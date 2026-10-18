#!/usr/bin/env python3
"""Deploy the canonical registration redirect to the production game client.

The deployment is deliberately narrow:

* client ``main.min...js`` and ``index.html`` are replaced atomically;
* ``REQUIRE_INVITE_REGISTER`` is set to ``1`` so the legacy random-account
  endpoint cannot bypass the invite-based web flow;
* only ``lhs-s1001`` is restarted;
* a remote backup and PM2 snapshot are created before any replacement;
* safe read-only probes verify the redirect marker and invite gate.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
import subprocess
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu"
REMOTE_APP = f"{REMOTE_ROOT}/lhs/newServer"
REMOTE_FILES = {
    "main": f"{REMOTE_ROOT}/webgame/game/js/main.min_a6195824.js",
    "index": f"{REMOTE_ROOT}/webgame/game/index.html",
    "ecosystem": f"{REMOTE_APP}/ecosystem.config.js",
}
LOCAL_FILES = {
    "main": Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"),
    "index": Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html"),
    "ecosystem": Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\registration_remote_current\ecosystem.config.js"),
}
EXPECTED_REMOTE = {
    "main": "a8b67b5d55a81389f3ba440603dea602c6823d2ab385808ce45970db69c550e1",
    "index": "0b75482b5a0a39a490d52aa06a92fc8a4d9201afb8f6d0566b42cc3417bf0199",
    # This is the ecosystem after the earlier diagnostic enablement (only
    # REQUIRE_INVITE_REGISTER=0 changed); it is our exact precondition.
    "ecosystem": "a81efbecd50113fef2ccbcf356680b8611bc89948ee49979fde43558ea3d2b52",
}
EXPECTED_LOCAL = {
    "main": "e30b3663edfdd284c36a4915cbe3f39fcd6236dccf4d503ce2e256ca7d22ab9c",
    "index": "39d70a1d91090500245bb00aea6ef25223230213b01ebc12f8c94500560274ed",
    "ecosystem": "cd134fad237a32907522bd27e6cdb504d23730c2388b4f81b314c779b75b8593",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: float = 60) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command)
    stdout.channel.settimeout(timeout)
    output = stdout.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    error = stderr.read().decode("utf-8", "replace")
    if code:
        raise RuntimeError(f"remote command failed ({code}): {error[-3000:] or output[-3000:]}")
    return output


def pm2_snapshot(ssh: paramiko.SSHClient) -> dict[str, dict[str, object]]:
    js = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const names=['lhs-s1001','lhs-real-bots','lhs-dist','lhs-admin'];"
        "for(const p of JSON.parse(s)){if(names.includes(p.name)){const e=p.pm2_env||{};"
        "console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time,uptime:e.pm_uptime}))}}})"
    )
    command = "pm2 jlist | node -e " + shlex.quote(js)
    rows: dict[str, dict[str, object]] = {}
    for line in run(ssh, command).splitlines():
        try:
            row = json.loads(line)
            rows[str(row["name"])] = row
        except (ValueError, KeyError):
            pass
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
        "); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); "
        "if [ \"$c\" = 200 ]; then echo READY=200; exit 0; fi; sleep 1; done; "
        "echo READY=FAIL; exit 1"
    )
    return run(ssh, command, timeout=seconds + 15).strip()


def run_safe_local_probe(script: Path) -> str:
    completed = subprocess.run(
        ["node", str(script)],
        cwd=str(script.parents[2]),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=30,
        check=False,
    )
    output = (completed.stdout or "") + (completed.stderr or "")
    if completed.returncode != 0:
        raise RuntimeError(f"local registration probe failed: {output[-3000:]}")
    return output.strip()


for name, path in LOCAL_FILES.items():
    if not path.is_file():
        raise SystemExit(f"missing local candidate: {path}")
    actual = sha256_bytes(path.read_bytes())
    if actual != EXPECTED_LOCAL[name]:
        raise SystemExit(f"local candidate hash mismatch for {name}: {actual}")

password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False,
            allow_agent=False, timeout=15)
backup = ""
staging = ""
changed = False
before: dict[str, dict[str, object]] = {}
try:
    before = pm2_snapshot(ssh)
    if before.get("lhs-s1001", {}).get("status") != "online":
        raise RuntimeError("lhs-s1001 is not online; refusing to restart")

    remote_hashes: dict[str, str] = {}
    for name, remote_path in REMOTE_FILES.items():
        remote_hashes[name] = run(
            ssh, f"sha256sum {shlex.quote(remote_path)} | awk '{{print $1}}'"
        ).strip()
        if remote_hashes[name] != EXPECTED_REMOTE[name]:
            raise RuntimeError(
                f"remote {name} changed after audit; refusing overwrite "
                f"(expected {EXPECTED_REMOTE[name]}, got {remote_hashes[name]})"
            )

    stamp = run(ssh, "date +%Y%m%d_%H%M%S").strip()
    backup = f"{REMOTE_ROOT}/_ai_workbench/backups/register_redirect_pre_{stamp}"
    staging = f"{REMOTE_ROOT}/_ai_workbench/temp/register_redirect_{stamp}"
    run(ssh, f"mkdir -p {shlex.quote(backup)} {shlex.quote(staging)}")
    for name, remote_path in REMOTE_FILES.items():
        run(ssh, f"cp -p {shlex.quote(remote_path)} {shlex.quote(backup + '/' + name)}")
    run(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}")

    staged_paths: dict[str, str] = {
        name: f"{staging}/{name}{'.js' if name == 'main' else ('.html' if name == 'index' else '')}"
        for name in REMOTE_FILES
    }
    sftp = ssh.open_sftp()
    try:
        for name, local_path in LOCAL_FILES.items():
            sftp.put(str(local_path), staged_paths[name])
    finally:
        sftp.close()

    for name, staged_path in staged_paths.items():
        uploaded = run(ssh, f"sha256sum {shlex.quote(staged_path)} | awk '{{print $1}}'").strip()
        expected = sha256_bytes(LOCAL_FILES[name].read_bytes())
        if uploaded != expected:
            raise RuntimeError(f"staged {name} hash mismatch")
    run(ssh, f"node --check {shlex.quote(staged_paths['main'])}")
    run(ssh, f"node --check {shlex.quote(staged_paths['ecosystem'])}")
    run(ssh, f"grep -q 'register.html?inviteCode=TY7C1A' {shlex.quote(staged_paths['main'])}")
    run(ssh, f"grep -q '20260831_register_redirect_v1' {shlex.quote(staged_paths['index'])}")
    config_check = run(
        ssh,
        "node -e " + shlex.quote(
            "const c=require(process.argv[1]);const e=c.apps.find(x=>x.name==='lhs-s1001').env;"
            "if(String(e.REQUIRE_INVITE_REGISTER)!=='1')process.exit(2);"
            "if(String(e.ALLOW_AUTO_REGISTER)!=='0'||String(e.SDK_AUTH_PASSWORD_STRICT)!=='1'||"
            "String(e.USER_CLIENT_VALIDATION_ENABLED)!=='1')process.exit(3);console.log('CONFIG_POLICY=PASS')"
        ) + " " + shlex.quote(staged_paths['ecosystem'])
    ).strip()

    changed = True
    for name, remote_path in REMOTE_FILES.items():
        run(ssh, f"mv {shlex.quote(staged_paths[name])} {shlex.quote(remote_path)}")
        run(ssh, f"chmod 644 {shlex.quote(remote_path)}")
    run(ssh, "REQUIRE_INVITE_REGISTER=1 pm2 restart lhs-s1001 --update-env", timeout=120)
    run(ssh, "pm2 save", timeout=45)
    ready = wait_ready(ssh)
    after = pm2_snapshot(ssh)
    env = env_snapshot(ssh)
    if after.get("lhs-s1001", {}).get("status") != "online":
        raise RuntimeError(f"lhs-s1001 not online after restart: {after.get('lhs-s1001')}")
    for name in ("lhs-real-bots", "lhs-dist", "lhs-admin"):
        if name in before and name in after and before[name].get("pid") != after[name].get("pid"):
            raise RuntimeError(f"unexpected restart of {name}")
    expected_env = {
        "SERVER_ID": "1001",
        "REQUIRE_INVITE_REGISTER": "1",
        "ALLOW_AUTO_REGISTER": "0",
        "SDK_AUTH_PASSWORD_STRICT": "1",
        "USER_CLIENT_VALIDATION_ENABLED": "1",
    }
    if any(env.get(k) != v for k, v in expected_env.items()):
        raise RuntimeError(f"runtime policy mismatch: {env}")

    served_index = run(ssh, "curl -fsS 'http://127.0.0.1:81/index.html?v=20260831_register_redirect_v1'")
    if "20260831_register_redirect_v1" not in served_index:
        raise RuntimeError("served index cache token mismatch")
    served_main_hash = run(
        ssh,
        "curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v=20260831_register_redirect_v1' | sha256sum | awk '{print $1}'",
    ).strip()
    candidate_main_hash = sha256_bytes(LOCAL_FILES["main"].read_bytes())
    if served_main_hash != candidate_main_hash:
        raise RuntimeError(f"served main hash mismatch: {served_main_hash}")
    register_http = run(
        ssh,
        "curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/register.html?inviteCode=TY7C1A'",
    ).strip()
    if register_http != "200":
        raise RuntimeError(f"register.html HTTP {register_http}")

    # 2817 is now a safe read-only gate probe; it must not create an account.
    probe = run_safe_local_probe(Path(r"I:\Linhhoasu\server\server\_ai_workbench\tools\probe_registration_gate.js"))
    if "RANDOM_REGISTER_DISABLED" not in probe:
        raise RuntimeError(f"legacy random registration gate unexpected: {probe[-2000:]}")

    current_errors = run(
        ssh,
        "f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); "
        "[ -n \"$n\" ] && tail -n +$n $f | grep -Ei 'SyntaxError|ReferenceError|TypeError|Unhandled|FATAL|fatal' | tail -n 40 || true",
    ).strip()
    if current_errors:
        raise RuntimeError(f"fatal errors after current runtime marker: {current_errors[-3000:]}")

    print(f"BACKUP={backup}")
    print("DEPLOYMENT=PASS")
    print(config_check)
    print(ready)
    print("ENV=" + json.dumps(env, sort_keys=True))
    print("PM2_BEFORE=" + json.dumps(before, sort_keys=True))
    print("PM2_AFTER=" + json.dumps(after, sort_keys=True))
    print("SERVED_MAIN_SHA256=" + served_main_hash)
    print("REGISTER_HTML_HTTP=" + register_http)
    print("RANDOM_REGISTER_PROBE=" + probe)
except Exception:
    if changed and backup:
        try:
            for name, remote_path in REMOTE_FILES.items():
                run(ssh, f"cp -p {shlex.quote(backup + '/' + name)} {shlex.quote(remote_path)}")
            run(ssh, "REQUIRE_INVITE_REGISTER=0 pm2 restart lhs-s1001 --update-env", timeout=120)
            run(ssh, "pm2 save", timeout=45)
            print("ROLLBACK=PASS")
        except Exception as rollback_error:
            raise RuntimeError(f"deployment failed and rollback failed: {rollback_error}")
    raise
finally:
    if staging:
        try:
            run(ssh, f"rm -rf -- {shlex.quote(staging)}")
        except Exception:
            pass
    ssh.close()
