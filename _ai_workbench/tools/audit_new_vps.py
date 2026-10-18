import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

HOST = '103.116.104.165'
USER = 'root'
PASS = 'anhduc11'

def run_ssh(ssh, cmd):
    print(f"\n=== CMD: {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f"[STDERR] {err}")

def main():
    print(f"Connecting to NEW VPS {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)

    commands = [
        "cat /etc/os-release | grep -E '^(NAME|VERSION)='",
        "free -h",
        "df -h",
        "node -v || echo 'NO_NODE'",
        "npm -v || echo 'NO_NPM'",
        "pm2 -v || echo 'NO_PM2'",
        "mongod --version || echo 'NO_MONGOD'",
        "mongosh --version || mongo --version || echo 'NO_MONGOSH'",
        "mongorestore --version || echo 'NO_MONGORESTORE'",
        "redis-server --version || echo 'NO_REDIS_SERVER'",
        "redis-cli ping || echo 'REDIS_NOT_RESPONDING'",
        "nginx -v || echo 'NO_NGINX'",
        "ss -tulpn || netstat -tulpn",
        "which rsync scp tar gzip curl git python3 || true",
        "ls -la /www /linhhoasu /backup 2>/dev/null || true"
    ]

    for cmd in commands:
        run_ssh(ssh, cmd)

    ssh.close()

if __name__ == '__main__':
    main()
