import getpass
import hashlib
import os
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu'
LOCAL_ROOT = r'I:\Linhhoasu\server\server'
FILES = {
    'lhs/newServer/src/handlers/fate.js': os.path.join(LOCAL_ROOT, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'fate.js'),
    'webgame/game/js/main.min_a6195824.js': os.path.join(LOCAL_ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js'),
    'webgame/game/index.html': os.path.join(LOCAL_ROOT, 'linhhoasu', 'webgame', 'game', 'index.html'),
}


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-4000:])
    return text


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
stages = []
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'{REMOTE_ROOT}/_ai_workbench/backups/fate_point_fix_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    sftp = ssh.open_sftp()
    try:
        for rel, local in FILES.items():
            remote = f'{REMOTE_ROOT}/{rel}'
            run(ssh, f'cp -p {remote} {backup}/{rel.replace("/", "__")}')
            stage = f'{remote}.deploy-{stamp}' + ('.js' if rel.endswith(('.js', '.html')) else '')
            sftp.put(local, stage)
            stages.append((rel, remote, stage))
    finally:
        sftp.close()
    run(ssh, f'node --check {stages[0][2]}')
    run(ssh, f'node --check {stages[1][2]}')
    # Verify the cache-busting token is present in the staged HTML.
    run(ssh, f"grep -q '20260830_fate_point_fix7' {stages[2][2]}")
    for _rel, remote, stage in stages:
        run(ssh, f'mv {stage} {remote}; chmod 644 {remote}')
    run(ssh, 'pm2 restart lhs-s1001 --update-env; pm2 save')
    ready = run(ssh, "for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
    health = run(ssh, "curl -fsS http://127.0.0.1:9200/health | head -c 1200").strip()
    print(f'BACKUP={backup}')
    print(f'READY_HTTP={ready}')
    print(f'HEALTH={health}')
    for rel, remote, _stage in stages:
        print(f'LOCAL_SHA256 {rel} {sha(FILES[rel])}')
        print(f'REMOTE_SHA256 {rel} ' + run(ssh, f'sha256sum {remote} | cut -d" " -f1').strip())
finally:
    try:
        for _rel, _remote, stage in stages:
            run(ssh, f'rm -f {stage}')
    except Exception:
        pass
    ssh.close()
