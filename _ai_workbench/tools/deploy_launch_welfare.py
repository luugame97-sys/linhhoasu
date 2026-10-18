#!/usr/bin/env python3
"""Inspect/deploy the launch-welfare disable change without persisting credentials."""
import getpass
import json
import posixpath
import sys
from datetime import datetime, timezone

import paramiko


HOST = "103.116.105.154"
USER = "root"
REMOTE_FILE = "/linhhoasu/lhs/newServer/src/services/LaunchWelfareService.js"
LOCAL_FILE = r"I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\services\LaunchWelfareService.js"


def run(ssh, command, check=True):
    stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f"remote command failed ({code}): {err[-500:]}")
    return code, out, err


def inspect(ssh):
    code, raw, _ = run(ssh, "pm2 jlist", check=False)
    proc = None
    if code == 0:
        try:
            rows = json.loads(raw)
            proc = next((row for row in rows if row.get("name") == "lhs-s1001"), None)
        except Exception:
            proc = None
    _, file_hash, _ = run(ssh, f"sha256sum {REMOTE_FILE} | cut -d' ' -f1")
    flag = "unknown"
    if proc:
        env = proc.get("pm2_env") or {}
        value = str((env.get("env") or {}).get("LAUNCH_WELFARE_ENABLED", ""))
        flag = "on" if value.strip().lower() in {"1", "true", "yes", "on"} else ("off" if value else "absent")
        print(f"PROCESS status={env.get('status')} pid={proc.get('pid')} cwd={env.get('pm_cwd')}")
    else:
        print("PROCESS lhs-s1001=missing-or-unreadable")
    print(f"REMOTE_HASH={file_hash.strip()}")
    print(f"LAUNCH_WELFARE_ENABLED={flag}")
    code, ready, err = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready", check=False)
    print(f"READY_HTTP={ready.strip() or 'unavailable'} EXIT={code}")
    _, listeners, _ = run(ssh, "ss -ltn | grep -E ':(8080|9200)\\b' || true")
    print("LISTENERS=" + " | ".join(line.strip() for line in listeners.splitlines() if line.strip()))
    _, logs, _ = run(ssh, "pm2 logs lhs-s1001 --lines 30 --nostream 2>&1", check=False)
    print("LOG_TAIL_START")
    print(logs[-6000:])
    print("LOG_TAIL_END")
    _, backups, _ = run(ssh, "ls -dt /linhhoasu/_ai_workbench/backups/launch_welfare_before_disable_* 2>/dev/null | head -3 || true")
    print("BACKUPS=" + " | ".join(line.strip() for line in backups.splitlines() if line.strip()))


def deploy(ssh):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/launch_welfare_before_disable_{stamp}"
    temp_file = f"{REMOTE_FILE}.deploy-{stamp}.js"
    run(ssh, "find /linhhoasu/lhs/newServer/src/services -maxdepth 1 -type f -name 'LaunchWelfareService.js.deploy-*.js' -delete")
    run(ssh, f"set -eu; test -f {REMOTE_FILE}; mkdir -p {backup_dir}; cp -p {REMOTE_FILE} {backup_dir}/LaunchWelfareService.js")
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL_FILE, temp_file)
    finally:
        sftp.close()
    run(ssh, f"set -eu; node --check {temp_file}; mv {temp_file} {REMOTE_FILE}; chmod 644 {REMOTE_FILE}")
    run(ssh, "pm2 restart lhs-s1001 --update-env")
    run(ssh, "pm2 save")
    _, ready, _ = run(ssh, "curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready")
    _, listeners, _ = run(ssh, "ss -ltn | grep -E ':(8080|9200)\\b' || true")
    _, final_hash, _ = run(ssh, f"sha256sum {REMOTE_FILE} | cut -d' ' -f1")
    _, contract, _ = run(ssh, "cd /linhhoasu/lhs/newServer && env -u LAUNCH_WELFARE_ENABLED node -e \"const s=require('./src/services/LaunchWelfareService'); const p={userId:'probe'}; Promise.resolve(s.ensureLaunchWelfareMail(p,'probe')).then(v=>{if(v!==false||p.mailFlags) process.exit(1); console.log('disabled-contract:PASS')})\"")
    print(f"BACKUP_DIR={backup_dir}")
    print(f"REMOTE_HASH_AFTER={final_hash.strip()}")
    print(f"READY_HTTP={ready.strip()}")
    print("LISTENERS=" + " | ".join(line.strip() for line in listeners.splitlines() if line.strip()))
    print(contract.strip())


def verify_contract(ssh):
    _, contract, _ = run(ssh, "cd /linhhoasu/lhs/newServer && env -u LAUNCH_WELFARE_ENABLED node -e \"const s=require('./src/services/LaunchWelfareService'); const p={userId:'probe'}; Promise.resolve(s.ensureLaunchWelfareMail(p,'probe')).then(v=>{if(v!==false||p.mailFlags) process.exit(1); console.log('disabled-contract:PASS')})\"")
    print(contract.strip())


def main():
    password = getpass.getpass("VPS password (not logged): ")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--deploy":
            deploy(client)
        elif len(sys.argv) > 1 and sys.argv[1] == "--verify-contract":
            verify_contract(client)
        else:
            inspect(client)
    finally:
        client.close()


if __name__ == "__main__":
    main()
