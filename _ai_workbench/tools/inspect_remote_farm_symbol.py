#!/usr/bin/env python3
"""Read-only check of production farm save helper and tag 2403 call."""
import getpass
import hashlib
import re

import paramiko

PATH = "/linhhoasu/lhs/newServer/src/handlers/farm.js"

password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("103.116.105.154", username="root", password=password,
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        with sftp.open(PATH, "rb") as handle:
            raw = handle.read()
    finally:
        sftp.close()
    text = raw.decode("utf-8", "replace")
    lines = text.splitlines()
    print("PATH", PATH)
    print("SHA256", hashlib.sha256(raw).hexdigest())
    print("LINES", len(lines), "SYMBOL_COUNT", text.count("scheduleFarmPlayerSave"))
    for idx, line in enumerate(lines, 1):
        if "scheduleFarmPlayerSave" in line or "handlePlantAddLog" in line:
            start = max(1, idx - 4)
            end = min(len(lines), idx + 12)
            print(f"CONTEXT {start}-{end}")
            for number in range(start, end + 1):
                print(f"{number}:{lines[number - 1]}")
    # Check whether helper accidentally landed inside another function/block.
    for anchor in ("async function savePlayer", "function scheduleFarmPlayerSave", "async function handlePlantAddLog"):
        matches = [i for i, row in enumerate(lines, 1) if anchor in row]
        print("ANCHOR", anchor, matches)
finally:
    ssh.close()
