"""Static-only Vietnamese number release with exact preimages, CAS and rollback."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shlex
import sys
from auction_ops_20261015 import connect, run

ROOT=Path(__file__).resolve().parents[2]
TASK=ROOT/'_ai_workbench/temp/number_vi_20261017'
WEB='/linhhoasu/webgame/game'
q=shlex.quote
def sha(b):return hashlib.sha256(b).hexdigest()
def save(name,data):(TASK/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
SNAP="node -e \"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).map(n=>({name:n.name,pid:n.pid,restarts:n.pm2_env.restart_time,status:n.pm2_env.status}))))\""

def main():
 sys.stdout.reconfigure(encoding='utf-8')
 release=json.loads((TASK/'release.json').read_text(encoding='utf-8'))
 tests=json.loads((TASK/'tests.json').read_text(encoding='utf-8'));assert tests['status']=='PASS'
 files=release['files'];stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 if '--followup' in sys.argv:
  initial=json.loads((TASK/'deployment_initial.json').read_text(encoding='utf-8'));assert initial['status']=='DEPLOYED_VERIFIED'
  current=dict(initial['files'])
  for name in ['deployment_currency.json','deployment_vi_final.json','deployment.json']:
   file=TASK/name
   if file.exists():
    prior=json.loads(file.read_text(encoding='utf-8'))
    if prior['status']=='DEPLOYED_VERIFIED':current.update(prior['files'])
  files={rel:{**meta,'before':current[rel]['after']} for rel,meta in files.items() if meta['after']!=current[rel]['after']}
 backup='/linhhoasu/_ai_workbench/backups/number_vi_'+stamp
 receipt={'version':release['version'],'at':datetime.now(timezone.utc).isoformat(),'backup':backup,'files':files,'status':'STARTED','restarts':0,'playerWrites':0,'swapped':[]}
 c=connect()
 try:
  def rh(p):return run(c,'sha256sum -- '+q(p),timeout=15).split()[0]
  before=json.loads(run(c,SNAP,timeout=15))
  with c.open_sftp() as s:
   for rel,meta in files.items():
    assert rh(WEB+'/'+rel)==meta['before'],'PREIMAGE_DRIFT:'+rel
    assert sha((TASK/'candidate'/rel).read_bytes())==meta['after'],'CANDIDATE_DRIFT:'+rel
   run(c,'install -d -m 700 -- '+q(backup+'/before/js')+' '+q(backup+'/stage/js'),timeout=10)
   for rel,meta in files.items():
    remote=WEB+'/'+rel;bp=backup+'/before/'+rel;stage=backup+'/stage/'+rel
    run(c,'cp -p -- '+q(remote)+' '+q(bp),timeout=15);assert rh(bp)==meta['before']
    s.put(str(TASK/'candidate'/rel),stage);st=s.stat(remote);s.chmod(stage,st.st_mode&0o7777);s.chown(stage,st.st_uid,st.st_gid)
    assert rh(stage)==meta['after'],'STAGE_HASH:'+rel
    if rel.endswith('.js'):run(c,'node --check '+q(stage),timeout=25)
   try:
    for rel,meta in files.items():
     assert rh(WEB+'/'+rel)==meta['before'],'SWAP_CAS:'+rel
     s.posix_rename(backup+'/stage/'+rel,WEB+'/'+rel);receipt['swapped'].append(rel);assert rh(WEB+'/'+rel)==meta['after']
    receipt['https']={}
    for rel,meta in files.items():
     url='https://linhhoasu.lol/'+rel+'?v='+release['version']
     digest=run(c,'set -o pipefail; curl -fsS --max-time 25 '+q(url)+' | sha256sum',timeout=30).split()[0]
     assert digest==meta['after'],'HTTPS_HASH:'+rel;receipt['https'][rel]=digest
    after=json.loads(run(c,SNAP,timeout=15));assert after==before,'PROCESS_CHANGED_DURING_STATIC_RELEASE'
    receipt['processesUnchanged']=True;receipt['status']='DEPLOYED_VERIFIED'
   except Exception:
    for rel in reversed(receipt['swapped']):
     assert rh(WEB+'/'+rel)==files[rel]['after'],'ROLLBACK_DRIFT:'+rel
     stage=backup+'/stage/'+rel;run(c,'cp -p -- '+q(backup+'/before/'+rel)+' '+q(stage));s.posix_rename(stage,WEB+'/'+rel);assert rh(WEB+'/'+rel)==files[rel]['before']
    receipt['status']='ROLLED_BACK';raise
   finally:
    run(c,'rmdir -- '+q(backup+'/stage/js')+' '+q(backup+'/stage'),timeout=10)
  print(json.dumps(receipt,ensure_ascii=False),flush=True)
 finally:
  save('deployment.json',receipt);c.close()

if __name__=='__main__':main()
