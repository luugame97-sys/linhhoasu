"""Read-only production correlation of queue backlogs, bot sockets, and reconnects."""
from __future__ import annotations

import getpass
import json
import paramiko


HOST = "103.116.105.154"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or output[-4000:])
    return output


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        commands = {
            "health": "curl -fsS --max-time 8 http://127.0.0.1:9200/health",
            "pm2": "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\"].includes(p.name))console.log(JSON.stringify({name:p.name,status:p.pm2_env.status,pid:p.pid,restart:p.pm2_env.restart_time,uptime:Date.now()-p.pm2_env.pm_uptime}))}})'",
            "worker_log": "tail -n 250 /root/.pm2/logs/lhs-real-bots-out.log 2>/dev/null || true",
            "worker_error": "tail -n 250 /root/.pm2/logs/lhs-real-bots-error.log 2>/dev/null || true",
            "game_log": "f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n \"$n\" ] || n=1; tail -n +$n $f | grep -E 'queue backlog|socket (close|error)|close ws#|real_bot|slow tag=|handler stuck|deadline exceeded' | tail -n 1200",
        }
        for name, command in commands.items():
            print(f"===== {name.upper()} =====")
            print(run(ssh, command))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
