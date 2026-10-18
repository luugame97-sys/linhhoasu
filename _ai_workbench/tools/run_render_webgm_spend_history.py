#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import paramiko


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\render_webgm_spend_history_live.php'
REMOTE = '/linhhoasu/_ai_workbench/temp/render_webgm_spend_history_live.php'

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
    raw = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    error = err.read().decode('utf-8', 'replace')
    if code:
        raise RuntimeError(error[-4000:] or raw[-4000:])
    data = json.loads(raw)
    data['js_contract_checked_separately'] = True
    print(json.dumps(data, ensure_ascii=False, indent=2))
    if not data.get('all_markers_present'):
        raise RuntimeError('render markers missing')
finally:
    ssh.close()
