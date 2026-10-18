#!/usr/bin/env python3
"""Download/enable the existing UTM font without overwriting unrelated client changes."""
import getpass
import hashlib
import os
import posixpath
import shutil
import tempfile
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/game'
REMOTE_INDEX = REMOTE_ROOT + '/index.html'
REMOTE_FONT = REMOTE_ROOT + '/utm.ttf'
LOCAL_ROOT = r'I:\Linhhoasu\server\server\linhhoasu\webgame\game'
LOCAL_INDEX = os.path.join(LOCAL_ROOT, 'index.html')
LOCAL_FONT = os.path.join(LOCAL_ROOT, 'utm.ttf')


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def run(ssh, command):
    stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'remote command failed ({code}): {err[-1000:]}')
    return out


def main():
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    local_backup = os.path.join(LOCAL_ROOT, '..', '..', '..', '_ai_workbench', 'backups', f'utm_font_before_enable_{stamp}')
    local_backup = os.path.abspath(local_backup)
    os.makedirs(local_backup, exist_ok=True)
    if os.path.exists(LOCAL_INDEX):
        shutil.copy2(LOCAL_INDEX, os.path.join(local_backup, 'index.html'))
    if os.path.exists(LOCAL_FONT):
        shutil.copy2(LOCAL_FONT, os.path.join(local_backup, 'utm.ttf'))

    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        sftp = ssh.open_sftp()
        try:
            with sftp.open(REMOTE_FONT, 'rb') as src, open(LOCAL_FONT, 'wb') as dst:
                shutil.copyfileobj(src, dst, length=1024 * 1024)
            with sftp.open(REMOTE_INDEX, 'rb') as src:
                remote_index = src.read()
        finally:
            sftp.close()

        if b'gothich.ttf' in remote_index:
            patched = remote_index.replace(b'gothich.ttf', b'utm.ttf')
        elif b'utm.ttf' in remote_index:
            patched = remote_index
        else:
            raise RuntimeError('remote index does not contain gothich.ttf or utm.ttf declaration')
        preload = b'<link rel="preload" href="./utm.ttf" as="font" type="font/ttf" crossorigin>'
        if preload not in patched:
            marker = b'<meta name="360-fullscreen" content="true" />'
            if marker not in patched:
                raise RuntimeError('remote index does not contain the preload insertion marker')
            patched = patched.replace(marker, marker + b'\n\t' + preload, 1)
        if patched == remote_index:
            raise RuntimeError('font replacement did not update the declaration')

        remote_backup = f'/linhhoasu/_ai_workbench/backups/utm_font_before_enable_{stamp}'
        temp_remote = REMOTE_INDEX + f'.deploy-{stamp}.html'
        run(ssh, f"set -eu; mkdir -p {remote_backup}; cp -p {REMOTE_INDEX} {remote_backup}/index.html; cp -p {REMOTE_FONT} {remote_backup}/utm.ttf")
        sftp = ssh.open_sftp()
        try:
            with sftp.open(temp_remote, 'wb') as dst:
                dst.write(patched)
        finally:
            sftp.close()
        run(ssh, f"set -eu; grep -q 'utm.ttf' {temp_remote}; mv {temp_remote} {REMOTE_INDEX}; chmod 644 {REMOTE_INDEX}; test -s {REMOTE_FONT}")
        remote_hash = run(ssh, f'sha256sum {REMOTE_INDEX} {REMOTE_FONT}')
        headers = run(ssh, "curl -sS -I http://127.0.0.1:81/utm.ttf | sed -n '1,10p'")
        index_hash = sha256_bytes(patched)
        font_hash = sha256_bytes(open(LOCAL_FONT, 'rb').read())
        print(f'LOCAL_BACKUP={local_backup}')
        print(f'REMOTE_BACKUP={remote_backup}')
        print(f'LOCAL_INDEX_EXPECTED_HASH={index_hash}')
        print(f'LOCAL_FONT_HASH={font_hash}')
        print('REMOTE_HASHES=' + remote_hash.strip().replace('\n', ' | '))
        print('FONT_HEADERS=' + ' | '.join(line.strip() for line in headers.splitlines() if line.strip()))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
