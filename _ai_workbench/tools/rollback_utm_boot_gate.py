#!/usr/bin/env python3
"""Rollback only the UTM boot-gate/index changes; keep the utm.ttf asset."""
import getpass
import os
import shutil
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'
REMOTE_INDEX='/linhhoasu/webgame/game/index.html'
REMOTE_FONT='/linhhoasu/webgame/game/utm.ttf'
ROLLBACK_SOURCE='/linhhoasu/_ai_workbench/backups/utm_font_boot_gate_before_20260829_120134/index.html'
LOCAL_INDEX=r'I:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html'

def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    out=stdout.read().decode('utf-8','replace'); err=stderr.read().decode('utf-8','replace')
    code=stdout.channel.recv_exit_status()
    if code: raise RuntimeError(err[-1000:])
    return out

password=getpass.getpass('VPS password (not logged): ')
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=15)
try:
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    rollback_backup=f'/linhhoasu/_ai_workbench/backups/utm_font_boot_gate_rollback_{stamp}'
    run(ssh, f"set -eu; test -f {ROLLBACK_SOURCE}; mkdir -p {rollback_backup}; cp -p {REMOTE_INDEX} {rollback_backup}/index.before.html; cp -p {REMOTE_FONT} {rollback_backup}/utm.ttf")
    sftp=ssh.open_sftp()
    try:
        with sftp.open(ROLLBACK_SOURCE,'rb') as src: restored=src.read()
    finally: sftp.close()
    if b'__lhsUtmFontBootGateV' in restored or b'runEgretAfterUtmFont' in restored:
        raise RuntimeError('rollback source still contains boot gate')
    if b"utm.ttf" not in restored:
        raise RuntimeError('rollback source does not retain existing UTM font mapping')
    sftp=ssh.open_sftp()
    temp=REMOTE_INDEX+'.rollback.html'
    try:
        with sftp.open(temp,'wb') as dst: dst.write(restored)
    finally: sftp.close()
    run(ssh, f"set -eu; mv {temp} {REMOTE_INDEX}; chmod 644 {REMOTE_INDEX}; test -s {REMOTE_FONT}")
    with open(LOCAL_INDEX,'wb') as dst: dst.write(restored)
    print(f'REMOTE_BACKUP={rollback_backup}')
    print(f'RESTORED_INDEX_HASH={run(ssh, f"sha256sum {REMOTE_INDEX} | cut -d' ' -f1").strip()}')
    print(f'FONT_HASH={run(ssh, f"sha256sum {REMOTE_FONT} | cut -d' ' -f1").strip()}')
    print('RESTART=not-needed-static-client')
finally: ssh.close()
