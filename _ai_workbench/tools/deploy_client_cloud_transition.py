import getpass
import hashlib
import os
import posixpath
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
LOCAL_ROOT = r'I:\Linhhoasu\server\server\linhhoasu\webgame\game'
REMOTE_ROOT = '/linhhoasu/webgame/game'
MAIN_REL = 'js/main.min_a6195824.js'
INDEX_REL = 'index.html'
EXPECTED_REMOTE_MAIN = '94fa50198532549a38e60cbb2920026e0f5ae3468680a1782ebde612ae838adb'
OLD_MARKER = b'20260830_freeze_guard2'
NEW_MARKER = b'20260830_freeze_guard3'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    with open(path, 'rb') as stream:
        return stream.read()


def run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {err.read().decode("utf-8", "replace")[-3000:]}')
    return text


main_payload = read(os.path.join(LOCAL_ROOT, MAIN_REL.replace('/', os.sep)))
index_payload = read(os.path.join(LOCAL_ROOT, INDEX_REL))
if b'[LHS] cloud show timeout fallback' not in main_payload or b'[LHS] cloud hide timeout fallback' not in main_payload:
    raise RuntimeError('local main payload lacks cloud transition watchdog')
if NEW_MARKER not in index_payload:
    raise RuntimeError('local index lacks freeze_guard3 marker')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    remote_main = f'{REMOTE_ROOT}/{MAIN_REL}'
    remote_index = f'{REMOTE_ROOT}/{INDEX_REL}'
    sftp = ssh.open_sftp()
    try:
        with sftp.open(remote_main, 'rb') as stream:
            old_main = stream.read()
        with sftp.open(remote_index, 'rb') as stream:
            old_index = stream.read()
    finally:
        sftp.close()
    if sha(old_main) != EXPECTED_REMOTE_MAIN:
        raise RuntimeError(f'remote main precondition failed: {sha(old_main)}')
    if OLD_MARKER not in old_index or NEW_MARKER in old_index:
        raise RuntimeError('remote index version precondition failed')
    remote_index_payload = old_index.replace(OLD_MARKER, NEW_MARKER)
    backup = f'/linhhoasu/_ai_workbench/backups/client_cloud_before_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    main_temp = f'{remote_main}.deploy-{stamp}.js'
    index_temp = f'{remote_index}.deploy-{stamp}.html'
    sftp = ssh.open_sftp()
    try:
        with sftp.open(posixpath.join(backup, 'main.min_a6195824.js'), 'wb') as stream:
            stream.write(old_main)
        with sftp.open(posixpath.join(backup, 'index.html'), 'wb') as stream:
            stream.write(old_index)
        with sftp.open(main_temp, 'wb') as stream:
            stream.write(main_payload)
        with sftp.open(index_temp, 'wb') as stream:
            stream.write(remote_index_payload)
    finally:
        sftp.close()
    run(ssh, f'node --check {main_temp}')
    run(ssh, f'mv {main_temp} {remote_main}; mv {index_temp} {remote_index}; chmod 644 {remote_main} {remote_index}')
    served = run(ssh, "curl -sS http://127.0.0.1:81/index.html | grep -o '20260830_freeze_guard3' | head -1 || true", check=False).strip()
    print('BACKUP=' + backup)
    print('REMOTE_MAIN_HASH=' + run(ssh, f'sha256sum {remote_main} | cut -d" " -f1').strip())
    print('REMOTE_INDEX_HASH=' + run(ssh, f'sha256sum {remote_index} | cut -d" " -f1').strip())
    print('SERVED_MARKER=' + served)
finally:
    ssh.close()
