"""Deploy the small WebGM checkbox alignment fix with rollback."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
WORKBENCH = Path(__file__).resolve().parents[1]
LOCAL = WORKBENCH / "temp" / "xu_checkbox_alignment_candidate_20260901" / "admin" / "index.php"
REMOTE = "/linhhoasu/webgame/gm/admin/index.php"
EXPECTED = "d5ea1a8a59e1692159fa0843902ae2799159a280f0303af71fb3aab75330cba2"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-5000:] or output[-5000:] or f"remote exit={code}")
    return output


def main() -> None:
    if not LOCAL.is_file():
        raise SystemExit(f"missing candidate: {LOCAL}")
    candidate = digest(LOCAL)
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/webgm_xu_checkbox_alignment_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/webgm_xu_checkbox_alignment_{stamp}.php"
    try:
        live = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)}")
        if EXPECTED not in live:
            raise RuntimeError("live hash precondition failed: " + live.strip())
        run(ssh, f"mkdir -p -- {shlex.quote(backup)} && cp -a -- {shlex.quote(REMOTE)} {shlex.quote(backup + '/index.php')}")
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL), stage)
        finally:
            sftp.close()
        run(ssh, f"php -l {shlex.quote(stage)} >/dev/null")
        staged = run(ssh, f"sha256sum -- {shlex.quote(stage)}")
        if candidate not in staged:
            raise RuntimeError("stage hash mismatch")
        run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage)} {shlex.quote(REMOTE)}")
        after = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)}")
        if candidate not in after:
            raise RuntimeError("deployed hash mismatch")
        http = run(ssh, "printf 'page='; curl -sS -o /dev/null -w '%{http_code}|%{content_type}' --max-time 15 http://127.0.0.1:88/admin/index.php; printf '\njs='; curl -sS -o /dev/null -w '%{http_code}|%{content_type}' --max-time 15 http://127.0.0.1:88/assets/js/admin.js; printf '\nready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:8080/ready")
    except Exception:
        try:
            run(ssh, f"test -f {shlex.quote(backup + '/index.php')} && cp -a -- {shlex.quote(backup + '/index.php')} {shlex.quote(REMOTE)} || true")
        except Exception:
            pass
        raise
    finally:
        ssh.close()
    print(json.dumps({"result": "PASS", "backup": backup, "stage": stage,
                      "sha256": candidate, "http": http, "restart": False},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
