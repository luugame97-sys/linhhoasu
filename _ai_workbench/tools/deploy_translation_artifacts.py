#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
from datetime import datetime
import paramiko

ROOT = Path(r'I:\Linhhoasu\server\server')
HOST = '103.116.105.154'
USER = 'root'
PASSWORD = 'anhduc11'
FILES = {
    'linhhoasu/webgame/game/js/main.min_a6195824.js': '/linhhoasu/webgame/game/js/main.min_a6195824.js',
    'linhhoasu/webgame/game/js/start.min_52ac8d58.js': '/linhhoasu/webgame/game/js/start.min_52ac8d58.js',
    'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin': '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
    'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin': '/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',
    'linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin': '/linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin',
}

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = client.open_sftp()
stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
backup = f'/linhhoasu/_ai_workbench/backups/translation_artifacts_pre_{stamp}'
client.exec_command(f'mkdir -p {backup}')[1].read()
result = {'backup': backup, 'files': [], 'index_sha256': None}
for local_rel, remote in FILES.items():
    local = ROOT / local_rel
    if not local.is_file():
        raise FileNotFoundError(str(local))
    current = client.exec_command(f'sha256sum {remote} 2>/dev/null | awk \'{{print $1}}\'')[1].read().decode().strip()
    if current:
        client.exec_command(f'cp -p {remote} {backup}/{Path(remote).name}')[1].read()
    sftp.put(str(local), remote)
    remote_hash = client.exec_command(f'sha256sum {remote} | awk \'{{print $1}}\'')[1].read().decode().strip()
    local_hash = sha256(local)
    result['files'].append({'local': local_rel, 'remote': remote, 'local_sha256': local_hash, 'remote_sha256': remote_hash, 'match': local_hash == remote_hash, 'previous_sha256': current})
index_hash = client.exec_command("sha256sum /linhhoasu/webgame/game/index.html | awk '{print $1}'")[1].read().decode().strip()
result['index_sha256'] = index_hash
sftp.close()
client.close()
print(json.dumps(result, ensure_ascii=False, indent=2))
if not all(row['match'] for row in result['files']):
    raise SystemExit(2)
