"""Enable invite-free registration only for lhs-s1001 on the isolated test VPS."""
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
REMOTE_CONFIG = "/linhhoasu/lhs/newServer/ecosystem.config.js"
PROCESS = "lhs-s1001"
PROCESS_MARKER = b"name: 'lhs-s1001'"
NEXT_PROCESS_MARKER = b"name: 'lhs-s1002'"
COMMENTED_FLAG = re.compile(rb"(?m)^([ \t]*)//[ \t]*REQUIRE_INVITE_REGISTER[ \t]*:[ \t]*0,[ \t]*$")
ACTIVE_FLAG = re.compile(rb"(?m)^([ \t]*)REQUIRE_INVITE_REGISTER[ \t]*:[ \t]*0,[ \t]*$")


def q(value: str) -> str:
    return shlex.quote(value)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit {code}")
    return out


def main() -> None:
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/test_registration_pre_{stamp}"
    staged = REMOTE_CONFIG + f".registration-{stamp}.js"

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
        sftp = ssh.open_sftp()
        try:
            with sftp.open(REMOTE_CONFIG, "rb") as handle:
                current = handle.read()
        finally:
            sftp.close()

        start = current.find(PROCESS_MARKER)
        end = current.find(NEXT_PROCESS_MARKER, start + 1)
        if start < 0 or end < 0:
            raise RuntimeError("ecosystem precondition failed: lhs-s1001 block not found")
        block = current[start:end]
        active_matches = list(ACTIVE_FLAG.finditer(block))
        commented_matches = list(COMMENTED_FLAG.finditer(block))
        if len(active_matches) == 1 and not commented_matches:
            changed = False
            candidate = current
        else:
            if active_matches or len(commented_matches) != 1:
                raise RuntimeError(
                    "ecosystem precondition failed: expected one commented flag in lhs-s1001 block"
                )
            match = commented_matches[0]
            replacement = match.group(1) + b"REQUIRE_INVITE_REGISTER: 0,"
            block = block[:match.start()] + replacement + block[match.end():]
            candidate = current[:start] + block + current[end:]
            changed = True

        run(
            ssh,
            f"set -eu; mkdir -p {q(backup_dir)}; "
            f"cp -p {q(REMOTE_CONFIG)} {q(posixpath.join(backup_dir, 'ecosystem.config.js'))}",
        )

        sftp = ssh.open_sftp()
        try:
            with sftp.open(staged, "wb") as handle:
                handle.write(candidate)
        finally:
            sftp.close()

        run(ssh, f"set -eu; node --check {q(staged)}; mv -f -- {q(staged)} {q(REMOTE_CONFIG)}")
        if run(ssh, f"sha256sum {q(REMOTE_CONFIG)} | awk '{{print $1}}'").strip() != sha256(candidate):
            raise RuntimeError("installed ecosystem hash mismatch")

        before = json.loads(run(ssh, "pm2 jlist"))
        before_row = next((row for row in before if row.get("name") == PROCESS), None)
        if not before_row:
            raise RuntimeError(f"{PROCESS} is not managed by PM2")

        run(
            ssh,
            "set -eu; cd /linhhoasu/lhs/newServer; "
            f"pm2 restart ecosystem.config.js --only {q(PROCESS)} --update-env >/dev/null; "
            "for i in $(seq 1 45); do "
            "code=$(curl -sS -o /tmp/test_registration_ready.$$ -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true); "
            "if [ \"$code\" = 200 ] && ss -lnt | grep -q ':9200 '; then exit 0; fi; sleep 1; done; exit 1",
            timeout=120,
        )
        after = json.loads(run(ssh, "pm2 jlist"))
        after_row = next(row for row in after if row.get("name") == PROCESS)
        env = after_row.get("pm2_env") or {}
        status = {
            "host": HOST,
            "process": PROCESS,
            "changed": changed,
            "backup": backup_dir,
            "registration": str(env.get("REQUIRE_INVITE_REGISTER")),
            "status": env.get("status"),
            "pid": after_row.get("pid"),
            "restart_before": (before_row.get("pm2_env") or {}).get("restart_time"),
            "restart_after": env.get("restart_time"),
            "ready": run(
                ssh,
                "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready",
            ).strip(),
            "listeners": run(
                ssh,
                "ss -lnt | awk '$4 ~ /:(81|8080|9200)$/ {print $4}' | sort -u",
            ).splitlines(),
            "config_sha256": sha256(candidate),
        }
        print(json.dumps(status, ensure_ascii=False, indent=2))
    finally:
        run(ssh, f"rm -f -- {q(staged)}", timeout=30) if ssh.get_transport() else None
        ssh.close()


if __name__ == "__main__":
    main()
