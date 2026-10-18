import getpass
import hashlib
import os
import posixpath
import shutil
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
LOCAL_ROOT = r'I:\Linhhoasu\server\server\linhhoasu\webgame\game'
REMOTE_ROOT = '/linhhoasu/webgame/game'
MAIN_NAME = 'js/main.min_a6195824.js'
INDEX_NAME = 'index.html'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
local_backup = os.path.join(
    r'I:\Linhhoasu\server\server\_ai_workbench\backups',
    f'client_freeze_before_{stamp}',
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_file(path):
    with open(path, 'rb') as stream:
        return stream.read()


def write_file(path, data):
    with open(path, 'wb') as stream:
        stream.write(data)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


def remote_run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'remote command failed ({code}): {err.read().decode("utf-8", "replace")[-3000:]}')
    return text


local_main_path = os.path.join(LOCAL_ROOT, MAIN_NAME.replace('/', os.sep))
local_index_path = os.path.join(LOCAL_ROOT, INDEX_NAME)
local_main_raw = read_file(local_main_path)
local_index_raw = read_file(local_index_path)
if b'waitPlayEnd().then(function(){t()})' not in local_main_raw:
    raise RuntimeError('fishing wait anchor missing from local main bundle')

main_text = local_main_raw.decode('utf-8')
main_text = replace_once(
    main_text,
    'a.rodSpine.setAnimation(0,"a_1",!0).waitPlayEnd().then(function(){t()})',
    'a.rodSpine.setAnimation(0,"a_1",!0),t()',
    'fishing queue anchor',
)
main_text = replace_once(
    main_text,
    'n.rodSpine.setAnimation(0,yD.Fish_Soul_AnimConfig[yD.FishBodyType.small].xianzhi,!0).waitPlayEnd().then(function(){t()})',
    'n.rodSpine.setAnimation(0,yD.Fish_Soul_AnimConfig[yD.FishBodyType.small].xianzhi,!0),t()',
    'fish-soul queue anchor',
)
main_payload = main_text.encode('utf-8')

old_version = b'20260829_text_refresh1'
new_version = b'20260830_freeze_guard1'
if local_index_raw.count(old_version) < 1:
    raise RuntimeError('client cache version anchor missing from local index')
index_payload = local_index_raw.replace(old_version, new_version)

os.makedirs(local_backup, exist_ok=True)
shutil.copy2(local_main_path, os.path.join(local_backup, 'main.min_a6195824.js'))
shutil.copy2(local_index_path, os.path.join(local_backup, 'index.html'))
write_file(local_main_path, main_payload)
write_file(local_index_path, index_payload)

print('LOCAL_MAIN_BEFORE', sha(local_main_raw))
print('LOCAL_MAIN_AFTER', sha(main_payload))
print('LOCAL_INDEX_BEFORE', sha(local_index_raw))
print('LOCAL_INDEX_AFTER', sha(index_payload))
print('LOCAL_BACKUP', local_backup)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username='root',
    password=getpass.getpass('VPS password (not logged): '),
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)
try:
    remote_main = f'{REMOTE_ROOT}/{MAIN_NAME}'
    remote_index = f'{REMOTE_ROOT}/{INDEX_NAME}'
    sftp = ssh.open_sftp()
    try:
        with sftp.open(remote_main, 'rb') as stream:
            remote_main_raw = stream.read()
        with sftp.open(remote_index, 'rb') as stream:
            remote_index_raw = stream.read()
    finally:
        sftp.close()

    if sha(remote_main_raw) != sha(local_main_raw):
        raise RuntimeError(
            'remote main bundle differs from expected current bundle; refuse overwrite '
            + f'(remote={sha(remote_main_raw)} expected={sha(local_main_raw)})'
        )
    if old_version not in remote_index_raw:
        raise RuntimeError('remote index cache version anchor missing')
    remote_index_payload = remote_index_raw.replace(old_version, new_version)

    remote_backup = f'/linhhoasu/_ai_workbench/backups/client_freeze_before_{stamp}'
    remote_run(ssh, f'mkdir -p {remote_backup}')
    sftp = ssh.open_sftp()
    try:
        with sftp.open(posixpath.join(remote_backup, 'main.min_a6195824.js'), 'wb') as stream:
            stream.write(remote_main_raw)
        with sftp.open(posixpath.join(remote_backup, 'index.html'), 'wb') as stream:
            stream.write(remote_index_raw)
        main_temp = remote_main + f'.deploy-{stamp}.js'
        index_temp = remote_index + f'.deploy-{stamp}.html'
        with sftp.open(main_temp, 'wb') as stream:
            stream.write(main_payload)
        with sftp.open(index_temp, 'wb') as stream:
            stream.write(remote_index_payload)
    finally:
        sftp.close()

    remote_run(ssh, f'node --check {main_temp}')
    remote_run(ssh, f'mv {main_temp} {remote_main}; mv {index_temp} {remote_index}; chmod 644 {remote_main} {remote_index}')
    remote_main_hash = remote_run(ssh, f'sha256sum {remote_main} | cut -d" " -f1').strip()
    remote_index_hash = remote_run(ssh, f'sha256sum {remote_index} | cut -d" " -f1').strip()
    served = remote_run(
        ssh,
        "curl -sS http://127.0.0.1:81/index.html | grep -o '20260830_freeze_guard1' | head -1 || true",
        check=False,
    ).strip()
    print('REMOTE_BACKUP', remote_backup)
    print('REMOTE_MAIN_HASH', remote_main_hash)
    print('REMOTE_INDEX_HASH', remote_index_hash)
    print('SERVED_VERSION_MARKER', served or 'not-found-on-index.html')
finally:
    ssh.close()
