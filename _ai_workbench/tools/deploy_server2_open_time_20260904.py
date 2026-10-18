"""Dời lịch S2 trên production, giữ server private và không restart dịch vụ."""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL_MUTATOR = ROOT / "tools" / "set_server2_open_time_20260904.js"
EXPECTED_OPEN_TIME = 1788516000000


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> tuple[int, str, str]:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def main() -> None:
    if not LOCAL_MUTATOR.is_file():
        raise FileNotFoundError(LOCAL_MUTATOR)

    credential_file = os.environ.get("LHS_PROD_CREDENTIAL_FILE", "").strip()
    username = "root"
    password = os.environ.get("LHS_PROD_PASSWORD", "")
    if credential_file:
        credential_lines = [
            line.strip()
            for line in Path(credential_file).read_text(encoding="utf-8-sig").splitlines()
            if line.strip()
        ]
        if len(credential_lines) != 3:
            raise RuntimeError("CREDENTIAL_FILE_FORMAT_INVALID")
        file_host, username, password = credential_lines
        if file_host != HOST or username != "root":
            raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    if not password:
        password = getpass.getpass("Production VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        HOST,
        username=username,
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/server2_schedule_pre_{stamp}"
    remote_mutator = f"/linhhoasu/_ai_workbench/temp/set_server2_open_time_{stamp}.js"
    backup_file = f"{backup_dir}/server_config_before.json"
    evidence_file = ROOT / "temp" / f"server2_schedule_20260904_{stamp}.json"

    try:
        preflight_command = (
            "pm2 jlist | node -e "
            + shlex.quote(
                'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{'
                'for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-dist","lhs-admin"].includes(p.name))'
                '{const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time}))}}})'
            )
        )
        code, pm2_before, error = run(ssh, preflight_command)
        if code:
            raise RuntimeError(error or pm2_before)

        code, _, error = run(ssh, f"install -d -m 700 {shlex.quote(backup_dir)}")
        if code:
            raise RuntimeError(error)

        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL_MUTATOR), remote_mutator)
        finally:
            sftp.close()

        code, output, error = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node "
            + shlex.quote(remote_mutator)
            + " "
            + shlex.quote(backup_file),
        )
        marker = "SERVER2_SCHEDULE_JSON="
        if code or marker not in output:
            raise RuntimeError((error + "\n" + output)[-8000:])
        schedule = json.loads(output.split(marker, 1)[1].splitlines()[0])
        after = schedule.get("after") or {}
        if (
            int(after.get("openTime") or 0) != EXPECTED_OPEN_TIME
            or after.get("running") is not False
            or int(after.get("status") if after.get("status") is not None else -1) != 0
        ):
            raise RuntimeError("SERVER2_SCHEDULE_VERIFY_FAILED")

        code, pm2_after, error = run(ssh, preflight_command)
        if code:
            raise RuntimeError(error or pm2_after)

        code, health, error = run(
            ssh,
            "curl -sS --max-time 10 -w '\\nS1_HTTP=%{http_code}\\n' http://127.0.0.1:8080/ready; "
            "curl -sS --max-time 10 -w '\\nS2_HTTP=%{http_code}\\n' http://127.0.0.1:8083/ready",
        )
        if code or "S1_HTTP=200" not in health or "S2_HTTP=200" not in health:
            raise RuntimeError(error or health)

        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "host": HOST,
            "serverId": 1002,
            "requestedLocalTime": "2026-09-04T17:00:00+07:00",
            "requestedUtcTime": "2026-09-04T10:00:00Z",
            "openTime": EXPECTED_OPEN_TIME,
            "schedule": schedule,
            "pm2Before": [json.loads(line) for line in pm2_before.splitlines() if line.strip()],
            "pm2After": [json.loads(line) for line in pm2_after.splitlines() if line.strip()],
            "health": health,
            "backup": backup_file,
            "servicesRestarted": [],
        }
        evidence_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        digest = hashlib.sha256(evidence_file.read_bytes()).hexdigest()
        print(json.dumps({
            "result": "PASS",
            "serverId": 1002,
            "openTime": EXPECTED_OPEN_TIME,
            "running": False,
            "status": 0,
            "backup": backup_file,
            "evidence": str(evidence_file),
            "sha256": digest,
        }, ensure_ascii=False, indent=2))
    finally:
        run(ssh, f"rm -f -- {shlex.quote(remote_mutator)}", timeout=30)
        ssh.close()


if __name__ == "__main__":
    main()
