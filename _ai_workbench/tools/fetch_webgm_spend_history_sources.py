#!/usr/bin/env python3
"""Fetch current production WebGM player-page sources for conflict-safe editing."""
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/webgame/gm"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_spend_history_current")
FILES = (
    "index.php",
    "config.php",
    "api/user_api.php",
    "assets/js/index.js",
    "assets/css/index.css",
)


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False,
            allow_agent=False, timeout=15)
try:
    LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            target = LOCAL_ROOT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(f"{REMOTE_ROOT}/{relative}", str(target))
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            print(f"FETCHED={relative} SIZE={target.stat().st_size} SHA256={digest}")
    finally:
        sftp.close()
finally:
    ssh.close()
