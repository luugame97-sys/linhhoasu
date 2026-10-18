import json,hashlib
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/delegate_first_task_20260905';OUT.mkdir(exist_ok=True)
files={'server.bin':'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','client.bin':'/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','index.html':'/linhhoasu/webgame/game/index.html','task.js':'/linhhoasu/lhs/newServer/src/handlers/task.js'}
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();manifest={}
 for name,remote in files.items():
  data=f.file(remote).read();(OUT/name).write_bytes(data);manifest[name]={'remote':remote,'sha256':hashlib.sha256(data).hexdigest()}
 f.close();(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps({'snapshot':str(OUT),'files':manifest}))
finally:s.close()
