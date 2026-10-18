#!/usr/bin/env python3
from __future__ import annotations
import getpass, paramiko

HOST='103.116.105.154'
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
    commands = [
        "f=/root/.pm2/logs/lhs-s1001-out.log; for n in 36855440 37496758 37719415; do echo ===$n===; sed -n \"$((n-80)),$((n+25))p\" $f; done",
        "echo '--- error lines recent ---'; tail -n 20000 /root/.pm2/logs/lhs-s1001-error.log | grep -Ei 'duplicate|E11000|Mongo|CREATE_ROLE|create player|save player|index' | tail -n 160 || true",
        "echo '--- account/player creation recent ---'; tail -n 20000 /root/.pm2/logs/lhs-s1001-out.log | grep -Ei '\\[Player\\] New Player|CREATE_ROLE_FAILED|createPlayer|E11000|duplicate' | tail -n 160 || true",
    ]
    for command in commands:
        _,out,err=ssh.exec_command(command);text=out.read().decode('utf-8','replace');out.channel.recv_exit_status();print(f'\n$ {command.split(";",1)[0]}\n{text}')
finally:ssh.close()
