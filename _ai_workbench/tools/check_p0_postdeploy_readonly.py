"""Read-only post-deploy hashes, health, PM2 and bounded current log tail."""
from __future__ import annotations

import getpass
import os
import re

import paramiko


HOST = "103.116.105.154"
COMMAND = r'''
set -u
echo '===TIME==='; date '+%Y-%m-%d %H:%M:%S %z'
echo '===HASHES==='; sha256sum -- /linhhoasu/lhs/newServer/src/handlers/item.js /linhhoasu/lhs/newServer/src/handlers/commerce-compat.js
echo '===PM2==='; pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-dist","lhs-admin","lhs-real-bots"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'
echo '===HTTP==='; for u in http://127.0.0.1:8080/ready http://127.0.0.1:9200/health; do printf '%s|' "$u"; curl -sS -o /tmp/p0_post.$$ -w '%{http_code}|%{size_download}|%{content_type}\n' --max-time 15 "$u"; head -c 800 /tmp/p0_post.$$; echo; rm -f /tmp/p0_post.$$; done
echo '===ERROR_LOG_TAIL==='; tail -n 160 /linhhoasu/lhs/newServer/logs/error-2026-09-01.log 2>/dev/null || true
echo '===COMBINED_RECENT_FLAGS==='; tail -n 250000 /linhhoasu/lhs/newServer/logs/combined-2026-09-01.log 2>/dev/null | awk '$0 >= "2026-09-01 11:09:00"' | grep -Ei 'unhandled|uncaught|syntaxerror|referenceerror|typeerror|EPIPE|connection is closed|failed|fatal|exception|paid goods rejected' | tail -n 240 || true
'''


def main() -> None:
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass(
        "Production password (not logged): "
    )
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _stdin, stdout, stderr = ssh.exec_command(COMMAND, timeout=180)
        body = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    body = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", body)
    print(body, end="")
    if error.strip():
        print("STDERR=" + error[-2000:])


if __name__ == "__main__":
    main()
