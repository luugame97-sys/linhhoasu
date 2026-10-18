"""Chạy audit read-only state nhuộm màu production và lưu evidence ẩn danh."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    script = (ROOT / "tools/audit_suit_dye_state_remote_20260905.js").read_text(encoding="utf-8")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    try:
        stdin, stdout, stderr = ssh.exec_command(f"cd {APP} && node -", timeout=300)
        stdin.write(script)
        stdin.channel.shutdown_write()
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError((error + output)[-24000:])
    finally:
        ssh.close()
    marker = "SUIT_DYE_AUDIT="
    payload = json.loads(output.split(marker, 1)[1].splitlines()[0])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = ROOT / "temp" / f"suit_dye_audit_{stamp}.json"
    evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        db_name: {
            key: row[key]
            for key in ("playerCount", "humanCount", "affectedCount", "humanAffectedCount", "suitCounts", "exact29030")
        }
        for db_name, row in payload["databases"].items()
    }
    print(json.dumps({
        "result": "PASS", "evidence": str(evidence),
        "sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(),
        "summary": summary,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
