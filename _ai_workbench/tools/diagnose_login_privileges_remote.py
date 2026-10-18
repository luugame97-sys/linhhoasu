"""Read-only audit for Activity9/Tiên duyên and recharge products 10501/10502."""
from __future__ import annotations

import getpass
import json
import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"command failed ({code}): {error[-5000:] or output[-5000:]}")
    return output


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20)
    try:
        commands = {
            "hashes": (
                "sha256sum "
                f"{REMOTE_ROOT}/src/handlers/activity.js "
                f"{REMOTE_ROOT}/src/handlers/recharge.js "
                f"{REMOTE_ROOT}/src/services/RechargeBenefitService.js "
                f"{REMOTE_ROOT}/src/services/RechargeConfigService.js "
                f"{REMOTE_ROOT}/src/db/models/Transaction.js"
            ),
            "source_markers": (
                "for p in "
                f"{REMOTE_ROOT}/src/handlers/activity.js "
                f"{REMOTE_ROOT}/src/handlers/recharge.js "
                f"{REMOTE_ROOT}/src/services/RechargeBenefitService.js; do "
                "echo ===$p; grep -n -E 'activityType === 9|Activity9|pRewards|rechargeInfo.records|applyRechargeBenefits|recordList|pushRechargeNotifications|sendRecharge' $p | head -120 || true; done"
            ),
            "pm2": (
                "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time}))}}})'"
            ),
            "mongo_summary": r"""
# Production mongod is bound to the local default port (27017).  Keep this
# audit read-only and avoid printing account names, credentials, tokens, or
# order identifiers.
mongosh --quiet 'mongodb://127.0.0.1:27017/lhs_s1001' --eval '
const ids=["10501","10502","10501","10502"];
const tx=db.transactions;
const players=db.players;
function out(x){print(JSON.stringify(x));}
out({collections:db.getCollectionNames().filter(x=>/transaction|player|mail/i.test(x))});
for(const id of ["10501","10502"]){
  const q={productId:id};
  out({kind:"tx",productId:id,total:tx.countDocuments(q),byStatus:tx.aggregate([{$match:q},{$group:{_id:"$status",count:{$sum:1},amount:{$sum:"$amount"}}},{$sort:{_id:1}}]).toArray(),recent:tx.find(q,{_id:0,orderId:1,productId:1,amount:1,status:1,createdAt:1,updatedAt:1,extra:1}).sort({createdAt:-1}).limit(20).toArray().map(x=>({productId:x.productId,amount:x.amount,status:x.status,createdAt:x.createdAt,hasRechargeMeta:!!(x.extra&&x.extra.recharge),hasMailId:!!(x.extra&&x.extra.recharge&&x.extra.recharge.mailId)}))});
  out({kind:"players_recharge",productId:id,count:players.countDocuments({"rechargeInfo.records":{$elemMatch:{id:Number(id),count:{$gt:0}}}})});
  out({kind:"players_activity",productId:id,count:players.countDocuments({"activityInfo.datas":{$elemMatch:{recordList:Number(id)}}})});
}
out({kind:"activity_rows",rows:players.aggregate([{$project:{datas:{$ifNull:["$activityInfo.datas",[]]}}},{$unwind:"$datas"},{$match:{"datas.id":{$gte:9001,$lte:9952}}},{$group:{_id:"$datas.id",players:{$sum:1},with10501:{$sum:{$cond:[{$in:[10501,"$datas.recordList"]},1,0]}},with10502:{$sum:{$cond:[{$in:[10502,"$datas.recordList"]},1,0]}}}},{$sort:{_id:1}}]).toArray()});
out({kind:"recharge_record_shapes",rows:players.aggregate([{$project:{records:{$ifNull:["$rechargeInfo.records",[]]}}},{$unwind:"$records"},{$match:{"records.id":{$in:[10501,10502]}}},{$group:{_id:{id:"$records.id",countType:{$type:"$records.count"}},players:{$sum:1},min:{$min:"$records.count"},max:{$max:"$records.count"}}}]).toArray()});
'
""",
            "log_summary": (
                "for f in /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log; do "
                "echo ===$f; grep -E -i 'Recharge|10501|10502|Activity9|LoginPrivileges|tiên duyên|仙缘|orderId' $f 2>/dev/null | tail -200 || true; done"
            ),
        }
        for name, command in commands.items():
            print(f"===== {name.upper()} =====")
            print(run(ssh, command))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
