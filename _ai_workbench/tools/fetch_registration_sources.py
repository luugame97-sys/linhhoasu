#!/usr/bin/env python3
"""Fetch current production registration/auth sources without mutating VPS."""
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\registration_remote_current")
FILES = (
    "ecosystem.config.js",
    "src/handlers/serverList.js",
    "src/handlers/serverList1.js",
    "src/services/AccountService.js",
    "src/net/HTTPServer.js",
    "src/net/HTTPServer1.js",
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
            print(f"FETCHED={relative} SHA256={hashlib.sha256(target.read_bytes()).hexdigest()}")
    finally:
        sftp.close()
finally:
    ssh.close()
