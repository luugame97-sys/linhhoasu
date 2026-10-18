import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("=== NGINX CONF web-panel ===")
_, o, _ = ssh.exec_command('grep -rn "web-panel" /www/server/panel/vhost/nginx/')
print(o.read().decode('utf-8'))

print("=== List /linhhoasu/webgame/gm ===")
_, o, _ = ssh.exec_command('ls -la /linhhoasu/webgame/gm')
print(o.read().decode('utf-8'))

print("=== Find login files in /linhhoasu/webgame/ ===")
_, o, _ = ssh.exec_command('find /linhhoasu/webgame/ -name "*login*" -o -name "*server*"')
print(o.read().decode('utf-8'))

ssh.close()
