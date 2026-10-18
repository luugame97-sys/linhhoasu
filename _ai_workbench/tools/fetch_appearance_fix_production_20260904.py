"""Chụp source production liên quan ngoại quan để tạo candidate không ghi đè live."""

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
REMOTE_FILES = [
    f"{APP}/src/services/RoleAppearanceService.js",
    f"{APP}/src/services/RewardGrantService.js",
    f"{APP}/src/services/FormationService.js",
    f"{APP}/src/handlers/fashion.js",
    f"{APP}/src/handlers/item.js",
    f"{APP}/src/handlers/mail.js",
    f"{APP}/src/handlers/activity.js",
    f"{APP}/src/handlers/recharge.js",
    f"{APP}/src/handlers/compat.js",
    f"{APP}/src/handlers/official-compat.js",
    f"{APP}/src/handlers/mount.js",
    f"{APP}/src/handlers/artifact.js",
    f"{APP}/src/handlers/spirit.js",
    f"{APP}/src/handlers/playerPayload.js",
    f"{APP}/src/handlers/account.js",
    f"{APP}/ecosystem.config.js",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-20000:])
    return output


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output_dir = ROOT / "temp" / f"appearance_fix_prod_snapshot_{stamp}"
    output_dir.mkdir(parents=True, exist_ok=False)
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    files = []
    diagnostics = {}
    try:
        sftp = ssh.open_sftp()
        try:
            for remote in REMOTE_FILES:
                local = output_dir / remote.lstrip("/")
                local.parent.mkdir(parents=True, exist_ok=True)
                try:
                    attrs = sftp.stat(remote)
                    sftp.get(remote, str(local))
                except (FileNotFoundError, IOError):
                    files.append({"remote": remote, "exists": False})
                    continue
                files.append({
                    "remote": remote,
                    "exists": True,
                    "local": str(local),
                    "bytes": attrs.st_size,
                    "mtime": attrs.st_mtime,
                    "sha256": digest(local),
                })
        finally:
            sftp.close()
        diagnostics["pm2"] = json.loads(run(
            ssh,
            "pm2 jlist | node -e " + shlex.quote(
                'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
                'JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name))'
                '.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime})))))'
            ),
        ))
        diagnostics["ready"] = {
            str(port): run(
                ssh,
                f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{port}/ready",
            ).strip()
            for port in (8080, 8083)
        }
        diagnostics["health"] = {
            str(port): json.loads(run(ssh, f"curl -fsS --max-time 10 http://127.0.0.1:{port}/health"))
            for port in (8080, 8083)
        }
        diagnostics["configSha256"] = run(
            ssh,
            "sha256sum /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin "
            "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
        ).strip().splitlines()
    finally:
        ssh.close()
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "app": APP,
        "files": files,
        "diagnostics": diagnostics,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    canonical = ROOT / "temp" / "appearance_fix_prod_snapshot_latest.json"
    canonical.write_text(json.dumps({
        "snapshot": str(output_dir),
        "manifest": str(manifest_path),
        "generatedAt": manifest["generatedAt"],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "snapshot": str(output_dir),
        "manifest": str(manifest_path),
        "files": len(files),
        "ready": diagnostics["ready"],
        "pm2": diagnostics["pm2"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
