from __future__ import annotations
import getpass
import paramiko

HOST = "103.116.105.154"
REMOTE = r"""
set -u
pid=$(pm2 pid lhs-s1001 2>/dev/null | head -1 | tr -d '[:space:]')
echo "PID=$pid"
if [ -n "$pid" ] && [ -r "/proc/$pid/environ" ]; then
  echo '===ENV==='
  tr '\0' '\n' < "/proc/$pid/environ" | awk -F= '
    /^((NODE_ENV|HTTP_PORT|WS_PORT|WS_PUBLIC_PORT|SERVER_ID|SERVER_NAME|MONGO_URI|REDIS_URL|REDIS_PREFIX|XTPAY_GATEWAY|XTPAY_PID|XTPAY_KEY|XTPAY_CREATE_MODE|XTPAY_NOTIFY_URL|XTPAY_RETURN_URL|PUBLIC_BASE_URL|INTERNAL_API_KEY|API_KEY|DIST_API_KEY)=)/ {
      k=$1; v=substr($0,index($0,"=")+1);
      if (k ~ /KEY|PASSWORD|SECRET|TOKEN|PID/ && v != "") v="[SET]";
      else if (k == "REDIS_URL" && v != "") sub(/:[^@]*@/,":[REDACTED]@",v);
      print k "=" v;
    }'
  echo '===CWD_CMD==='
  readlink "/proc/$pid/cwd" || true
  tr '\0' ' ' < "/proc/$pid/cmdline"; echo
fi
echo '===ECOSYSTEM_MARKERS==='
for p in /linhhoasu/lhs/newServer/ecosystem.config.js /linhhoasu/lhs/newServer/.env; do
  if [ -f "$p" ]; then
    echo "---$p"
    grep -nE 'MONGO_URI|REDIS_URL|XTPAY_|PUBLIC_BASE_URL|HTTP_PORT|WS_PORT|SERVER_ID|NODE_ENV' "$p" | sed -E 's/(KEY|PASSWORD|SECRET|TOKEN|PID):?[^, ]*/\1=[SET]/Ig'
  fi
done
echo '===HTTP_ROUTES==='
for path in /ready /health /api/pay/xtpay/create /api/pay/xtpay/notify /api/internal/recharge /internal/recharge-callback; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:8080$path" || echo 000)
  echo "$path=$code"
done
"""
def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _, out, err = ssh.exec_command(REMOTE, timeout=90)
        print(out.read().decode("utf-8", "replace"), end="")
        e = err.read().decode("utf-8", "replace")
        if e:
            print("STDERR=" + e, end="")
    finally:
        ssh.close()
if __name__ == "__main__":
    main()
