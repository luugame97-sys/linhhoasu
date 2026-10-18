"""Read-only fetch of current production sources for phase-2 recharge resolver."""
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
OUT = ROOT / "temp" / f"phase2_recharge_prod_{STAMP}"
REMOTE_ROOT = "/linhhoasu"
FILES = (
    "lhs/newServer/src/handlers/item.js",
    "lhs/newServer/src/handlers/compat.js",
    "lhs/newServer/src/handlers/recharge.js",
    "lhs/newServer/src/handlers/commerce-compat.js",
    "lhs/newServer/src/handlers/activity.js",
    "lhs/newServer/src/handlers/raid.js",
    "lhs/newServer/src/handlers/index.js",
    "lhs/newServer/src/services/RechargeBenefitService.js",
    "lhs/newServer/src/services/RechargeRewardResolver.js",
    "lhs/newServer/src/services/RechargeConfigService.js",
    "lhs/newServer/src/services/Activity9Service.js",
    "lhs/newServer/src/services/PlayerService.js",
    "lhs/newServer/src/services/RewardGrantService.js",
    "lhs/newServer/src/services/EquipService.js",
    "lhs/newServer/src/handlers/fashion.js",
    "lhs/newServer/src/handlers/gem.js",
    "lhs/newServer/src/services/RoleAppearanceService.js",
    "lhs/newServer/ecosystem.config.js",
    "lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit={code}")
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    files = []
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
                    st = sftp.stat(remote)
                    files.append({"remote": remote, "local": str(local), "size": st.st_size, "mtime": st.st_mtime, "mode": oct(st.st_mode & 0o777), "sha256": sha(local)})
                except (FileNotFoundError, OSError) as exc:
                    files.append({"remote": remote, "missing": True, "error": str(exc)})
        finally:
            sftp.close()
        diagnostics["pm2"] = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'")
        diagnostics["health"] = run(ssh, "for u in http://127.0.0.1:8080/ready http://127.0.0.1:9200/health; do printf '%s|' \"$u\"; curl -sS -o /tmp/phase2_probe.$$ -w '%{http_code}|%{size_download}|%{content_type}\n' --max-time 15 \"$u\"; rm -f /tmp/phase2_probe.$$; done")
    finally:
        ssh.close()
    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "host": HOST, "readOnly": True, "files": files, "diagnostics": diagnostics}
    (OUT / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(files), "diagnostics": list(diagnostics)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
