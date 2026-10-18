#!/usr/bin/env python3
"""Read-only inventory of app/PM2 log files and current timestamps."""
import getpass
import paramiko

password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("103.116.105.154", username="root", password=password,
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    command = "date '+%Y-%m-%d %H:%M:%S %z'; ls -l --time-style=long-iso /root/.pm2/logs/lhs-s1001-* 2>/dev/null; find /linhhoasu/lhs/newServer -maxdepth 3 -type f -name '*.log' -printf '%TY-%Tm-%Td %TH:%TM:%TS %s %p\\n' 2>/dev/null | sort -r | head -80; for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1001-out.log; do echo FILE=$f; tail -n 2000 \"$f\" | grep -Ei '10:3[6-9]:|10:4[0-9]:|10:5[0-9]:|unhandled|uncaught|syntaxerror|EPIPE|connection is closed|failed|timeout|error' | tail -100; done"
    _, out, err = ssh.exec_command(command)
    print(out.read().decode("utf-8", "replace"))
    out.channel.recv_exit_status()
    error_text = err.read().decode("utf-8", "replace")
    if error_text.strip():
        print("CMDERR", error_text[-500:])
finally:
    ssh.close()
