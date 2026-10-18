"""Read-only diagnosis for two reported login accounts; never reads passwords."""
from __future__ import annotations

import base64
import getpass
import json
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ACCOUNTS = ["Ohokaka12321", "minh3010"]
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "temp" / "login_account_audit_ohokaka_minh3010_20260901.json"

NODE = r'''
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'});}catch(_){}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const wanted=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const hashInfo=h=>{h=String(h||'');return{present:!!h,length:h.length,kind:h.startsWith('$2')?'bcrypt':h.includes(':')?'legacy_colon':/^[a-f0-9]{32,128}$/i.test(h)?'legacy_hex':'other'};};
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});const out=[];for(const input of wanted){const lower=String(input).trim().toLowerCase();const docs=await Account.find({accountId:{$regex:new RegExp('^'+esc(String(input).trim())+'$','i')}}).lean();const exactLower=await Account.findOne({accountId:lower}).lean();const rows=[];for(const a of docs){const uids=Array.isArray(a.roles)?a.roles.map(r=>String(r&&r.userId||'')).filter(Boolean):[];const players=uids.length?await Player.find({userId:{$in:uids}}).select({userId:1,playerId:1,name:1,level:1,updatedAt:1}).lean():[];rows.push({accountId:String(a.accountId||''),isExactInput:String(a.accountId||'')===String(input).trim(),isNormalizedLower:String(a.accountId||'')===lower,status:Number(a.status),authVersion:Number(a.authVersion)||1,banUntil:a.banUntil||null,banReason:String(a.banReason||''),banCode:String(a.banCode||''),lastLoginTime:Number(a.lastLoginTime)||0,createdAt:a.createdAt||null,updatedAt:a.updatedAt||null,passwordHash:hashInfo(a.passwordHash),roles:(a.roles||[]).map(r=>({roleId:String(r.roleId||''),userId:String(r.userId||''),serverId:Number(r.serverId)||0,name:String(r.name||''),status:Number(r.status),lastLoginTime:Number(r.lastLoginTime)||0})),players});}out.push({input,normalized:lower,caseInsensitiveMatches:rows.length,exactLowerExists:!!exactLower,rows});}console.log(JSON.stringify({readOnly:true,db:mongoose.connection.name,accounts:out},null,2));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''

PHP = r'''<?php
define('LHS_API_REQUEST',true);
require '/linhhoasu/webgame/gm/config.php';
$wanted=json_decode(base64_decode($argv[1]),true);$out=array();
foreach($wanted as $input){$lower=strtolower(trim((string)$input));$a=$conn_web->prepare('SELECT account_id,account,sdk_user_id,status,vip_level,created_at,updated_at,last_login_at FROM account WHERE LOWER(account)=?');$a->execute(array($lower));$attempt=$conn_web->prepare('SELECT username,success,created_at FROM login_attempts WHERE LOWER(username)=? ORDER BY id DESC LIMIT 20');$attempt->execute(array($lower));$out[]=array('input'=>$input,'normalized'=>$lower,'accountRows'=>$a->fetchAll(PDO::FETCH_ASSOC),'loginAttempts'=>$attempt->fetchAll(PDO::FETCH_ASSOC));}
echo json_encode(array('readOnly'=>true,'accounts'=>$out),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
?>'''


def run(ssh, cmd, timeout=120):
    _, o, e = ssh.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    if code:
        raise RuntimeError(err or out or f"exit={code}")
    return out


def main():
    encoded = base64.b64encode(json.dumps(ACCOUNTS).encode()).decode()
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        n64 = base64.b64encode(NODE.encode()).decode()
        node_raw = run(ssh, f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{n64}','base64').toString('utf8'))\" {encoded}", 180)
        node = json.loads(node_raw[node_raw.rfind("\n{") + 1:])
        p64 = base64.b64encode(PHP.encode()).decode()
        php_raw = run(ssh, f"printf '%s' '{p64}'|base64 -d|php /dev/stdin {encoded}", 120)
        php = json.loads(php_raw)
        logs = run(ssh, "grep -aEi 'Ohokaka12321|ohokaka12321|minh3010' /linhhoasu/lhs/newServer/logs/*.log 2>/dev/null | tail -n 300 || true", 120)
        data = {"host": HOST, "readOnly": True, "mongo": node, "webgm": php, "logLines": logs.splitlines()}
    finally:
        ssh.close()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


if __name__ == "__main__":
    main()
