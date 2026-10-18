"""Read-only inventory of payload/RPC evidence on the isolated test VPS.

This helper intentionally performs no remote writes, restarts, or config changes.
It asks for the VPS password interactively and writes a redacted report under
_ai_workbench/temp so the evidence can be reviewed without exposing secrets.
"""
from __future__ import annotations

import getpass
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]


def q(value: str) -> str:
    return shlex.quote(value)


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code and not out:
        return f"[remote exit {code}]\n{err[-8000:]}"
    return out + (f"\n[stderr]\n{err[-8000:]}" if err else "")


def redact(text: str) -> str:
    # Never persist credentials, URI passwords, tokens, or account credentials.
    text = re.sub(r"(?i)(password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*[=:]\s*[^\s,;]+", r"\1=[REDACTED]", text)
    text = re.sub(r"(?i)(mongodb(?:\+srv)?://[^:/\s]+:)[^@\s]+@", r"\1[REDACTED]@", text)
    text = re.sub(r"(?i)(redis://[^:/\s]+:)[^@\s]+@", r"\1[REDACTED]@", text)
    # Avoid copying account-like IDs from noisy packet lines into the artifact.
    text = re.sub(r"\b(?:p_u_[A-Za-z0-9_-]+|user(?:Id)?=[A-Za-z0-9_-]+)\b", "[REDACTED_ID]", text)
    return text


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = ROOT / "_ai_workbench" / "temp" / f"test_payload_inventory_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=False)
    password = getpass.getpass("Test VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)

    commands: dict[str, str] = {
        "clock_pm2": r'''date -Is; pm2 jlist 2>/dev/null | python3 -c 'import sys,json; data=json.load(sys.stdin); out=[]
for p in data:
 e=p.get("pm2_env",{}); env=e.get("env",{}) or {}; keep={k:v for k,v in env.items() if k in {"NODE_ENV","HTTP_PORT","WS_PORT","SERVER_ID","LOG_LEVEL","BOT_ENABLED","BOT_MAX_TOTAL","BOT_MAP_IDS","BOT_REAL_ENABLED","BOT_CHAT_ENABLED","LHS_TEST_DISABLE_BOX_BROADCAST","REQUIRE_INVITE_REGISTER"}}; out.append({"name":p.get("name"),"pid":p.get("pid"),"status":e.get("status"),"restart_time":e.get("restart_time"),"pm_uptime":e.get("pm_uptime"),"env":keep})
print(json.dumps(out,ensure_ascii=False))' 2>&1''',
        "proc_env": r'''pid=$(pm2 pid lhs-s1001 2>/dev/null | head -1 | tr -d '[:space:]'); echo PID=$pid; if [ -n "$pid" ] && [ -r "/proc/$pid/environ" ]; then tr '\0' '\n' < "/proc/$pid/environ" | grep -E '^(NODE_ENV|HTTP_PORT|WS_PORT|SERVER_ID|SERVER_NAME|LOG_LEVEL|BOT_|LHS_TEST_|REQUIRE_INVITE_REGISTER|MONGO_URI|REDIS_URL)=' | sed -E 's#(MONGO_URI|REDIS_URL)=.*#\1=[REDACTED]#; s#(PASSWORD|SECRET|TOKEN|KEY|PID)=.*#\1=[REDACTED]#'; fi''',
        "listeners": r'''ss -lntp 2>/dev/null | grep -E ':(81|8080|9200|27017|6379)\b' || true''',
        "log_files": r'''for d in /linhhoasu/lhs/newServer/logs /root/.pm2/logs /linhhoasu/_ai_workbench/logs; do echo "=== $d"; find "$d" -maxdepth 2 -type f -printf '%TY-%Tm-%Td %TH:%TM:%TS %s %p\n' 2>/dev/null | sort -r | head -40; done''',
        "source_tags": r'''cd /linhhoasu/lhs/newServer; rg -n --glob '*.js' --glob '!node_modules/**' "(2150|2160|2600|2602|2300|2301|1400|1401|1402|1403|1404|setInterval|setTimeout|_messageQueue|handler still pending|slow tag|broadcastMap|push.*Map|send.*tag)" src ecosystem.config.js 2>/dev/null | head -1200 || grep -RInE --include='*.js' --exclude-dir=node_modules "2150|2160|2600|2602|2300|2301|1400|1401|1402|1403|1404|setInterval|setTimeout|_messageQueue|handler still pending|slow tag|broadcastMap|push.*Map|send.*tag" src ecosystem.config.js 2>/dev/null | head -1200''',
        "remote_workbench": r'''find /linhhoasu/_ai_workbench -maxdepth 4 -type f \( -iname '*trace*' -o -iname '*freeze*' -o -iname '*qa*' -o -iname '*.json' \) -printf '%TY-%Tm-%Td %TH:%TM:%TS %s %p\n' 2>/dev/null | sort -r | head -120''',
        "git_state": r'''cd /linhhoasu/lhs/newServer; git rev-parse --short HEAD 2>/dev/null || true; git status --short 2>/dev/null | head -80''',
    }
    result: dict[str, str] = {}
    try:
        for key, command in commands.items():
            result[key] = redact(run(ssh, command, timeout=120))
    finally:
        ssh.close()
    payload = {"host": HOST, "capturedAt": datetime.now(timezone.utc).isoformat(), "readOnly": True, "data": result}
    path = out_dir / "report.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    # Also emit compact sectioned text for quick review.
    text = "\n\n".join(f"===== {k} =====\n{v}" for k, v in result.items())
    (out_dir / "report.txt").write_text(text + "\n", encoding="utf-8")
    print(json.dumps({"output": str(out_dir), "host": HOST, "keys": list(result)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
