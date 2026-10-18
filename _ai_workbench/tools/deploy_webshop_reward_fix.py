import getpass
import hashlib
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
ROOT = '/linhhoasu/lhs/newServer/src'
LOCAL_ROOT = r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src'
FILES = [
    'services/RewardGrantService.js',
    'handlers/artifact.js',
    'handlers/item.js',
    'handlers/mail.js',
]


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        detail = stderr.read().decode('utf-8', 'replace')
        raise RuntimeError(f'command failed ({code}): {detail[-3000:]}')
    return output


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username='root',
    password=password,
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)

try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/webshop_reward_fix_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    for rel in FILES:
        remote = f'{ROOT}/{rel}'
        run(ssh, f'cp -p {remote} {backup}/{rel.replace("/", "__")}')

    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = f'{LOCAL_ROOT}\\{rel.replace("/", "\\\\")}'
            remote = f'{ROOT}/{rel}.deploy-{stamp}.js'
            sftp.put(local, remote)
    finally:
        sftp.close()

    for rel in FILES:
        remote = f'{ROOT}/{rel}'
        staged = f'{remote}.deploy-{stamp}.js'
        run(ssh, f'node --check {staged}')
    for rel in FILES:
        remote = f'{ROOT}/{rel}'
        staged = f'{remote}.deploy-{stamp}.js'
        run(ssh, f'mv {staged} {remote}; chmod 644 {remote}')

    run(ssh, 'pm2 restart lhs-s1001 --update-env; pm2 save')
    ready = run(
        ssh,
        "for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1",
    ).strip()
    health = run(ssh, "curl -fsS http://127.0.0.1:9200/health | head -c 1200").strip()
    status = run(ssh, "pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s)){if(['lhs-s1001','lhs-dist','lhs-admin'].includes(p.name))console.log(p.name,p.pm2_env.status,p.pid,p.pm2_env.restart_time)}})\"").strip()
    print(f'BACKUP={backup}')
    print(f'READY_HTTP={ready}')
    print(f'HEALTH={health}')
    print(status)
    for rel in FILES:
        remote = f'{ROOT}/{rel}'
        print(f'REMOTE_SHA256 {rel} ' + run(ssh, f'sha256sum {remote} | cut -d" " -f1').strip())
        local = f'{LOCAL_ROOT}\\{rel.replace("/", "\\\\")}'
        print(f'LOCAL_SHA256 {rel} {sha256(local)}')
finally:
    ssh.close()
