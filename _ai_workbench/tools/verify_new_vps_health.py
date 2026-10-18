import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    "curl -I http://103.116.104.165:81/",
    "mongosh --quiet --eval 'for (let d of [\"lhs_s1001\",\"lhs_s1002\",\"lhs_s1003\",\"lhs_s1004\",\"lhs_s1005\",\"lhs_s1006\",\"lhs_dist\"]) { print(d + \" players:\", db.getSiblingDB(d).players ? db.getSiblingDB(d).players.countDocuments() : \"N/A\"); }'",
    "redis-cli ping && redis-cli dbsize",
    "pm2 startup systemd -u root --hp /root || true"
]

for cmd in commands:
    print(f"\n=== CMD: {cmd} ===")
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f"[ERR] {err}")

ssh.close()
