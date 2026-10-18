#!/usr/bin/env python3
"""Fetch current production admin log UI/API sources without mutating VPS."""
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/gm'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\admin_log_dashboard_current')
FILES = (
    'admin/index.php',
    'admin/admin_api.php',
    'assets/js/admin.js',
    'assets/css/admin.css',
    'assets/css/ui-refactor.css',
    'config.php',
)


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '),
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            local = LOCAL_ROOT / relative
            local.parent.mkdir(parents=True, exist_ok=True)
            try:
                sftp.get(f'{REMOTE_ROOT}/{relative}', str(local))
            except FileNotFoundError:
                print(f'MISSING={relative}')
                continue
            digest = hashlib.sha256(local.read_bytes()).hexdigest()
            print(f'FETCHED={relative} SIZE={local.stat().st_size} SHA256={digest}')
    finally:
        sftp.close()
finally:
    ssh.close()
