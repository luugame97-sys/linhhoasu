import getpass
from pathlib import Path
import paramiko


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', username='root', password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    target = Path(__file__).resolve().parents[1] / 'temp' / 'live_alchemyMaterialDrops_20260914.json'
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        ssh.open_sftp().get('/linhhoasu/lhs/newServer/src/config/alchemyMaterialDrops.json', str(target))
        print(target)
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
