import getpass
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '),
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    for command in (
        'pm2 -v',
        'pm2 restart --help | sed -n "1,180p"',
        'pm2 describe lhs-s1001 | sed -n "1,180p"',
    ):
        _, out, err = ssh.exec_command(command)
        print(f'$ {command}\n{out.read().decode("utf-8", "replace")}')
        out.channel.recv_exit_status()
finally:
    ssh.close()
