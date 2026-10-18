"""Deploy the restored local login UI to the isolated test VPS only."""
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
CANDIDATE = ROOT / "_ai_workbench/temp/vusa_local_login_ui_candidate_20260901"
REMOTE_ROOT = "/linhhoasu/webgame/game"
FILES = ["js/main.min_vi_1e47377c.js", "index.html"]
EXPECTED = {
    "js/main.min_vi_1e47377c.js": "1e47377c1025a9e68a32c180844a85f7e7411fe2753f2f327db1fd4d8c35377e",
    "index.html": "857bd18ef39b924b5c0d7a958a32ca21ca79b9c179576c97fc61a4ea50007260",
}


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


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip().lower()


def main() -> None:
    local_hashes = {relative: sha256(CANDIDATE / relative) for relative in FILES}
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/vusa_local_login_ui_pre_{stamp}"
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
        for relative in FILES:
            remote = posixpath.join(REMOTE_ROOT, relative)
            actual = remote_sha(ssh, remote)
            if actual != EXPECTED[relative]:
                raise RuntimeError(f"remote precondition changed for {relative}: {actual}")

        run(
            ssh,
            f"set -eu; mkdir -p {q(backup + '/js')}; "
            f"cp -p {q(REMOTE_ROOT + '/index.html')} {q(backup + '/index.html')}; "
            f"cp -p {q(REMOTE_ROOT + '/js/main.min_vi_1e47377c.js')} "
            f"{q(backup + '/js/main.min_vi_1e47377c.js')}",
        )

        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote = posixpath.join(REMOTE_ROOT, relative)
                suffix = posixpath.splitext(relative)[1]
                stage = remote + f".local-login-{stamp}{suffix}"
                sftp.put(str(CANDIDATE / relative), stage)
                stages.append((relative, remote, stage))
        finally:
            sftp.close()

        for relative, _remote, stage in stages:
            if remote_sha(ssh, stage) != local_hashes[relative]:
                raise RuntimeError(f"staged hash mismatch: {relative}")
            if relative.endswith(".js"):
                run(ssh, f"node --check {q(stage)}")

        # Bundle first, index last to switch cache marker atomically.
        for _relative, remote, stage in stages:
            run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
        installed = True

        for relative in FILES:
            remote = posixpath.join(REMOTE_ROOT, relative)
            if remote_sha(ssh, remote) != local_hashes[relative]:
                raise RuntimeError(f"installed hash mismatch: {relative}")

        ready = run(
            ssh,
            "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready",
        ).strip()
        http = {}
        for url in ["/", "/js/main.min_vi_1e47377c.js?v=20260901_vusa_local_login_ui_v2"]:
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
                    f"cp -p {q(backup + '/js/main.min_vi_1e47377c.js')} "
                    f"{q(REMOTE_ROOT + '/js/main.min_vi_1e47377c.js')}",
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
