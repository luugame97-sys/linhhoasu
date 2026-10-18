import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("=== 0.websocket.conf ===")
_, o, _ = ssh.exec_command('cat /www/server/panel/vhost/nginx/0.websocket.conf')
print(o.read().decode('utf-8'))

print("=== proxy.conf ===")
_, o, _ = ssh.exec_command('cat /www/server/nginx/conf/proxy.conf')
print(o.read().decode('utf-8'))

ssh.close()
