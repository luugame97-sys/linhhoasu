import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

_, stdout, _ = ssh.exec_command('grep -rn "game_download_links" /linhhoasu/webgame/gm/ -A 20')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
