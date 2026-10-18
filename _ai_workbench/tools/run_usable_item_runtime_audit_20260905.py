"""Chạy audit runtime read-only cho 271 item lỗi và lưu evidence ẩn danh."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 300) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-24000:])
    return output


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    catalog = json.loads((ROOT / "temp/usable_item_audit_prod_20260905.json").read_text(encoding="utf-8"))
    confirmed = sorted(int(row["id"]) for row in catalog["rows"] if row["status"] == "LOI_DA_XAC_NHAN")
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_script = f"/linhhoasu/_ai_workbench/temp/usable_item_runtime_{stamp}.js"
    remote_ids = f"/linhhoasu/_ai_workbench/temp/usable_item_runtime_{stamp}.json"
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    try:
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(ROOT / "tools/audit_usable_item_runtime_remote_20260905.js"), remote_script)
            with sftp.file(remote_ids, "w") as handle:
                handle.write(json.dumps(confirmed))
        finally:
            sftp.close()
        output = run(
            ssh,
            f"cd {APP} && USABLE_ITEM_IDS_PATH={shlex.quote(remote_ids)} node {shlex.quote(remote_script)}",
            timeout=420,
        )
    finally:
        try:
            run(ssh, f"rm -f -- {shlex.quote(remote_script)} {shlex.quote(remote_ids)}")
        except Exception:
            pass
        ssh.close()
    marker = "USABLE_ITEM_RUNTIME="
    payload = json.loads(output.split(marker, 1)[1].splitlines()[0])
    evidence = ROOT / "temp" / f"usable_item_runtime_audit_{stamp}.json"
    evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        db_name: {
            key: value[key]
            for key in ("playerCount", "humanCount", "affectedSubjects", "affectedHumans", "humanItems", "unclaimedMailItems", "activeCodeItems")
        }
        for db_name, value in payload["databases"].items()
    }
    print(json.dumps({
        "result": "PASS", "evidence": str(evidence), "auditedIds": len(confirmed),
        "sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(), "summary": summary,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
