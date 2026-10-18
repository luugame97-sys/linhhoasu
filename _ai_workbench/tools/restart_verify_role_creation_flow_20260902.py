#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko

HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    def run(cmd):
        _,o,e=ssh.exec_command(cmd); text=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace'); return code,text,err
    before = run("echo PID=$(pm2 pid lhs-s1001); pm2 describe lhs-s1001 | grep -E 'status|restarts|pid' | head -n 12")[1]
    code, out, err = run('pm2 restart lhs-s1001 --update-env')
    if code: raise RuntimeError(err[-4000:] or out[-4000:])
    code, ready, err = run("for i in $(seq 1 20); do code=$(curl -sS -o /tmp/lhs_ready_role_flow.json -w '%{http_code}' --max-time 3 http://127.0.0.1:8080/ready || true); [ \"$code\" = 200 ] && break; sleep 1; done; cat /tmp/lhs_ready_role_flow.json; echo; echo HTTP=$code")
    if code: raise RuntimeError(err[-4000:] or ready[-4000:])
    after = run("echo PID=$(pm2 pid lhs-s1001); pm2 describe lhs-s1001 | grep -E 'status|restarts|pid' | head -n 12")[1]
    # Ensure the active process logs the new marker and no immediate restart loop.
    log = run("tail -n 120 /root/.pm2/logs/lhs-s1001-out.log | grep -E 'ServerList|HTTP handlers registered|runtime ready|MongoDB' | tail -n 30 || true")[1]
    print(json.dumps({'before':before,'restartOutput':out[-2000:],'ready':ready[-4000:],'after':after,'recentLog':log}, ensure_ascii=False, indent=2))
finally: ssh.close()
