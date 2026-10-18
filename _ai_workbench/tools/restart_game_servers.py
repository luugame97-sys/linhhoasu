import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("1. Restarting PM2 game services...")
_, o, _ = ssh.exec_command('pm2 restart lhs-s1001 lhs-s1002 lhs-s1003 lhs-s1004 lhs-s1005 lhs-s1006')
print(o.read().decode('utf-8', errors='replace'))

time.sleep(3)

print("2. Checking /ready status...")
_, o, _ = ssh.exec_command('for p in 9200 9201 9202 9203 9204 9205; do echo -n "Port $p: "; curl -s http://127.0.0.1:$p/ready || echo "ERR"; echo ""; done')
print(o.read().decode('utf-8', errors='replace'))

print("3. Checking PM2 S1001 logs after restart...")
_, o, _ = ssh.exec_command('tail -n 20 /root/.pm2/logs/lhs-s1001-out.log')
print(o.read().decode('utf-8', errors='replace'))

ssh.close()
