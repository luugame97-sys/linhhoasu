"""Chạy full fixture 940 item sử dụng trên đúng source/config production."""

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
CONFIG = "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
LANG = "/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 600) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-30000:])
    return output


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_tool = f"/linhhoasu/_ai_workbench/temp/usable_item_audit_{stamp}.js"
    remote_output = f"/linhhoasu/_ai_workbench/temp/usable_item_audit_{stamp}.json"
    local_output = ROOT / "temp" / f"usable_item_audit_prod_{stamp}.json"
    canonical = ROOT / "temp" / "usable_item_audit_prod_20260905.json"
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
            sftp.put(str(ROOT / "tools/audit_all_usable_items_20260905.js"), remote_tool)
        finally:
            sftp.close()
        env = (
            f"LHS_APP_ROOT={APP} LHS_CONFIG_PATH={CONFIG} LHS_LANG_PATH={LANG} "
            f"LHS_USABLE_ITEM_OUTPUT={remote_output} "
        )
        output = run(ssh, f"cd {APP} && {env} node {shlex.quote(remote_tool)}", timeout=900)
        summary = json.loads(output.strip().splitlines()[-1])
        sftp = ssh.open_sftp()
        try:
            sftp.get(remote_output, str(local_output))
        finally:
            sftp.close()
        source_hashes = {
            path: run(ssh, f"sha256sum {shlex.quote(path)}").split()[0]
            for path in [
                f"{APP}/src/handlers/item.js",
                f"{APP}/src/services/RewardGrantService.js",
                CONFIG,
                LANG,
            ]
        }
    finally:
        try:
            run(ssh, f"rm -f -- {shlex.quote(remote_tool)} {shlex.quote(remote_output)}")
        except Exception:
            pass
        ssh.close()
    payload = json.loads(local_output.read_text(encoding="utf-8"))
    payload["productionEvidence"] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "app": APP,
        "config": CONFIG,
        "language": LANG,
        "databaseConnected": False,
        "sourceHashes": source_hashes,
        "runnerSummary": summary,
    }
    canonical.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "evidence": str(local_output),
        "canonical": str(canonical),
        "sha256": {
            "evidence": hashlib.sha256(local_output.read_bytes()).hexdigest(),
            "canonical": hashlib.sha256(canonical.read_bytes()).hexdigest(),
        },
        "summary": payload["summary"],
        "sourceHashes": source_hashes,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
