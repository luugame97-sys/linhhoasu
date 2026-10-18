import getpass
import json
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_webshop_compensation.js'

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)


def run(command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-3000:])
    return text


remote = None
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    remote = f'/linhhoasu/_ai_workbench/temp/audit_webshop_compensation_{stamp}.js'
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL, remote)
    finally:
        sftp.close()
    output = run(f'cd /linhhoasu/lhs/newServer && node {remote}')
    start = output.find('{')
    data = json.loads(output[start:])
    print(json.dumps(data, ensure_ascii=False, indent=2))
finally:
    try:
        if remote:
            run(f'rm -f {remote}')
    except Exception:
        pass
    ssh.close()
