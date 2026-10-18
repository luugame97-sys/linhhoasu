import getpass
import json
import os
import time

import paramiko

HOST = '103.116.105.154'
REMOTE_DIR = '/linhhoasu/_ai_workbench/temp'
LOCAL_DIR = os.path.dirname(__file__)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)

def run(command, check=False):
    _, out, err = ssh.exec_command(command)
    stdout = out.read().decode('utf-8', 'replace')
    stderr = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {stderr[-2000:]}')
    return code, stdout, stderr

try:
    run(f'mkdir -p {REMOTE_DIR}')
    _, before, _ = run("find /root/.pm2 -type f \( -name '*.cpuprofile' -o -name 'CPU.*' \) -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -20")
    print('BEFORE', before.strip())
    code, started, stderr = run('pm2 trigger lhs-s1001 km:cpu:profiling:start')
    print('START_CODE', code, started.strip(), stderr.strip())
    time.sleep(20)
    code, stopped, stderr = run('pm2 trigger lhs-s1001 km:cpu:profiling:stop')
    print('STOP_CODE', code, stopped.strip(), stderr.strip())
    _, after, _ = run("find /root/.pm2 -type f \( -name '*.cpuprofile' -o -name 'CPU.*' \) -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -20")
    print('AFTER', after.strip())
    profiles = []
    for line in after.splitlines():
        parts = line.split(' ', 1)
        if len(parts) == 2:
            profiles.append(parts[1].strip())
    if profiles:
        remote = profiles[0]
        local = os.path.join(LOCAL_DIR, 'lhs-s1001.cpuprofile')
        sftp = ssh.open_sftp()
        try:
            sftp.get(remote, local)
        finally:
            sftp.close()
        print('PROFILE_SAVED', local)
        try:
            payload = json.load(open(local, encoding='utf-8'))
            nodes = {node.get('id'): node for node in payload.get('nodes', [])}
            samples = payload.get('samples', [])
            counts = {}
            for sample in samples:
                node = nodes.get(sample)
                if not node:
                    continue
                name = f"{node.get('callFrame', {}).get('functionName', '(anonymous)')}@{node.get('callFrame', {}).get('url', '')}:{node.get('callFrame', {}).get('lineNumber', -1) + 1}"
                counts[name] = counts.get(name, 0) + 1
            for name, count in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:30]:
                print('HOT', count, name)
        except Exception as exc:
            print('PROFILE_PARSE_FAILED', exc)
finally:
    ssh.close()
