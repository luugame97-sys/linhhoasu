"""One-file pet policy release; selective backup, CAS, readiness, recoverable rollback."""
from pathlib import Path
from datetime import datetime, timezone
import json, time, shlex
from auction_ops_20261015 import connect, run
from deploy_mount_star_progress_20261017 import SNAP, sha

TASK=Path(__file__).resolve().parents[1]/'temp/pet_eat_overflow_20261017'
TARGET='/linhhoasu/lhs/newServer/src/handlers/pet.js'
q=shlex.quote

def main():
 tests=json.loads((TASK/'tests.json').read_text())
 old=(TASK/'baseline/pet.js').read_bytes();new=(TASK/'candidate/pet.js').read_bytes()
 assert tests['status']=='PASS' and tests['sourceSha256']==sha(new)
 backup='/linhhoasu/_ai_workbench/backups/pet_eat_overflow_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 receipt={'status':'PREPARING','backup':backup,'before':sha(old),'after':sha(new),'restarts':[],'directPlayerWrites':0,'tests':tests}
 def save():(TASK/'deployment.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
 c=connect();swapped=False;nodes=[]
 def rh(p):return run(c,'sha256sum -- '+q(p)).split()[0]
 def ready(n):
  for attempt in range(50):
   try:
    r=json.loads(run(c,'curl -fsS --max-time 3 http://127.0.0.1:'+str(n['port'])+'/ready',timeout=5))
    if r['checks']['mongo'] and r['checks']['redis']:return r
   except (RuntimeError,ValueError):pass
   time.sleep(.5)
  raise RuntimeError('READY_TIMEOUT:'+n['name'])
 try:
  before=json.loads(run(c,SNAP));nodes=sorted([n for n in before if n['name'].startswith('lhs-s') and n['name'][5:].isdigit()],key=lambda n:n['name'])
  assert len(nodes)==9 and all(n['cwd']=='/linhhoasu/lhs/newServer' and n['entry']=='/linhhoasu/lhs/newServer/src/app.js' for n in nodes)
  for n in nodes:ready(n)
  assert rh(TARGET)==sha(old),'BASELINE_DRIFT'
  run(c,'install -d -m 700 '+q(backup));run(c,'cp -p '+q(TARGET)+' '+q(backup+'/before.js'))
  assert rh(backup+'/before.js')==sha(old)
  with c.open_sftp() as s:
   stage=backup+'/candidate.js';s.put(str(TASK/'candidate/pet.js'),stage);st=s.stat(TARGET);s.chmod(stage,st.st_mode&0o7777);s.chown(stage,st.st_uid,st.st_gid)
   assert rh(stage)==sha(new);run(c,'node --check '+q(stage));assert rh(TARGET)==sha(old),'SWAP_DRIFT';s.posix_rename(stage,TARGET);swapped=True
  assert rh(TARGET)==sha(new);receipt['status']='FILES_APPLIED';save();print(json.dumps({'status':receipt['status'],'backup':backup}),flush=True)
  for n in nodes:
   run(c,'pm2 restart '+q(n['name'])+' >/dev/null',timeout=30);r=ready(n)
   cur=next(x for x in json.loads(run(c,SNAP)) if x['name']==n['name']);assert cur['pid']!=n['pid'] and cur['restarts']==n['restarts']+1
   receipt['restarts'].append({**cur,'ready':r});save();print(json.dumps({'server':n['name'],'ready':True}),flush=True)
  final=json.loads(run(c,SNAP));names={n['name'] for n in nodes}
  assert all(next(x for x in final if x['name']==n['name'])['pid']==n['pid'] for n in before if n['name'] not in names),'OUTSIDE_PROCESS_CHANGE'
  for n in receipt['restarts']:
   cur=next(x for x in final if x['name']==n['name']);assert cur['pid']==n['pid'] and cur['restarts']==n['restarts'] and cur['status']=='online';ready(n)
  assert rh(TARGET)==sha(new);run(c,'pm2 save >/dev/null');receipt['status']='DEPLOYED_VERIFIED';receipt['outsideProcessChanges']=0;save()
  with c.open_sftp() as s:
   with s.open(backup+'/deployment.json','wb') as f:f.write(json.dumps(receipt,ensure_ascii=False,indent=2).encode('utf-8'))
  print(json.dumps({'status':receipt['status'],'nodes':len(nodes),'sha256':sha(new)}),flush=True)
 except Exception as e:
  receipt['error']=str(e)
  if swapped:
   try:
    assert rh(TARGET)==sha(new),'ROLLBACK_DRIFT'
    run(c,'cp -p '+q(backup+'/before.js')+' '+q(backup+'/restore.js'))
    with c.open_sftp() as s:s.posix_rename(backup+'/restore.js',TARGET)
    for n in nodes:run(c,'pm2 restart '+q(n['name'])+' >/dev/null',timeout=30);ready(n)
    assert rh(TARGET)==sha(old);run(c,'pm2 save >/dev/null');receipt['status']='ROLLED_BACK'
   except Exception as re:receipt['status']='ROLLBACK_NEEDS_ATTENTION';receipt['rollbackError']=str(re)
  else:receipt['status']='FAILED_BEFORE_SWAP'
  raise
 finally:save();c.close()

if __name__=='__main__':main()
