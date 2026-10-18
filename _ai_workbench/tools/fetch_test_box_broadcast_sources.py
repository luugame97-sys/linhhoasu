"""Fetch current box broadcast handlers from the isolated test VPS."""
from __future__ import annotations

import getpass
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
FILES = ["src/handlers/box.js", "src/handlers/compat.js"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output = ROOT / "_ai_workbench/temp" / f"test_box_broadcast_sources_{stamp}"
    output.mkdir(parents=True)
    password = getpass.getpass("Test VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    rows = []
    try:
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote = "/linhhoasu/lhs/newServer/" + relative
                local = output / relative
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                rows.append({"relative": relative, "bytes": local.stat().st_size, "sha256": sha256(local)})
        finally:
            sftp.close()
    finally:
        ssh.close()
    (output / "manifest.json").write_text(json.dumps({"host": HOST, "files": rows}, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "files": rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
