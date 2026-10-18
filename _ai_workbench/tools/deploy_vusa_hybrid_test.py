"""Deploy the hybrid VUSA runtime to the isolated test VPS only."""
from __future__ import annotations

import getpass
import hashlib
import json
import posixpath
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = sorted((ROOT / "_ai_workbench/temp").glob("vusa_hybrid_test_candidate_*"))[-1]
LOCAL_GAME = CANDIDATE / "linhhoasu/webgame/game"
REMOTE_GAME = "/linhhoasu/webgame/game"
EXPECTED_INDEX = "d0ebe0044539d71993327c1b75e8d3bc11aaacce3d76f1b50e69a3138e3353cc"
FILES = [
    "js/egret.min_vi_45030898.js",
    "js/start.min_vi_fe8efd0a.js",
    "js/main.min_vi_1e47377c.js",
    "fonts/vusagaming_a3b36b35.woff2",
    "index.html",
]


def q(value: str) -> str:
    return shlex.quote(value)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90, check: bool = True) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit {code}")
    return out


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str | None:
    value = run(ssh, f"if [ -f {q(path)} ]; then sha256sum {q(path)} | awk '{{print $1}}'; else echo MISSING; fi").strip()
    return None if value == "MISSING" else value.splitlines()[-1].lower()


def stage_path(remote: str, stamp: str) -> str:
    suffix = posixpath.splitext(remote)[1] or ".tmp"
    return remote + f".vusa-hybrid-{stamp}" + suffix


def main() -> None:
    local_hashes = {}
    for relative in FILES:
        path = LOCAL_GAME / relative
        if not path.is_file():
            raise FileNotFoundError(path)
        local_hashes[relative] = sha256(path)

    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/vusa_hybrid_pre_{stamp}"
    stages = []
    installed = False
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        current_index = remote_sha(ssh, REMOTE_GAME + "/index.html")
        if current_index != EXPECTED_INDEX:
            raise RuntimeError(f"test index precondition changed: {current_index}")
        run(ssh, f"set -eu; mkdir -p {q(backup)}; cp -a {q(REMOTE_GAME + '/index.html')} {q(backup + '/index.html')}")

        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote = REMOTE_GAME + "/" + relative
                stage = stage_path(remote, stamp)
                stages.append(stage)
                run(ssh, f"mkdir -p {q(posixpath.dirname(remote))}")
                sftp.put(str(LOCAL_GAME / relative), stage)
                run(ssh, f"chmod 777 {q(stage)}; chown 0:0 {q(stage)}")
        finally:
            sftp.close()

        # Validate staged hash and JS syntax before changing any live path.
        for relative in FILES:
            remote = REMOTE_GAME + "/" + relative
            stage = stage_path(remote, stamp)
            if remote_sha(ssh, stage) != local_hashes[relative]:
                raise RuntimeError("staged hash mismatch: " + relative)
            if relative.endswith(".js"):
                run(ssh, f"node --check {q(stage)}")

        # Install unique runtime assets first; index is last and atomically
        # switches the browser to the candidate.
        for relative in FILES:
            remote = REMOTE_GAME + "/" + relative
            stage = stage_path(remote, stamp)
            run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
        installed = True

        served = {}
        for relative in FILES:
            remote = REMOTE_GAME + "/" + relative
            actual = remote_sha(ssh, remote)
            if actual != local_hashes[relative]:
                raise RuntimeError("installed hash mismatch: " + relative)
            served[relative] = actual
        http = run(
            ssh,
            "set -eu; for u in / /js/egret.min_vi_45030898.js /js/start.min_vi_fe8efd0a.js /js/main.min_vi_1e47377c.js /fonts/vusagaming_a3b36b35.woff2; do "
            "printf '%s|' \"$u\"; curl -sS -o /tmp/vusa_hybrid.$$ -w '%{http_code}|%{size_download}\\n' --max-time 20 \"http://127.0.0.1:81$u\"; rm -f /tmp/vusa_hybrid.$$; done",
        )
        ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready").strip()
        print(json.dumps({"result": "ok", "host": HOST, "backup": backup, "http": http, "ready": ready, "hashes": served}, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                run(ssh, f"cp -a {q(backup + '/index.html')} {q(REMOTE_GAME + '/index.html')}")
            except Exception as rollback_error:
                print("ROLLBACK_ERROR=" + str(rollback_error))
        raise
    finally:
        for stage in stages:
            run(ssh, f"rm -f -- {q(stage)}", timeout=30, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
