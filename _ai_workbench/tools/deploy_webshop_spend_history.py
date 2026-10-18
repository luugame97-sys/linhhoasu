#!/usr/bin/env python3
"""Deploy the player-facing WebShop spend history feature.

Only four WebGM files are changed.  The script refuses to overwrite a file
that changed after the read-only fetch, stores a remote backup, lints PHP/JS,
and restores all files if any post-deploy check fails.  No game process is
restarted.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/gm'
LOCAL_ROOT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_spend_history_candidate')
FILES = {
    'index.php': {
        'remote': f'{REMOTE_ROOT}/index.php',
        'before': '26ca51146301eacc5890dc4b4ef733d0727bc485fedcbc0be5593251ff47a0a5',
        'candidate': '464ecdad62e59c9b004242da6c3939fcd76fcbcc9c48f26327c2d22011ee8f5b',
    },
    'api/user_api.php': {
        'remote': f'{REMOTE_ROOT}/api/user_api.php',
        'before': '36e2b82f5610e91bd6355bbeed78af908120aeb0672f6907c1de1049cdb007bc',
        'candidate': 'a556c614f4108320addb2569c824ee2807770a1361cfe7e9785ae2d20e20c882',
    },
    'assets/js/index.js': {
        'remote': f'{REMOTE_ROOT}/assets/js/index.js',
        'before': 'adec68c63a1632c8b93a8ce62fb9681c2c982ece99aaee91137bfa6dd47ed181',
        'candidate': '4982df5c4c411a5b2dee14bcf21df33f4afd9cdf2595e0c906ee151299b277a0',
    },
    'assets/css/index.css': {
        'remote': f'{REMOTE_ROOT}/assets/css/index.css',
        'before': 'f7d40e27cb759a6cf521a8ed3ed3b98be1962a39b78cc1b31441096730f99ea0',
        'candidate': '5553dfda8f06ab45ebf532cea794f87c00dd16a48a79fe4155f4de1927bb56fb',
    },
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: float = 60) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command)
    stdout.channel.settimeout(timeout)
    output = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    error = stderr.read().decode('utf-8', 'replace')
    if code:
        raise RuntimeError(f'remote command failed ({code}): {error[-3000:] or output[-3000:]}')
    return output


def pm2_snapshot(ssh: paramiko.SSHClient) -> dict[str, dict[str, object]]:
    js = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "for(const p of JSON.parse(s)){if(['lhs-s1001','lhs-real-bots','lhs-dist','lhs-admin'].includes(p.name)){"
        "const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time}))}}})"
    )
    rows: dict[str, dict[str, object]] = {}
    for line in run(ssh, 'pm2 jlist | node -e ' + shlex.quote(js)).splitlines():
        try:
            row = json.loads(line)
            rows[str(row['name'])] = row
        except (ValueError, KeyError):
            pass
    return rows


def fetch_response(ssh: paramiko.SSHClient, script: str, args: tuple[str, ...] = ()) -> dict:
    command = 'php ' + ' '.join([shlex.quote(script), *(shlex.quote(x) for x in args)])
    raw = run(ssh, command, timeout=60)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'expected JSON from {script}: {raw[-3000:]}') from exc


for relative, metadata in FILES.items():
    local = LOCAL_ROOT / relative
    if not local.is_file():
        raise SystemExit(f'missing candidate file: {local}')
    actual = sha256_file(local)
    if actual != metadata['candidate']:
        raise SystemExit(f'candidate hash mismatch {relative}: {actual}')

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False,
            allow_agent=False, timeout=15)
backup = ''
staging = ''
changed = False
before_pm2: dict[str, dict[str, object]] = {}
try:
    before_pm2 = pm2_snapshot(ssh)
    for required in ('lhs-s1001', 'lhs-dist', 'lhs-admin'):
        if before_pm2.get(required, {}).get('status') != 'online':
            raise RuntimeError(f'{required} is not online; refusing WebGM deploy')

    remote_hashes = {}
    for relative, metadata in FILES.items():
        remote_hashes[relative] = run(ssh, f"sha256sum {shlex.quote(metadata['remote'])} | awk '{{print $1}}'").strip()
        if remote_hashes[relative] != metadata['before']:
            raise RuntimeError(f'remote {relative} changed since fetch: {remote_hashes[relative]}')

    stamp = run(ssh, 'date +%Y%m%d_%H%M%S').strip()
    backup = f'{REMOTE_ROOT}/../../_ai_workbench/backups/webshop_spend_history_pre_{stamp}'
    staging = f'{REMOTE_ROOT}/../../_ai_workbench/temp/webshop_spend_history_{stamp}'
    run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(staging + "/api")} {shlex.quote(staging + "/assets/js")} {shlex.quote(staging + "/assets/css")}')

    for relative, metadata in FILES.items():
        run(ssh, f"cp -p {shlex.quote(metadata['remote'])} {shlex.quote(backup + '/' + relative.replace('/', '__'))}")
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
        uploaded = run(ssh, f"sha256sum {shlex.quote(staged[relative])} | awk '{{print $1}}'").strip()
        if uploaded != metadata['candidate']:
            raise RuntimeError(f'staged hash mismatch {relative}: {uploaded}')

    for relative in ('index.php', 'api/user_api.php'):
        run(ssh, f'php -l {shlex.quote(staged[relative])}')
    run(ssh, f'node --check {shlex.quote(staged["assets/js/index.js"])}')
    run(ssh, f"grep -q 'get_my_webshop_spend_history' {shlex.quote(staged['api/user_api.php'])}")
    run(ssh, f"grep -q 'tab-spend-history' {shlex.quote(staged['index.php'])}")
    run(ssh, f"grep -q 'spend-summary-grid' {shlex.quote(staged['assets/css/index.css'])}")

    changed = True
    for relative, metadata in FILES.items():
        target = metadata['remote']
        run(ssh, f'mv {shlex.quote(staged[relative])} {shlex.quote(target)}')
        run(ssh, f'chmod 644 {shlex.quote(target)}')

    # Verify the live PHP files and static responses. No process reload is
    # needed; the PHP runtime checks file timestamps and JS/CSS use time-based
    # query strings in the existing page.
    for relative in ('index.php', 'api/user_api.php'):
        run(ssh, f'php -l {shlex.quote(FILES[relative]["remote"])}')
    run(ssh, f'node --check {shlex.quote(FILES["assets/js/index.js"]["remote"])}')
    ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/ready || true").strip()
    if ready != '200':
        raise RuntimeError(f'game readiness changed unexpectedly: {ready}')

    after_pm2 = pm2_snapshot(ssh)
    for name in ('lhs-s1001', 'lhs-real-bots', 'lhs-dist', 'lhs-admin'):
        if name in before_pm2 and name in after_pm2 and before_pm2[name].get('pid') != after_pm2[name].get('pid'):
            raise RuntimeError(f'unexpected process change: {name}')

    index_http = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/index.php || true").strip()
    if index_http not in ('200', '302'):
        raise RuntimeError(f'WebGM index HTTP {index_http}')

    # Run the read-only feature contract against the production DB/config. It
    # uses a fixture account selected server-side and never submits a purchase.
    feature_probe_local = Path(r'I:\Linhhoasu\server\server\_ai_workbench\tools\probe_webshop_spend_history_live.php')
    feature_probe_remote = f'{staging}/probe_webshop_spend_history_live.php'
    sftp = ssh.open_sftp()
    try:
        sftp.put(str(feature_probe_local), feature_probe_remote)
    finally:
        sftp.close()
    probe_results = []
    for period, status, date_from, date_to in (
        ('today', 'all', '', ''),
        ('week', 'all', '', ''),
        ('month', 'paid', '', ''),
        ('custom', 'all', '2026-08-29', '2026-08-31'),
        ('all', 'all', '', ''),
    ):
        data = fetch_response(ssh, feature_probe_remote, (period, status, date_from, date_to))
        if data.get('status') != 'success':
            raise RuntimeError(f'feature probe {period} failed: {data}')
        rows = data.get('data') or []
        if not all((row.get('item_name') or '').strip() for row in rows):
            raise RuntimeError(f'feature probe {period} has unnamed item')
        probe_results.append({
            'period': period,
            'range': data.get('range'),
            'summary': data.get('summary'),
            'daily_count': len(data.get('daily') or []),
            'row_count': len(rows),
            'total_pages': data.get('total_pages'),
        })

    print('BACKUP=' + backup)
    print('DEPLOYMENT=PASS')
    print('WEBGM_INDEX_HTTP=' + index_http)
    print('GAME_READY_HTTP=' + ready)
    print('PM2_BEFORE=' + json.dumps(before_pm2, sort_keys=True))
    print('PM2_AFTER=' + json.dumps(after_pm2, sort_keys=True))
    print('FEATURE_PROBE=' + json.dumps(probe_results, ensure_ascii=False))
except Exception:
    if changed and backup:
        try:
            for relative, metadata in FILES.items():
                run(ssh, f"cp -p {shlex.quote(backup + '/' + relative.replace('/', '__'))} {shlex.quote(metadata['remote'])}")
            print('ROLLBACK=PASS')
        except Exception as rollback_error:
            raise RuntimeError(f'deployment failed and rollback failed: {rollback_error}')
    raise
finally:
    if staging:
        try:
            run(ssh, f'rm -f {shlex.quote(staging + "/index.php")} {shlex.quote(staging + "/api/user_api.php")} {shlex.quote(staging + "/assets/js/index.js")} {shlex.quote(staging + "/assets/css/index.css")} {shlex.quote(staging + "/probe_webshop_spend_history_live.php")}')
            run(ssh, f'rmdir {shlex.quote(staging + "/api")} {shlex.quote(staging + "/assets/js")} {shlex.quote(staging + "/assets/css")} {shlex.quote(staging + "/assets")} {shlex.quote(staging)} 2>/dev/null || true')
        except Exception:
            pass
    ssh.close()
