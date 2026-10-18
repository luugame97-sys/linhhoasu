import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("1. Kill manual redis process...")
ssh.exec_command('pkill -9 redis-server')

print("2. Fix ownership of /www/server/redis...")
ssh.exec_command('chown -R redis:redis /www/server/redis')

print("3. Start redis via systemctl...")
_, o, e = ssh.exec_command('systemctl reset-failed redis && systemctl start redis')
print("systemctl output:", o.read().decode('utf-8', errors='replace'), e.read().decode('utf-8', errors='replace'))

print("4. Check systemctl status...")
_, o, _ = ssh.exec_command('systemctl status redis --no-pager')
print(o.read().decode('utf-8', errors='replace'))

print("5. Test redis ping...")
_, o, _ = ssh.exec_command('/www/server/redis/src/redis-cli ping')
print("Ping:", o.read().decode('utf-8', errors='replace'))

ssh.close()
