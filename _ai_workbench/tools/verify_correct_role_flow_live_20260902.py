#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko

HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=20)
try:
 def run(cmd,timeout=60):
  _,o,e=ssh.exec_command(cmd,timeout=timeout); t=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); er=e.read().decode('utf-8','replace'); return code,t,er
 out={}
 out['hashes']=run('sha256sum /linhhoasu/lhs/newServer/src/services/AccountService.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js')[1]
 out['syntax']=run("for f in /linhhoasu/lhs/newServer/src/services/AccountService.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js; do node --check \"$f\" || exit 1; done; echo PASS")[1]
 out['registrationMarkers']=run("grep -n -E 'buildAccountOnlyRegistrationResponse|needCreateRole: 1|const role = await accountService.createRole' /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js | tail -n 80")[1]
 out['placeholderPath']=run("grep -n -E 'if \(!selectedRole\)|deferRoleSelection: true|createRole\(accountId' /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js | tail -n 40")[1]
 out['ready']=run("curl -sS --max-time 5 -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:8080/ready")[1]
 out['pm2']=run("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)) console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env.status,restart:p.pm2_env.restart_time}))}})'")[1]
 node="const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');(async()=>{await mongo.connect();const a=await Account.find({accountId:/^qa_flow_/i}).select({accountId:1}).lean();const p=await Player.find({accountId:/^qa_flow_/i}).select({accountId:1,userId:1}).lean();console.log(JSON.stringify({qaAccountCount:a.length,qaPlayerCount:p.length,accounts:a,players:p}));await mongo.disconnect()})().catch(e=>{console.error(e.stack||e);process.exit(1)})"
 import base64
 enc=base64.b64encode(node.encode()).decode(); out['qaLeftovers']=run("pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); cd /linhhoasu/lhs/newServer; node -e \"eval(Buffer.from('"+enc+"','base64').toString('utf8'))\"",120)[1]
 out['authErrorsTail']=run("tail -n 12000 /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -E 'AUTH_SESSION_REVOKED|AUTH_SESSION_MISMATCH|ROLE_NOT_FOUND|CREATE_ROLE_FAILED' | tail -n 60 || true")[1]
 print(json.dumps(out,ensure_ascii=False,indent=2))
finally: ssh.close()
