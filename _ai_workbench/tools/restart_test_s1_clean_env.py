"""Restart only test S1 from restored ecosystem, clearing stale PM2 env."""
from __future__ import annotations

import getpass
import json
import time
import paramiko

HOST = "192.168.200.151"
ROOT = "/linhhoasu/lhs/newServer"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit {code}")
    return out


def main() -> None:
    password = getpass.getpass("Test VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        backup = run(
            ssh,
            "stamp=$(date +%Y%m%d_%H%M%S); "
            "backup=/linhhoasu/_ai_workbench/backups/restart_s1_clean_env_pre_$stamp; "
            "mkdir -p \"$backup\"; "
            f"cp -p {ROOT}/ecosystem.config.js \"$backup/ecosystem.config.js\"; "
            "pm2 jlist > \"$backup/pm2-before.json\"; printf '%s' \"$backup\"",
        ).strip()
        run(ssh, "pm2 delete lhs-s1001 >/dev/null 2>&1 || true")
        run(ssh, f"cd {ROOT} && pm2 start ecosystem.config.js --only lhs-s1001 --update-env >/dev/null", timeout=120)
        ready = False
        for _ in range(90):
            code = run(
                ssh,
                "curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "
                "http://127.0.0.1:8080/ready || true",
            ).strip()
            listeners = run(ssh, "ss -lnt | grep -c ':9200 ' || true").strip()
            if code == "200" and listeners != "0":
                ready = True
                break
            time.sleep(1)
        if not ready:
            raise RuntimeError("S1 did not become healthy after clean restart")
        rows = json.loads(run(ssh, "pm2 jlist"))
        row = next(item for item in rows if item.get("name") == "lhs-s1001")
        env = row.get("pm2_env") or {}
        result = {
            "host": HOST,
            "backup": backup,
            "pid": row.get("pid"),
            "status": env.get("status"),
            "restartCount": env.get("restart_time"),
            "invite": env.get("REQUIRE_INVITE_REGISTER"),
            "boxBroadcastFlag": env.get("LHS_TEST_DISABLE_BOX_BROADCAST"),
            "ready": "200",
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
