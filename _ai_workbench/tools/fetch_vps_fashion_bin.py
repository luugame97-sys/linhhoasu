import sys
from pathlib import Path
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
sftp = ssh.open_sftp()

out_dir = Path('i:/Linhhoasu/server/server/_ai_workbench/temp/vps_fashion_bin')
out_dir.mkdir(parents=True, exist_ok=True)

for remote in [
    '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
    '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'
]:
    name = Path(remote).parts[2] + '_' + Path(remote).name
    dest = out_dir / name
    print(f"Downloading {remote} -> {dest}...")
    sftp.get(remote, str(dest))
    print(f"  Downloaded: {dest.stat().st_size} bytes")

sftp.close()
ssh.close()
