import json,hashlib
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/server_status_color_20260905';OUT.mkdir(exist_ok=True)
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();manifest={}
 for name,remote in {'main.js':'/linhhoasu/webgame/game/js/main.min_a6195824.js','index.html':'/linhhoasu/webgame/game/index.html'}.items():
  b=f.file(remote).read();(OUT/(name+'.before')).write_bytes(b);manifest[name]={'remote':remote,'sha256':hashlib.sha256(b).hexdigest()}
 f.close();(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print(json.dumps(manifest))
finally:s.close()
