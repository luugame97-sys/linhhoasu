#!/usr/bin/env python3
"""Read-only inspect PM2 process/restart evidence around current runtime."""
import getpass
import json
import re

import paramiko


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("103.116.105.154", username="root", password=password,
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    commands = {
        "pm2": "pm2 jlist",
        "out": "tail -n 800 /root/.pm2/logs/lhs-s1001-out.log",
        "err": "tail -n 800 /root/.pm2/logs/lhs-s1001-error.log",
        "pm2log": "tail -n 300 /root/.pm2/pm2.log | grep -E 'lhs-s1001|online|exit|restart|errored|stopped' | tail -n 120",
    }
    outputs = {}
    for key, command in commands.items():
        _, out, err = ssh.exec_command(command)
        outputs[key] = out.read().decode("utf-8", "replace")
        out.channel.recv_exit_status()
        if err.read().strip():
            print("CMDERR", key)
    try:
        rows = json.loads(outputs["pm2"])
        row = next(x for x in rows if x.get("name") == "lhs-s1001")
        env = row.get("pm2_env") or {}
        print("PM2", {k: env.get(k) for k in ("status", "restart_time", "unstable_restarts", "pm_uptime", "exit_code", "exit_signal", "created_at", "updated_at")})
        print("PM2_PID", row.get("pid"))
    except Exception as exc:
        print("PM2_PARSE", repr(exc))
    for name, body in outputs.items():
        if name == "pm2":
            continue
        print("---", name)
        for line in body.splitlines():
            if re.search(r"10:3[5-9]:|10:4[0-9]:|10:5[0-9]:|runtime ready|exit|SIG|uncaught|unhandled|EPIPE|Connection is closed|restart", line, re.I):
                line = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", line)
                print(line)
finally:
    ssh.close()
