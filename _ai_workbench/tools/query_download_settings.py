import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

cmd = "mysql -u root -panhduc00 account_linhhoasu -e \"SELECT setting_key, setting_value FROM web_settings WHERE setting_key LIKE '%download%';\" 2>/dev/null || mysql -u root -p'anhduc11' account_linhhoasu -e \"SELECT setting_key, setting_value FROM web_settings WHERE setting_key LIKE '%download%';\" 2>/dev/null || grep -rn 'download_' /linhhoasu/webgame/gm/"
_, stdout, _ = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
