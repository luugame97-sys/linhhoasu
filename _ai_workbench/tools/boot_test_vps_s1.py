"""Back up config and boot only the S1 process on the isolated test VPS."""
from __future__ import annotations

import getpass
import json
import paramiko

HOST = "192.168.200.151"

def main() -> None:
    password = getpass.getpass("Test VPS password (not logged): ")
    command = """set -eu
stamp=$(date +%Y%m%d_%H%M%S)
backup=/linhhoasu/_ai_workbench/backups/test_boot_pre_$stamp
mkdir -p "$backup"
cp -p /linhhoasu/lhs/newServer/ecosystem.config.js "$backup/ecosystem.config.js"
cd /linhhoasu/lhs/newServer
pm2 start ecosystem.config.js --only lhs-s1001 --update-env
ready=0
for i in $(seq 1 45); do
  code=$(curl -sS -o /tmp/test_ready.$$ -w '%{http_code}' http://127.0.0.1:8080/ready || true)
  if [ "$code" = "200" ] && ss -lnt | grep -q ':9200 '; then ready=1; break; fi
  sleep 1
done
printf '%s\\n' '===READY==='; curl -sS -i --max-time 10 http://127.0.0.1:8080/ready | sed -n '1,20p'
printf '%s\\n' '===PM2==='; pm2 list 2>&1 | sed -n '1,100p'
printf '%s\\n' '===LISTENERS==='; ss -lntp | grep -E ':(81|8080|9200|27017|6379)\\\\b' || true
printf '%s\\n' '===ERROR_TAIL==='; tail -n 120 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 40 || true
printf 'BACKUP=%s\\n' "$backup"
printf 'READY_FLAG=%s\\n' "$ready"
"""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(command, timeout=150)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        print(json.dumps({"exit": stdout.channel.recv_exit_status(), "stdout": out, "stderr": err}, ensure_ascii=False))
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
