"""Đọc metadata các backup lịch S2; không in credential hoặc dữ liệu nhạy cảm."""
from __future__ import annotations

import json
import os
from pathlib import Path

import paramiko


HOST = "103.116.105.154"


def main() -> None:
    credential_file = Path(os.environ["LHS_PROD_CREDENTIAL_FILE"])
    lines = [line.strip() for line in credential_file.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(lines) != 3 or lines[0] != HOST or lines[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username=lines[1], password=lines[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(
            "find /linhhoasu/_ai_workbench/backups -maxdepth 2 -type f "
            "-path '*/server2_schedule_pre_*/server_config_before.json' -printf '%T@ %p\\n' "
            "| sort -n | tail -5",
            timeout=30,
        )
        listing = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(error or listing)

        rows = []
        sftp = ssh.open_sftp()
        try:
            for line in listing.splitlines():
                if not line.strip():
                    continue
                _, remote_path = line.split(" ", 1)
                with sftp.open(remote_path, "r") as stream:
                    raw = stream.read()
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", "replace")
                row = json.loads(raw)
                rows.append({
                    "path": remote_path,
                    "serverId": int(row.get("serverId") or 0),
                    "openTime": int(row.get("openTime") or 0),
                    "running": row.get("running"),
                    "status": int(row.get("status") or 0),
                })
        finally:
            sftp.close()
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
