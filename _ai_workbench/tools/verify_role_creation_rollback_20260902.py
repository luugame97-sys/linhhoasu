#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko
HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 def run(c):
  _,o,e=ssh.exec_command(c); t=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); er=e.read().decode('utf-8','replace'); return code,t,er
 checks={}
 checks['currentHashes']=run('sha256sum /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js')[1]
 checks['restoredAutoCreate']=run(r"grep -n -E 'const (role|created) = await accountService.createRole|if \(!selectedRole\)' /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js | tail -n 40")[1]
 checks['postRestartAuthErrors']=run("awk '/2026-09-02 01:55:53/{seen=1} seen && /AUTH_SESSION_REVOKED|AUTH_SESSION_MISMATCH|ROLE_NOT_FOUND/{print}' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log | tail -n 40 || true")[1]
 checks['ready']=run("curl -sS --max-time 5 -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:8080/ready")[1]
 checks['pm2']=run("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)) console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env.status,restart:p.pm2_env.restart_time}))}})'")[1]
 print(json.dumps(checks,ensure_ascii=False,indent=2))
finally: ssh.close()
