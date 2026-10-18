import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect('103.116.104.165', 22, 'root', 'anhduc00', timeout=10)
    commands = [
        'node -v',
        'npm -v',
        'pm2 -v',
        'ss -lntp',
        'ls -la /linhhoasu/lhs/newServer/node_modules/bcrypt 2>/dev/null | head -n 5',
        'ls -la /linhhoasu/lhs/LHS-dist/node_modules/bcrypt 2>/dev/null | head -n 5'
    ]
    for cmd in commands:
        print('=== ' + cmd + ' ===')
        stdin, stdout, stderr = client.exec_command(cmd)
        print(stdout.read().decode('utf-8'))
    client.close()
except Exception as e:
    print('Connection failed:', e)

