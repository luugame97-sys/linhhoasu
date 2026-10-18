"""Chụp source production liên quan Activity 7 để khóa drift trước deploy."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
FILES = {
    f"{APP}/src/services/ActivationPassService.js": "services/ActivationPassService.js",
    f"{APP}/src/services/RechargeRewardResolver.js": "services/RechargeRewardResolver.js",
    f"{APP}/src/services/RechargeBenefitService.js": "services/RechargeBenefitService.js",
    f"{APP}/src/handlers/activity.js": "handlers/activity.js",
    f"{APP}/src/handlers/compat.js": "handlers/compat.js",
    f"{APP}/src/handlers/recharge.js": "handlers/recharge.js",
    f"{APP}/src/handlers/account.js": "handlers/account.js",
    f"{APP}/src/handlers/playerPayload.js": "handlers/playerPayload.js",
    f"{APP}/src/handlers/task.js": "handlers/task.js",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output = ROOT / "temp" / f"activation_pass_prod_snapshot_{stamp}"
    output.mkdir(parents=True, exist_ok=True)

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(),
        username="root",
        password=credentials[2],
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    rows = []
    try:
        sftp = ssh.open_sftp()
        try:
            for remote, relative in FILES.items():
                target = output / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                try:
                    sftp.get(remote, str(target))
                    rows.append({
                        "remote": remote,
                        "relative": relative,
                        "exists": True,
                        "bytes": target.stat().st_size,
                        "sha256": digest(target),
                    })
                except FileNotFoundError:
                    rows.append({
                        "remote": remote,
                        "relative": relative,
                        "exists": False,
                        "bytes": 0,
                        "sha256": "",
                    })
        finally:
            sftp.close()
    finally:
        ssh.close()

    manifest = output / "manifest.json"
    manifest.write_text(json.dumps({
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "files": rows,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "snapshot": str(output),
        "manifest": str(manifest),
        "sha256": digest(manifest),
        "files": rows,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
