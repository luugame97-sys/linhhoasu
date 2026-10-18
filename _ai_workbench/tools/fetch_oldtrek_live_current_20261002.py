"""Read-only exact-live baseline; reuse existing work area."""
from pathlib import Path
import hashlib, json
from release_petsoul_day1_20261007 import connect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/oldtrek_live_current_20261002/current'
FILES={
 'old-trek.js':'/linhhoasu/lhs/newServer/src/handlers/old-trek.js',
 'old-trek.before.js':'/linhhoasu/_ai_workbench/backups/oldtrek_server_fix_20261011_212458/old-trek.js',
 'PlayerService.js':'/linhhoasu/lhs/newServer/src/services/PlayerService.js',
 'OldTrekSnapshotService.js':'/linhhoasu/lhs/newServer/src/services/OldTrekSnapshotService.js',
 'OldTrekEventService.js':'/linhhoasu/lhs/newServer/src/services/OldTrekEventService.js',
 'guard.js':'/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js',
 'index.html':'/linhhoasu/webgame/game/index.html'}
def main():
 OUT.mkdir(parents=True,exist_ok=True);s=connect()
 try:
  manifest={}
  with s.open_sftp() as sf:
   for name,remote in FILES.items():
    with sf.open(remote,'rb') as f:data=f.read()
    p=OUT/name
    if p.exists() and p.read_bytes()!=data:raise RuntimeError('BASELINE_DRIFT:'+name)
    p.write_bytes(data);manifest[name]={'remote':remote,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
  (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
  print(json.dumps(manifest))
 finally:s.close()
if __name__=='__main__':main()
