import json,hashlib
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/cross_server_login_20260905';OUT.mkdir(exist_ok=True)
files=['src/services/AccountService.js','src/handlers/account.js','src/services/ServerAccessService.js','src/services/AuthSessionService.js']
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();manifest={}
 for p in files:
  b=f.file('/linhhoasu/lhs/newServer/'+p).read();dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);manifest[p]=hashlib.sha256(b).hexdigest()
 f.close();(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps(manifest))
finally:s.close()
