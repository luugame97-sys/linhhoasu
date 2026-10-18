#!/usr/bin/env python3
"""Move the two history entries to the bottom of the player menu."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE = '/linhhoasu/webgame/gm/index.php'
LOCAL = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_spend_history_candidate\index.php')
BEFORE = '464ecdad62e59c9b004242da6c3939fcd76fcbcc9c48f26327c2d22011ee8f5b'
CANDIDATE = 'd9ba157a77523497d8fbc98c024d63e6cc06b51a05b7147bee37c90f3c0d0e7d'


def run(ssh: paramiko.SSHClient, command: str, timeout: float = 60) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command)
    stdout.channel.settimeout(timeout)
    out = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    err = stderr.read().decode('utf-8', 'replace')
    if code:
        raise RuntimeError(err[-3000:] or out[-3000:])
    return out


if hashlib.sha256(LOCAL.read_bytes()).hexdigest() != CANDIDATE:
    raise SystemExit('local menu candidate hash mismatch')
password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
backup = ''
stage = ''
changed = False
try:
    remote_before = run(ssh, f"sha256sum {shlex.quote(REMOTE)} | awk '{{print $1}}'").strip()
    if remote_before != BEFORE:
        raise RuntimeError(f'remote index changed unexpectedly: {remote_before}')
    stamp = run(ssh, 'date +%Y%m%d_%H%M%S').strip()
    backup = f'/linhhoasu/_ai_workbench/backups/webshop_spend_history_menu_pre_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/webshop_spend_history_menu_{stamp}.php'
    run(ssh, f'mkdir -p {shlex.quote(backup)}; cp -p {shlex.quote(REMOTE)} {shlex.quote(backup + "/index.php")}')
    sftp = ssh.open_sftp()
    try:
        sftp.put(str(LOCAL), stage)
    finally:
        sftp.close()
    if run(ssh, f"sha256sum {shlex.quote(stage)} | awk '{{print $1}}'").strip() != CANDIDATE:
        raise RuntimeError('stage hash mismatch')
    run(ssh, f'php -l {shlex.quote(stage)}')
    run(ssh, f"grep -q 'data-tab=\"tab-transactions\"' {shlex.quote(stage)}")
    run(ssh, f"grep -q 'data-tab=\"tab-spend-history\"' {shlex.quote(stage)}")
    changed = True
    run(ssh, f'mv {shlex.quote(stage)} {shlex.quote(REMOTE)}; chmod 644 {shlex.quote(REMOTE)}')
    after = run(ssh, f"sha256sum {shlex.quote(REMOTE)} | awk '{{print $1}}'").strip()
    if after != CANDIDATE:
        raise RuntimeError(f'after hash mismatch: {after}')
    status = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/index.php").strip()
    if status not in ('200', '302'):
        raise RuntimeError(f'WebGM status {status}')
    print(f'BACKUP={backup}')
    print('DEPLOYMENT=PASS')
    print(f'WEBGM_INDEX_HTTP={status}')
    print(f'INDEX_SHA256={after}')
    print('GAME_RESTART=none')
except Exception:
    if changed and backup:
        run(ssh, f'cp -p {shlex.quote(backup + "/index.php")} {shlex.quote(REMOTE)}')
        print('ROLLBACK=PASS')
    raise
finally:
    if stage:
        try:
            run(ssh, f'rm -f {shlex.quote(stage)}')
        except Exception:
            pass
    ssh.close()
