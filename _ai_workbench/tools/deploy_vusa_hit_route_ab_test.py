"""Deploy exact VUSA hit-route guard to the isolated test VPS index only."""
from __future__ import annotations

import getpass
import hashlib
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_candidate_20260901/index.html"
REMOTE = "/linhhoasu/webgame/game/index.html"
EXPECTED_REMOTE = "857bd18ef39b924b5c0d7a958a32ca21ca79b9c179576c97fc61a4ea50007260"
EXPECTED_GUARD = "1e171081a591069243f9260440b7e8163d2bf56a8c82ac169d77ac1645c87678"


def q(value: str) -> str:
    return shlex.quote(value)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90, check: bool = True) -> str:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or text[-4000:] or f"remote exit {code}")
    return text


def main() -> None:
    wanted = digest(LOCAL)
    candidate_text = LOCAL.read_text(encoding="utf-8")
    guard_match = re.search(
        r"<!-- LHS_MAIN_HIT_ROUTE_V6_START -->\n<script>(.*?)</script>\n<!-- LHS_MAIN_HIT_ROUTE_V6_END -->",
        candidate_text,
        re.S,
    )
    if not guard_match or hashlib.sha256(guard_match.group(1).encode("utf-8")).hexdigest() != EXPECTED_GUARD:
        raise RuntimeError("local guard hash mismatch")
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/vusa_hit_route_v6_pre_{stamp}"
    stage = REMOTE + f".hit-route-{stamp}.html"
    installed = False
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        current = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if current != EXPECTED_REMOTE:
            raise RuntimeError(f"index precondition changed: {current}")
        run(ssh, f"set -eu; mkdir -p {q(backup)}; cp -p {q(REMOTE)} {q(backup + '/index.html')}")
        sftp = ssh.open_sftp()
        try: sftp.put(str(LOCAL), stage)
        finally: sftp.close()
        staged = run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower()
        if staged != wanted:
            raise RuntimeError("staged index hash mismatch")
        source = run(ssh, f"sed -n '/LHS_MAIN_HIT_ROUTE_V6_START/,/LHS_MAIN_HIT_ROUTE_V6_END/p' {q(stage)}")
        if "__lhsMainHitRouteV6Bootstrap" not in source or "__lhsMainLayerPriorityV8" not in source:
            raise RuntimeError("staged guard markers missing")
        run(ssh, f"mv -f -- {q(stage)} {q(REMOTE)}")
        installed = True
        served = run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/")
        if "__lhsMainHitRouteV6Bootstrap" not in served:
            raise RuntimeError("served guard marker missing")
        print(json.dumps({
            "result":"ok","host":HOST,"backup":backup,"indexSha256":wanted,
            "guardSha256":EXPECTED_GUARD,"ready":run(ssh,"curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip(),
            "backendRestarted":False
        },ensure_ascii=False,indent=2))
    except Exception:
        if installed:
            try:
                run(ssh, f"cp -p {q(backup + '/index.html')} {q(REMOTE)}")
                print("ROLLBACK=completed")
            except Exception as error:
                print(f"ROLLBACK_ERROR={error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(ssh, f"rm -f -- {q(stage)}", timeout=30, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
