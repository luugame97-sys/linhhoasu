"""Chạy audit read-only, ẩn danh cho gói Tiên duyên Activity 7 trên production."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CREDENTIAL = ROOT / "VPS103.116.105.154.txt"
REMOTE_APP = "/linhhoasu/lhs/newServer"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    credential_path = Path(os.environ.get("LHS_PROD_CREDENTIAL_FILE", DEFAULT_CREDENTIAL))
    lines = credential_path.read_text(encoding="utf-8-sig").splitlines()
    if len(lines) < 3:
        raise RuntimeError("File thông tin VPS không đủ ba dòng")

    host = lines[0].strip()
    password = lines[2]
    script_path = ROOT / "tools" / "audit_activation_pass_remote_20260904.js"
    script = script_path.read_text(encoding="utf-8")

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        host,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    try:
        stdin, stdout, stderr = ssh.exec_command(
            f"cd {REMOTE_APP} && node -",
            timeout=240,
        )
        stdin.write(script)
        stdin.channel.shutdown_write()
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code != 0:
            raise RuntimeError((error + output)[-12000:])
    finally:
        ssh.close()

    marker = "AUDIT_JSON="
    if marker not in output:
        raise RuntimeError("Không tìm thấy payload audit trong output")
    payload = json.loads(output.split(marker, 1)[1].splitlines()[0])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = ROOT / "temp" / f"activation_pass_68_audit_{stamp}.json"
    evidence.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    result = {
        "result": "PASS",
        "evidence": str(evidence),
        "sha256": sha256(evidence),
        "summary": payload.get("summary", {}),
        "inMemoryContract": payload.get("inMemoryContract", {}),
        "transactionAggregates": {
            key: value.get("transactionAggregate", [])
            for key, value in payload.get("databases", {}).items()
        },
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
