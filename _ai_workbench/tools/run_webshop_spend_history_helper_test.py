#!/usr/bin/env python3
from __future__ import annotations

import getpass
import paramiko

HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\test_webshop_spend_history_helpers.php'
REMOTE = '/linhhoasu/_ai_workbench/temp/test_webshop_spend_history_helpers.php'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL, REMOTE)
    finally:
        sftp.close()
    _, out, err = ssh.exec_command(f'php {REMOTE}')
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    print(text)
    if code:
        raise RuntimeError(err.read().decode('utf-8', 'replace')[-4000:])
finally:
    ssh.close()
