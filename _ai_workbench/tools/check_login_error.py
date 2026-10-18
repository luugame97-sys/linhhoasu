import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("=== Check S1001 latest logs right now ===")
_, o, _ = ssh.exec_command('tail -n 20 /root/.pm2/logs/lhs-s1001-out.log')
print(o.read().decode('utf-8', errors='replace'))

print("=== Check Redis ping and keys ===")
_, o, _ = ssh.exec_command('/www/server/redis/src/redis-cli ping ; /www/server/redis/src/redis-cli dbsize ; /www/server/redis/src/redis-cli keys "auth:*"')
print(o.read().decode('utf-8', errors='replace'))

ssh.close()
