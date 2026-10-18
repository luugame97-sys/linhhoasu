#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import paramiko
import shlex


HOST = '103.116.105.154'
LOCAL_API = r'I:\Linhhoasu\server\server\_ai_workbench\tools\probe_webshop_spend_history_candidate.php'
REMOTE_API = '/linhhoasu/_ai_workbench/temp/probe_webshop_spend_history_candidate.php'
LOCAL_SOURCE = r'I:\Linhhoasu\server\server\_ai_workbench\temp\webgm_spend_history_candidate\api\user_api.php'
REMOTE_SOURCE = '/linhhoasu/_ai_workbench/temp/webgm_spend_history_lint/api/user_api.php'
CASES = (
    ('today', 'all', '', ''),
    ('week', 'all', '', ''),
    ('month', 'paid', '', ''),
    ('custom', 'all', '2026-08-29', '2026-08-31'),
    ('all', 'all', '', ''),
)


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL_API, REMOTE_API)
    finally:
        sftp.close()
    results = []
    for period, status, date_from, date_to in CASES:
        command = 'php ' + ' '.join(shlex.quote(value) for value in (REMOTE_API, period, status, date_from, date_to))
        _, out, err = ssh.exec_command(command)
        raw = out.read().decode('utf-8', 'replace')
        code = out.channel.recv_exit_status()
        error = err.read().decode('utf-8', 'replace')
        if code:
            raise RuntimeError(error[-4000:] or raw[-4000:])
        data = json.loads(raw)
        if data.get('status') != 'success':
            raise RuntimeError(f'{period} returned {data}')
        rows = data.get('data') or []
        results.append({
            'period': period,
            'range': data.get('range'),
            'summary': data.get('summary'),
            'today': data.get('today'),
            'daily_count': len(data.get('daily') or []),
            'row_count': len(rows),
            'rows_have_names': all(bool((row.get('item_name') or '').strip()) for row in rows),
            'rows_have_status': all(bool((row.get('status_label') or '').strip()) for row in rows),
            'total_pages': data.get('total_pages'),
        })
    print(json.dumps({'result': 'PASS', 'cases': results}, ensure_ascii=False, indent=2))
finally:
    ssh.close()
