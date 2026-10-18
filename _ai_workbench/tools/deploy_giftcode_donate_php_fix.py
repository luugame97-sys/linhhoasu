import getpass
import hashlib
import os
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
ROOT = '/linhhoasu/webgame/gm'
LOCAL = {
    'config.php': r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit\config.php',
    'api/user_api.php': r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit\api__user_api.php',
}


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-4000:])
    return text


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


pw = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=pw, look_for_keys=False, allow_agent=False, timeout=15)
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/giftcode_donate_php_fix_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    for rel in LOCAL:
        run(ssh, f'cp -p {ROOT}/{rel} {backup}/{rel.replace("/", "__")}')
    sftp = ssh.open_sftp()
    stages = {}
    try:
        for rel, local in LOCAL.items():
            stage = f'{ROOT}/{rel}.deploy-{stamp}.php'
            sftp.put(local, stage)
            stages[rel] = stage
    finally:
        sftp.close()
    for stage in stages.values(): run(ssh, f'php -l {stage}')
    for rel, stage in stages.items(): run(ssh, f'mv {stage} {ROOT}/{rel}; chmod 644 {ROOT}/{rel}')
    for rel in LOCAL: run(ssh, f'php -l {ROOT}/{rel}')
    # No game restart is needed for PHP; the next PHP-FPM request loads source.
    print('BACKUP=' + backup)
    for rel, local in LOCAL.items():
        print(f'LOCAL_SHA256 {rel} {sha(local)}')
        print(f'REMOTE_SHA256 {rel} ' + run(ssh, f'sha256sum {ROOT}/{rel} | cut -d" " -f1').strip())
finally:
    ssh.close()
