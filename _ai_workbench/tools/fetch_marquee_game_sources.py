"""Fetch live production game sources needed by native marquee (read-only)."""
from __future__ import annotations

import getpass
import hashlib
import json
from datetime import datetime
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/lhs/newServer/src"
WORKBENCH = Path(__file__).resolve().parents[1]
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUT = WORKBENCH / "temp" / f"marquee_game_sources_{STAMP}"
FILES = (
    "handlers/chat.js",
    "net/HTTPServer.js",
    "net/WSServer.js",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    manifest = []
    try:
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote = f"{REMOTE_ROOT}/{relative}"
                local = OUT / relative
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                stat = sftp.stat(remote)
                manifest.append({"remote": remote, "local": str(local), "size": stat.st_size,
                                 "mtime": stat.st_mtime, "sha256": sha256(local)})
        finally:
            sftp.close()
        _, stdout, stderr = ssh.exec_command(
            "printf 'ready='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready; "
            "printf ' ws='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9200/health; echo",
            timeout=60,
        )
        diagnostics = {"stdout": stdout.read().decode("utf-8", "replace"),
                       "stderr": stderr.read().decode("utf-8", "replace"),
                       "code": stdout.channel.recv_exit_status()}
    finally:
        ssh.close()
    data = {"host": HOST, "readOnly": True, "files": manifest, "diagnostics": diagnostics}
    (OUT / "manifest.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


if __name__ == "__main__":
    main()
