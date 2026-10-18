"""Atomically restore a production index backup made by hit-route deployment."""
from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import shlex
from datetime import datetime, timezone

import paramiko


HOST = "103.116.105.154"
REMOTE = "/linhhoasu/webgame/game/index.html"
EXPECTED_BASE = "970667f4833a439a30d1d42fea61f65c15799ec03ce72d9bd3164b495fd82a18"
EXPECTED_CANDIDATE = "9ed4b5bc65088c3cd2f178691ef68a547025b4180c8f8e74c6e492e79c3e3af9"
BACKUP_PATTERN = re.compile(
    r"^/linhhoasu/_ai_workbench/backups/prod_hit_route_v6_pre_\d{8}_\d{6}/?$"
)
LOCK_DIR = "/linhhoasu/_ai_workbench/locks"
LOCK_FILE = LOCK_DIR + "/prod_hit_route_v6.lock"


def q(value: str) -> str:
    return shlex.quote(value)


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote exit {code}")
    return output


def sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip().lower()


def metadata_stat(ssh: paramiko.SSHClient, path: str) -> str:
    basic = run(
        ssh,
        f"stat -c '%u:%g:%a|%U:%G|%s|%y' -- {q(path)}",
    ).strip()
    context = run(
        ssh,
        "if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; "
        f"then stat -c '%C' -- {q(path)}; else printf 'selinux-disabled'; fi",
    ).strip()
    prefix, separator, rest = basic.partition("|")
    if not separator:
        raise RuntimeError(f"metadata stat format mismatch: {basic}")
    return f"{prefix}:{context}|{rest}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True, help="Exact backup directory from deploy output")
    args = parser.parse_args()
    if not BACKUP_PATTERN.fullmatch(args.backup):
        raise ValueError("backup path is outside the allowed hit-route backup prefix")
    backup_index = args.backup.rstrip("/") + "/index.html"
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass(
        "Production password (not logged): "
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = REMOTE + f".rollback-stage-{stamp}"
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    try:
        current = sha(ssh, REMOTE)
        backup_hash = sha(ssh, backup_index)
        if current != EXPECTED_CANDIDATE:
            raise RuntimeError(f"current index is not the expected candidate: {current}")
        if backup_hash != EXPECTED_BASE:
            raise RuntimeError(f"backup hash mismatch: {backup_hash}")
        live_stat = metadata_stat(ssh, REMOTE)
        run(
            ssh,
            "set -eu; "
            f"mkdir -p -- {q(LOCK_DIR)}; "
            f"flock -x {q(LOCK_FILE)} sh -c "
            + q(
                "set -eu; "
                f"test \"$(sha256sum -- {q(REMOTE)} | awk '{{print $1}}')\" = {q(EXPECTED_CANDIDATE)}; "
                f"cp -p -- {q(backup_index)} {q(stage)}; "
                f"chown --reference={q(REMOTE)} {q(stage)}; "
                f"chmod --reference={q(REMOTE)} {q(stage)}; "
                f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE)} {q(stage)}; fi; "
                f"mv -f -- {q(stage)} {q(REMOTE)}"
            ),
        )
        disk = sha(ssh, REMOTE)
        served = run(
            ssh,
            f"curl -fsS --max-time 20 {q('http://127.0.0.1:81/index.html?rollback=' + stamp)} | sha256sum | awk '{{print $1}}'",
        ).strip().lower()
        if disk != EXPECTED_BASE or served != EXPECTED_BASE:
            raise RuntimeError(f"rollback verify failed: disk={disk}, served={served}")
        restored_stat = metadata_stat(ssh, REMOTE)
        if restored_stat.split("|", 1)[0] != live_stat.split("|", 1)[0]:
            raise RuntimeError(
                f"rollback metadata mismatch: live={live_stat}, restored={restored_stat}"
            )
        print(json.dumps({"result": "ROLLED_BACK", "diskSha256": disk, "servedSha256": served, "restoredStat": restored_stat}, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
