#!/usr/bin/env python3
from __future__ import annotations

import getpass
import paramiko


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_webshop_spend_history.php'
REMOTE = '/linhhoasu/_ai_workbench/temp/audit_webshop_spend_history.php'


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    _, out, err = ssh.exec_command('mkdir -p /linhhoasu/_ai_workbench/temp')
    out.channel.recv_exit_status()
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL, REMOTE)
    finally:
        sftp.close()
    _, out, err = ssh.exec_command(f'php {REMOTE}')
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    error = err.read().decode('utf-8', 'replace')
    print(text)
    if error.strip():
        print('[stderr]', error[-4000:])
    if code:
        raise SystemExit(code)
finally:
    ssh.close()
