import getpass
import os

import paramiko

HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/gm'
LOCAL_OUT = r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)

def run(command):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code and code != 1:
        print('COMMAND_FAILED', code, err.read().decode('utf-8', 'replace')[-2000:])
    return text

try:
    print('TREE')
    print(run(
        f"find {REMOTE_ROOT} -maxdepth 3 -type f "
        "! -name '.env' ! -name '*.log' ! -path '*/vendor/*' "
        "-printf '%p|%s|%TY-%Tm-%Td %TH:%TM:%TS\\n' | sort | head -500"
    ))
    print('REFERENCES')
    print(run(
        f"grep -RInE --exclude='.env' --exclude='*.log' --exclude-dir=vendor "
        "'webshop|shop_orders|shop_products|category|attachment|Quà chọn|Rương hiếm|Hồn ngọc|Trang bị|魂玉|装备|宝箱|任选' "
        f"{REMOTE_ROOT}/api {REMOTE_ROOT}/assets {REMOTE_ROOT}/*.php 2>/dev/null | head -1200"
    ))
    os.makedirs(LOCAL_OUT, exist_ok=True)
    source_files = [
        'api/user_api.php',
        'config.php',
        'admin/admin_api.php',
        'index.php',
        'admin/index.php',
        'assets/item/webshop_catalog.json',
        'assets/item/gmitem.txt',
        '_ai_workbench/tools/sync_webshop_catalog.php',
        'assets/js/app.js',
        'assets/js/user.js',
        'assets/js/admin.js',
    ]
    sftp = ssh.open_sftp()
    try:
        for relative in source_files:
            remote = f'{REMOTE_ROOT}/{relative}'
            local = os.path.join(LOCAL_OUT, relative.replace('/', '__'))
            try:
                sftp.get(remote, local)
                print('DOWNLOADED', relative, os.path.getsize(local))
            except FileNotFoundError:
                pass
            except IOError:
                pass
    finally:
        sftp.close()
finally:
    ssh.close()
