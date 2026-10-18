import getpass
import json
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
LOCAL = r'I:\Linhhoasu\server\server\_ai_workbench\tools\probe_reward_bridge.php'

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)

def run(command):
    _, stdout, stderr = ssh.exec_command(command); text = stdout.read().decode('utf-8', 'replace'); code = stdout.channel.recv_exit_status()
    if code: raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-4000:])
    return text

remote = None
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    remote = f'/linhhoasu/_ai_workbench/temp/probe_reward_bridge_{stamp}.php'
    sftp = ssh.open_sftp(); sftp.put(LOCAL, remote); sftp.close()
    raw = run(f'php {remote}'); data = json.loads(raw[raw.find('{'):]); print(json.dumps(data, ensure_ascii=False, indent=2))
finally:
    try:
        if remote: run(f'rm -f {remote}')
    except Exception: pass
    ssh.close()
