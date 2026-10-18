"""Deploy the combined-scope rollback guard in WebGM admin_api.php only."""

from __future__ import annotations

import getpass
import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "temp" / "account_management_redesign_candidate_20260901" / "webgm" / "admin" / "admin_api.php"
REMOTE = "/linhhoasu/webgame/gm/admin/admin_api.php"
EXPECTED = "da860414be4ebb517766d65bdcead3146494f093a250b99a4366763857486fb1"


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
    candidate = digest(LOCAL)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/webgm_admin_api_delta_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/webgm_admin_api_delta_{stamp}.php"
    try:
        live = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)}")
        if EXPECTED not in live:
            raise RuntimeError("live admin_api hash precondition failed: " + live)
        run(ssh, f"mkdir -p -- {shlex.quote(backup)} && cp -a -- {shlex.quote(REMOTE)} {shlex.quote(backup + '/admin_api.php')}")
        sftp = ssh.open_sftp(); sftp.put(str(LOCAL), stage); sftp.close()
        run(ssh, f"php -l {shlex.quote(stage)} >/dev/null")
        staged = run(ssh, f"sha256sum -- {shlex.quote(stage)}")
        if candidate not in staged: raise RuntimeError("stage hash mismatch")
        run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage)} {shlex.quote(REMOTE)}")
        after = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)}")
        if candidate not in after: raise RuntimeError("deployed hash mismatch")
        webgm = run(ssh, "curl -sS -o /tmp/webgm-admin-api.$$ -w '%{http_code}|%{size_download}|%{content_type}' --max-time 15 http://127.0.0.1:88/admin/index.php; rm -f /tmp/webgm-admin-api.$$")
    except Exception:
        try: run(ssh, f"test -f {shlex.quote(backup + '/admin_api.php')} && cp -a -- {shlex.quote(backup + '/admin_api.php')} {shlex.quote(REMOTE)} || true")
        except Exception: pass
        raise
    finally:
        ssh.close()
    print(json.dumps({"result":"PASS","backup":backup,"sha256":candidate,"webgm":webgm,"restart":False},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
