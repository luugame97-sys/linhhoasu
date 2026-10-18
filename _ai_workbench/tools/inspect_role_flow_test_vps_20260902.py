#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko
HOST='192.168.200.151'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST,username='root',password=getpass.getpass('Test VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 def run(c):
  _,o,e=ssh.exec_command(c); t=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); er=e.read().decode('utf-8','replace'); return code,t,er
 checks={}
 checks['pm2']=run("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(String(p.name).includes(\"lhs\")) console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env.status,restart:p.pm2_env.restart_time,cwd:p.pm2_env.pm_cwd}))}})'")[1]
 checks['source']=run("for f in /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/HTTPServer1.js /linhhoasu/lhs/newServer/src/handlers/serverList.js /linhhoasu/lhs/newServer/src/handlers/serverList1.js; do [ -f \"$f\" ] && sha256sum \"$f\"; done")[1]
 checks['ready']=run("for u in http://127.0.0.1:8080/ready http://127.0.0.1:81/ready; do echo URL=$u; curl -sS --max-time 5 -w '\\nHTTP=%{http_code}\\n' \"$u\" || true; done")[1]
 checks['routeMarkers']=run("grep -n -E 'createRole\(|needCreateRole|deferRoleSelection' /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/handlers/serverList.js 2>/dev/null | tail -n 80")[1]
 print(json.dumps(checks,ensure_ascii=False,indent=2))
finally: ssh.close()
