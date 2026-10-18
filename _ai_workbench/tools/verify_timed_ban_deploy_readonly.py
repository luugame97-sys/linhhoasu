"""Read-only post-deploy verification for the timed-ban redesign."""

from __future__ import annotations

import base64
import getpass
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
NODE = r'''
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'})}catch(_){}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});const all=await Account.aggregate([{$group:{_id:null,total:{$sum:1},banned:{$sum:{$cond:[{$lte:['$status',0]},1,0]}},timed:{$sum:{$cond:[{$and:[{$lte:['$status',0]},{$gt:[{$type:'$banUntil'},'missing']},{$ne:['$banUntil',null]}]},1,0]}},reason:{$sum:{$cond:[{$and:[{$lte:['$status',0]},{$gt:[{$strLenCP:{$ifNull:['$banReason','']}},0]}]},1,0]}}}}]);console.log('MONGO_JSON='+JSON.stringify({db:mongoose.connection.name,summary:all[0]||{total:0,banned:0,timed:0,reason:0}}));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''
PHP = r'''require '/linhhoasu/webgame/gm/config.php'; global $conn_web; $out=array(); foreach(array('web_account_bans','web_account_ban_history') as $t){$stmt=$conn_web->query('SELECT COUNT(*) FROM `'.$t.'`');$out[$t]=(int)$stmt->fetchColumn();} $stmt=$conn_web->query("SELECT COUNT(*) FROM account WHERE status='locked'"); $out['webLocked']=(int)$stmt->fetchColumn(); echo 'WEB_JSON='.json_encode($out,JSON_UNESCAPED_UNICODE);'''


def enc(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        node = ssh.exec_command(f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{enc(NODE)}','base64').toString('utf8'))\"")[1].read().decode("utf-8", "replace")
        web = ssh.exec_command("php -r " + shlex.quote(PHP))[1].read().decode("utf-8", "replace")
        health = ssh.exec_command("curl -sS --max-time 15 http://127.0.0.1:8080/ready; printf '\n'; curl -sS --max-time 15 http://127.0.0.1:9200/health | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const x=JSON.parse(s);console.log(JSON.stringify({status:x.status,pid:x.runtime&&x.runtime.pid,revision:x.runtime&&x.runtime.revision,clients:x.runtime&&x.runtime.clients}))})'")[1].read().decode("utf-8", "replace")
        hashes = ssh.exec_command("sha256sum /linhhoasu/lhs/newServer/src/services/AccountBanService.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/admin/admin_api.php /linhhoasu/webgame/gm/admin/index.php /linhhoasu/webgame/gm/assets/js/admin.js")[1].read().decode("utf-8", "replace")
    finally:
        ssh.close()
    target_dir = ROOT / "temp" / "timed_ban_qa"; target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "host": HOST, "readOnly": True, "node": node, "web": web, "health": health, "hashes": hashes}
    target = target_dir / f"timed_ban_readonly_verify_{stamp}.json"; target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(target), "node": node, "web": web, "health": health, "hashes": hashes}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
