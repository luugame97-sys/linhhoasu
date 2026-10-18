"""Snapshot read-only source/runtime liên quan S2 từ production."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
REMOTE_ROOT = PurePosixPath("/linhhoasu/lhs/newServer")
FILES = [
    "ecosystem.config.js",
    "src/handlers/serverList.js",
    "src/handlers/account.js",
    "src/net/WSServer.js",
    "src/net/HTTPServer.js",
    "src/services/ServerConfigService.js",
    "src/services/AuthSessionService.js",
    "src/db/models/GameServer.js",
    "src/db/models/Account.js",
]


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> tuple[int, str, str]:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def main() -> None:
    credential_file = Path(os.environ["LHS_PROD_CREDENTIAL_FILE"])
    lines = [line.strip() for line in credential_file.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(lines) != 3 or lines[0] != HOST or lines[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = ROOT / "temp" / f"server2_public_gate_snapshot_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=False)

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username=lines[1], password=lines[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        manifest = []
        sftp = ssh.open_sftp()
        try:
            for rel in FILES:
                local = out_dir / rel
                local.parent.mkdir(parents=True, exist_ok=True)
                remote = str(REMOTE_ROOT / rel)
                sftp.get(remote, str(local))
                manifest.append({
                    "remote": remote,
                    "local": str(local),
                    "sha256": hashlib.sha256(local.read_bytes()).hexdigest(),
                    "bytes": local.stat().st_size,
                })
            nginx_remote = "/www/server/panel/vhost/nginx/game.lhs.conf"
            nginx_local = out_dir / "nginx" / "game.lhs.conf"
            nginx_local.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(nginx_remote, str(nginx_local))
            manifest.append({
                "remote": nginx_remote,
                "local": str(nginx_local),
                "sha256": hashlib.sha256(nginx_local.read_bytes()).hexdigest(),
                "bytes": nginx_local.stat().st_size,
            })
        finally:
            sftp.close()

        command = r"""
date '+TIME=%F %T %z %Z'
echo PM2
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-dist","lhs-admin"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,WS_PORT:e.WS_PORT,HTTP_PORT:e.HTTP_PORT,SERVER_ID:e.SERVER_ID,REDIS_PREFIX:e.REDIS_PREFIX,AUTH_REDIS_PREFIX:e.AUTH_REDIS_PREFIX,IDENTITY_MONGO_DB:e.IDENTITY_MONGO_DB,WS_PUBLIC_PATH:e.WS_PUBLIC_PATH,WS_PUBLIC_PATH_1002:e.WS_PUBLIC_PATH_1002}))}}})'
echo S1_SERVER_CONFIG
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval 'JSON.stringify(db.gameservers.find({serverId:{$in:[1001,1002]}},{_id:0,serverId:1,serverName:1,pageId:1,running:1,status:1,openTime:1,isNew:1,isRecommend:1}).sort({serverId:1}).toArray())'
echo S2_SERVER_CONFIG
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval 'JSON.stringify(db.gameservers.find({serverId:{$in:[1001,1002]}},{_id:0,serverId:1,serverName:1,pageId:1,running:1,status:1,openTime:1,isNew:1,isRecommend:1}).sort({serverId:1}).toArray())'
echo COUNTS
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval 'JSON.stringify({db:db.getName(),accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({})})'
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval 'JSON.stringify({db:db.getName(),accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({})})'
echo PORTS
ss -lntp | grep -E ':(8080|8083|9200|9201)[[:space:]]' || true
echo NGINX_S2
nginx -T 2>/dev/null | grep -n -E '/ws-s2|127\.0\.0\.1:9201|location /ws|proxy_pass http://127\.0\.0\.1:9200' | head -80 || true
echo HEALTH
curl -sS --max-time 5 -w '\nS1_HTTP=%{http_code}\n' http://127.0.0.1:8080/ready
curl -sS --max-time 5 -w '\nS2_HTTP=%{http_code}\n' http://127.0.0.1:8083/ready
curl -sS --max-time 5 -w '\nBOT_HTTP=%{http_code}\n' http://127.0.0.1:9097/health || true
echo LOG_STATUS
for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do stat -c '%n bytes=%s modified=%y' "$f" 2>/dev/null || true; done
echo RUNTIME_MARKERS
grep 'runtime ready revision=' /root/.pm2/logs/lhs-s1001-out.log 2>/dev/null | tail -1 || true
grep 'runtime ready revision=' /root/.pm2/logs/lhs-s1002-out.log 2>/dev/null | tail -1 || true
echo POST_RESTART_ERROR_COUNTS
for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do n=$(grep -n 'runtime ready revision=' "$f" 2>/dev/null | tail -1 | cut -d: -f1); [ -n "$n" ] || n=1; c=$(tail -n +"$n" "$f" 2>/dev/null | grep -Eic 'uncaught|unhandled|EADDRINUSE|MongoDB.*(failed|error)|Redis.*(failed|error)|startup failed|TypeError|ReferenceError|SyntaxError' || true); echo "$f critical_count=$c"; done
echo POST_RESTART_ERROR_SAMPLES
f=/root/.pm2/logs/lhs-s1001-error.log; n=$(grep -n 'runtime ready revision=' "$f" 2>/dev/null | tail -1 | cut -d: -f1); [ -n "$n" ] || n=1; tail -n +"$n" "$f" 2>/dev/null | grep -Ei 'uncaught|unhandled|EADDRINUSE|MongoDB.*(failed|error)|Redis.*(failed|error)|startup failed|TypeError|ReferenceError|SyntaxError' | tail -30 | sed -E 's/(user=)[^ ]+/\1[REDACTED]/g' || true
echo ERROR_TAIL_CONTEXT
tail -80 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | sed -E 's/(user=)[^ ]+/\1[REDACTED]/g; s/(account=)[^ ]+/\1[REDACTED]/g' || true
echo BOT_RECONNECT_STATUS
tail -400 /root/.pm2/logs/lhs-real-bots-out.log 2>/dev/null | grep -Ei 'ready|connected|online|distribution|580' | tail -20 | sed -E 's/(user=)[^ ]+/\1[REDACTED]/g' || true
"""
        code, runtime, error = run(ssh, command)
        if code:
            raise RuntimeError(error or runtime)
        (out_dir / "runtime.txt").write_text(runtime, encoding="utf-8")
        code, nginx_dump, error = run(ssh, "nginx -T 2>&1", timeout=60)
        if code:
            raise RuntimeError(error or nginx_dump)
        (out_dir / "nginx.txt").write_text(nginx_dump, encoding="utf-8")
        (out_dir / "manifest.json").write_text(
            json.dumps({"host": HOST, "generatedAt": datetime.now(timezone.utc).isoformat(), "files": manifest}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(json.dumps({"result": "PASS", "snapshot": str(out_dir), "files": len(manifest)}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
