"""Bump the trace script cache URL in the isolated test VPS index."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "_ai_workbench/temp/vusa_local_login_ui_candidate_20260901/index.html"
REMOTE = "/linhhoasu/webgame/game/index.html"
EXPECTED_REMOTE = "d074e44d743033095faaf97cf7fbd1a53a994f2c35ca2c4e7b745bb51e1c2b0d"


def q(value: str) -> str:
    return shlex.quote(value)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit {code}")
    return out


def main() -> None:
    wanted = sha256(LOCAL)
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = REMOTE + f".cache-{stamp}.html"
    backup = f"/linhhoasu/_ai_workbench/backups/trace_index_cache_pre_{stamp}"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        current = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if current != EXPECTED_REMOTE:
            raise RuntimeError(f"index precondition changed: {current}")
        run(ssh, f"mkdir -p {q(backup)}; cp -p {q(REMOTE)} {q(backup + '/index.html')}")
        sftp = ssh.open_sftp()
        try: sftp.put(str(LOCAL), stage)
        finally: sftp.close()
        staged = run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower()
        if staged != wanted:
            raise RuntimeError("staged index hash mismatch")
        run(ssh, f"mv -f -- {q(stage)} {q(REMOTE)}")
        installed = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if installed != wanted:
            run(ssh, f"cp -p {q(backup + '/index.html')} {q(REMOTE)}")
            raise RuntimeError("installed index hash mismatch; rolled back")
        print(json.dumps({"result": "ok", "host": HOST, "backup": backup,
                          "sha256": installed, "backendRestarted": False}, ensure_ascii=False, indent=2))
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(ssh, f"rm -f -- {q(stage)}")
        ssh.close()


if __name__ == "__main__":
    main()
