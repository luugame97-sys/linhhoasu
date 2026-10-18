#!/usr/bin/env python3
from __future__ import annotations

import getpass
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server')
REMOTE_ROOT = '/linhhoasu/webgame/gm/_ai_workbench/temp/admin-log-qa'
FILES = {
    LOCAL_ROOT / '_ai_workbench/temp/admin_log_dashboard_qa.html': 'index.html',
}

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    _, out, err = ssh.exec_command(f'mkdir -p {REMOTE_ROOT}')
    out.channel.recv_exit_status()
    sftp = ssh.open_sftp()
    try:
        for local, remote_name in FILES.items():
            sftp.put(str(local), f'{REMOTE_ROOT}/{remote_name}')
            print(f'UPLOADED={remote_name}')
    finally:
        sftp.close()
    _, out, err = ssh.exec_command("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/_ai_workbench/temp/admin-log-qa/index.html")
    status = out.read().decode('utf-8', 'replace').strip()
    out.channel.recv_exit_status()
    print(f'HTTP={status}')
    if status != '200': raise RuntimeError(f'QA fixture HTTP {status}')
finally:
    ssh.close()
