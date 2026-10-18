import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("=== 1. Ports listening for nginx ===")
_, o, _ = ssh.exec_command('ss -tulpn | grep nginx')
print(o.read().decode('utf-8'))

print("=== 2. Local curl port 80 ===")
_, o, _ = ssh.exec_command('curl -s -I -H "Host: linhhoasu.lol" http://127.0.0.1:80/')
print(o.read().decode('utf-8'))

print("=== 3. Local curl port 443 HTTPS ===")
_, o, _ = ssh.exec_command('curl -s -I -k -H "Host: linhhoasu.lol" https://127.0.0.1:443/')
print(o.read().decode('utf-8'))

print("=== 4. Local curl web-panel on 443 ===")
_, o, _ = ssh.exec_command('curl -s -I -k -H "Host: linhhoasu.lol" https://127.0.0.1:443/web-panel/')
print(o.read().decode('utf-8'))

print("=== 5. Local curl port 81 ===")
_, o, _ = ssh.exec_command('curl -s -I http://127.0.0.1:81/')
print(o.read().decode('utf-8'))

ssh.close()
