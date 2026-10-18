"""Read-only target/status audit before applying Baozi exploit penalties."""
from __future__ import annotations

import base64
import getpass
import json
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "temp" / "baozi_penalty_plan_20260901.json"
OUT = ROOT / "temp" / "baozi_penalty_targets_status_20260901.json"

NODE = r'''
const fs=require('fs'); const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const plan=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
(async()=>{
  const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});
  const accountIds=plan.rows.map(r=>String(r.accountId)); const userIds=plan.rows.map(r=>String(r.userId));
  const accounts=await Account.find({accountId:{$in:accountIds}}).select({accountId:1,status:1,authVersion:1,banUntil:1,banReason:1,banCode:1,bannedAt:1,bannedBy:1}).lean();
  const players=await Player.find({userId:{$in:userIds}}).select({userId:1,name:1,items:1,currencies:1,updatedAt:1}).lean();
  const info=await mongoose.connection.db.admin().command({hello:1});
  console.log(JSON.stringify({readOnly:true,db:mongoose.connection.name,replicaSet:info.setName||'',accounts,players,hello:{isWritablePrimary:!!info.isWritablePrimary,primary:info.primary||'',setName:info.setName||''}}));
  await mongoose.disconnect();
})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''

PHP = r'''<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$plan = json_decode(file_get_contents($argv[1]), true);
$ids = array(); foreach ((array)$plan['rows'] as $r) $ids[] = strtolower((string)$r['accountId']);
$out = array();
if ($ids) {
  $marks = implode(',', array_fill(0, count($ids), '?'));
  $s = $conn_web->prepare("SELECT account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at FROM web_account_bans WHERE account_name IN ($marks)");
  $s->execute($ids); $out = $s->fetchAll(PDO::FETCH_ASSOC);
}
echo json_encode(array('readOnly'=>true,'webBans'=>$out), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
?>'''


def run(ssh, cmd, timeout=120):
    _, o, e = ssh.exec_command(cmd, timeout=timeout)
    out = o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
    if code: raise RuntimeError(err or out or f'exit={code}')
    return out


def main():
    plan_arg = base64.b64encode(PLAN.read_bytes()).decode()
    password = getpass.getpass("Production password (not logged): ")
    ssh=paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
    try:
        n64=base64.b64encode(NODE.encode()).decode()
        out=run(ssh,f"cd /linhhoasu/lhs/newServer && printf '%s' '{plan_arg}' | base64 -d >/tmp/baozi_plan_$$.json && node -e \"eval(Buffer.from('{n64}','base64').toString('utf8'))\" /tmp/baozi_plan_$$.json; rm -f /tmp/baozi_plan_$$.json",180)
        node=json.loads(out.splitlines()[-1])
        p64=base64.b64encode(PHP.encode()).decode()
        out=run(ssh,f"printf '%s' '{plan_arg}' | base64 -d >/tmp/baozi_plan_$$.json; printf '%s' '{p64}' | base64 -d | php /dev/stdin /tmp/baozi_plan_$$.json; rm -f /tmp/baozi_plan_$$.json",120)
        php=json.loads(out)
        data={'readOnly':True,'plan':json.loads(PLAN.read_text(encoding='utf-8')),'mongo':node,'webgm':php}
    finally: ssh.close()
    OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(data,ensure_ascii=False,indent=2)); print(f'OUT={OUT}')


if __name__=='__main__': main()
