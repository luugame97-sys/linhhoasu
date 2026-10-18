import getpass
import pathlib
import paramiko

HOST = '103.116.105.154'
ROOT = pathlib.Path(__file__).resolve().parents[1] / 'temp' / 'auto_delegate_sell_all_20260914' / 'baseline'
FILES = {
    'server_box.js': '/linhhoasu/lhs/newServer/src/handlers/box.js',
    'server_item.js': '/linhhoasu/lhs/newServer/src/handlers/item.js',
    'server_EquipService.js': '/linhhoasu/lhs/newServer/src/services/EquipService.js',
    'client_main.js': '/linhhoasu/webgame/game/js/main.min_a6195824.js',
    'client_index.html': '/linhhoasu/webgame/game/index.html',
}


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    sftp = ssh.open_sftp()
    try:
        ROOT.mkdir(parents=True, exist_ok=True)
        for name, remote in FILES.items():
            target = ROOT / name
            sftp.get(remote, str(target))
            print(f'{name}: {target.stat().st_size} bytes')
    finally:
        sftp.close()
        ssh.close()


if __name__ == '__main__':
    main()
