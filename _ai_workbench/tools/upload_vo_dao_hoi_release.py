from __future__ import annotations

import hashlib
import io
import json
import os
import sys
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
USER = "root"
EXPECTED_FP = "SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ"
ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "_ai_workbench" / "temp" / "vo_dao_hoi_fix_20260912" / "release.tar.gz"
REMOTE = "/tmp/vo_dao_hoi_release.tar.gz"
QA_SCRIPT = ROOT / "_ai_workbench" / "tools" / "qa_vo_dao_hoi_live_20260913.js"
REMOTE_QA = "/tmp/qa_vo_dao_hoi_live_20260913.js"


def main() -> None:
    password = sys.stdin.readline().rstrip("\r\n")
    if not password:
        raise SystemExit("password missing on stdin")
    payload = ARCHIVE.read_bytes()
    qa_payload = QA_SCRIPT.read_bytes()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=password, look_for_keys=False, allow_agent=False,
                   timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        key = client.get_transport().get_remote_server_key()
        fp = key.asbytes()
        import base64
        digest = base64.b64encode(hashlib.sha256(fp).digest()).decode().rstrip("=")
        actual = "SHA256:" + digest
        if actual != EXPECTED_FP:
            raise RuntimeError(f"host fingerprint mismatch: {actual}")
        sftp = client.open_sftp()
        try:
            with sftp.open(REMOTE, "wb") as out:
                out.write(payload)
            with sftp.open(REMOTE_QA, "wb") as out:
                out.write(qa_payload)
        finally:
            sftp.close()
        stdin, stdout, stderr = client.exec_command(f"sha256sum {REMOTE} {REMOTE_QA}; stat -c '%s' {REMOTE} {REMOTE_QA}", timeout=30)
        result = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        if error.strip():
            raise RuntimeError(error.strip())
        print(json.dumps({"ok": True, "hostFingerprint": actual, "localSha256": hashlib.sha256(payload).hexdigest(), "qaSha256": hashlib.sha256(qa_payload).hexdigest(), "remote": result.strip()}, ensure_ascii=False))
    finally:
        client.close()


if __name__ == "__main__":
    main()
