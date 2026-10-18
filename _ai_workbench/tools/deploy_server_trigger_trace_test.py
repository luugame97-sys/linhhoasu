"""Deploy read-only input/RPC instrumentation to the isolated test VPS."""
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
LOCAL_ROOT = ROOT / "_ai_workbench/temp/vusa_local_login_ui_candidate_20260901"
REMOTE_ROOT = "/linhhoasu/webgame/game"
FILES = ["js/lhs-input-trace-v1.js", "index.html"]
EXPECTED_INDEX = "1b64c3bd9ac51d8823c9b05078abfded4f5e522ccfac9eb44ae7ce01d7a400c6"


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
    output = run(
        ssh,
        f"if [ -f {q(path)} ]; then sha256sum -- {q(path)} | awk '{{print $1}}'; else echo MISSING; fi",
    ).strip()
    return None if output == "MISSING" else output.lower()


def main() -> None:
    local_hashes = {relative: sha256(LOCAL_ROOT / relative) for relative in FILES}
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/server_trigger_trace_pre_{stamp}"
    stages: list[tuple[str, str, str]] = []
    installed = False

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    try:
        remote_index = f"{REMOTE_ROOT}/index.html"
        if remote_sha(ssh, remote_index) != EXPECTED_INDEX:
            raise RuntimeError("test index precondition changed")
        remote_trace = f"{REMOTE_ROOT}/js/lhs-input-trace-v1.js"
        if remote_sha(ssh, remote_trace) is not None:
            raise RuntimeError("trace file already exists; refusing to overwrite unknown state")

        run(ssh, f"set -eu; mkdir -p {q(backup + '/js')}; cp -p {q(remote_index)} {q(backup + '/index.html')}")
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote = posixpath.join(REMOTE_ROOT, relative)
                suffix = posixpath.splitext(relative)[1]
                stage = remote + f".trace-{stamp}{suffix}"
                sftp.put(str(LOCAL_ROOT / relative), stage)
                stages.append((relative, remote, stage))
        finally:
            sftp.close()

        for relative, _remote, stage in stages:
            if remote_sha(ssh, stage) != local_hashes[relative]:
                raise RuntimeError(f"staged hash mismatch: {relative}")
            if relative.endswith(".js"):
                run(ssh, f"node --check {q(stage)}")

        # Install trace source first and switch the browser to it with index last.
        for _relative, remote, stage in stages:
            run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
        installed = True

        for relative in FILES:
            if remote_sha(ssh, posixpath.join(REMOTE_ROOT, relative)) != local_hashes[relative]:
                raise RuntimeError(f"installed hash mismatch: {relative}")

        ready = run(
            ssh,
            "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready",
        ).strip()
        http = {}
        for url in ["/", "/js/lhs-input-trace-v1.js?v=20260901_server_trigger_trace_v1"]:
            http[url] = run(
                ssh,
                "curl -sS -o /dev/null -w '%{http_code}|%{size_download}' --max-time 30 "
                + q("http://127.0.0.1:81" + url),
            ).strip()
        print(json.dumps({
            "result": "ok",
            "host": HOST,
            "backup": backup,
            "hashes": local_hashes,
            "ready": ready,
            "http": http,
            "backendRestarted": False,
        }, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                run(
                    ssh,
                    f"set -eu; cp -p {q(backup + '/index.html')} {q(REMOTE_ROOT + '/index.html')}; "
                    f"rm -f -- {q(REMOTE_ROOT + '/js/lhs-input-trace-v1.js')}",
                )
                print("ROLLBACK=completed")
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            for _relative, _remote, stage in stages:
                run(ssh, f"rm -f -- {q(stage)}", timeout=30, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
