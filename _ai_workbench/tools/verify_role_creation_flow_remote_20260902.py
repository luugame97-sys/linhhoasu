#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko

HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    def run(cmd):
        _,o,e=ssh.exec_command(cmd); text=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace'); return code,text,err
    checks={}
    checks['hashes']=run("sha256sum /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js")[1]
    checks['syntax']=run("for f in /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js; do node --check \"$f\" || exit 1; done; echo PASS")[1]
    checks['no_auto_create']=run("if grep -n -E 'const (role|created) = await accountService.createRole' /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js; then echo FAIL; exit 1; else echo PASS; fi")[1]
    checks['need_create_contract']=run(r"grep -n -E 'needCreateRole: (true|roles.length > 0 \? 0 : 1)|Role creation is a separate native-client step|handler 2818' /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js | tail -n 30")[1]
    checks['ready']=run("curl -sS --max-time 5 -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:8080/ready")[1]
    checks['pm2']=run("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)) console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env.status,restart:p.pm2_env.restart_time}))}})'")[1]
    print(json.dumps(checks, ensure_ascii=False, indent=2))
finally: ssh.close()
