import getpass
import paramiko


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', username='root', password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    try:
        commands = [
            "find /linhhoasu /root -type f \( -iname '*alchemy*' -o -iname '*drop*' \) 2>/dev/null | head -120",
            "grep -RIl --exclude-dir=node_modules --exclude='*.log' -E '2001.?2015|2201.?2215|AlchemyMaterialDrop' /linhhoasu /root 2>/dev/null | head -120",
        ]
        for command in commands:
            _, out, err = ssh.exec_command(command, timeout=120)
            print(out.read().decode('utf-8', 'replace'), end='')
            print(err.read().decode('utf-8', 'replace'), end='')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
