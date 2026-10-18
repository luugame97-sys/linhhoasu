#!/usr/bin/env python3
"""Safely enable the in-game random-registration flow on s1001.

Only the lhs-s1001 PM2 process is restarted.  The script takes a remote
backup, verifies that the ecosystem file has not changed since the read-only
fetch, uploads the one-line candidate, and runs an ephemeral registration
E2E which removes its own account/player/session afterwards.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
import time
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
REMOTE_ECOSYSTEM = f"{REMOTE_ROOT}/ecosystem.config.js"
LOCAL_CANDIDATE = Path(
    r"I:\Linhhoasu\server\server\_ai_workbench\temp\registration_remote_current\ecosystem.config.js"
)
LOCAL_TEST = Path(
    r"I:\Linhhoasu\server\server\_ai_workbench\tools\test_registration_live.js"
)
EXPECTED_REMOTE_SHA256 = "1b1eab2d3bf809e31ee0d64903d50aedc5b9521e568fc0b6ed741517be437016"


def run(ssh: paramiko.SSHClient, command: str, timeout: float = 45) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command)
    stdout.channel.settimeout(timeout)
    output = stdout.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    error = stderr.read().decode("utf-8", "replace")
    if code:
        raise RuntimeError(f"remote command failed ({code}): {error[-2000:] or output[-2000:]}")
    return output


def snapshot(ssh: paramiko.SSHClient) -> dict[str, dict[str, object]]:
    command = (
        "pm2 jlist | node -e "
        + shlex.quote(
            "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
            "const names=['lhs-s1001','lhs-real-bots','lhs-dist','lhs-admin'];"
            "for(const p of JSON.parse(s)){if(names.includes(p.name)){const e=p.pm2_env||{};"
            "console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time,uptime:e.pm_uptime}))}}})"
        )
    )
    rows: dict[str, dict[str, object]] = {}
    for line in run(ssh, command).splitlines():
        try:
            row = json.loads(line)
            rows[str(row["name"])] = row
        except (ValueError, KeyError):
            continue
    return rows


def env_snapshot(ssh: paramiko.SSHClient) -> dict[str, str]:
    command = (
        "pid=$(pm2 pid lhs-s1001 | tail -1); "
        "tr '\\0' '\\n' </proc/$pid/environ | "
        "grep -E '^(SERVER_ID|REQUIRE_INVITE_REGISTER|ALLOW_AUTO_REGISTER|"
        "SDK_AUTH_PASSWORD_STRICT|USER_CLIENT_VALIDATION_ENABLED)=' | sort"
    )
    result: dict[str, str] = {}
    for line in run(ssh, command).splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key] = value
    return result


def wait_ready(ssh: paramiko.SSHClient, seconds: int = 60) -> str:
    command = (
        "for i in $(seq 1 "
        f"{seconds}"
        "); do c=$(curl -sS -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1:8080/ready || true); "
        "if [ \"$c\" = 200 ]; then echo READY=200; exit 0; fi; sleep 1; done; "
        "echo READY=FAIL; exit 1"
    )
    return run(ssh, command, timeout=seconds + 15).strip()


password = getpass.getpass("VPS password (not logged): ")
if not LOCAL_CANDIDATE.is_file() or not LOCAL_TEST.is_file():
    raise SystemExit("candidate ecosystem or E2E test file is missing")

candidate_bytes = LOCAL_CANDIDATE.read_bytes()
candidate_sha = hashlib.sha256(candidate_bytes).hexdigest()
if candidate_sha == EXPECTED_REMOTE_SHA256:
    raise SystemExit("candidate does not contain a change")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False,
            allow_agent=False, timeout=15)
backup = ""
changed = False
rolled_back = False
before: dict[str, dict[str, object]] = {}
try:
    before = snapshot(ssh)
    if before.get("lhs-s1001", {}).get("status") != "online":
        raise RuntimeError("lhs-s1001 is not online; refusing to restart it")

    remote_sha = run(ssh, f"sha256sum {shlex.quote(REMOTE_ECOSYSTEM)} | awk '{{print $1}}'").strip()
    if remote_sha != EXPECTED_REMOTE_SHA256:
        raise RuntimeError(
            "remote ecosystem changed after read-only fetch; refusing to overwrite "
            f"(expected {EXPECTED_REMOTE_SHA256}, got {remote_sha})"
        )

    stamp = run(ssh, "date +%Y%m%d_%H%M%S").strip()
    backup = f"/linhhoasu/_ai_workbench/backups/registration_enable_pre_{stamp}"
    staging = f"/linhhoasu/_ai_workbench/temp/registration_enable_{stamp}"
    run(ssh, f"mkdir -p {shlex.quote(backup)} {shlex.quote(staging)}")
    run(ssh, f"cp -p {shlex.quote(REMOTE_ECOSYSTEM)} {shlex.quote(backup + '/ecosystem.config.js')}")
    run(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}")

    sftp = ssh.open_sftp()
    try:
        remote_candidate = f"{staging}/ecosystem.config.js"
        remote_test = f"{staging}/test_registration_live.js"
        sftp.put(str(LOCAL_CANDIDATE), remote_candidate)
        sftp.put(str(LOCAL_TEST), remote_test)
    finally:
        sftp.close()

    remote_candidate_sha = run(ssh, f"sha256sum {shlex.quote(staging + '/ecosystem.config.js')} | awk '{{print $1}}'").strip()
    if remote_candidate_sha != candidate_sha:
        raise RuntimeError("candidate upload hash mismatch")
    run(ssh, f"node --check {shlex.quote(staging + '/ecosystem.config.js')}")
    run(ssh, f"cmp -s {shlex.quote(staging + '/ecosystem.config.js')} {shlex.quote(REMOTE_ECOSYSTEM)} || true")
    run(ssh, f"cp -p {shlex.quote(staging + '/ecosystem.config.js')} {shlex.quote(REMOTE_ECOSYSTEM)}")
    changed = True
    deployed_sha = run(ssh, f"sha256sum {shlex.quote(REMOTE_ECOSYSTEM)} | awk '{{print $1}}'").strip()
    if deployed_sha != candidate_sha:
        raise RuntimeError("remote ecosystem hash after replacement mismatch")

    # Explicit assignment guarantees PM2 receives the new value even though
    # `pm2 restart <name>` normally keeps the old process environment.
    run(ssh, "REQUIRE_INVITE_REGISTER=0 pm2 restart lhs-s1001 --update-env", timeout=120)
    run(ssh, "pm2 save", timeout=45)
    ready = wait_ready(ssh)
    after = snapshot(ssh)
    env = env_snapshot(ssh)
    if after.get("lhs-s1001", {}).get("status") != "online":
        raise RuntimeError(f"lhs-s1001 did not return online: {after.get('lhs-s1001')}")
    for name in ("lhs-real-bots", "lhs-dist", "lhs-admin"):
        if name in before and name in after and before[name].get("pid") != after[name].get("pid"):
            raise RuntimeError(f"unexpected restart of {name}")
    expected_env = {
        "SERVER_ID": "1001",
        "REQUIRE_INVITE_REGISTER": "0",
        "ALLOW_AUTO_REGISTER": "0",
        "SDK_AUTH_PASSWORD_STRICT": "1",
        "USER_CLIENT_VALIDATION_ENABLED": "1",
    }
    if any(env.get(k) != v for k, v in expected_env.items()):
        raise RuntimeError(f"strict/registration environment mismatch: {env}")

    # Full disposable flow: 2817 -> 2818 -> 2820 -> WS, with cleanup.
    test_output = run(ssh, f"cd {shlex.quote(REMOTE_ROOT)} && node {shlex.quote(staging + '/test_registration_live.js')}", timeout=120)
    if '"result":"PASS"' not in test_output:
        raise RuntimeError(f"registration E2E did not pass: {test_output[-3000:]}")

    log_output = run(
        ssh,
        "grep -h -E 'runtime ready revision=|POST gameMsg.do cmd=(2817|2818|2820)|"
        "SyntaxError|ReferenceError|TypeError|Unhandled|FATAL' "
        "/root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log "
        "2>/dev/null | tail -n 80 || true",
    )
    print(f"BACKUP={backup}")
    print(f"CANDIDATE_SHA256={candidate_sha}")
    print(ready)
    print("ENV=" + json.dumps(env, sort_keys=True))
    print("PM2_BEFORE=" + json.dumps(before, sort_keys=True))
    print("PM2_AFTER=" + json.dumps(after, sort_keys=True))
    print("REGISTRATION_E2E=" + test_output.strip())
    print("RECENT_LOGS_START")
    print(log_output.strip())
    print("RECENT_LOGS_END")
except Exception:
    if changed and backup:
        try:
            run(ssh, f"cp -p {shlex.quote(backup + '/ecosystem.config.js')} {shlex.quote(REMOTE_ECOSYSTEM)}")
            run(ssh, "REQUIRE_INVITE_REGISTER=1 pm2 restart lhs-s1001 --update-env", timeout=120)
            run(ssh, "pm2 save", timeout=45)
            rolled_back = True
        except Exception as rollback_error:
            raise RuntimeError(f"deployment failed and rollback failed: {rollback_error}")
    raise
finally:
    ssh.close()
