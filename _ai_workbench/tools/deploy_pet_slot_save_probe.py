import getpass
import hashlib
import os
import posixpath
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
ROOT = '/linhhoasu/lhs/newServer'
FILES = {
    'pet.js': f'{ROOT}/src/handlers/pet.js',
    'PlayerService.js': f'{ROOT}/src/services/PlayerService.js',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


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


stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username='root',
    password=getpass.getpass('VPS password (not logged): '),
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)

try:
    sftp = ssh.open_sftp()
    try:
        originals = {}
        for name, path in FILES.items():
            with sftp.open(path, 'rb') as stream:
                originals[name] = stream.read()
    finally:
        sftp.close()

    backup = f'/linhhoasu/_ai_workbench/backups/lag_fix_pet_slot_save_probe_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    sftp = ssh.open_sftp()
    try:
        for name, path in FILES.items():
            with sftp.open(posixpath.join(backup, name), 'wb') as stream:
                stream.write(originals[name])
    finally:
        sftp.close()

    pet = normalize(originals['pet.js'])
    old = "const playerService = require('../services/PlayerService');\n"
    new = old + "const logger = require('../logger');\n"
    if old not in pet:
        raise RuntimeError('pet logger anchor missing')
    pet = pet.replace(old, new, 1)
    old = '  await playerService.savePlayer(session.userId, player, { returnSaved: false });\n  const changed = [pet];\n'
    new = (
        "  // Slot changes are state-only (no reward/currency transaction). Persist asynchronously\n"
        "  // so rapid pet-screen actions do not wait on a full player write.\n"
        "  playerService.savePlayerDeferred(session.userId, player).catch((err) => {\n"
        "    logger.warn(`[Pet] async slot save failed user=${session.userId}: ${err.message}`);\n"
        "  });\n"
        "  const changed = [pet];\n"
    )
    if old not in pet:
        raise RuntimeError('pet slot save anchor missing')
    pet = pet.replace(old, new, 1)

    service = normalize(originals['PlayerService.js'])
    old = (
        '  const sourceData = data;\n'
        '  const taskSyncMeta = getTaskSyncMeta(sourceData);\n'
        '  const snapshot = options && options.snapshotProvided === true\n'
        '    ? sourceData\n'
        '    : cloneSaveData(sourceData);\n'
    )
    new = (
        '  const sourceData = data;\n'
        '  const saveStartedAt = Date.now();\n'
        '  const taskSyncMeta = getTaskSyncMeta(sourceData);\n'
        '  const cloneStartedAt = Date.now();\n'
        '  const snapshot = options && options.snapshotProvided === true\n'
        '    ? sourceData\n'
        '    : cloneSaveData(sourceData);\n'
        '  const cloneMs = Date.now() - cloneStartedAt;\n'
    )
    if old not in service:
        raise RuntimeError('PlayerService clone anchor missing')
    service = service.replace(old, new, 1)
    old = (
        '        const writeResult = await withRetry(() => Player.updateOne(\n'
        '          filter,\n'
        '          { $set: updateData }\n'
        '        ).maxTimeMS(DB_OPERATION_TIMEOUT_MS));\n'
    )
    new = (
        '        const dbStartedAt = Date.now();\n'
        '        const writeResult = await withRetry(() => Player.updateOne(\n'
        '          filter,\n'
        '          { $set: updateData }\n'
        '        ).maxTimeMS(DB_OPERATION_TIMEOUT_MS));\n'
        '        const dbMs = Date.now() - dbStartedAt;\n'
        '        if (cloneMs >= 50 || dbMs >= 100) {\n'
        '          logger.warn(`[Perf][PlayerSave] user=${userId} cloneMs=${cloneMs} dbMs=${dbMs} totalMs=${Date.now() - saveStartedAt}`);\n'
        '        }\n'
    )
    if old not in service:
        raise RuntimeError('PlayerService updateOne anchor missing')
    service = service.replace(old, new, 1)

    payloads = {
        'pet.js': restore(pet, originals['pet.js']),
        'PlayerService.js': restore(service, originals['PlayerService.js']),
    }
    for name in FILES:
        print(f'{name} before={digest(originals[name])} after={digest(payloads[name])} bytes={len(payloads[name])}')

    sftp = ssh.open_sftp()
    try:
        temp_paths = {}
        for name, path in FILES.items():
            temp_paths[name] = f'{path}.deploy-{stamp}.js'
            with sftp.open(temp_paths[name], 'wb') as stream:
                stream.write(payloads[name])
    finally:
        sftp.close()
    for name in FILES:
        run(ssh, f'node --check {temp_paths[name]}')
    for name, path in FILES.items():
        run(ssh, f'mv {temp_paths[name]} {path}; chmod 644 {path}')

    run(ssh, f'cd {ROOT} && npm run test:core-contract')
    run(ssh, 'pm2 restart lhs-s1001 --update-env && pm2 save')
    ready = run(
        ssh,
        "for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1",
    ).strip()
    print('BACKUP=' + backup)
    print('READY_HTTP=' + ready)
    for name, path in FILES.items():
        print(name, run(ssh, f'sha256sum {path} | cut -d" " -f1').strip())
finally:
    ssh.close()
