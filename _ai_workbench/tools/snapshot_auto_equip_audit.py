"""Read-only production snapshot for auto-equip feasibility."""
from __future__ import annotations
import hashlib,json,os
from datetime import datetime,timezone
from pathlib import Path
import paramiko
HOST='103.116.105.154';ROOT=Path(__file__).resolve().parents[1]
FILES=['/linhhoasu/lhs/newServer/src/services/EquipService.js','/linhhoasu/lhs/newServer/src/services/MapMonsterService.js','/linhhoasu/lhs/newServer/src/handlers/item.js','/linhhoasu/webgame/game/js/main.min_a6195824.js','/linhhoasu/webgame/game/index.html']
c=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
if c[0].strip()!=HOST or c[1].strip()!='root':raise RuntimeError('TARGET_MISMATCH')
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');out=ROOT/'temp'/('auto_equip_audit_'+stamp);out.mkdir(parents=True)
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(HOST,username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();manifest=[]
 try:
  for remote in FILES:
   local=out/remote.split('/')[-1];f.get(remote,str(local));manifest.append({'remote':remote,'local':str(local),'sha256':hashlib.sha256(local.read_bytes()).hexdigest(),'bytes':local.stat().st_size})
 finally:f.close()
 (out/'manifest.json').write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'files':manifest},indent=2),encoding='utf-8')
 print(json.dumps({'result':'PASS','snapshot':str(out),'files':manifest}))
finally:s.close()
