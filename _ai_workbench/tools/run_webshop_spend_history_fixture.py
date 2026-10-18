#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import paramiko
import shlex


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\verify_webshop_spend_history.php'
REMOTE = '/linhhoasu/_ai_workbench/temp/verify_webshop_spend_history.php'


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    # Use PHP/config without printing DB credentials.
    query = "define('LHS_API_REQUEST',true);require '/linhhoasu/webgame/gm/config.php';$r=$conn_web->query(\"SELECT account_name,server_id,COUNT(*) c FROM webshop_orders GROUP BY account_name,server_id ORDER BY c DESC LIMIT 1\")->fetch(PDO::FETCH_ASSOC);echo json_encode($r);"
    _, out, err = ssh.exec_command('php -r ' + shlex.quote(query))
    raw = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(err.read().decode('utf-8', 'replace')[-3000:])
    row = json.loads(raw)
    fixture = [row['account_name'], row['server_id']]
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL, REMOTE)
    finally:
        sftp.close()
    account = fixture[0].replace("'", "")
    server = fixture[1].replace("'", "")
    _, out, err = ssh.exec_command(f"php {REMOTE} '{account}' '{server}'")
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(err.read().decode('utf-8', 'replace')[-3000:])
    data = json.loads(text)
    # Do not expose the fixture account name; only report query evidence.
    print(json.dumps({
        'server_id': server,
        'all': data.get('all'),
        'today': data.get('today'),
        'row_count': len(data.get('rows') or []),
        'rows_have_item_names': all(bool((row.get('item_name') or '').strip()) for row in (data.get('rows') or [])),
    }, ensure_ascii=False, indent=2))
finally:
    ssh.close()
