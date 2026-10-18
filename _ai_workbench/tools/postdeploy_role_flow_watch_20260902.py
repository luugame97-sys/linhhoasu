#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko
HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=20)
try:
 def run(c,timeout=90):
  _,o,e=ssh.exec_command(c,timeout=timeout); t=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); er=e.read().decode('utf-8','replace'); return code,t,er
 out={}
 out['beforeWait']=run("pm2 describe lhs-s1001 | grep -E 'status|restarts|pid|cpu|memory' | head -n 14")[1]
 run('sleep 20',30)
 out['afterWait']=run("pm2 describe lhs-s1001 | grep -E 'status|restarts|pid|cpu|memory' | head -n 14")[1]
 out['ready']=run("curl -sS --max-time 5 -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:8080/ready")[1]
 out['recentAuthErrors']=run("tail -n 12000 /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -E 'AUTH_SESSION_REVOKED|AUTH_SESSION_MISMATCH|ROLE_NOT_FOUND|CREATE_ROLE_FAILED|uncaughtException|unhandledRejection' | tail -n 80 || true")[1]
 print(json.dumps(out,ensure_ascii=False,indent=2))
finally: ssh.close()
