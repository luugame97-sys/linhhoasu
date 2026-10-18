import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password='anhduc11')

for f in ['127.0.0.2.conf', 'game.lhs.conf']:
    print(f"\n==================== {f} ====================")
    _, o, _ = ssh.exec_command(f"cat /www/server/panel/vhost/nginx/{f}")
    print(o.read().decode('utf-8', errors='replace'))

ssh.close()
