import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    'ls -la /linhhoasu/webgame/game/*apk*',
    'ls -la /linhhoasu/webgame/gm/*apk*',
    'curl -sI http://127.0.0.1:81/linhhoasulol.apk',
    'curl -sI http://127.0.0.1:81/linhhoasu.apk',
    'curl -sI -H "Host: linhhoasu.lol" http://127.0.0.1:80/linhhoasulol.apk',
    'curl -sI -H "Host: linhhoasu.lol" http://127.0.0.1:80/linhhoasu.apk',
    'curl -sI https://linhhoasu.lol/linhhoasulol.apk?v=1',
    'curl -sI https://linhhoasu.lol/linhhoasu.apk'
]

for cmd in commands:
    print(f"\n>>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='replace').strip())

ssh.close()
