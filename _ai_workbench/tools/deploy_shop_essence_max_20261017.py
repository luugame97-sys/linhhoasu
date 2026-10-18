"""Scoped service/client release, backup/CAS, sequential readiness and HTTP hashes."""
from pathlib import Path
from datetime import datetime, timezone
import json
import hashlib
import shlex
import sys
import time
from auction_ops_20261015 import connect, run

ROOT=Path(__file__).resolve().parents[2]
TASK=ROOT/'_ai_workbench/temp/shop_essence_max_20261017'
REMOTE='/linhhoasu'
FILES={
 'lhs/newServer/src/services/EssenceBulkShopService.js':'src/services/EssenceBulkShopService.js',
 'lhs/newServer/src/handlers/item.js':'src/handlers/item.js',
 'webgame/game/js/lhs-essence-buy-max-v1.js':'web/js/lhs-essence-buy-max-v1.js',
 'webgame/game/index.html':'web/index.html',
}
q=shlex.quote
def sha(b):return hashlib.sha256(b).hexdigest()
def save(name,data):(TASK/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
SNAPSHOT="node -e \"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status,port:p.pm2_env.HTTP_PORT}))))\""

def main():
 sys.stdout.reconfigure(encoding='utf-8')
 tests=json.loads((TASK/'tests.json').read_text());assert tests['status']=='PASS'
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 receipt={'at':datetime.now(timezone.utc).isoformat(),'backup':REMOTE+'/_ai_workbench/backups/shop_essence_max_'+stamp,'status':'STARTED','files':{},'restarts':[],'directPlayerWrites':0}
 c=connect()
 try:
  def rh(p):return run(c,'sha256sum -- '+q(p),timeout=15).split()[0]
  with c.open_sftp() as s:
   before=json.loads(run(c,SNAPSHOT));nodes=[n for n in before if n['name'].startswith('lhs-s') and n['name'][5:].isdigit()]
   nodes.sort(key=lambda n:n['name']);assert len(nodes)==9
   for rel,local in FILES.items():
    baseline=TASK/'live'/local;candidate=TASK/'candidate'/local;meta={'before':sha(baseline.read_bytes()) if baseline.exists() else None,'after':sha(candidate.read_bytes())}
    remote=REMOTE+'/'+rel
    if meta['before']:assert rh(remote)==meta['before'],'BASELINE_DRIFT:'+rel
    else:
     try:s.stat(remote)
     except FileNotFoundError:pass
     else:raise RuntimeError('NEW_FILE_EXISTS:'+rel)
    receipt['files'][rel]=meta
   for n in nodes:
    body=json.loads(run(c,'curl -fsS --max-time 5 http://127.0.0.1:'+str(n['port'])+'/ready',timeout=8));assert body['checks']['mongo'] and body['checks']['redis']
   backup=receipt['backup'];run(c,'install -d -m 700 -- '+q(backup),timeout=10)
   for rel,local in FILES.items():
    target=REMOTE+'/'+rel;stage=backup+'/stage/'+rel;bp=backup+'/before/'+rel
    run(c,'install -d -m 700 -- '+q(str(Path(stage).parent).replace('\\','/'))+' '+q(str(Path(bp).parent).replace('\\','/')),timeout=10)
    if receipt['files'][rel]['before']:
     run(c,'cp -p -- '+q(target)+' '+q(bp));assert rh(bp)==receipt['files'][rel]['before']
    s.put(str(TASK/'candidate'/local),stage)
    ref=target if receipt['files'][rel]['before'] else REMOTE+('/lhs/newServer/src/handlers/item.js' if rel.startswith('lhs/') else '/webgame/game/index.html')
    st=s.stat(ref);s.chmod(stage,st.st_mode&0o7777);s.chown(stage,st.st_uid,st.st_gid)
    assert rh(stage)==receipt['files'][rel]['after']
    if rel.endswith('.js'):run(c,'node --check '+q(stage),timeout=15)
   swapped=[]
   try:
    for rel in FILES:
     target=REMOTE+'/'+rel;meta=receipt['files'][rel]
     if meta['before']:assert rh(target)==meta['before'],'SWAP_CAS:'+rel
     s.posix_rename(backup+'/stage/'+rel,target);swapped.append(rel);assert rh(target)==meta['after'],'SWAP_HASH:'+rel
   except Exception:
    for rel in reversed(swapped):
     target=REMOTE+'/'+rel;meta=receipt['files'][rel];assert rh(target)==meta['after'],'ROLLBACK_DRIFT'
     if meta['before']:
      rollback=backup+'/stage/'+rel;run(c,'cp -p -- '+q(backup+'/before/'+rel)+' '+q(rollback));s.posix_rename(rollback,target)
     else:s.posix_rename(target,backup+'/stage/'+rel)
    receipt['status']='ROLLED_BACK';raise
   receipt['status']='FILES_APPLIED';save('deployment.json',receipt)
   print(json.dumps({'status':receipt['status'],'backup':backup}),flush=True)
   for n in nodes:
    run(c,'pm2 restart '+q(n['name'])+' >/dev/null',timeout=25)
    ready=None
    for _ in range(90):
     try:
      body=json.loads(run(c,'curl -fsS --max-time 3 http://127.0.0.1:'+str(n['port'])+'/ready',timeout=5))
      if body['checks']['mongo'] and body['checks']['redis']:ready=body;break
     except RuntimeError:pass
     time.sleep(.5)
    assert ready,'READY_TIMEOUT:'+n['name']
    now=next(x for x in json.loads(run(c,SNAPSHOT)) if x['name']==n['name']);assert now['pid']!=n['pid'] and now['restarts']==n['restarts']+1
    receipt['restarts'].append({**now,'ready':ready});save('deployment.json',receipt);print(json.dumps({'server':n['name'],'ready':True}),flush=True)
   run(c,'pm2 save >/dev/null',timeout=15)
   final=json.loads(run(c,SNAPSHOT));target_names={n['name'] for n in nodes}
   receipt['outsideProcessChanges']=[{'before':n,'after':next((x for x in final if x['name']==n['name']),None)} for n in before if n['name'] not in target_names and next((x['pid'] for x in final if x['name']==n['name']),None)!=n['pid']]
   for rel in FILES:assert rh(REMOTE+'/'+rel)==receipt['files'][rel]['after']
   receipt['https']={}
   for rel in ['webgame/game/js/lhs-essence-buy-max-v1.js','webgame/game/index.html']:
    url='https://linhhoasu.lol/'+rel.removeprefix('webgame/game/')+'?v=20261017_essence_buy_max_v1'
    digest=run(c,'set -o pipefail; curl -fsS --max-time 20 '+q(url)+' | sha256sum',timeout=25).split()[0];assert digest==receipt['files'][rel]['after'],'HTTPS_HASH:'+rel
    receipt['https'][rel]=digest
   source="const l=require.resolve('./src/logger');require.cache[l]={id:l,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};const C=require('./src/services/ConfigService');C.loadAllTables();const s=require('./src/services/EssenceBulkShopService');if(s.MAX_COUNT!==999999999||!s.hasRequest({require:{1000006:10000}}))throw Error('SERVICE_NOT_READY');console.log(JSON.stringify({max:s.MAX_COUNT,goods:C.get('ShopConfig')[1000006]}));"
   receipt['serviceReadback']=json.loads(run(c,"cd /linhhoasu/lhs/newServer && timeout 20s node - <<'VERIFY'\n"+source+"\nVERIFY",timeout=25))
   receipt['status']='DEPLOYED_VERIFIED';save('deployment.json',receipt);print(json.dumps({'status':receipt['status'],'ready':len(receipt['restarts']),'max':receipt['serviceReadback']['max']}),flush=True)
 finally:
  save('deployment.json',receipt);c.close()

if __name__=='__main__':main()
