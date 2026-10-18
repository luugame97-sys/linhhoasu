import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import datetime
import paramiko

HOST = '103.116.105.154'
USER = 'root'
PASS = 'anhduc11'

def run():
    print(f"[{datetime.datetime.now()}] Connecting to {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)

    commands = [
        "pm2 list",
        "which mongodump mongosh mongo redis-cli",
        "redis-cli config get dir",
        "redis-cli config get dbfilename",
        "redis-cli info persistence",
        "mongosh --eval 'db.adminCommand({listDatabases: 1})' || mongo --eval 'db.adminCommand({listDatabases: 1})'"
    ]

    for cmd in commands:
        print(f"\n--- RUNNING: {cmd} ---")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        if out:
            print(out.strip())
        if err:
            print(f"[STDERR] {err.strip()}")

    ssh.close()

if __name__ == '__main__':
    run()
