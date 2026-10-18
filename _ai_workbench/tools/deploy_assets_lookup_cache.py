import getpass
import hashlib
import posixpath
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
ROOT = '/linhhoasu/lhs/newServer'
REMOTE = f'{ROOT}/src/services/EquipService.js'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')


def run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {err.read().decode("utf-8", "replace")[-2000:]}')
    return text


def normalize(raw):
    return raw.decode('utf-8', 'replace').replace('\r\n', '\n').replace('\r', '')


def restore(text, raw):
    if b'\r\r\n' in raw:
        return text.replace('\n', '\r\r\n').encode('utf-8')
    if b'\r\n' in raw:
        return text.replace('\n', '\r\n').encode('utf-8')
    return text.encode('utf-8')


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        with sftp.open(REMOTE, 'rb') as stream:
            raw = stream.read()
    finally:
        sftp.close()
    text = normalize(raw)
    old = 'const normalizedEquipInfoRefs = new WeakMap();\n'
    new = (
        old
        + 'let cachedAssetsConfigRef = null;\n'
        + 'let cachedAssetsConfigHasRows = false;\n\n'
        + 'function hasAssetsConfigRows(assets) {\n'
        + '  if (assets !== cachedAssetsConfigRef) {\n'
        + '    cachedAssetsConfigRef = assets;\n'
        + '    cachedAssetsConfigHasRows = Object.keys(assets).length > 0;\n'
        + '  }\n'
        + '  return cachedAssetsConfigHasRows;\n'
        + '}\n'
    )
    if old not in text:
        raise RuntimeError('assets cache declaration anchor missing')
    text = text.replace(old, new, 1)
    old = '  if (Object.keys(assets).length > 0 && (!asset || toSafeInt(asset.type, 0) !== 3)) {\n'
    new = '  if (hasAssetsConfigRows(assets) && (!asset || toSafeInt(asset.type, 0) !== 3)) {\n'
    if old not in text:
        raise RuntimeError('assets Object.keys anchor missing')
    text = text.replace(old, new, 1)
    payload = restore(text, raw)

    backup = f'/linhhoasu/_ai_workbench/backups/lag_fix_assets_lookup_cache_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    temp = f'{REMOTE}.deploy-{stamp}.js'
    sftp = ssh.open_sftp()
    try:
        with sftp.open(posixpath.join(backup, 'EquipService.js'), 'wb') as stream:
            stream.write(raw)
        with sftp.open(temp, 'wb') as stream:
            stream.write(payload)
    finally:
        sftp.close()

    print('before', hashlib.sha256(raw).hexdigest())
    print('after', hashlib.sha256(payload).hexdigest())
    run(ssh, f'node --check {temp}')
    run(ssh, f'mv {temp} {REMOTE}; chmod 644 {REMOTE}')
    run(ssh, f'cd {ROOT} && npm run test:core-contract')
    run(ssh, 'pm2 restart lhs-s1001 --update-env && pm2 save')
    ready = run(ssh, "for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
    print('BACKUP=' + backup)
    print('READY_HTTP=' + ready)
    print('REMOTE_HASH=' + run(ssh, f'sha256sum {REMOTE} | cut -d" " -f1').strip())
finally:
    ssh.close()
