"""Read-only fetch of production files for conflict-safe merge."""
from __future__ import annotations

import getpass
import hashlib
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\input_freeze_remote_current")
FILES = (
    "webgame/game/js/main.min_a6195824.js",
    "webgame/game/index.html",
    "lhs/newServer/src/net/WSServer.js",
    "lhs/newServer/src/handlers/arena.js",
    "lhs/newServer/src/db/models/Account.js",
    "lhs/newServer/src/handlers/basic.js",
    "lhs/newServer/src/bots/RealBotWorker.js",
)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=getpass.getpass("VPS password (not logged): "), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
        for rel in FILES:
            target = LOCAL_ROOT / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(f"{REMOTE_ROOT}/{rel}", str(target))
            print(f"{rel} remote_sha256={hashlib.sha256(target.read_bytes()).hexdigest()}")
    finally:
        sftp.close()
finally:
    ssh.close()
