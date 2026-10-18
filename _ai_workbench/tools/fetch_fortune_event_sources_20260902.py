"""Read-only snapshot of the live Kim Ma Chuc Phuc event contract.

The tool only downloads source/config artifacts and collects process/health
metadata.  It never writes to the VPS, database, Redis, or PM2.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "temp" / f"fortune_event_sources_{STAMP}"
REMOTE_ROOT = "/linhhoasu"

FILES = (
    "lhs/newServer/src/handlers/activity.js",
    "lhs/newServer/src/handlers/item.js",
    "lhs/newServer/src/handlers/box.js",
    "lhs/newServer/src/handlers/compat.js",
    "lhs/newServer/src/handlers/recharge.js",
    "lhs/newServer/src/handlers/task.js",
    "lhs/newServer/src/handlers/playerPayload.js",
    "lhs/newServer/src/handlers/arena.js",
    "lhs/newServer/src/handlers/dungeon.js",
    "lhs/newServer/src/handlers/cross-rival.js",
    "lhs/newServer/src/handlers/fish.js",
    "lhs/newServer/src/handlers/guild.js",
    "lhs/newServer/src/handlers/raid.js",
    "lhs/newServer/src/handlers/index.js",
    "lhs/newServer/src/services/MainTaskProgressService.js",
    "lhs/newServer/src/services/PlayerService.js",
    "lhs/newServer/src/services/RewardSync.js",
    "lhs/newServer/src/services/ConfigService.js",
    "lhs/newServer/src/db/models/Player.js",
    "lhs/newServer/ecosystem.config.js",
    "lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
    "webgame/game/js/main.min_a6195824.js",
    "webgame/game/index.html",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote exit={code}")
    return output


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    manifest = []
    diagnostics = {}
    try:
        sftp = ssh.open_sftp()
        try:
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                local = OUT / rel
                local.parent.mkdir(parents=True, exist_ok=True)
                try:
                    sftp.get(remote, str(local))
                    stat = sftp.stat(remote)
                    manifest.append({
                        "remote": remote,
                        "local": str(local),
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                        "mode": oct(stat.st_mode & 0o777),
                        "sha256": sha256(local),
                    })
                except (FileNotFoundError, OSError) as exc:
                    manifest.append({"remote": remote, "missing": True, "error": str(exc)})
        finally:
            sftp.close()
        diagnostics["pm2"] = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'",
        )
        diagnostics["health"] = run(
            ssh,
            "for u in http://127.0.0.1:8080/ready http://127.0.0.1:9200/health; do printf '%s|' \"$u\"; curl -sS -o /tmp/fortune_event_probe.$$ -w '%{http_code}|%{size_download}|%{content_type}\\n' --max-time 15 \"$u\"; rm -f /tmp/fortune_event_probe.$$; done",
        )
        diagnostics["live_hashes"] = run(
            ssh,
            "sha256sum /linhhoasu/lhs/newServer/src/handlers/activity.js /linhhoasu/lhs/newServer/src/handlers/item.js /linhhoasu/lhs/newServer/src/handlers/task.js /linhhoasu/lhs/newServer/src/services/MainTaskProgressService.js",
        )
    finally:
        ssh.close()

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "host": HOST,
        "readOnly": True,
        "files": manifest,
        "diagnostics": diagnostics,
    }
    (OUT / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(manifest), "diagnostics": list(diagnostics)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
