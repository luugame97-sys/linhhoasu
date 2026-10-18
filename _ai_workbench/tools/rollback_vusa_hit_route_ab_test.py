"""Rollback only the VUSA hit-route A/B index on the isolated test VPS."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
REMOTE = "/linhhoasu/webgame/game/index.html"
BACKUP = "/linhhoasu/_ai_workbench/backups/vusa_hit_route_v6_pre_20260831_183442/index.html"
EXPECTED_CANDIDATE = "b55d61265f9e32e5a31ea85e4352dd0f790abec53d0fcac028edcd705c6d9d61"
EXPECTED_BASELINE = "857bd18ef39b924b5c0d7a958a32ca21ca79b9c179576c97fc61a4ea50007260"


def q(value: str) -> str:
    return shlex.quote(value)


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit {code}")
    return out


def main() -> None:
    password = getpass.getpass("Test VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        current = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if current == EXPECTED_BASELINE:
            print(json.dumps({"result":"already_baseline","host":HOST,"sha256":current},indent=2))
            return
        if current != EXPECTED_CANDIDATE:
            raise RuntimeError(f"index precondition changed: {current}")
        backup_hash = run(ssh, f"sha256sum -- {q(BACKUP)} | awk '{{print $1}}'").strip().lower()
        if backup_hash != EXPECTED_BASELINE:
            raise RuntimeError(f"backup hash mismatch: {backup_hash}")
        run(ssh, f"cp -p -- {q(BACKUP)} {q(REMOTE)}")
        live = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if live != EXPECTED_BASELINE:
            raise RuntimeError(f"rollback readback mismatch: {live}")
        print(json.dumps({"result":"rolled_back","host":HOST,"sha256":live,"backendRestarted":False},indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
