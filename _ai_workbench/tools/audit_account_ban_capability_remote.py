"""Read-only production audit of account ban, login, token, and offender state."""

from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "temp" / f"account_ban_capability_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
TOTALS_JSON = ROOT / "temp" / "fortune_package_audit" / "fortune_package_totals_20260901_093320.json"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
FILES = (
    "src/db/models/Account.js",
    "src/db/models/AdminActionLog.js",
    "src/services/AccountService.js",
    "src/services/AuthSessionService.js",
    "src/handlers/account.js",
    "src/handlers/serverList.js",
    "src/net/HTTPServer.js",
    "src/net/HTTPServer1.js",
    "src/net/WSServer.js",
    "ecosystem.config.js",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(source: str) -> str:
    return base64.b64encode(source.encode()).decode()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-6000:] or output[-6000:] or f"remote exit={code}")
    return output


def main() -> None:
    source = json.loads(TOTALS_JSON.read_text(encoding="utf-8"))
    offenders = [
        {"accountId": row["accountId"], "userId": row["userId"], "name": row["name"]}
        for row in source["audit"]["rows"]
        if int(row.get("minimumExcessClaims") or 0) > 0
    ]
    account_ids = [row["accountId"] for row in offenders]
    user_ids = [row["userId"] for row in offenders]
    mongo_source = r'''
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const AdminActionLog=require('/linhhoasu/lhs/newServer/src/db/models/AdminActionLog');
const accountIds=''' + json.dumps(account_ids, ensure_ascii=False) + r''';
(async()=>{const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001';await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});
const statusAgg=await Account.aggregate([{$group:{_id:'$status',count:{$sum:1}}},{$sort:{_id:1}}]);
const fieldAgg=await Account.aggregate([{$group:{_id:null,total:{$sum:1},banUntil:{$sum:{$cond:[{$ne:[{$type:'$banUntil'},'missing']},1,0]}},banReason:{$sum:{$cond:[{$ne:[{$type:'$banReason'},'missing']},1,0]}},bannedAt:{$sum:{$cond:[{$ne:[{$type:'$bannedAt'},'missing']},1,0]}},bannedBy:{$sum:{$cond:[{$ne:[{$type:'$bannedBy'},'missing']},1,0]}},banHistory:{$sum:{$cond:[{$ne:[{$type:'$banHistory'},'missing']},1,0]}}}}]);
const rows=await Account.find({accountId:{$in:accountIds}}).select({accountId:1,status:1,roles:1,banUntil:1,banReason:1,bannedAt:1,bannedBy:1}).lean();
const banLogs=await AdminActionLog.aggregate([{$match:{action:{$in:['ban_player_account','unban_player_account']} }},{$group:{_id:'$action',count:{$sum:1},lastAt:{$max:'$createdAt'}}}]);
console.log('MONGO_JSON='+JSON.stringify({db:mongoose.connection.name,statusAgg,fieldAgg:fieldAgg[0]||{},offenderRows:rows.map(a=>({accountId:a.accountId,status:Number(a.status),roleUserIds:(a.roles||[]).map(r=>String(r.userId||'')),banUntil:a.banUntil||null,banReason:a.banReason||'',bannedAt:a.bannedAt||null,bannedBy:a.bannedBy||''})),banLogs}));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''
    redis_source = r'''
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const Redis=require('/linhhoasu/lhs/newServer/node_modules/ioredis');
const accountIds=new Set(''' + json.dumps(account_ids, ensure_ascii=False) + r''');
const userIds=new Set(''' + json.dumps(user_ids, ensure_ascii=False) + r''');
const prefix=String(process.env.REDIS_PREFIX||'');
const client=new Redis({host:process.env.REDIS_HOST||'127.0.0.1',port:Number(process.env.REDIS_PORT)||6379,password:process.env.REDIS_PASSWORD||undefined,lazyConnect:true,connectTimeout:7000,maxRetriesPerRequest:1});
(async()=>{await client.connect();let cursor='0',keys=[];do{const result=await client.scan(cursor,'MATCH',prefix+'auth:session:*','COUNT',1000);cursor=result[0];keys.push(...result[1])}while(cursor!=='0');let targetTokens=0,targetAccounts=new Set(),targetUsers=new Set(),malformed=0;for(const key of keys){let raw=await client.get(key);if(!raw&&prefix&&key.startsWith(prefix))raw=await client.get(key.slice(prefix.length));if(!raw)continue;try{const row=JSON.parse(raw),accountId=String(row.accountId||''),userId=String(row.userId||'');if(accountIds.has(accountId)||userIds.has(userId)){targetTokens++;if(accountId)targetAccounts.add(accountId);if(userId)targetUsers.add(userId)}}catch(_){malformed++}}console.log('REDIS_JSON='+JSON.stringify({totalAuthTokens:keys.length,targetTokens,targetAccountCount:targetAccounts.size,targetUserCount:targetUsers.size,malformed,ttlDefaultSec:Number(process.env.AUTH_SESSION_TTL_SEC)||86400}));await client.quit()})().catch(async e=>{console.error(e.stack||String(e));try{await client.quit()}catch(_){}process.exit(1)});
'''
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    OUT.mkdir(parents=True, exist_ok=False)
    files = []
    try:
        sftp = ssh.open_sftp()
        try:
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                local = OUT / rel
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                stat = sftp.stat(remote)
                files.append({"remote": remote, "local": str(local), "size": stat.st_size, "mtime": stat.st_mtime, "mode": oct(stat.st_mode & 0o777), "sha256": sha(local)})
        finally:
            sftp.close()
        mongo_output = run(ssh, f"cd {REMOTE_ROOT} && node -e \"eval(Buffer.from('{encode(mongo_source)}','base64').toString('utf8'))\"")
        redis_output = run(ssh, f"cd {REMOTE_ROOT} && node -e \"eval(Buffer.from('{encode(redis_source)}','base64').toString('utf8'))\"")
        flags_output = run(ssh, "pm2 env 0 | grep -E '^(AUTH_SESSION_TTL_SEC|USER_CLIENT_VALIDATION_ENABLED|SDK_AUTH_PASSWORD_STRICT|ALLOW_AUTO_REGISTER|WS_CLOSE_DUPLICATE_LOGIN):' || true")
        health = run(ssh, "date --iso-8601=seconds; curl -sS --max-time 15 http://127.0.0.1:8080/ready; printf '\n'; curl -sS --max-time 15 http://127.0.0.1:9200/health | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const x=JSON.parse(s);console.log(JSON.stringify({status:x.status,pid:x.runtime&&x.runtime.pid,clients:x.runtime&&x.runtime.clients,revision:x.runtime&&x.runtime.revision}))})'")
    finally:
        ssh.close()
    def marked(output: str, marker: str):
        return json.loads(output.split(marker, 1)[1].splitlines()[0])
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "host": HOST,
        "readOnly": True,
        "offenders": offenders,
        "files": files,
        "mongo": marked(mongo_output, "MONGO_JSON="),
        "redis": marked(redis_output, "REDIS_JSON="),
        "runtimeFlags": flags_output,
        "health": health,
    }
    target = OUT / "audit.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "auditSha256": sha(target), "offenders": len(offenders), "mongo": payload["mongo"], "redis": payload["redis"], "runtimeFlags": flags_output, "health": health}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
