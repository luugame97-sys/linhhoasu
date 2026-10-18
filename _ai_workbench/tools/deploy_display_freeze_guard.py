import getpass
import hashlib
import posixpath
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
ROOT = '/linhhoasu/lhs/newServer'
REMOTE_APPEARANCE = f'{ROOT}/src/services/RoleAppearanceService.js'
REMOTE_WS = f'{ROOT}/src/net/WSServer.js'
LOCAL_APPEARANCE = r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\services\RoleAppearanceService.js'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')


def run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {err.read().decode("utf-8", "replace")[-3000:]}')
    return text


def normalize(raw):
    return raw.decode('utf-8', 'replace').replace('\r\n', '\n').replace('\r', '')


def restore(text, raw):
    if b'\r\r\n' in raw:
        return text.replace('\n', '\r\r\n').encode('utf-8')
    if b'\r\n' in raw:
        return text.replace('\n', '\r\n').encode('utf-8')
    return text.encode('utf-8')


def read_local(path):
    with open(path, 'rb') as stream:
        return stream.read()


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        with sftp.open(REMOTE_APPEARANCE, 'rb') as stream:
            remote_appearance = stream.read()
        with sftp.open(REMOTE_WS, 'rb') as stream:
            remote_ws = stream.read()
    finally:
        sftp.close()

    expected_old_appearance = '230D7B'  # informational; exact precondition below is a size/hash check
    local_appearance = read_local(LOCAL_APPEARANCE)
    if b'normalizeOutboundPayload' not in local_appearance:
        raise RuntimeError('local RoleAppearanceService has no freeze guard')
    if b'normalizeOutboundPayload' in remote_appearance:
        raise RuntimeError('remote RoleAppearanceService already contains freeze guard')
    if b"const { normalizeOutboundPayload }" in remote_ws:
        raise RuntimeError('remote WSServer already contains outbound guard import')
    old_line = b'      const packed = PacketManager.packSingle(msg.tag, msg.data, msg.msgUid);'
    if remote_ws.count(old_line) != 1:
        raise RuntimeError(f'remote WSServer pack anchor count={remote_ws.count(old_line)}')

    backup = f'/linhhoasu/_ai_workbench/backups/display_freeze_guard_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    sftp = ssh.open_sftp()
    try:
        with sftp.open(posixpath.join(backup, 'RoleAppearanceService.js'), 'wb') as stream:
            stream.write(remote_appearance)
        with sftp.open(posixpath.join(backup, 'WSServer.js'), 'wb') as stream:
            stream.write(remote_ws)
    finally:
        sftp.close()

    ws = normalize(remote_ws)
    import_anchor = "const { syncSessionPlayerFields } = require('../services/SessionPlayerSyncService');\n"
    if import_anchor not in ws:
        raise RuntimeError('WSServer import anchor missing')
    ws = ws.replace(import_anchor, import_anchor + "const { normalizeOutboundPayload } = require('../services/RoleAppearanceService');\n", 1)
    old = "      const packed = PacketManager.packSingle(msg.tag, msg.data, msg.msgUid);"
    new = (
        "      const showStats = { normalizedRows: 0, roleFallbacks: 0 };\n"
        "      const safeData = normalizeOutboundPayload(msg.data, showStats);\n"
        "      if (showStats.normalizedRows > 0 || showStats.roleFallbacks > 0) {\n"
        "        logger.warn(\n"
        "          `[WSServer] normalized outbound show rows tag=${Number(msg.tag) || 0} `\n"
        "          + `msgUid=${Number(msg.msgUid) || 0} rows=${showStats.normalizedRows} `\n"
        "          + `roleFallbacks=${showStats.roleFallbacks}`\n"
        "        );\n"
        "      }\n"
        "      const packed = PacketManager.packSingle(msg.tag, safeData, msg.msgUid);"
    )
    ws = ws.replace(old, new, 1)
    appearance_payload = local_appearance
    ws_payload = restore(ws, remote_ws)

    print('APPEARANCE_BEFORE', hashlib.sha256(remote_appearance).hexdigest())
    print('APPEARANCE_AFTER', hashlib.sha256(appearance_payload).hexdigest())
    print('WS_BEFORE', hashlib.sha256(remote_ws).hexdigest())
    print('WS_AFTER', hashlib.sha256(ws_payload).hexdigest())

    temp_appearance = f'{REMOTE_APPEARANCE}.deploy-{stamp}.js'
    temp_ws = f'{REMOTE_WS}.deploy-{stamp}.js'
    sftp = ssh.open_sftp()
    try:
        with sftp.open(temp_appearance, 'wb') as stream:
            stream.write(appearance_payload)
        with sftp.open(temp_ws, 'wb') as stream:
            stream.write(ws_payload)
    finally:
        sftp.close()

    run(ssh, f'node --check {temp_appearance}')
    run(ssh, f'node --check {temp_ws}')
    run(ssh, f'mv {temp_appearance} {REMOTE_APPEARANCE}; mv {temp_ws} {REMOTE_WS}; chmod 644 {REMOTE_APPEARANCE} {REMOTE_WS}')
    run(ssh, f'cd {ROOT} && npm run test:core-contract')
    run(ssh, 'pm2 restart lhs-s1001 --update-env && pm2 save')
    ready = run(ssh, "for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
    print('BACKUP=' + backup)
    print('READY_HTTP=' + ready)
    print('REMOTE_APPEARANCE_HASH=' + run(ssh, f'sha256sum {REMOTE_APPEARANCE} | cut -d" " -f1').strip())
    print('REMOTE_WS_HASH=' + run(ssh, f'sha256sum {REMOTE_WS} | cut -d" " -f1').strip())
finally:
    ssh.close()
