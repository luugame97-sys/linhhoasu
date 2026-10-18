"""Bounded read-only soak after input-freeze deployment."""
from __future__ import annotations

import getpass
import paramiko

HOST = "103.116.105.154"


def run(ssh, command, timeout=180):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-3000:] or f"command failed {code}")
    return out


parts = [
    "set -u",
    "out=/root/.pm2/logs/lhs-s1001-out.log",
    "marker=$(grep -n '\\[WSServer\\] runtime ready revision=b15797d9e617' \"$out\" | tail -1 | cut -d: -f1)",
    "marker=${marker:-1}",
    "for i in $(seq 1 6); do",
    "now=$(date -Is)",
    "health=$(curl -fsS --max-time 5 http://127.0.0.1:9200/health || echo '{\"status\":\"error\"}')",
    "ready=$(curl -fsS --max-time 5 http://127.0.0.1:8080/ready || echo '{\"status\":\"error\"}')",
    "pid=$(pm2 pid lhs-s1001 2>/dev/null | tail -1)",
    "psrow=$(ps -o pid=,etimes=,%cpu=,rss= -p \"$pid\" 2>/dev/null | awk '{$1=$1;print}' || true)",
    "pending=$(tail -n +\"$marker\" \"$out\" | grep -E 'handler stuck|deadline exceeded|handler still pending' | wc -l)",
    "slowArena=$(tail -n +\"$marker\" \"$out\" | grep -E 'slow tag=(2600|2602)' | wc -l)",
    "fatal=$(tail -n +\"$marker\" \"$out\" | grep -Ei 'ReferenceError|TypeError|SyntaxError|uncaught|unhandled rejection|async-save-failed' | wc -l)",
    "printf 'SAMPLE %s ps=%s pending=%s slowArena=%s fatal=%s health=%s ready=%s\\n' \"$now\" \"$psrow\" \"$pending\" \"$slowArena\" \"$fatal\" \"$health\" \"$ready\"",
    "sleep 20",
    "done",
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username="root",
    password=getpass.getpass("VPS password (not logged): "),
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)
try:
    print(run(ssh, "\n".join(parts), timeout=180))
finally:
    ssh.close()
