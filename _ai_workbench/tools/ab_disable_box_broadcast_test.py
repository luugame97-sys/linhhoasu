"""A/B test: disable only cross-user box broadcasts on S1 test VPS.

The player's own box requests/responses remain enabled. This is intentionally
test-only and rolls back all touched files if any gate fails.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import posixpath
import re
import shlex
from datetime import datetime, timezone

import paramiko


HOST = "192.168.200.151"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
FILES = ["src/handlers/box.js", "src/handlers/compat.js", "ecosystem.config.js"]
BOX_IF = b"if (wsServer && typeof wsServer.broadcastExceptUser === 'function') {"
NEW_IF = b"if (process.env.LHS_TEST_DISABLE_BOX_BROADCAST !== '1' && wsServer && typeof wsServer.broadcastExceptUser === 'function') {"
S1_MARKER = b"name: 'lhs-s1001'"
S2_MARKER = b"name: 'lhs-s1002'"
ENV_LINE = b"        LHS_TEST_DISABLE_BOX_BROADCAST: '1',\n"


def q(value: str) -> str:
    return shlex.quote(value)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90, check: bool = True) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit {code}")
    return out


def read_remote(sftp: paramiko.SFTPClient, path: str) -> bytes:
    with sftp.open(path, "rb") as handle:
        return handle.read()


def patch_ecosystem(data: bytes) -> bytes:
    start = data.find(S1_MARKER)
    end = data.find(S2_MARKER, start + 1)
    if start < 0 or end < 0:
        raise RuntimeError("lhs-s1001 ecosystem block not found")
    block = data[start:end]
    if b"LHS_TEST_DISABLE_BOX_BROADCAST" in block:
        raise RuntimeError("test broadcast flag already present")
    env_marker = b"NODE_ENV: 'production',"
    pos = block.find(env_marker)
    if pos < 0:
        raise RuntimeError("NODE_ENV marker missing in lhs-s1001 block")
    insert_at = pos + len(env_marker)
    block = block[:insert_at] + b"\n" + ENV_LINE.rstrip(b"\n") + block[insert_at:]
    return data[:start] + block + data[end:]


def main() -> None:
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/ab_disable_box_broadcast_pre_{stamp}"
    stages: list[tuple[str, str]] = []
    originals: dict[str, bytes] = {}
    candidates: dict[str, bytes] = {}
    installed = False

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                originals[relative] = read_remote(sftp, posixpath.join(REMOTE_ROOT, relative))
        finally:
            sftp.close()

        if originals["src/handlers/box.js"].count(BOX_IF) != 1:
            raise RuntimeError("box.js broadcast precondition count mismatch")
        if originals["src/handlers/compat.js"].count(BOX_IF) != 1:
            raise RuntimeError("compat.js broadcast precondition count mismatch")
        if originals["ecosystem.config.js"].count(S1_MARKER) != 1:
            raise RuntimeError("ecosystem S1 precondition count mismatch")

        candidates["src/handlers/box.js"] = originals["src/handlers/box.js"].replace(BOX_IF, NEW_IF, 1)
        candidates["src/handlers/compat.js"] = originals["src/handlers/compat.js"].replace(BOX_IF, NEW_IF, 1)
        candidates["ecosystem.config.js"] = patch_ecosystem(originals["ecosystem.config.js"])

        run(ssh, f"set -eu; mkdir -p {q(backup)}")
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote = posixpath.join(REMOTE_ROOT, relative)
                backup_remote = posixpath.join(backup, relative)
                run(ssh, f"mkdir -p {q(posixpath.dirname(backup_remote))}")
                with sftp.open(backup_remote, "wb") as handle:
                    handle.write(originals[relative])
                suffix = posixpath.splitext(relative)[1] or ".tmp"
                stage = remote + f".ab-{stamp}{suffix}"
                with sftp.open(stage, "wb") as handle:
                    handle.write(candidates[relative])
                stages.append((remote, stage))
        finally:
            sftp.close()

        for relative, data in candidates.items():
            remote = posixpath.join(REMOTE_ROOT, relative)
            stage = next(stage for target, stage in stages if target == remote)
            if run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower() != sha256(data):
                raise RuntimeError(f"stage hash mismatch: {relative}")
            if relative.endswith(".js") or relative.endswith(".config.js"):
                run(ssh, f"node --check {q(stage)}")

        for remote, stage in stages:
            run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
        installed = True

        for relative, data in candidates.items():
            remote = posixpath.join(REMOTE_ROOT, relative)
            if run(ssh, f"sha256sum -- {q(remote)} | awk '{{print $1}}'").strip().lower() != sha256(data):
                raise RuntimeError(f"installed hash mismatch: {relative}")

        run(ssh, "set -eu; cd /linhhoasu/lhs/newServer; pm2 restart ecosystem.config.js --only lhs-s1001 --update-env >/dev/null", timeout=120)
        ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready").strip()
        pm2 = run(ssh, "pm2 jlist")
        rows = json.loads(pm2)
        row = next(item for item in rows if item.get("name") == "lhs-s1001")
        env = row.get("pm2_env") or {}
        if env.get("status") != "online":
            raise RuntimeError(f"lhs-s1001 is not online: {env.get('status')}")
        print(json.dumps({
            "result": "ok",
            "host": HOST,
            "backup": backup,
            "ready": ready,
            "pid": row.get("pid"),
            "restartCount": env.get("restart_time"),
            "testFlag": env.get("LHS_TEST_DISABLE_BOX_BROADCAST"),
            "hashes": {relative: sha256(data) for relative, data in candidates.items()},
        }, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                sftp = ssh.open_sftp()
                try:
                    for relative in FILES:
                        remote = posixpath.join(REMOTE_ROOT, relative)
                        backup_remote = posixpath.join(backup, relative)
                        stage = remote + f".rollback-{stamp}{posixpath.splitext(relative)[1] or '.tmp'}"
                        sftp.get(backup_remote, stage)
                        run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
                finally:
                    sftp.close()
                run(ssh, "cd /linhhoasu/lhs/newServer; pm2 restart ecosystem.config.js --only lhs-s1001 --update-env >/dev/null", timeout=120)
                print("ROLLBACK=completed")
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            for _remote, stage in stages:
                run(ssh, f"rm -f -- {q(stage)}", timeout=30, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
