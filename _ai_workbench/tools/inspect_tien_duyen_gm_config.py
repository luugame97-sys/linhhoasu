from __future__ import annotations
import getpass
import paramiko

HOST = "103.116.105.154"
REMOTE = r"""
set -u
root=/linhhoasu/webgame/gm
echo '===GM_CONFIG_MARKERS==='
for f in "$root/config.php" "$root/.env" "$root/api/user_api.php" "$root/api/admin_api.php"; do
  if [ -f "$f" ]; then
    echo "---$f"
    grep -nE 'DB_|MYSQL|database|mysqli|PDO|sepay|recharge|webshop|order|table|GAME_HTTP|INTERNAL' "$f" \
      | sed -E 's/([Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Kk][Ee][Yy]|[Aa][Pp][Ii]_?[Kk][Ee][Yy])[^=]*=[[:space:]]*[^;,&]*/\1=[REDACTED]/g'
  fi
done
echo '===MYSQL_CLIENT==='
command -v mysql || true
echo '===MYSQL_PORTS==='
ss -lntp | grep -E ':(3306|3307|3308)\b' || true
echo '===GM_FILES==='
find "$root" -maxdepth 3 -type f ! -name '.env' ! -name '*.log' \
  | grep -Ei '(recharge|payment|sepay|order|shop|purchase|transaction)' | sort | head -300
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

