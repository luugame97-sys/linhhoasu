#!/usr/bin/env python3
"""Read-only inspect current app error log after latest restart."""
import getpass
import re
import paramiko

password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("103.116.105.154", username="root", password=password,
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    command = "echo NOW; date '+%Y-%m-%d %H:%M:%S %z'; echo ERROR_LOG; cat /linhhoasu/lhs/newServer/logs/error-2026-08-30.log 2>/dev/null; echo COMBINED_FLAGS; tail -n 100000 /linhhoasu/lhs/newServer/logs/combined-2026-08-30.log | grep -Ei 'unhandled|uncaught|syntaxerror|EPIPE|connection is closed|failed|timeout|error|exception|slow|queue backlog|queue wait' | tail -n 300"
    _, out, err = ssh.exec_command(command)
    body = out.read().decode("utf-8", "replace")
    out.channel.recv_exit_status()
    body = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", body)
    print(body)
    err_text = err.read().decode("utf-8", "replace")
    if err_text.strip():
        print("CMDERR", err_text[-500:])
finally:
    ssh.close()
