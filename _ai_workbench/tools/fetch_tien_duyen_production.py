"""Download only Tiên duyên-related production artifacts for an isolated candidate."""
from __future__ import annotations

import getpass
import hashlib
import json
from datetime import datetime
from pathlib import Path
import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "temp" / f"tien_duyen_prod_{STAMP}"

REMOTE_FILES = [
    "/linhhoasu/lhs/newServer/src/handlers/activity.js",
    "/linhhoasu/lhs/newServer/src/handlers/recharge.js",
    "/linhhoasu/lhs/newServer/src/handlers/compat.js",
    "/linhhoasu/lhs/newServer/src/handlers/account.js",
    "/linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js",
    "/linhhoasu/lhs/newServer/src/services/ConfigService.js",
    "/linhhoasu/lhs/newServer/src/services/PlayerService.js",
    "/linhhoasu/lhs/newServer/src/handlers/raid.js",
    "/linhhoasu/lhs/newServer/src/services/RewardSync.js",
    "/linhhoasu/lhs/newServer/src/services/ServerConfigService.js",
    "/linhhoasu/lhs/newServer/ecosystem.config.js",
    "/linhhoasu/webgame/game/index.html",
    "/linhhoasu/webgame/game/js/main.min_a6195824.js",
    "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
]

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20)
    manifest = []
    try:
        sftp = ssh.open_sftp()
        try:
            for remote in REMOTE_FILES:
                local = OUT / remote.lstrip("/")
                local.parent.mkdir(parents=True, exist_ok=True)
                try:
                    sftp.get(remote, str(local))
                except FileNotFoundError:
                    manifest.append({"remote": remote, "missing": True})
                    continue
                except IOError:
                    manifest.append({"remote": remote, "missing": True})
                    continue
                stat = sftp.stat(remote)
                manifest.append({
                    "remote": remote,
                    "local": str(local),
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                    "sha256": sha256(local),
                })
        finally:
            sftp.close()
        commands = {
            "config_paths": r"""
set -u
for p in \
 /linhhoasu/lhs/LHS-re/update/resource/assets/excel/config_e5ac72c2.bin \
 /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin \
 /linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin; do
 if [ -e "$p" ]; then stat -Lc '%n|size=%s|inode=%i|mtime=%Y|mode=%a|uid=%u|gid=%g' "$p"; sha256sum "$p"; readlink -f "$p"; fi
done
""",
            "process": r"""
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-real-bots","lhs-dist","lhs-admin"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'
""",
            "listeners": "ss -lntp | grep -E ':(81|8080|9200|3001|9097|27017)\\b' || true",
            "served": r"""
for u in \
 http://127.0.0.1:81/ \
 http://127.0.0.1:81/js/main.min_a6195824.js \
 http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin \
 http://127.0.0.1:8080/ready; do
 printf '%s|' "$u"; curl -sS -o /tmp/tien_duyen_probe.$$ -w '%{http_code}|%{size_download}|%{content_type}\n' --max-time 15 "$u"; sha256sum /tmp/tien_duyen_probe.$$ | cut -d' ' -f1; rm -f /tmp/tien_duyen_probe.$$;
done
""",
        }
        diagnostics = {}
        for name, command in commands.items():
            _, stdout, stderr = ssh.exec_command(command, timeout=90)
            diagnostics[name] = {
                "stdout": stdout.read().decode("utf-8", "replace"),
                "stderr": stderr.read().decode("utf-8", "replace"),
                "code": stdout.channel.recv_exit_status(),
            }
    finally:
        ssh.close()

    (OUT / "manifest.json").write_text(
        json.dumps({"files": manifest, "diagnostics": diagnostics}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(str(OUT))
    print(json.dumps({"files": manifest, "diagnostics": diagnostics}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

