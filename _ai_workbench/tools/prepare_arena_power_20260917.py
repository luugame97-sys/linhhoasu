"""Read-only selected live baseline for display-only Arena power repair."""
import hashlib,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect
WB=Path(__file__).resolve().parents[1]
OUT=WB/'backups/arena_power_20260917'
FILES=['src/services/ArenaReadModelService.js','src/handlers/arena.js','src/handlers/basic.js','src/services/CrossArenaService.js']
assert not OUT.exists(),'BASELINE_EXISTS'
OUT.mkdir(parents=True)
s=connect();result={'before':{},'localMatch':{}}
try:
 with s.open_sftp() as f:
  for rel in FILES:
   remote='/linhhoasu/lhs/newServer/'+rel
   with f.open(remote,'rb') as h:data=h.read()
   target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
   digest=hashlib.sha256(data).hexdigest();result['before'][remote]=digest
   result['localMatch'][rel]=hashlib.sha256((WB.parent/'linhhoasu/lhs/newServer'/rel).read_bytes()).hexdigest()==digest
 (OUT/'manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result));assert all(result['localMatch'].values()),'LOCAL_DRIFT'
finally:s.close()
