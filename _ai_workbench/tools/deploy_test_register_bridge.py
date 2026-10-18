"""Deploy the test-only login storage bridge to register.html."""
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
LOCAL = ROOT / "_ai_workbench/temp/test_register_page_20260831.html"
REMOTE = "/linhhoasu/webgame/game/register.html"


def q(value: str) -> str:
    return shlex.quote(value)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or text[-4000:] or f"remote exit {code}")
    return text


def main() -> None:
    wanted = sha(LOCAL)
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/test_register_bridge_pre_{stamp}"
    stage = REMOTE + f".bridge-{stamp}.html"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        run(ssh, f"set -eu; mkdir -p {q(backup)}; cp -p {q(REMOTE)} {q(backup + '/register.html')}")
        sftp = ssh.open_sftp()
        try: sftp.put(str(LOCAL), stage)
        finally: sftp.close()
        if run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower() != wanted:
            raise RuntimeError("staged hash mismatch")
        run(ssh, f"mv -f -- {q(stage)} {q(REMOTE)}")
        live = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if live != wanted:
            run(ssh, f"cp -p {q(backup + '/register.html')} {q(REMOTE)}")
            raise RuntimeError("live hash mismatch; rolled back")
        print(json.dumps({"result":"ok","host":HOST,"backup":backup,"sha256":live,"backendRestarted":False},ensure_ascii=False,indent=2))
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active(): run(ssh, f"rm -f -- {q(stage)}", timeout=30)
        ssh.close()


if __name__ == "__main__":
    main()
