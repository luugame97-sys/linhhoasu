import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

test_account = 'test_withinv_' + os.urandom(3).hex()
payload = json.dumps({
    'accountId': test_account,
    'password': 'Password123456',
    'confirmPassword': 'Password123456',
    'inviteCode': 'TY7C1A'
})
cmd = f"curl -s -i -X POST https://linhhoasu.lol/api/user/register -H 'Content-Type: application/json' -d '{payload}'"
_, stdout, stderr = ssh.exec_command(cmd)
print("=== Public HTTPS with inviteCode TY7C1A ===")
print(stdout.read().decode('utf-8', errors='replace').strip())

# Clean up test accounts from MongoDB to keep DB clean
cleanup_cmd = "mongosh lhs_s1001 --quiet --eval 'db.accounts.deleteMany({ accountId: /^test_(noinv|ok|withinv)_/ });'"
print("\n=== Cleaning up test accounts ===")
_, stdout2, _ = ssh.exec_command(cleanup_cmd)
print(stdout2.read().decode('utf-8', errors='replace').strip())

ssh.close()
