from __future__ import annotations
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]; ROOT = WB.parent
sys.path.insert(0, str(WB / 'tools'))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

MAIN='/linhhoasu/webgame/game/js/main.min_drop100.js'; INDEX='/linhhoasu/webgame/game/index.html'
LOCAL_MAIN=ROOT/'linhhoasu/webgame/game/js/main.min_drop100.js'; LOCAL_INDEX=ROOT/'linhhoasu/webgame/game/index.html'
EXPECTED_MAIN='041c5f30d3ddfd53ab83ea0e20c386b8db698b45ec7b690193b9cf457131cd59'
EXPECTED_INDEX='24cab63a538efff05da1c6cd01cd1089c631fb63552c1edb9c6db3e3f7b63d21'
EXPECTED_CANDIDATE_MAIN='6b573641bace055cdc41f8d7dcf57198e3e4276934845c031f99739a42913c32'
OLD_MARKER=b'"js/main.min_drop100.js?v=20260929_pet_release_v6"'; NEW_MARKER=b'"js/main.min_drop100.js?v=20260930_map_pet_visual_v2"'
def sha(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def remote_sha(ssh,path): return run(ssh,'sha256sum '+shlex.quote(path)+' | cut -d" " -f1').strip()
def main():
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/map_pet_visual_20260930_{stamp}'; stage=f'/linhhoasu/_ai_workbench/temp/map_pet_visual_20260930_{stamp}'; out=WB/'temp/map_pet_visual_20260930'/f'fast_{stamp}.json'; out.parent.mkdir(parents=True,exist_ok=True)
 main_data=LOCAL_MAIN.read_bytes(); index_data=LOCAL_INDEX.read_bytes()
 if sha(main_data)!=EXPECTED_CANDIDATE_MAIN: raise RuntimeError('LOCAL_MAIN_CANDIDATE_HASH')
 if NEW_MARKER not in index_data: raise RuntimeError('LOCAL_INDEX_V1_MARKER')
 ev={'generatedAt':datetime.now(timezone.utc).isoformat(),'status':'PREPARING','scope':[MAIN,INDEX],'visualOnly':True,'damageChanged':False,'rewardChanged':False,'processRestarts':0,'playerWrites':0,'dbWrites':0,'backup':backup,'stage':stage}
 ssh=connect()
 try:
  before={MAIN:remote_sha(ssh,MAIN),INDEX:remote_sha(ssh,INDEX)}
  if before!={MAIN:EXPECTED_MAIN,INDEX:EXPECTED_INDEX}: raise RuntimeError('LIVE_BASELINE_DRIFT:'+json.dumps(before))
  ev['beforeHashes']=before
  run(ssh,'install -d -m 700 '+shlex.quote(backup)+' '+shlex.quote(stage))
  bmain=backup+'/01_main.before'; bidx=backup+'/02_index.before'; smain=stage+'/01_main.candidate'; sidx=stage+'/02_index.candidate'
  run(ssh,'cp -p -- '+shlex.quote(MAIN)+' '+shlex.quote(bmain)+' && cp -p -- '+shlex.quote(INDEX)+' '+shlex.quote(bidx))
  with ssh.open_sftp() as sftp:
   with sftp.open(smain,'wb') as h:h.write(main_data)
   with sftp.open(sidx,'wb') as h:h.write(index_data)
   sftp.chmod(smain,0o644);sftp.chmod(sidx,0o644)
  if remote_sha(ssh,smain)!=EXPECTED_CANDIDATE_MAIN: raise RuntimeError('STAGE_MAIN_HASH')
  if remote_sha(ssh,sidx)!=sha(index_data): raise RuntimeError('STAGE_INDEX_HASH')
  run(ssh,'node --check < '+shlex.quote(smain))
  if remote_sha(ssh,MAIN)!=EXPECTED_MAIN or remote_sha(ssh,INDEX)!=EXPECTED_INDEX: raise RuntimeError('LIVE_CAS_DRIFT')
  for path,sp in ((MAIN,smain),(INDEX,sidx)):
   tmp=path+'.map-pet-visual-fast-'+stamp+'.next'; run(ssh,'cp -p -- '+shlex.quote(sp)+' '+shlex.quote(tmp)+' && mv -f -- '+shlex.quote(tmp)+' '+shlex.quote(path))
  after={MAIN:remote_sha(ssh,MAIN),INDEX:remote_sha(ssh,INDEX)}; ev['afterHashes']=after
  for path in (MAIN,INDEX):
   up=path.removeprefix('/linhhoasu/webgame/game'); url='http://127.0.0.1:81'+up+'?verify=map_pet_visual_fast_'+stamp; got=run(ssh,'curl -fsS --max-time 20 '+shlex.quote(url)+' | sha256sum | cut -d" " -f1').strip();
   if got!=after[path]: raise RuntimeError('HTTP_HASH:'+path)
  ev['status']='DEPLOYED'; ev['served']=True; run(ssh,'rm -f -- '+shlex.quote(smain)+' '+shlex.quote(sidx)+' && rmdir -- '+shlex.quote(stage))
 except Exception: ev['status']='FAILED'; raise
 finally: out.write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); ssh.close()
 print(json.dumps(ev,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
