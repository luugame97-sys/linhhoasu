from __future__ import annotations
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode=True
WB=Path(__file__).resolve().parents[1]; ROOT=WB.parent
sys.path.insert(0,str(WB/'tools'))
from snapshot_web_multiserver_20260906 import connect,run
MAIN='/linhhoasu/webgame/game/js/main.min_drop100.js'; INDEX='/linhhoasu/webgame/game/index.html'
REMOTE_BACKUP='/linhhoasu/_ai_workbench/backups/map_pet_visual_20260930_20260929_171233'
CURRENT={MAIN:'6b573641bace055cdc41f8d7dcf57198e3e4276934845c031f99739a42913c32',INDEX:'d1629771b7f1c63066b7e017fc37c835d063e0154a8b5faece1bb8edbcd8ae71'}
BASE={MAIN:'62e6ee653adb92755bebcac771ff5eebd8014ec3c3cf6f8acac982baaaf92750',INDEX:'6160bd7ce8a69f1ada690fecb6b620e38f733826d812974c0a0a67a9e050c6b7'}
def rsha(ssh,p): return run(ssh,'sha256sum '+shlex.quote(p)+' | cut -d" " -f1').strip()
def main():
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/map_pet_visual_rollback_20260930_{stamp}'; stage=f'/linhhoasu/_ai_workbench/temp/map_pet_visual_rollback_20260930_{stamp}'; out=WB/'temp/map_pet_visual_20260930'/f'rollback_{stamp}.json'; out.parent.mkdir(parents=True,exist_ok=True)
 ssh=connect(); ev={'generatedAt':datetime.now(timezone.utc).isoformat(),'status':'PREPARING','scope':[MAIN,INDEX],'from':'20260930_map_pet_visual_v2','to':'20260929_pet_release_v6','visualOnlyRollback':True,'processRestarts':0,'playerWrites':0,'dbWrites':0,'backup':backup,'stage':stage}
 try:
  before={MAIN:rsha(ssh,MAIN),INDEX:rsha(ssh,INDEX)}
  if before!=CURRENT: raise RuntimeError('LIVE_BASELINE_DRIFT:'+json.dumps(before))
  run(ssh,'install -d -m 700 '+shlex.quote(backup)+' '+shlex.quote(stage))
  run(ssh,'cp -p -- '+shlex.quote(MAIN)+' '+shlex.quote(backup+'/01_main.v2.before')+' && cp -p -- '+shlex.quote(INDEX)+' '+shlex.quote(backup+'/02_index.v2.before'))
  sm=stage+'/01_main.baseline'; si=stage+'/02_index.baseline'
  run(ssh,'cp -p -- '+shlex.quote(REMOTE_BACKUP+'/01_main.before')+' '+shlex.quote(sm)+' && cp -p -- '+shlex.quote(REMOTE_BACKUP+'/02_index.before')+' '+shlex.quote(si))
  if rsha(ssh,sm)!=BASE[MAIN] or rsha(ssh,si)!=BASE[INDEX]: raise RuntimeError('BASELINE_BACKUP_HASH_MISMATCH')
  run(ssh,'node --check < '+shlex.quote(sm))
  if rsha(ssh,MAIN)!=CURRENT[MAIN] or rsha(ssh,INDEX)!=CURRENT[INDEX]: raise RuntimeError('LIVE_CAS_DRIFT')
  for path,sp in ((MAIN,sm),(INDEX,si)):
   tmp=path+'.map-pet-visual-rollback-'+stamp+'.next'; run(ssh,'cp -p -- '+shlex.quote(sp)+' '+shlex.quote(tmp)+' && mv -f -- '+shlex.quote(tmp)+' '+shlex.quote(path))
  after={MAIN:rsha(ssh,MAIN),INDEX:rsha(ssh,INDEX)}
  if after!=BASE: raise RuntimeError('ROLLBACK_HASH_MISMATCH:'+json.dumps(after))
  # Keep workspace source aligned with exact production baseline bytes.
  local_main=ROOT/'linhhoasu/webgame/game/js/main.min_drop100.js'; local_idx=ROOT/'linhhoasu/webgame/game/index.html'
  with ssh.open_sftp() as sftp:
   with sftp.open(REMOTE_BACKUP+'/01_main.before','rb') as h: local_main.write_bytes(h.read())
   with sftp.open(REMOTE_BACKUP+'/02_index.before','rb') as h: local_idx.write_bytes(h.read())
  ev['beforeHashes']=before; ev['afterHashes']=after; ev['status']='ROLLED_BACK'; run(ssh,'rm -f -- '+shlex.quote(sm)+' '+shlex.quote(si)+' && rmdir -- '+shlex.quote(stage))
 except Exception: ev['status']='FAILED'; raise
 finally: out.write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); ssh.close()
 print(json.dumps(ev,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
