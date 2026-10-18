import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("--- login.css 190-225 ---")
_, o, _ = ssh.exec_command('sed -n "190,225p" /linhhoasu/webgame/gm/assets/css/login.css')
print(o.read().decode('utf-8'))

ssh.close()
