"""Chạy dry-run inventory cho repair ngoại quan production, không ghi DB."""

from __future__ import annotations

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
    script = (ROOT / "tools" / "audit_appearance_repair_remote_20260905.js").read_text(encoding="utf-8")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    try:
        stdin, stdout, stderr = ssh.exec_command(f"cd {APP} && node - dry-run", timeout=300)
        stdin.write(script)
        stdin.channel.shutdown_write()
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError((error + output)[-20000:])
    finally:
        ssh.close()
    marker = "APPEARANCE_REPAIR_AUDIT="
    payload = json.loads(output.split(marker, 1)[1].splitlines()[0])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = ROOT / "temp" / f"appearance_repair_audit_{stamp}.json"
    evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": "PASS", "evidence": str(evidence), "summary": payload["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
