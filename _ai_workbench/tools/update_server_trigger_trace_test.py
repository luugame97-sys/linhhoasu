"""Update only the read-only trace script on the isolated test VPS."""
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
LOCAL = ROOT / "_ai_workbench/temp/vusa_local_login_ui_candidate_20260901/js/lhs-input-trace-v1.js"
REMOTE = "/linhhoasu/webgame/game/js/lhs-input-trace-v1.js"
EXPECTED_REMOTE = "cc3ae6509f0bb70ae64ceef0d50e8a7d82a221d2050434e0742e8a6406523eb1"


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
    stage = REMOTE + f".update-{stamp}.js"
    backup = f"/linhhoasu/_ai_workbench/backups/server_trigger_trace_update_pre_{stamp}"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        current = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if current != EXPECTED_REMOTE:
            raise RuntimeError(f"trace precondition changed: {current}")
        run(ssh, f"mkdir -p {q(backup + '/js')}; cp -p {q(REMOTE)} {q(backup + '/js/lhs-input-trace-v1.js')}")
        sftp = ssh.open_sftp()
        try: sftp.put(str(LOCAL), stage)
        finally: sftp.close()
        run(ssh, f"node --check {q(stage)}")
        staged = run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower()
        if staged != wanted:
            raise RuntimeError("staged trace hash mismatch")
        run(ssh, f"mv -f -- {q(stage)} {q(REMOTE)}")
        installed = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if installed != wanted:
            run(ssh, f"cp -p {q(backup + '/js/lhs-input-trace-v1.js')} {q(REMOTE)}")
            raise RuntimeError("installed trace hash mismatch; rolled back")
        print(json.dumps({"result": "ok", "host": HOST, "backup": backup,
                          "sha256": installed, "backendRestarted": False}, ensure_ascii=False, indent=2))
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(ssh, f"rm -f -- {q(stage)}")
        ssh.close()


if __name__ == "__main__":
    main()
