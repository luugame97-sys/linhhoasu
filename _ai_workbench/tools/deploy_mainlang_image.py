from pathlib import Path
import hashlib
import json
import paramiko

ROOT = Path(r'I:\Linhhoasu\server\server')
LOCAL = ROOT / 'linhhoasu/webgame/game/update/resource/assets/atlas_ui/1_lilian/main/mainLang/lang_cn/ui_mainLang_a72efeec.png'
REMOTE = '/linhhoasu/webgame/game/update/resource/assets/atlas_ui/1_lilian/main/mainLang/lang_cn/ui_mainLang_a72efeec.png'
HOST = '103.116.105.154'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username='root', password='anhduc11', timeout=30)
sftp = client.open_sftp()
previous = client.exec_command(f"sha256sum {REMOTE} 2>/dev/null | awk '{{print $1}}'")[1].read().decode().strip()
stamp = client.exec_command('date +%Y%m%d_%H%M%S')[1].read().decode().strip()
backup = f'/linhhoasu/_ai_workbench/backups/mainlang_image_pre_{stamp}'
client.exec_command(f'mkdir -p {backup}')[1].read()
if previous:
    client.exec_command(f'cp -p {REMOTE} {backup}/ui_mainLang_a72efeec_before.png')[1].read()
sftp.put(str(LOCAL), REMOTE)
remote_hash = client.exec_command(f"sha256sum {REMOTE} | awk '{{print $1}}'")[1].read().decode().strip()
local_hash = sha(LOCAL)
result = {'remote': REMOTE, 'previous_sha256': previous, 'local_sha256': local_hash, 'remote_sha256': remote_hash, 'match': local_hash == remote_hash, 'backup': backup}
print(json.dumps(result, ensure_ascii=False, indent=2))
sftp.close()
client.close()
if not result['match']:
    raise SystemExit(2)
