#!/usr/bin/env python3
"""Fix computed CSS order so spend history stays below Donate history."""
from __future__ import annotations

import getpass
import hashlib
import shlex
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE = '/linhhoasu/webgame/gm/assets/css/ui-refactor.css'
LOCAL = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_ui_refactor_current\assets\css\ui-refactor.css')
BEFORE = '87841138c80a0d9b9442e1b4853e5da1167c514a3e955e99c067b69f45726c4a'
CANDIDATE = '25c806da8bcb7aa4325b01065d5524a6f2b421ea329327638b6c0fe40e8df7e3'


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
    raise SystemExit('local CSS candidate hash mismatch')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
backup = ''
stage = ''
changed = False
try:
    remote_before = run(ssh, f"sha256sum {shlex.quote(REMOTE)} | awk '{{print $1}}'").strip()
    if remote_before != BEFORE:
        raise RuntimeError(f'remote ui-refactor.css changed: {remote_before}')
    stamp = run(ssh, 'date +%Y%m%d_%H%M%S').strip()
    backup = f'/linhhoasu/_ai_workbench/backups/webgm_menu_visual_order_pre_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/webgm_menu_visual_order_{stamp}.css'
    run(ssh, f'mkdir -p {shlex.quote(backup)}; cp -p {shlex.quote(REMOTE)} {shlex.quote(backup + "/ui-refactor.css")}')
    sftp = ssh.open_sftp()
    try:
        sftp.put(str(LOCAL), stage)
    finally:
        sftp.close()
    if run(ssh, f"sha256sum {shlex.quote(stage)} | awk '{{print $1}}'").strip() != CANDIDATE:
        raise RuntimeError('staged CSS hash mismatch')
    run(ssh, f"grep -q 'tab-spend-history.*order: 1000' {shlex.quote(stage)}")
    changed = True
    run(ssh, f'mv {shlex.quote(stage)} {shlex.quote(REMOTE)}; chmod 644 {shlex.quote(REMOTE)}')
    after = run(ssh, f"sha256sum {shlex.quote(REMOTE)} | awk '{{print $1}}'").strip()
    if after != CANDIDATE:
        raise RuntimeError(f'after hash mismatch: {after}')
    served = run(ssh, "curl -fsS 'http://127.0.0.1:88/assets/css/ui-refactor.css?v=menu-order' | sha256sum | awk '{print $1}'").strip()
    if served != CANDIDATE:
        raise RuntimeError(f'served CSS hash mismatch: {served}')
    ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/ready").strip()
    if ready != '200':
        raise RuntimeError(f'game ready={ready}')
    print(f'BACKUP={backup}')
    print('DEPLOYMENT=PASS')
    print(f'CSS_SHA256={after}')
    print(f'SERVED_CSS_SHA256={served}')
    print('VISUAL_ORDER=tab-transactions,tab-spend-history')
    print('GAME_RESTART=none')
except Exception:
    if changed and backup:
        run(ssh, f'cp -p {shlex.quote(backup + "/ui-refactor.css")} {shlex.quote(REMOTE)}')
        print('ROLLBACK=PASS')
    raise
finally:
    if stage:
        try:
            run(ssh, f'rm -f {shlex.quote(stage)}')
        except Exception:
            pass
    ssh.close()
