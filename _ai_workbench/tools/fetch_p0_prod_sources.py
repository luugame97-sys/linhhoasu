"""Read-only snapshot of production sources needed for P0 recharge fixes.

No remote file is changed, no process is restarted, and the password is never
written to output or a command line.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "temp" / f"p0_prod_snapshot_{STAMP}"
REMOTE_ROOT = "/linhhoasu"
FILES = (
    "lhs/newServer/src/handlers/item.js",
    "lhs/newServer/src/handlers/commerce-compat.js",
    "lhs/newServer/src/handlers/index.js",
    "lhs/newServer/src/handlers/raid.js",
    "lhs/newServer/src/services/PlayerService.js",
    "lhs/newServer/src/services/ConfigService.js",
    "lhs/newServer/src/services/Activity9Service.js",
    "lhs/newServer/src/services/RechargeBenefitService.js",
    "lhs/newServer/ecosystem.config.js",
    "lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    text = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or text[-4000:] or f"remote exit {code}")
    return text


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass(
        "Production password (not logged): "
    )
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
                    st = sftp.stat(remote)
                    manifest.append(
                        {
                            "remote": remote,
                            "local": str(local),
                            "size": st.st_size,
                            "mtime": st.st_mtime,
                            "mode": oct(st.st_mode & 0o777),
                            "sha256": sha256(local),
                        }
                    )
                except (FileNotFoundError, OSError) as exc:
                    manifest.append({"remote": remote, "missing": True, "error": str(exc)})
        finally:
            sftp.close()

        diagnostics["pm2"] = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,script:e.pm_exec_path,cwd:e.pm_cwd}))}}})'",
        )
        diagnostics["health"] = run(
            ssh,
            "for u in http://127.0.0.1:8080/ready http://127.0.0.1:8080/health; do printf '%s|' \"$u\"; curl -sS -o /tmp/p0_probe.$$ -w '%{http_code}|%{size_download}|%{content_type}\n' --max-time 15 \"$u\"; rm -f /tmp/p0_probe.$$; done",
        )
        diagnostics["listeners"] = run(
            ssh,
            "ss -lntp 2>/dev/null | grep -E ':(81|8080|9200|3001|9097|27017)\\b' || true",
        )
        diagnostics["source_hashes"] = run(
            ssh,
            "sha256sum -- "
            + " ".join(
                shlex.quote(f"{REMOTE_ROOT}/{rel}")
                for rel in FILES
                if not rel.endswith(".bin")
            ),
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
    (OUT / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"output": str(OUT), "files": len(manifest), "diagnostics": list(diagnostics)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
