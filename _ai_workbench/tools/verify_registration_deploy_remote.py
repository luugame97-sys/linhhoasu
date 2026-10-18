#!/usr/bin/env python3
"""Read-only post-deploy verification for the registration gate."""
import getpass
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '),
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    commands = [
        "date '+NOW=%Y-%m-%d %H:%M:%S %z'; pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time,pm_uptime:e.pm_uptime}))}}})'",
        "pid=$(pm2 pid lhs-s1001|tail -1); echo PID=$pid; tr '\\0' '\\n' </proc/$pid/environ | grep -E '^(SERVER_ID|REQUIRE_INVITE_REGISTER|ALLOW_AUTO_REGISTER|SDK_AUTH_PASSWORD_STRICT|USER_CLIENT_VALIDATION_ENABLED)=' | sort",
        "echo '--- latest runtime markers ---'; grep -n '\[WSServer\] runtime ready revision=' /root/.pm2/logs/lhs-s1001-out.log | tail -n 5",
        "echo '--- lines after latest runtime marker (errors) ---'; f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\[WSServer\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n \"$n\" ] && tail -n +$n $f | grep -Ei 'SyntaxError|ReferenceError|TypeError|Unhandled|FATAL|fatal|error|exception|failed' | tail -n 120 || true",
        "echo '--- current error file tail ---'; tail -n 120 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null",
        "echo '--- registration command lines after latest marker ---'; f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\[WSServer\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n \"$n\" ] && tail -n +$n $f | grep -E 'POST gameMsg.do cmd=(2817|2818|2820)' | tail -n 40 || true",
    ]
    for command in commands:
        _, out, err = ssh.exec_command(command)
        print(f"\n$ {command.split(';', 1)[0]}\n{out.read().decode('utf-8', 'replace')}")
        out.channel.recv_exit_status()
finally:
    ssh.close()
