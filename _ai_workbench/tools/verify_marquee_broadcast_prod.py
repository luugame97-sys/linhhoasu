"""Read-only post-deploy verification for marquee production changes."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "marquee_broadcast_candidate_20260901"
FILES = {
    "game/chat.js": (CANDIDATE / "game/chat.js", "/linhhoasu/lhs/newServer/src/handlers/chat.js"),
    "game/HTTPServer.js": (CANDIDATE / "game/HTTPServer.js", "/linhhoasu/lhs/newServer/src/net/HTTPServer.js"),
    "game/WSServer.js": (CANDIDATE / "game/WSServer.js", "/linhhoasu/lhs/newServer/src/net/WSServer.js"),
    "webgm/config.php": (CANDIDATE / "config.php", "/linhhoasu/webgame/gm/config.php"),
    "webgm/admin/admin_api.php": (CANDIDATE / "admin/admin_api.php", "/linhhoasu/webgame/gm/admin/admin_api.php"),
    "webgm/admin/index.php": (CANDIDATE / "admin/index.php", "/linhhoasu/webgame/gm/admin/index.php"),
    "webgm/assets/js/admin.js": (CANDIDATE / "assets/js/admin.js", "/linhhoasu/webgame/gm/assets/js/admin.js"),
}


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-5000:] or out[-5000:] or f"remote exit={code}")
    return out


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        hashes = {}
        for key, (local, remote) in FILES.items():
            hashes[key] = {
                "candidate": sha(local),
                "production": run(ssh, f"sha256sum -- {shlex.quote(remote)}").split()[0],
            }
            hashes[key]["match"] = hashes[key]["candidate"] == hashes[key]["production"]
        syntax = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node --check src/handlers/chat.js && "
            "node --check src/net/HTTPServer.js && node --check src/net/WSServer.js && echo SYNTAX_OK",
        ).strip()
        health = run(
            ssh,
            "printf 'ready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready; "
            "printf ' ws='; curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9200/health; "
            "printf 'webgm='; curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:88/admin/index.php; echo",
        ).strip()
        unauthorized = run(
            ssh,
            "curl -sS -o /tmp/lhs_marquee_unauth.json -w '%{http_code}' --max-time 5 "
            "-H 'Content-Type: application/json' -d '{\"text\":\"\"}' "
            "http://127.0.0.1:8080/api/internal/broadcast/marquee; "
            "printf '|'; tr -d '\\n' < /tmp/lhs_marquee_unauth.json; rm -f /tmp/lhs_marquee_unauth.json; echo",
        ).strip()
        pm2 = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const a=JSON.parse(s).filter(x=>[\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env&&x.pm2_env.status,restarts:x.pm2_env&&x.pm2_env.restart_time}));console.log(JSON.stringify(a))})'",
        ).strip()
        backups = run(
            ssh,
            "ls -td /linhhoasu/_ai_workbench/backups/marquee_broadcast_pre_* 2>/dev/null | head -n 3 || true",
        ).strip().splitlines()
    finally:
        ssh.close()
    data = {"host": HOST, "readOnly": True, "hashes": hashes, "syntax": syntax,
            "health": health, "unauthorizedRoute": unauthorized, "pm2": json.loads(pm2),
            "backups": backups}
    out = ROOT / "temp" / "marquee_broadcast_prod_verify_20260901.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={out}")


if __name__ == "__main__":
    main()
