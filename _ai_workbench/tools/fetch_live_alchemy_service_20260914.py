import getpass
from pathlib import Path
import paramiko


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', username='root', password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    sftp = ssh.open_sftp()
    target = Path(__file__).resolve().parents[1] / 'temp' / 'live_AlchemyMaterialDropService_20260914.js'
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        sftp.get('/linhhoasu/lhs/newServer/src/services/AlchemyMaterialDropService.js', str(target))
        print(target)
    finally:
        sftp.close()
        ssh.close()


if __name__ == '__main__':
    main()
