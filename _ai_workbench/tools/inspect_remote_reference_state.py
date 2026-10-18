"""Read-only production state needed to avoid mixing local candidates with VPS."""
from __future__ import annotations

import getpass
import paramiko


HOST = "103.116.105.154"


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20)
    command = "\n".join([
        "set -u",
        "echo '===FILES==='",
        "stat -c '%y %s %n' /linhhoasu/webgame/game/index.html /linhhoasu/webgame/game/js/main.min_a6195824.js",
        "sha256sum /linhhoasu/webgame/game/index.html /linhhoasu/webgame/game/js/main.min_a6195824.js",
        "echo '===MARKERS==='",
        "grep -oE '20260831_[A-Za-z0-9_]+' /linhhoasu/webgame/game/index.html /linhhoasu/webgame/game/js/main.min_a6195824.js | sort -u | head -40 || true",
        "grep -oE 'register\\.html\\?inviteCode=[A-Za-z0-9]+' /linhhoasu/webgame/game/js/main.min_a6195824.js | sort -u | head -20 || true",
        "echo '===SERVED==='",
        "curl -fsS 'http://127.0.0.1:81/index.html?v=readonly' | grep -oE '20260831_[A-Za-z0-9_]+' | sort -u | head -20 || true",
        "curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v=readonly' | sha256sum",
        "echo '===PM2==='",
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time,uptime:e.pm_uptime}))}}})'",
        "echo '===BACKUPS==='",
        "find /linhhoasu/_ai_workbench/backups -maxdepth 1 -mindepth 1 -type d -printf '%TY-%Tm-%Td %TH:%TM:%TS %f\\n' | sort | tail -20",
    ])
    try:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        print(stdout.read().decode("utf-8", "replace"), end="")
        error = stderr.read().decode("utf-8", "replace")
        if error:
            print("STDERR=" + error)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
