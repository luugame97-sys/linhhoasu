"""Read-only fetch of production source files used by paid package contracts."""
from __future__ import annotations

import getpass
import hashlib
import json
from datetime import datetime
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
WORKBENCH = Path(__file__).resolve().parents[1]
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUT = WORKBENCH / "temp" / f"paid_package_server_prod_{STAMP}"

FILES = [
    "/linhhoasu/lhs/newServer/src/handlers/index.js",
    "/linhhoasu/lhs/newServer/src/handlers/item.js",
    "/linhhoasu/lhs/newServer/src/handlers/commerce-compat.js",
    "/linhhoasu/lhs/newServer/src/handlers/compat.js",
    "/linhhoasu/lhs/newServer/src/handlers/recharge.js",
    "/linhhoasu/lhs/newServer/src/handlers/activity.js",
    "/linhhoasu/lhs/newServer/src/handlers/playerPayload.js",
    "/linhhoasu/lhs/newServer/src/services/RechargeConfigService.js",
    "/linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js",
    "/linhhoasu/lhs/newServer/src/services/Activity9Service.js",
    "/linhhoasu/lhs/newServer/src/services/XtPayService.js",
    "/linhhoasu/lhs/newServer/src/services/RewardGrantService.js",
    "/linhhoasu/lhs/newServer/src/services/PlayerService.js",
    "/linhhoasu/lhs/newServer/src/services/ConfigService.js",
    "/linhhoasu/lhs/newServer/src/net/HTTPServer.js",
    "/linhhoasu/lhs/newServer/src/db/models/Transaction.js",
    "/linhhoasu/lhs/newServer/src/db/models/RechargeProductConfig.js",
    "/linhhoasu/lhs/newServer/src/db/models/Player.js",
    "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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
            for remote in FILES:
                local = OUT / remote.lstrip("/")
                local.parent.mkdir(parents=True, exist_ok=True)
                try:
                    sftp.get(remote, str(local))
                    stat = sftp.stat(remote)
                    manifest.append({"remote": remote, "size": stat.st_size,
                                     "mtime": stat.st_mtime, "sha256": digest(local)})
                except OSError:
                    manifest.append({"remote": remote, "missing": True})
        finally:
            sftp.close()
        command = (
            "printf 'ready='; curl -sS -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:8080/ready; "
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{"
            "for(const p of JSON.parse(s)){if(p.name===\"lhs-s1001\"){const e=p.pm2_env||{};"
            "console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'"
        )
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        diagnostics = {"stdout": stdout.read().decode("utf-8", "replace"),
                       "stderr": stderr.read().decode("utf-8", "replace"),
                       "code": stdout.channel.recv_exit_status()}
    finally:
        ssh.close()
    data = {"host": HOST, "readOnly": True, "files": manifest, "diagnostics": diagnostics}
    (OUT / "manifest.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(OUT))
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
