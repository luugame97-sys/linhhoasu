import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    'grep -n "server-slider" /linhhoasu/webgame/gm/login.php',
    'grep -n "brand-lockup" /linhhoasu/webgame/gm/login.php -A 10',
    'grep -n "btn-switch-wrap" /linhhoasu/webgame/gm/login.php -A 5'
]

for cmd in commands:
    print(f"\n=== {cmd} ===")
    _, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='replace').strip())

ssh.close()
