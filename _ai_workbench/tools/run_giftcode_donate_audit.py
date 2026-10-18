import getpass
import json
import os
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_giftcode_donate_remote.php'
OUT = r'I:\Linhhoasu\server\server\_ai_workbench\temp\giftcode_donate_audit.json'

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
    remote = f'/linhhoasu/_ai_workbench/temp/audit_giftcode_donate_{stamp}.php'
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL, remote)
    finally:
        sftp.close()
    raw = run(f'php {remote}')
    start = raw.find('{')
    data = json.loads(raw[start:])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    print(json.dumps({
        'result': data.get('result'),
        'tables': list(data.get('tables', {}).keys()),
        'giftcodes': len(data.get('giftcodes', [])),
        'gift_batches': len(data.get('gift_batches', [])),
        'gift_logs': len(data.get('gift_logs', [])),
        'donate_rows': {key: len(value) if isinstance(value, list) else value for key, value in data.get('donate_rows', {}).items()},
        'gm_logs': len(data.get('gm_logs', [])),
        'output': OUT,
    }, ensure_ascii=False, indent=2))
finally:
    try:
        if remote:
            run(f'rm -f {remote}')
    except Exception:
        pass
    ssh.close()
