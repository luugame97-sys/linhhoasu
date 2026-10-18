#!/usr/bin/env python3
"""Read-only inspection of the registration page and its API routing."""
import getpass
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '),
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    commands = [
        "curl -sS -D - -o /tmp/lhs_register_probe.html 'http://127.0.0.1:81/register.html?inviteCode=TY7C1A' | sed -n '1,24p'; grep -nE 'backendHost|httpPort|wsPort|resolveApiUrl|api/user/register|inviteCode' /tmp/lhs_register_probe.html | head -40",
        "nginx -T 2>/dev/null | grep -nE -B4 -A18 'server_name|listen 81|register.html|root /linhhoasu|location /api' | head -240",
        "ss -ltnp | grep -E ':(81|8080|18080)\\b' || true",
        "echo '--- registration file locations ---'; find /linhhoasu -maxdepth 4 -type f -name register.html -printf '%p %s bytes %TY-%Tm-%Td %TH:%TM:%TS\\n' 2>/dev/null | sort",
    ]
    for command in commands:
        _, out, err = ssh.exec_command(command)
        print(f"\n$ {command.split(';', 1)[0]}\n{out.read().decode('utf-8', 'replace')}")
        out.channel.recv_exit_status()
finally:
    ssh.close()
