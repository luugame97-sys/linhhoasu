import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh_old = paramiko.SSHClient()
ssh_old.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh_old.connect('103.116.105.154', username='root', password='anhduc11')

ssh_new = paramiko.SSHClient()
ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh_new.connect('103.116.104.165', username='root', password='anhduc11')

print('=== OLD VPS MYSQL DBS ===')
_, o, _ = ssh_old.exec_command('mysql -uroot -p123456 -e "SHOW DATABASES;" 2>/dev/null || cat /www/server/data/default.pl')
print(o.read().decode('utf-8'))

print('=== NEW VPS MYSQL DBS ===')
_, o, _ = ssh_new.exec_command('mysql -uroot -p123456 -e "SHOW DATABASES;" 2>/dev/null || cat /www/server/data/default.pl')
print(o.read().decode('utf-8'))

ssh_old.close()
ssh_new.close()
