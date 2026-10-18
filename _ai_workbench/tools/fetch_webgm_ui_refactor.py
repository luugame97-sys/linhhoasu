#!/usr/bin/env python3
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/gm'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_ui_refactor_current')
FILES = ('assets/css/ui-refactor.css', 'assets/js/index.js', 'index.php')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            local = LOCAL_ROOT / relative
            local.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(f'{REMOTE_ROOT}/{relative}', str(local))
            print(f'FETCHED={relative} SIZE={local.stat().st_size} SHA256={hashlib.sha256(local.read_bytes()).hexdigest()}')
    finally:
        sftp.close()
finally:
    ssh.close()
