#!/usr/bin/env python3
"""Deploy monitor-log presentation/filter enhancements only.

The audit-log tab is intentionally left at its current production hash.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\admin_monitor_log_candidate')
REMOTE_ROOT = '/linhhoasu/webgame/gm'
FILES = {
    'admin/index.php': {
        'remote': f'{REMOTE_ROOT}/admin/index.php',
        'before': '57137b9df95cc0d316ef798a92fce62671f0556d0878fa0300e7f114d967bbe7',
        'candidate': 'a38f104e036980bfeeaffc58434afdbac92ee98896945040dcf103dd8824701d',
    },
    'admin/admin_api.php': {
        'remote': f'{REMOTE_ROOT}/admin/admin_api.php',
        'before': '36bfc4ee028111d9f0b021a114a5c9ec4dd13fa3469bee608b26d44dd3038941',
        'candidate': 'fdbbdb124ef7f15892f1c01c1d3877d810c4b22c067bef270154e7c1a371fbc2',
    },
    'assets/js/admin.js': {
        'remote': f'{REMOTE_ROOT}/assets/js/admin.js',
        'before': '651f178dc60f07e51c8046dbc86fd03ddb84c8bb6ca727df235ac83abc304f20',
        'candidate': 'a256f28df723e616f41c0e0791454e14e44fea1dc2399c8d4c4a7c581ab44247',
    },
    'assets/css/ui-refactor.css': {
        'remote': f'{REMOTE_ROOT}/assets/css/ui-refactor.css',
        'before': '25c806da8bcb7aa4325b01065d5524a6f2b421ea329327638b6c0fe40e8df7e3',
        'candidate': 'daa0397d16f3a0abbf8294facebdd26dcf7ab02b889ae801a652ea74ab9c9cae',
    },
}


def run(ssh: paramiko.SSHClient, command: str, timeout: float = 60) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command)
    stdout.channel.settimeout(timeout)
    output = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    error = stderr.read().decode('utf-8', 'replace')
    if code:
        raise RuntimeError(f'command failed ({code}): {error[-3000:] or output[-3000:]}')
    return output


def pm2_snapshot(ssh: paramiko.SSHClient) -> dict[str, dict[str, object]]:
    js = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "for(const p of JSON.parse(s)){if(['lhs-s1001','lhs-real-bots','lhs-dist','lhs-admin'].includes(p.name)){"
        "const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time}))}}})"
    )
    rows = {}
    for line in run(ssh, 'pm2 jlist | node -e ' + shlex.quote(js)).splitlines():
        try:
            row = json.loads(line)
            rows[str(row['name'])] = row
        except (ValueError, KeyError):
            pass
    return rows


for relative, metadata in FILES.items():
    local = LOCAL_ROOT / relative
    if not local.is_file(): raise SystemExit(f'missing candidate {local}')
    if hashlib.sha256(local.read_bytes()).hexdigest() != metadata['candidate']:
        raise SystemExit(f'candidate hash mismatch {relative}')

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
backup = ''
staging = ''
changed = False
before_pm2 = {}
try:
    before_pm2 = pm2_snapshot(ssh)
    for name in ('lhs-s1001', 'lhs-dist', 'lhs-admin'):
        if before_pm2.get(name, {}).get('status') != 'online': raise RuntimeError(f'{name} is not online')
    for relative, metadata in FILES.items():
        actual = run(ssh, f"sha256sum {shlex.quote(metadata['remote'])} | awk '{{print $1}}'").strip()
        if actual != metadata['before']: raise RuntimeError(f'remote changed {relative}: {actual}')
    stamp = run(ssh, 'date +%Y%m%d_%H%M%S').strip()
    backup = f'/linhhoasu/_ai_workbench/backups/admin_monitor_log_pre_{stamp}'
    staging = f'/linhhoasu/_ai_workbench/temp/admin_monitor_log_{stamp}'
    run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(staging + "/admin")} {shlex.quote(staging + "/assets/js")} {shlex.quote(staging + "/assets/css")}')
    for relative, metadata in FILES.items():
        run(ssh, f'cp -p {shlex.quote(metadata["remote"])} {shlex.quote(backup + "/" + relative.replace("/", "__"))}')
    run(ssh, f'pm2 jlist > {shlex.quote(backup + "/pm2_before.json")}')
    staged = {}
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            target = f'{staging}/{relative}'
            staged[relative] = target
            sftp.put(str(LOCAL_ROOT / relative), target)
    finally:
        sftp.close()
    for relative, metadata in FILES.items():
        actual = run(ssh, f"sha256sum {shlex.quote(staged[relative])} | awk '{{print $1}}'").strip()
        if actual != metadata['candidate']: raise RuntimeError(f'stage mismatch {relative}: {actual}')
    run(ssh, f'php -l {shlex.quote(staged["admin/index.php"])}')
    run(ssh, f'php -l {shlex.quote(staged["admin/admin_api.php"])}')
    run(ssh, f'node --check {shlex.quote(staged["assets/js/admin.js"])}')
    run(ssh, f"grep -q 'tab-monitor' {shlex.quote(staged['admin/index.php'])}")
    run(ssh, f"grep -q 'admin_monitor_period_range' {shlex.quote(staged['admin/admin_api.php'])}")
    run(ssh, f"grep -q '#tab-monitor .log-stat-grid' {shlex.quote(staged['assets/css/ui-refactor.css'])}")
    changed = True
    for relative, metadata in FILES.items():
        run(ssh, f'mv {shlex.quote(staged[relative])} {shlex.quote(metadata["remote"])}; chmod 644 {shlex.quote(metadata["remote"])}')
    for relative, metadata in FILES.items():
        actual = run(ssh, f"sha256sum {shlex.quote(metadata['remote'])} | awk '{{print $1}}'").strip()
        if actual != metadata['candidate']: raise RuntimeError(f'production hash mismatch {relative}: {actual}')
    index_http = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/admin/index.php || true").strip()
    if index_http not in ('200', '302'): raise RuntimeError(f'admin index HTTP {index_http}')
    ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/ready || true").strip()
    if ready != '200': raise RuntimeError(f'game ready {ready}')
    after_pm2 = pm2_snapshot(ssh)
    for name in ('lhs-s1001', 'lhs-real-bots', 'lhs-dist', 'lhs-admin'):
        if before_pm2.get(name, {}).get('pid') != after_pm2.get(name, {}).get('pid'):
            raise RuntimeError(f'unexpected process change {name}')
    print(f'BACKUP={backup}')
    print('DEPLOYMENT=PASS')
    print(f'ADMIN_INDEX_HTTP={index_http}')
    print(f'GAME_READY_HTTP={ready}')
    print('PM2_BEFORE=' + json.dumps(before_pm2, sort_keys=True))
    print('PM2_AFTER=' + json.dumps(after_pm2, sort_keys=True))
    print('AUDIT_TAB_MUTATION=none')
except Exception:
    if changed and backup:
        try:
            for relative, metadata in FILES.items():
                run(ssh, f'cp -p {shlex.quote(backup + "/" + relative.replace("/", "__"))} {shlex.quote(metadata["remote"])}')
            print('ROLLBACK=PASS')
        except Exception as rollback_error:
            raise RuntimeError(f'deploy failed and rollback failed: {rollback_error}')
    raise
finally:
    if staging:
        try:
            run(ssh, f'rm -f {shlex.quote(staging + "/admin/index.php")} {shlex.quote(staging + "/admin/admin_api.php")} {shlex.quote(staging + "/assets/js/admin.js")} {shlex.quote(staging + "/assets/css/ui-refactor.css")}')
            run(ssh, f'rmdir {shlex.quote(staging + "/admin")} {shlex.quote(staging + "/assets/js")} {shlex.quote(staging + "/assets/css")} {shlex.quote(staging + "/assets")} {shlex.quote(staging)} 2>/dev/null || true')
        except Exception:
            pass
    ssh.close()
