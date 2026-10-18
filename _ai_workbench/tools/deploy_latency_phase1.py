import getpass
import hashlib
import os
import posixpath
import tempfile
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
ROOT = '/linhhoasu/lhs/newServer'
FILES = {
    'WSServer.js': f'{ROOT}/src/net/WSServer.js',
    'farm.js': f'{ROOT}/src/handlers/farm.js',
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {err.read().decode("utf-8", "replace")[-2000:]}')
    return text


def read_remote(sftp, path):
    with sftp.open(path, 'rb') as stream:
        return stream.read()


def write_remote(sftp, path, data):
    temp_name = f'{path}.deploy-{stamp}.js'
    with sftp.open(temp_name, 'wb') as stream:
        stream.write(data)
    return temp_name


def normalize_text(raw):
    return raw.decode('utf-8', 'replace').replace('\r\n', '\n').replace('\r', '')


def restore_line_ending(text, raw):
    if b'\r\r\n' in raw:
        return text.replace('\n', '\r\r\n').encode('utf-8')
    if b'\r\n' in raw:
        return text.replace('\n', '\r\n').encode('utf-8')
    return text.encode('utf-8')


stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)

try:
    sftp = ssh.open_sftp()
    try:
        originals = {name: read_remote(sftp, path) for name, path in FILES.items()}
    finally:
        sftp.close()

    backup = f'/linhhoasu/_ai_workbench/backups/lag_fix_phase1_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    sftp = ssh.open_sftp()
    try:
        for name, path in FILES.items():
            with sftp.open(posixpath.join(backup, name), 'wb') as stream:
                stream.write(originals[name])
    finally:
        sftp.close()

    ws = normalize_text(originals['WSServer.js'])
    old = '        let shouldSaveAfterResponse = false;\n'
    new = (
        '        let shouldSaveAfterResponse = false;\n'
        '        let routeDoneAt = startedAt;\n'
        '        let responseDoneAt = startedAt;\n'
    )
    if old not in ws:
        raise RuntimeError('WSServer shouldSave anchor missing')
    ws = ws.replace(old, new, 1)
    old = '          result = await routePromise;\n'
    new = '          result = await routePromise;\n          routeDoneAt = Date.now();\n'
    if old not in ws:
        raise RuntimeError('WSServer route anchor missing')
    ws = ws.replace(old, new, 1)
    old = '        const elapsed = Date.now() - startedAt;\n        if (this.traceTags.has(safeTag)) {'
    new = '        responseDoneAt = Date.now();\n        const elapsed = Date.now() - startedAt;\n        if (this.traceTags.has(safeTag)) {'
    if old not in ws:
        raise RuntimeError('WSServer response timing anchor missing')
    ws = ws.replace(old, new, 1)
    old = (
        "            `[WSServer] slow tag=${safeTag} msgUid=${Number(msg && msg.msgUid) || 0} `\n"
        "            + `user=${session && session.userId ? session.userId : 'unknown'} elapsed=${elapsed}ms`\n"
    )
    new = (
        "            `[WSServer] slow tag=${safeTag} msgUid=${Number(msg && msg.msgUid) || 0} `\n"
        "            + `user=${session && session.userId ? session.userId : 'unknown'} elapsed=${elapsed}ms `\n"
        "            + `route=${routeDoneAt - startedAt}ms post=${responseDoneAt - routeDoneAt}ms `\n"
        "            + `tail=${Date.now() - responseDoneAt}ms`\n"
    )
    if old not in ws:
        raise RuntimeError('WSServer slow log anchor missing')
    ws = ws.replace(old, new, 1)

    farm = normalize_text(originals['farm.js'])
    old = '  await savePlayer(session, player);\n\n  return {\n    tag: 2403,\n'
    new = "  scheduleFarmPlayerSave(session, player, '2403');\n\n  return {\n    tag: 2403,\n"
    if old not in farm:
        raise RuntimeError('farm 2403 save anchor missing')
    farm = farm.replace(old, new, 1)
    old = (
        '  const farm = ensureFarmInfo(targetPlayer);\n'
        '  if (!isSelf) await saveExternalPlayer(targetPlayer);\n'
        '  return {\n'
        '    tag: 2408,\n'
    )
    new = (
        '  const farm = ensureFarmInfo(targetPlayer);\n'
        '  // Detail-auto is a read-only polling RPC; never persist a full snapshot here.\n'
        '  return {\n'
        '    tag: 2408,\n'
    )
    if old not in farm:
        raise RuntimeError('farm 2408 save anchor missing')
    farm = farm.replace(old, new, 1)

    local_temp = {}
    for name, path, text in (
        ('WSServer.js', FILES['WSServer.js'], ws),
        ('farm.js', FILES['farm.js'], farm),
    ):
        data = restore_line_ending(text, originals[name])
        local_temp[name] = data
        print(f'{name} before={sha256(originals[name])} after={sha256(data)} bytes={len(data)}')

    sftp = ssh.open_sftp()
    try:
        temp_paths = {}
        for name, path in FILES.items():
            temp_paths[name] = write_remote(sftp, path, local_temp[name])
    finally:
        sftp.close()

    for name, path in FILES.items():
        run(ssh, f'node --check {temp_paths[name]}')
    for name, path in FILES.items():
        run(ssh, f'mv {temp_paths[name]} {path}; chmod 644 {path}')

    run(ssh, 'cd /linhhoasu/lhs/newServer && npm run test:core-contract', check=True)
    run(ssh, 'pm2 restart lhs-s1001 --update-env && pm2 save', check=True)
    ready = run(
        ssh,
        "for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1",
    ).strip()
    print('BACKUP=' + backup)
    print('READY_HTTP=' + ready)
    print('REMOTE_HASHES')
    for name, path in FILES.items():
        print(name, run(ssh, f'sha256sum {path} | cut -d" " -f1').strip())
finally:
    ssh.close()
