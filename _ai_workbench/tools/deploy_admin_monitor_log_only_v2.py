#!/usr/bin/env python3
"""Deploy only the redesigned admin Giám sát log tab."""
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
    'admin/index.php': ('/linhhoasu/webgame/gm/admin/index.php', '57137b9df95cc0d316ef798a92fce62671f0556d0878fa0300e7f114d967bbe7', 'a38f104e036980bfeeaffc58434afdbac92ee98896945040dcf103dd8824701d'),
    'admin/admin_api.php': ('/linhhoasu/webgame/gm/admin/admin_api.php', '36bfc4ee028111d9f0b021a114a5c9ec4dd13fa3469bee608b26d44dd3038941', 'fdbbdb124ef7f15892f1c01c1d3877d810c4b22c067bef270154e7c1a371fbc2'),
    'assets/js/admin.js': ('/linhhoasu/webgame/gm/assets/js/admin.js', '651f178dc60f07e51c8046dbc86fd03ddb84c8bb6ca727df235ac83abc304f20', 'a256f28df723e616f41c0e0791454e14e44fea1dc2399c8d4c4a7c581ab44247'),
    'assets/css/ui-refactor.css': ('/linhhoasu/webgame/gm/assets/css/ui-refactor.css', '25c806da8bcb7aa4325b01065d5524a6f2b421ea329327638b6c0fe40e8df7e3', 'daa0397d16f3a0abbf8294facebdd26dcf7ab02b889ae801a652ea74ab9c9cae'),
}


def run(ssh: paramiko.SSHClient, command: str, timeout: float = 60) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command)
    stdout.channel.settimeout(timeout)
    output = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    error = stderr.read().decode('utf-8', 'replace')
    if code: raise RuntimeError(error[-3000:] or output[-3000:])
    return output


def pm2(ssh: paramiko.SSHClient):
    js = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s)){if(['lhs-s1001','lhs-dist','lhs-admin','lhs-real-bots'].includes(p.name))console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env&&p.pm2_env.status,restart:p.pm2_env&&p.pm2_env.restart_time}))}})"
    rows = {}
    for line in run(ssh, 'pm2 jlist | node -e ' + shlex.quote(js)).splitlines():
        try:
            row = json.loads(line); rows[row['name']] = row
        except (ValueError, KeyError): pass
    return rows


for relative, (_, _, expected) in FILES.items():
    local = LOCAL_ROOT / relative
    if not local.is_file() or hashlib.sha256(local.read_bytes()).hexdigest() != expected: raise SystemExit(f'candidate mismatch {relative}')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
backup = ''; stage = ''; changed = False
try:
    before_pm2 = pm2(ssh)
    for name in ('lhs-s1001','lhs-dist','lhs-admin','lhs-real-bots'):
        if before_pm2.get(name, {}).get('status') != 'online': raise RuntimeError(f'{name} is not online')
    for relative, (remote, before, _) in FILES.items():
        actual = run(ssh, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
        if actual != before: raise RuntimeError(f'remote changed {relative}: {actual}')
    stamp = run(ssh, 'date +%Y%m%d_%H%M%S').strip()
    backup = f'/linhhoasu/_ai_workbench/backups/admin_monitor_log_v2_pre_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/admin_monitor_log_v2_{stamp}'
    run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(stage + "/admin")} {shlex.quote(stage + "/assets/js")} {shlex.quote(stage + "/assets/css")}')
    for relative, (remote, _, _) in FILES.items():
        run(ssh, f'cp -p {shlex.quote(remote)} {shlex.quote(backup + "/" + relative.replace("/", "__"))}')
    run(ssh, f'pm2 jlist > {shlex.quote(backup + "/pm2_before.json")}')
    staged = {}
    sftp = ssh.open_sftp()
    try:
        for relative in FILES:
            target = f'{stage}/{relative}'; staged[relative] = target; sftp.put(str(LOCAL_ROOT / relative), target)
    finally: sftp.close()
    run(ssh, f'php -l {shlex.quote(staged["admin/index.php"])}')
    run(ssh, f'php -l {shlex.quote(staged["admin/admin_api.php"])}')
    run(ssh, f'node --check {shlex.quote(staged["assets/js/admin.js"])}')
    run(ssh, f"grep -q '#tab-monitor .log-stat-grid' {shlex.quote(staged['assets/css/ui-refactor.css'])}")
    run(ssh, f"grep -q 'admin_monitor_period_range' {shlex.quote(staged['admin/admin_api.php'])}")
    changed = True
    for relative, (remote, _, expected) in FILES.items():
        run(ssh, f'mv {shlex.quote(staged[relative])} {shlex.quote(remote)}; chmod 644 {shlex.quote(remote)}')
        actual = run(ssh, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
        if actual != expected: raise RuntimeError(f'production hash mismatch {relative}: {actual}')
    index_http = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/admin/index.php || true").strip()
    ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/ready || true").strip()
    if index_http not in ('200','302') or ready != '200': raise RuntimeError(f'health mismatch admin={index_http} ready={ready}')
    after_pm2 = pm2(ssh)
    for name in before_pm2:
        if before_pm2[name].get('pid') != after_pm2.get(name, {}).get('pid'): raise RuntimeError(f'unexpected process change {name}')
    print(f'BACKUP={backup}'); print('DEPLOYMENT=PASS'); print(f'ADMIN_INDEX_HTTP={index_http}'); print(f'GAME_READY_HTTP={ready}'); print('PM2_BEFORE='+json.dumps(before_pm2,sort_keys=True)); print('PM2_AFTER='+json.dumps(after_pm2,sort_keys=True)); print('AUDIT_TAB_MUTATION=none')
except Exception:
    if changed and backup:
        try:
            for relative, (remote, _, _) in FILES.items(): run(ssh, f'cp -p {shlex.quote(backup + "/" + relative.replace("/", "__"))} {shlex.quote(remote)}')
            print('ROLLBACK=PASS')
        except Exception as rollback_error: raise RuntimeError(f'rollback failed: {rollback_error}')
    raise
finally:
    if stage:
        try: run(ssh, f'rm -f {shlex.quote(stage + "/admin/index.php")} {shlex.quote(stage + "/admin/admin_api.php")} {shlex.quote(stage + "/assets/js/admin.js")} {shlex.quote(stage + "/assets/css/ui-refactor.css")}')
        except Exception: pass
    ssh.close()
