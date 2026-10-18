import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    "grep -rn 'Android / iOS / PC' /linhhoasu /www 2>/dev/null",
    "grep -rn 'Android / iOS' /linhhoasu /www 2>/dev/null",
    "grep -rn 'TẢI GAME' /linhhoasu /www 2>/dev/null",
    "grep -rn 'Chọn máy chủ' /linhhoasu /www 2>/dev/null",
    "grep -rn 'Linh Họa Sư - S1001' /linhhoasu /www 2>/dev/null"
]

for cmd in commands:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out[:500])
    else:
        print("NONE")

ssh.close()
