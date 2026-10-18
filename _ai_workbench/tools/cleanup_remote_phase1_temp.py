import getpass
import paramiko

HOST = '103.116.105.154'
paths = [
    '/linhhoasu/lhs/newServer/src/net/WSServer.js.deploy-20260830_015351',
    '/linhhoasu/lhs/newServer/src/handlers/farm.js.deploy-20260830_015351',
]
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    for path in paths:
        _, out, err = ssh.exec_command(f'test -e {path} && rm -f {path} && echo removed:{path} || echo absent:{path}')
        print(out.read().decode('utf-8', 'replace').strip())
        if out.channel.recv_exit_status() != 0:
            print(err.read().decode('utf-8', 'replace'))
finally:
    ssh.close()
