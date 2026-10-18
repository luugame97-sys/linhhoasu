from __future__ import annotations
import getpass
import paramiko

HOST = "103.116.105.154"
REMOTE = r"""
set -u
for path in /api/pay/xtpay/create /api/pay/xtpay/notify /api/internal/recharge; do
  echo "---$path"
  if [ "$path" = "/api/pay/xtpay/create" ]; then
    curl -sS -i -X POST -H 'Content-Type: application/json' --data '{}' --max-time 5 "http://127.0.0.1:8080$path" | sed -n '1,16p'
  elif [ "$path" = "/api/pay/xtpay/notify" ]; then
    curl -sS -i -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data '' --max-time 5 "http://127.0.0.1:8080$path" | sed -n '1,16p'
  else
    curl -sS -i -X POST -H 'Content-Type: application/json' --data '{}' --max-time 5 "http://127.0.0.1:8080$path" | sed -n '1,16p'
  fi
done
"""
def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _, out, err = ssh.exec_command(REMOTE, timeout=60)
        print(out.read().decode("utf-8", "replace"), end="")
        e = err.read().decode("utf-8", "replace")
        if e:
            print("STDERR=" + e, end="")
    finally:
        ssh.close()
if __name__ == "__main__":
    main()
