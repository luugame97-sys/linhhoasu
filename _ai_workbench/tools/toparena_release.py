"""TopArena scoped snapshot and release orchestration. Never prints secrets."""
import json,hashlib,shlex,sys,time
from pathlib import Path
from skin_incident_remote import connect,run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/toparena_fix_20261003'
APP='/linhhoasu/lhs/newServer'
FILES=['src/handlers/arena.js','src/handlers/account.js','src/handlers/recharge.js','src/handlers/raid.js','src/router.js','src/app.js','src/services/CrossEventScheduleService.js','src/services/CrossEventSettlementService.js','src/services/CrossServerEventService.js','src/services/PlayerService.js','src/config/crossServerEventSchedule.json','src/db/models/Player.js']
STATIC=['/linhhoasu/webgame/game/index.html','/linhhoasu/webgame/game/js/lhs-cross-events-v2.js','/linhhoasu/webgame/game/js/lhs-arena-v1.js']
def sha(b):return hashlib.sha256(b).hexdigest()
def snapshot():
 OUT.mkdir(parents=True,exist_ok=True)
 with connect() as c, c.open_sftp() as s:
  inventory={}
  for remote in [APP+'/'+r for r in FILES]+STATIC:
   st=s.stat(remote);b=s.open(remote,'rb').read();p=OUT/'baseline'/remote.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
   inventory[remote]={'sha256':sha(b),'size':len(b),'mode':st.st_mode&0o777,'uid':st.st_uid,'gid':st.st_gid}
  (OUT/'inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf8')
  print(json.dumps({'files':len(inventory),'path':str(OUT),'hashes':{p:r['sha256'] for p,r in inventory.items()}},indent=2))
if __name__=='__main__':
 if sys.argv[1]=='snapshot':snapshot()
