from pathlib import Path
from datetime import datetime
import hashlib, json, shutil
import paramiko

ROOT=Path(r'I:\Linhhoasu\server\server')
SOURCE=ROOT/'_ai_workbench/temp/minigame_icon_original_cn_reexport_20260905/dichxong'
LOCAL_DIR=ROOT/'linhhoasu/webgame/game/update/resource/assets/atlas_ui/1_lilian/touxiang/shuangzhuxian/rukou/lang_cn'
REMOTE_DIR='/linhhoasu/webgame/game/update/resource/assets/atlas_ui/1_lilian/touxiang/shuangzhuxian/rukou/lang_cn'
NAMES=sorted(p.name for p in SOURCE.glob('minigame_bt_*.png'))
if len(NAMES)!=7: raise SystemExit(f'expected 7 png, got {len(NAMES)}')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
local_backup=ROOT/f'_ai_workbench/backups/minigame_icons_pre_{stamp}'
local_backup.mkdir(parents=True,exist_ok=False)
for name in NAMES:
    if not (LOCAL_DIR/name).is_file(): raise FileNotFoundError(LOCAL_DIR/name)
    shutil.copy2(LOCAL_DIR/name,local_backup/name)

c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect('103.116.105.154',username='root',password='anhduc11',timeout=30); s=c.open_sftp()
remote_backup=f'/linhhoasu/_ai_workbench/backups/minigame_icons_pre_{stamp}'
c.exec_command(f'mkdir -p {remote_backup}')[1].read()
result={'local_backup':str(local_backup),'remote_backup':remote_backup,'files':[]}
for name in NAMES:
    remote=f'{REMOTE_DIR}/{name}'
    previous=c.exec_command(f"sha256sum {remote} | awk '{{print $1}}'")[1].read().decode().strip()
    c.exec_command(f'cp -p {remote} {remote_backup}/{name}')[1].read()
    shutil.copy2(SOURCE/name,LOCAL_DIR/name)
    s.put(str(LOCAL_DIR/name),remote)
    remote_hash=c.exec_command(f"sha256sum {remote} | awk '{{print $1}}'")[1].read().decode().strip()
    local_hash=sha(LOCAL_DIR/name)
    result['files'].append({'name':name,'previous_sha256':previous,'sha256':local_hash,'remote_sha256':remote_hash,'match':local_hash==remote_hash})
s.close(); c.close()
print(json.dumps(result,ensure_ascii=False,indent=2))
if not all(x['match'] for x in result['files']): raise SystemExit(2)
