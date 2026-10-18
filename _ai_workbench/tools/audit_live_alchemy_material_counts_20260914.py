import getpass
import paramiko


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', username='root', password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    try:
        cmd = r"grep -h 'alchemyMaterials=' /root/.pm2/logs/lhs-s100*-out.log 2>/dev/null | tail -n 5000 | grep -oE '([0-9]{4}):[0-9]+' | sort | uniq -c | sort -k2n"
        _, out, err = ssh.exec_command(cmd, timeout=60)
        print(out.read().decode('utf-8', 'replace'), end='')
        print(err.read().decode('utf-8', 'replace'), end='')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
