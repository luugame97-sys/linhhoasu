#!/usr/bin/env python3
"""Read-only registration diagnosis for the production s1001 process.

The password is requested interactively and is never printed or persisted.
No game command is sent by this tool; it only reads PM2 environment, source,
and recent logs.
"""
from __future__ import annotations

import getpass
import paramiko


HOST = "103.116.105.154"


def run(ssh: paramiko.SSHClient, command: str) -> str:
    _, out, err = ssh.exec_command(command)
    text = out.read().decode("utf-8", "replace")
    out.channel.recv_exit_status()
    error = err.read().decode("utf-8", "replace").strip()
    if error:
        text += f"\n[stderr] {error}\n"
    return text


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False,
           allow_agent=False, timeout=15)
try:
    commands = [
        "date '+DATE=%Y-%m-%d %H:%M:%S %z'; pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(p.name===\"lhs-s1001\") {const e=p.pm2_env||{}; console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restart:e.restart_time,uptime:Date.now()-e.pm_uptime,env:Object.fromEntries([\"SERVER_ID\",\"REQUIRE_INVITE_REGISTER\",\"ALLOW_AUTO_REGISTER\",\"SDK_AUTH_PASSWORD_STRICT\",\"USER_CLIENT_VALIDATION_ENABLED\",\"REGISTER_URL\",\"REGISTER_PUBLIC_PORT\"].map(k=>[k,e.env&&e.env[k]]))}))}}})'",
        "pid=$(pm2 pid lhs-s1001 | tail -1); echo PID=$pid; if [ -n \"$pid\" ]; then tr '\\0' '\\n' </proc/$pid/environ | grep -E '^(SERVER_ID|REQUIRE_INVITE_REGISTER|ALLOW_AUTO_REGISTER|SDK_AUTH_PASSWORD_STRICT|USER_CLIENT_VALIDATION_ENABLED|REGISTER_URL|REGISTER_PUBLIC_PORT)=' | sort; fi",
        "echo '--- remote handler ---'; sed -n '175,205p;640,725p;850,866p' /linhhoasu/lhs/newServer/src/handlers/serverList.js 2>/dev/null",
        "echo '--- remote handler1 ---'; sed -n '175,205p;640,720p;840,858p' /linhhoasu/lhs/newServer/src/handlers/serverList1.js 2>/dev/null",
        "echo '--- recent registration log lines ---'; grep -h -E 'cmd=2817|cmd=2818|cmd=2821|RANDOM_REGISTER|INVITE_CODE|register|Đăng ký|REGISTER_FAILED|ACCOUNT_EXISTS' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 160",
        "echo '--- recent HTTP command lines ---'; grep -h -E '\[HTTP\].*(2817|2818|2821)' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 120",
    ]
    for command in commands:
        print(f"\n$ {command.split(';', 1)[0]}")
        print(run(ssh, command))
finally:
    ssh.close()
