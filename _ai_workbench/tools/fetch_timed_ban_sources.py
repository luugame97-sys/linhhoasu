"""Read-only snapshot of live game/WebGM sources for timed-ban development."""

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
OUT = ROOT / "temp" / f"timed_ban_live_{STAMP}"
FILES = {
    "/linhhoasu/lhs/newServer": (
        "src/app.js",
        "src/db/models/Account.js",
        "src/db/models/AdminActionLog.js",
        "src/services/AccountService.js",
        "src/services/AuthSessionService.js",
        "src/handlers/account.js",
        "src/handlers/serverList.js",
        "src/handlers/serverList1.js",
        "src/handlers/index.js",
        "src/net/HTTPServer.js",
        "src/net/HTTPServer1.js",
        "src/net/WSServer.js",
        "src/router.js",
        "ecosystem.config.js",
    ),
    "/linhhoasu/webgame/gm": (
        "admin/index.php",
        "admin/admin_api.php",
        "assets/js/admin.js",
        "assets/css/admin.css",
        "assets/css/ui-refactor.css",
        "config.php",
        "api/user_api.php",
        "index.php",
        "login.php",
    ),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-5000:] or output[-5000:] or f"remote exit={code}")
    return output


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    rows = []
    diagnostics = {}
    try:
        sftp = ssh.open_sftp()
        try:
            for remote_root, relatives in FILES.items():
                root_label = "game" if remote_root.endswith("newServer") else "webgm"
                for relative in relatives:
                    remote = f"{remote_root}/{relative}"
                    local = OUT / root_label / relative
                    local.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        sftp.get(remote, str(local))
                        stat = sftp.stat(remote)
                        rows.append({"remote": remote, "local": str(local), "size": stat.st_size, "mtime": stat.st_mtime, "mode": oct(stat.st_mode & 0o777), "sha256": digest(local)})
                    except (FileNotFoundError, OSError) as error:
                        rows.append({"remote": remote, "missing": True, "error": str(error)})
        finally:
            sftp.close()
        diagnostics["pm2"] = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'")
        diagnostics["health"] = run(ssh, "curl -sS --max-time 15 http://127.0.0.1:8080/ready; printf '\n'; curl -sS --max-time 15 http://127.0.0.1:9200/health | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const x=JSON.parse(s);console.log(JSON.stringify({status:x.status,pid:x.runtime&&x.runtime.pid,revision:x.runtime&&x.runtime.revision,clients:x.runtime&&x.runtime.clients}))})'")
        diagnostics["webgm"] = run(ssh, "for u in http://127.0.0.1:88/ http://127.0.0.1:88/admin/index.php; do printf '%s|' \"$u\"; curl -sS -o /tmp/timed-ban-web.$$ -w '%{http_code}|%{size_download}|%{content_type}\n' --max-time 15 \"$u\"; rm -f /tmp/timed-ban-web.$$; done")
        diagnostics["listeners"] = run(ssh, "ss -lntp 2>/dev/null | grep -E ':(81|88|8080|9200|9097)\\b' || true")
    finally:
        ssh.close()
    manifest = {"generatedAt": datetime.now(timezone.utc).isoformat(), "host": HOST, "readOnly": True, "files": rows, "diagnostics": diagnostics}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(rows), "diagnostics": diagnostics}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
