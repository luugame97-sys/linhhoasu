#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import paramiko
import shlex


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\probe_admin_log_dashboard_candidate.php'
REMOTE = '/linhhoasu/_ai_workbench/temp/probe_admin_monitor_log_candidate.php'
SOURCE = '/linhhoasu/_ai_workbench/temp/admin_monitor_log_lint/admin/admin_api.php'
CASES = (
    ('get_monitor_logs', 'today', '', '', '', '', ''),
    ('get_monitor_logs', '7days', 'webshop', 'paid', '', '', ''),
    ('get_monitor_logs', '30days', '', 'failed', '', '', ''),
    ('get_monitor_logs', 'custom', '', '', '', '2026-08-29', '2026-08-31'),
)


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try: sftp.put(LOCAL, REMOTE)
    finally: sftp.close()
    results = []
    for case in CASES:
        command = 'ADMIN_LOG_CANDIDATE_PATH=' + shlex.quote(SOURCE) + ' php ' + ' '.join(shlex.quote(x) for x in (REMOTE, *case))
        _, out, err = ssh.exec_command(command)
        raw = out.read().decode('utf-8', 'replace')
        code = out.channel.recv_exit_status()
        error = err.read().decode('utf-8', 'replace')
        if code: raise RuntimeError(error[-4000:] or raw[-4000:])
        data = json.loads(raw)
        if data.get('status') != 'success': raise RuntimeError(f'{case} => {data}')
        results.append({'period':case[1],'source':case[2],'status_filter':case[3],'range':data.get('range'),'summary':data.get('summary'),'row_count':len(data.get('data') or []),'total_pages':data.get('total_pages')})
    print(json.dumps({'result':'PASS','cases':results},ensure_ascii=False,indent=2))
finally:
    ssh.close()
