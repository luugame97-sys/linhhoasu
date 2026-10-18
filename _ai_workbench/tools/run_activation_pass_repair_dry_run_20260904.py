"""Chạy dry-run repair entitlement 10301 trên production."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-12000:])
    return output


def main() -> None:
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote = f"/linhhoasu/_ai_workbench/temp/activation_pass_repair_dry_{stamp}.js"
    evidence = ROOT / "temp" / f"activation_pass_repair_dry_run_{stamp}.json"
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
            sftp.put(str(ROOT / "tools" / "repair_activation_pass_entitlements_20260904.js"), remote)
        finally:
            sftp.close()
        output = run(ssh, f"cd {APP} && node {shlex.quote(remote)} dry-run")
        payload = json.loads(output.split("ACTIVATION_PASS_REPAIR=", 1)[1].splitlines()[0])
        evidence.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({
            "result": "PASS",
            "evidence": str(evidence),
            "sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(),
            "summary": payload,
        }, ensure_ascii=False))
    finally:
        try:
            run(ssh, f"rm -f -- {shlex.quote(remote)}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
