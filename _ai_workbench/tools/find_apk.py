import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    'find /linhhoasu /www /root /home /tmp -iname "*apk*" 2>/dev/null',
    'find / -maxdepth 3 -iname "*apk*" 2>/dev/null',
    'ls -lh /linhhoasu/webgame/game/*.apk 2>/dev/null || true',
    'ls -lh /root/*.apk 2>/dev/null || true',
    'ls -lh /www/wwwroot/*/*.apk 2>/dev/null || true'
]

for cmd in commands:
    print(f"\n>>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='replace').strip())

ssh.close()
