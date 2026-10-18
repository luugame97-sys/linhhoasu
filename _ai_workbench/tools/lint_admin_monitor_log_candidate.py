#!/usr/bin/env python3
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\admin_monitor_log_candidate')
REMOTE_ROOT = '/linhhoasu/_ai_workbench/temp/admin_monitor_log_lint'
FILES = ('admin/index.php', 'admin/admin_api.php', 'assets/js/admin.js', 'assets/css/ui-refactor.css')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    _, out, err = ssh.exec_command(f'mkdir -p {REMOTE_ROOT}/admin {REMOTE_ROOT}/assets/js {REMOTE_ROOT}/assets/css')
    out.channel.recv_exit_status()
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            local = LOCAL_ROOT / relative
            sftp.put(str(local), f'{REMOTE_ROOT}/{relative}')
            print(f'UPLOADED={relative} SHA256={hashlib.sha256(local.read_bytes()).hexdigest()}')
    finally:
        sftp.close()
    for relative in ('admin/index.php', 'admin/admin_api.php'):
        _, out, err = ssh.exec_command(f'php -l {REMOTE_ROOT}/{relative}')
        text = out.read().decode('utf-8', 'replace')
        code = out.channel.recv_exit_status()
        error = err.read().decode('utf-8', 'replace')
        print(text.strip())
        if code: raise RuntimeError(error[-3000:] or text[-3000:])
    _, out, err = ssh.exec_command(f'node --check {REMOTE_ROOT}/assets/js/admin.js')
    code = out.channel.recv_exit_status()
    if code: raise RuntimeError(err.read().decode('utf-8', 'replace')[-3000:])
    print('NODE_CHECK=PASS')
finally:
    ssh.close()
