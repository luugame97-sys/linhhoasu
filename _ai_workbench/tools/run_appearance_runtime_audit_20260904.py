"""Chạy audit runtime ngoại quan production chỉ đọc và lưu evidence ẩn danh."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"


def main() -> None:
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    script = (ROOT / "tools" / "audit_appearance_runtime_remote_20260904.js").read_text(encoding="utf-8")
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
            raise RuntimeError((error + output)[-20000:])
    finally:
        ssh.close()
    marker = "APPEARANCE_RUNTIME_AUDIT="
    payload = json.loads(output.split(marker, 1)[1].splitlines()[0])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = ROOT / "temp" / f"appearance_runtime_audit_{stamp}.json"
    evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "evidence": str(evidence),
        "sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(),
        "summary": {
            db_name: {
                key: value.get(key)
                for key in ("playerCount", "humanCount", "issueSubjects", "humanIssueSubjects")
            }
            for db_name, value in payload["databases"].items()
        },
        "issueCounts": payload["issueCounts"],
        "issueIds": payload["issueIds"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
