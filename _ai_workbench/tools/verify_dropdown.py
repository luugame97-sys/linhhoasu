import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("1. PHP syntax check:")
_, o, _ = ssh.exec_command('php -l /linhhoasu/webgame/gm/login.php')
print(o.read().decode('utf-8'))

print("2. Curl login page via Nginx port 81:")
_, o, _ = ssh.exec_command('curl -s -I http://127.0.0.1:81/web-panel/')
print(o.read().decode('utf-8'))

print("3. Check critical style in login.php:")
_, o, _ = ssh.exec_command('grep -n "custom-dropdown-menu" /linhhoasu/webgame/gm/login.php')
print(o.read().decode('utf-8'))

print("4. Check login.css bottom:")
_, o, _ = ssh.exec_command('tail -n 60 /linhhoasu/webgame/gm/assets/css/login.css')
print(o.read().decode('utf-8'))

print("5. Check login.js server click:")
_, o, _ = ssh.exec_command('grep -n -C 5 "server-option" /linhhoasu/webgame/gm/assets/js/login.js')
print(o.read().decode('utf-8'))

ssh.close()
