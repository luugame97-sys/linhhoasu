#!/usr/bin/env python3
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\register_failure_remote_current_20260901')
FILES = (
    'lhs/newServer/src/handlers/serverList.js',
    'lhs/newServer/src/handlers/serverList1.js',
    'lhs/newServer/src/services/AccountService.js',
    'lhs/newServer/src/services/PlayerService.js',
    'lhs/newServer/src/db/models/Account.js',
    'lhs/newServer/src/db/models/Player.js',
    'webgame/game/register.html',
    'webgame/gm/api/user_api.php',
)


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            target = LOCAL_ROOT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                sftp.get(f'{REMOTE_ROOT}/{relative}', str(target))
            except FileNotFoundError:
                print(f'MISSING={relative}')
                continue
            print(f'FETCHED={relative} SIZE={target.stat().st_size} SHA256={hashlib.sha256(target.read_bytes()).hexdigest()}')
    finally:
        sftp.close()
finally:
    ssh.close()
