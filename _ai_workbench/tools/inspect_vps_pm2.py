import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

commands = [
    'pm2 env 0 | grep -i REQUIRE_INVITE',
    'grep -n "REQUIRE_INVITE" /linhhoasu/lhs/newServer/src/net/HTTPServer.js',
    'grep -n "REQUIRE_INVITE" /linhhoasu/lhs/newServer/ecosystem.config.js',
    'pm2 jlist | grep -o \'"name":"lhs-s1001"[^}]*\'',
    'grep -n "registerUrl" /linhhoasu/lhs/newServer/src/net/HTTPServer.js'
]

for cmd in commands:
    print(f"\n=== {cmd} ===")
    _, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='replace').strip())

ssh.close()
