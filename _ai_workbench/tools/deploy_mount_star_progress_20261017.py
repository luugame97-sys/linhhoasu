"""Shared source release: backup/CAS, atomic swaps, one-by-one node readiness."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shlex
import sys
import time
from auction_ops_20261015 import connect, run

ROOT=Path(__file__).resolve().parents[2]
TASK=ROOT/'_ai_workbench/temp/mount_star_fix_20261017'
REMOTE='/linhhoasu'
VERSION='20261017_mount_star_progress_v1'
BACKUP_PREFIX='mount_star_progress_'
RECOVERY_POLICY='automatic lower-bound recovery on normal player load; original skills recorded per mount'
q=shlex.quote
FILES={
 'lhs/newServer/src/services/MountStarProgressService.js':'src/services/MountStarProgressService.js',
 'lhs/newServer/src/services/PlayerService.js':'src/services/PlayerService.js',
 'lhs/newServer/src/handlers/mount.js':'src/handlers/mount.js',
 'webgame/game/js/lhs-mount-fix-v1.js':'web/js/lhs-mount-fix-v1.js',
 'webgame/game/index.html':'web/index.html',
}
SNAP="node -e \"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status,port:p.pm2_env.HTTP_PORT,cwd:p.pm2_env.pm_cwd,entry:p.pm2_env.pm_exec_path,serverId:p.pm2_env.SERVER_ID}))))\""
def sha(b):return hashlib.sha256(b).hexdigest()
def save(data):(TASK/'deployment.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
 sys.stdout.reconfigure(encoding='utf-8')
 assert json.loads((TASK/'tests.json').read_text())['status']=='PASS'
 assert json.loads((TASK/'mongo-tests.json').read_text())['status']=='PASS'
 receipt={'at':datetime.now(timezone.utc).isoformat(),'version':VERSION,'backup':REMOTE+'/_ai_workbench/backups/'+BACKUP_PREFIX+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'),'status':'PREPARING','files':{},'restarts':[],'directPlayerWrites':0,'recoveryPolicy':RECOVERY_POLICY}
 c=connect()
 try:
  def rh(p):return run(c,'sha256sum -- '+q(p),timeout=15).split()[0]
  before=json.loads(run(c,SNAP));nodes=sorted([n for n in before if n['name'].startswith('lhs-s') and n['name'][5:].isdigit()],key=lambda n:n['name']);assert len(nodes)==9
  assert all(n['cwd']=='/linhhoasu/lhs/newServer' and n['entry']=='/linhhoasu/lhs/newServer/src/app.js' for n in nodes),'NON_SHARED_SOURCE_NODE'
  for n in nodes:
   ready=json.loads(run(c,'curl -fsS --max-time 5 http://127.0.0.1:'+str(n['port'])+'/ready',timeout=8));assert ready['checks']['mongo'] and ready['checks']['redis'],'PRE_READY:'+n['name']
  with c.open_sftp() as s:
   for rel,local in FILES.items():
    old=TASK/'baseline'/local;candidate=TASK/'candidate'/local
    meta={'before':sha(old.read_bytes()) if old.exists() else None,'after':sha(candidate.read_bytes())}
    if meta['before']:assert rh(REMOTE+'/'+rel)==meta['before'],'PREIMAGE_DRIFT:'+rel
    else:
     try:s.stat(REMOTE+'/'+rel)
     except FileNotFoundError:pass
     else:raise RuntimeError('NEW_FILE_EXISTS:'+rel)
    receipt['files'][rel]=meta
   backup=receipt['backup'];run(c,'install -d -m 700 -- '+q(backup),timeout=10)
   for rel,local in FILES.items():
    target=REMOTE+'/'+rel;bp=backup+'/before/'+rel;stage=backup+'/stage/'+rel
    dirs=[p.rsplit('/',1)[0] for p in [bp,stage]];run(c,'install -d -m 700 -- '+' '.join(q(p) for p in dirs))
    if receipt['files'][rel]['before']:run(c,'cp -p -- '+q(target)+' '+q(bp));assert rh(bp)==receipt['files'][rel]['before']
    s.put(str(TASK/'candidate'/local),stage)
    ref=target if receipt['files'][rel]['before'] else REMOTE+'/lhs/newServer/src/handlers/mount.js';st=s.stat(ref);s.chmod(stage,st.st_mode&0o7777);s.chown(stage,st.st_uid,st.st_gid)
    assert rh(stage)==receipt['files'][rel]['after'],'STAGE_HASH'
    if rel.endswith('.js'):run(c,'node --check '+q(stage),timeout=20)
   swapped=[]
   try:
    for rel in FILES:
     target=REMOTE+'/'+rel;meta=receipt['files'][rel]
     if meta['before']:assert rh(target)==meta['before'],'SWAP_CAS'
     s.posix_rename(backup+'/stage/'+rel,target);swapped.append(rel);assert rh(target)==meta['after'],'POSTIMAGE'
   except Exception:
    for rel in reversed(swapped):
     assert rh(REMOTE+'/'+rel)==receipt['files'][rel]['after'],'ROLLBACK_DRIFT'
     if receipt['files'][rel]['before']:
      stage=backup+'/stage/'+rel;run(c,'cp -p -- '+q(backup+'/before/'+rel)+' '+q(stage));s.posix_rename(stage,REMOTE+'/'+rel)
     else:s.posix_rename(REMOTE+'/'+rel,backup+'/stage/'+rel)
    receipt['status']='ROLLED_BACK';raise
   receipt['status']='FILES_APPLIED';save(receipt);print(json.dumps({'status':receipt['status'],'backup':backup}),flush=True)
   for n in nodes:
    run(c,'pm2 restart '+q(n['name'])+' >/dev/null',timeout=30)
    ready=None
    for _ in range(100):
     try:
      body=json.loads(run(c,'curl -fsS --max-time 3 http://127.0.0.1:'+str(n['port'])+'/ready',timeout=5))
      if body['checks']['mongo'] and body['checks']['redis']:ready=body;break
     except RuntimeError:pass
     time.sleep(.5)
    assert ready,'READY_TIMEOUT:'+n['name']
    now=next(x for x in json.loads(run(c,SNAP)) if x['name']==n['name']);assert now['pid']!=n['pid'] and now['restarts']==n['restarts']+1,'RESTART_INVARIANT'
    receipt['restarts'].append({**now,'ready':ready});save(receipt);print(json.dumps({'server':n['name'],'ready':True}),flush=True)
   run(c,'pm2 save >/dev/null',timeout=15)
   final=json.loads(run(c,SNAP));names={n['name'] for n in nodes}
   receipt['outsideProcessChanges']=[{'before':n,'after':next((x for x in final if x['name']==n['name']),None)} for n in before if n['name'] not in names and next((x['pid'] for x in final if x['name']==n['name']),None)!=n['pid']]
   for n in receipt['restarts']:
    current=next(x for x in final if x['name']==n['name']);assert current['pid']==n['pid'] and current['restarts']==n['restarts'],'FINAL_PROCESS_DRIFT'
   for rel in FILES:assert rh(REMOTE+'/'+rel)==receipt['files'][rel]['after'],'FINAL_HASH'
   receipt['https']={}
   for rel in [r for r in FILES if r.startswith('webgame/game/')]:
    url='https://linhhoasu.lol/'+rel.removeprefix('webgame/game/')+'?v='+receipt['version'];digest=run(c,'set -o pipefail; curl -fsS --max-time 20 '+q(url)+' | sha256sum',timeout=25).split()[0];assert digest==receipt['files'][rel]['after'],'HTTPS_HASH';receipt['https'][rel]=digest
   receipt['status']='DEPLOYED_VERIFIED';save(receipt)
   # Keep a receipt on the VPS together with the exact preimages.
   with s.open(backup+'/deployment.json','wb') as f:f.write(json.dumps(receipt,ensure_ascii=False,indent=2).encode('utf-8'))
   print(json.dumps({'status':receipt['status'],'nodes':len(receipt['restarts']),'outsideProcessChanges':len(receipt['outsideProcessChanges']),'https':len(receipt['https'])}),flush=True)
 finally:save(receipt);c.close()

if __name__=='__main__':main()
