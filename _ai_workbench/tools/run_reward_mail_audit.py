import getpass
import json
import os
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_reward_mails.js'
OUT = r'I:\Linhhoasu\server\server\_ai_workbench\temp\reward_mail_audit.json'

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)


def run(command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-4000:])
    return text


remote = None
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    remote = f'/linhhoasu/_ai_workbench/temp/audit_reward_mails_{stamp}.js'
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL, remote)
    finally:
        sftp.close()
    raw = run(f'cd /linhhoasu/lhs/newServer && node {remote}')
    start = raw.find('{')
    data = json.loads(raw[start:])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    compact = {key: value for key, value in data.items() if key in ('result', 'count', 'channel', 'itemCounts')}
    compact['output'] = OUT
    print(json.dumps(compact, ensure_ascii=False, indent=2))
finally:
    try:
        if remote:
            run(f'rm -f {remote}')
    except Exception:
        pass
    ssh.close()
