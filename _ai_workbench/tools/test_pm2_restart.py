import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    'cd /linhhoasu/lhs/newServer && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',
    'sleep 3',
    'pm2 env 0 | grep -i REQUIRE_INVITE',
    'pm2 save'
]

for cmd in commands:
    print(f"\n>>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='replace').strip())

test_account = 'test_noinv_' + os.urandom(3).hex()
payload = json.dumps({'accountId': test_account, 'password': 'Password123456', 'confirmPassword': 'Password123456'})
cmd = f"curl -s -i -X POST http://127.0.0.1:8080/api/user/register -H 'Content-Type: application/json' -d '{payload}'"
print(f"\n>>> {cmd}")
_, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='replace').strip())

cmd2 = f"curl -s -i -X POST https://linhhoasu.lol/api/user/register -H 'Content-Type: application/json' -d '{payload}'"
print(f"\n>>> {cmd2}")
_, stdout2, stderr2 = ssh.exec_command(cmd2)
print(stdout2.read().decode('utf-8', errors='replace').strip())

ssh.close()
