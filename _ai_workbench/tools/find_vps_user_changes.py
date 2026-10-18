import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password='anhduc11', timeout=15)

commands = [
    "find /linhhoasu -mmin -240 ! -path '*/_ai_workbench/*' ! -path '*/logs/*' -type f -ls 2>/dev/null",
    "find /www/wwwroot -mmin -240 ! -path '*/_ai_workbench/*' -type f -ls 2>/dev/null",
    "find / -maxdepth 3 -mmin -120 2>/dev/null"
]

for cmd in commands:
    print(f"\n=== CMD: {cmd} ===")
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    else:
        print("NONE")

ssh.close()
