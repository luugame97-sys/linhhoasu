"""Snapshot narrowly selected source/config; never mutates game or players."""
import hashlib,json,sys
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/fashion_review_20260905';OUT.mkdir(exist_ok=True)
APP='/linhhoasu/lhs/newServer'
files=['src/services/RewardGrantService.js','src/services/RoleAppearanceService.js','src/services/PlayerGrantService.js','src/handlers/mail.js','src/handlers/item.js','src/handlers/fashion.js','src/handlers/activity.js','src/handlers/raid.js','src/handlers/task.js','src/handlers/compat.js','src/handlers/recharge.js','src/handlers/official-compat.js','src/services/ConfigService.js']
paths={f:APP+'/'+f for f in files};paths.update({'config.bin':'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','lang.bin':'/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'})
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
sys.stdout.reconfigure(encoding='utf-8')
try:
 sf=s.open_sftp();manifest={}
 for rel,remote in paths.items():
  b=sf.file(remote).read();target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
  local=WB.parent/'linhhoasu/lhs/newServer'/rel
  manifest[rel]={'remote':remote,'sha256':hashlib.sha256(b).hexdigest(),'localIdentical':local.exists() and local.read_bytes()==b}
 sf.close();(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps({'snapshot':str(OUT),'files':manifest}))
finally:s.close()
