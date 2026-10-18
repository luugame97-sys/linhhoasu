"""Read-only diagnosis after marquee deployment; no restart or mutation."""
from __future__ import annotations

import getpass
import json
import re

import paramiko

HOST = "103.116.105.154"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 60) -> tuple[str, str, int]:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return out, err, code


def redact(text: str) -> str:
    text = re.sub(r"(?i)(password|token|api[_-]?key|signature|secret)=?[^\s,;]+", r"\1=[REDACTED]", text)
    text = re.sub(r"(?i)(x-api-key:\s*)[^\s]+", r"\1[REDACTED]", text)
    return text


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        commands = {
            "pm2": "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const names=[\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"];const a=JSON.parse(s).filter(x=>names.includes(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env&&x.pm2_env.status,uptime:x.pm2_env&&x.pm2_env.pm_uptime,restarts:x.pm2_env&&x.pm2_env.restart_time,exit:x.pm2_env&&x.pm2_env.exit_code}));console.log(JSON.stringify(a))})'",
            "ports": "ss -lntp | grep -E ':(81|88|3001|8080|8082|9200)\\b' || true",
            "health": "for u in http://127.0.0.1:8080/ready http://127.0.0.1:8080/health http://127.0.0.1:9200/health http://127.0.0.1:8080/api/user/policy http://127.0.0.1:81/; do code=$(curl -sS -o /tmp/lhs_diag_body -w '%{http_code}' --max-time 8 \"$u\" || true); printf '%s %s ' \"$code\" \"$u\"; head -c 300 /tmp/lhs_diag_body | tr '\\n' ' '; echo; done; rm -f /tmp/lhs_diag_body",
            "require": "cd /linhhoasu/lhs/newServer && node --check src/handlers/chat.js && node --check src/net/HTTPServer.js && node --check src/net/WSServer.js && node -e \"require('./src/handlers/chat');require('./src/net/HTTPServer');require('./src/net/WSServer');console.log('REQUIRE_OK')\"",
            "logs": "pm2 logs lhs-s1001 --lines 120 --nostream 2>&1 | tail -n 180",
            "recent_errors": "tail -n 500 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -aEi 'error|fatal|crash|auth|websocket|handler|marquee' | tail -n 120 || true",
            "recent_restart_logs": "awk '/2026-09-01 22:49:00/{f=1} f' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -aEi 'error|fatal|crash|auth|websocket|handler|marquee|ready|listening' | tail -n 160 || true",
            "source_markers": "grep -n -E 'broadcast/marquee|msgType: 16|buildMarqueeMarkup|TextFlow|_marqueeTimers' /linhhoasu/lhs/newServer/src/handlers/chat.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/WSServer.js || true",
            "error_meta": "stat -c 'error_mtime=%y error_size=%s' /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null || true; tail -n 40 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 40",
            "pm2_describe": "pm2 describe lhs-s1001 | grep -E 'status|pid|uptime|restarts|script path|exec cwd|error log|out log' || true",
            "marquee_logs": "grep -aEi 'marquee|broadcast/marquee|TEXTFLOW' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 80 || true",
        }
        results = {}
        for name, command in commands.items():
            out, err, code = run(ssh, command, 120 if name == "logs" else 60)
            results[name] = {"code": code, "stdout": redact(out), "stderr": redact(err)}
    finally:
        ssh.close()
    print(json.dumps({"host": HOST, "readOnly": True, "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
