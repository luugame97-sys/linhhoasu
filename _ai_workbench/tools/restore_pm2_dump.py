import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh_new = paramiko.SSHClient()
ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh_new.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    "sshpass -p 'anhduc11' scp -o StrictHostKeyChecking=no root@103.116.105.154:/root/.pm2/dump.pm2 /root/.pm2/dump.pm2",
    "pm2 delete all",
    "pm2 resurrect",
    "pm2 start all",
    "pm2 save",
    "pm2 list"
]

for cmd in commands:
    print(f"\n[EXEC] {cmd}")
    _, stdout, stderr = ssh_new.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f"[ERR] {err}")

ssh_new.close()
