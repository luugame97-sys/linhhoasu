#!/usr/bin/env python3
"""Small follow-up: keep large Xu values exact in the daily chart label."""
from __future__ import annotations

import getpass
import hashlib
import shlex
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE = '/linhhoasu/webgame/gm/assets/js/index.js'
LOCAL = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_spend_history_candidate\assets\js\index.js')
BEFORE = '4982df5c4c411a5b2dee14bcf21df33f4afd9cdf2595e0c906ee151299b277a0'
CANDIDATE = 'a124f96d44a277ff5ddd8466b427a1004e73241e5bba52cb88ea13d1644fc04d'


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
    raise SystemExit('local precision candidate hash mismatch')
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
        raise RuntimeError(f'remote JS changed unexpectedly: {remote_before}')
    stamp = run(ssh, 'date +%Y%m%d_%H%M%S').strip()
    backup = f'/linhhoasu/_ai_workbench/backups/webshop_spend_history_precision_pre_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/webshop_spend_history_precision_{stamp}.js'
    run(ssh, f'mkdir -p {shlex.quote(backup)}; cp -p {shlex.quote(REMOTE)} {shlex.quote(backup + "/index.js")}')
    sftp = ssh.open_sftp()
    try:
        sftp.put(str(LOCAL), stage)
    finally:
        sftp.close()
    if run(ssh, f"sha256sum {shlex.quote(stage)} | awk '{{print $1}}'").strip() != CANDIDATE:
        raise RuntimeError('stage hash mismatch')
    run(ssh, f'node --check {shlex.quote(stage)}')
    run(ssh, f'mv {shlex.quote(stage)} {shlex.quote(REMOTE)}; chmod 644 {shlex.quote(REMOTE)}')
    changed = True
    after = run(ssh, f"sha256sum {shlex.quote(REMOTE)} | awk '{{print $1}}'").strip()
    if after != CANDIDATE:
        raise RuntimeError(f'after hash mismatch: {after}')
    print(f'BACKUP={backup}')
    print(f'JS_SHA256={after}')
    print('NODE_CHECK=PASS')
    print('GAME_RESTART=none')
except Exception:
    if changed and backup:
        run(ssh, f'cp -p {shlex.quote(backup + "/index.js")} {shlex.quote(REMOTE)}')
        print('ROLLBACK=PASS')
    raise
finally:
    if stage:
        try:
            run(ssh, f'rm -f {shlex.quote(stage)}')
        except Exception:
            pass
    ssh.close()
