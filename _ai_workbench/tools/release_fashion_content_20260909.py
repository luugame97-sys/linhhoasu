"""Stage/deploy the fashion blocker fixes plus the verified CN content overlay.

Deployment is CAS-protected, backups every changed target, restarts S2 then S1,
and runs a disposable WebSocket QA profile on both servers. No player repair.
"""
import hashlib,json,shlex,sys,time
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from deploy_farm_alchemy_20260908 import install_one
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/fashion_cn_recovery_20260909';CAND=OUT/'rollout-candidate';MANIFEST=OUT/'rollout-candidate.json';RELEASE=OUT/'content-release.json';QA=WB/'tools/qa_fashion_content_live_20260909.js';NAMES=['lhs-s1002','lhs-s1001']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(x):RELEASE.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def candidate_files():
 m=json.loads(MANIFEST.read_text(encoding='utf-8'));return {row['path']:(CAND/row['path'],row['sha256']) for row in m['files']}
def local_test():
 import subprocess,os
 env=dict(os.environ);env['CONFIG_BIN_PATH']=str(OUT/'config_fashion_candidate.bin');env['FASHION_CONTENT_OVERLAY_PATH']=str(OUT/'fashion-overlay.json')
 cmds=[['node',str(WB/'tools/test_cn_fashion_compat_20260909.js')],['node',str(WB.parent/'linhhoasu/lhs/newServer/scripts/test-core-gameplay-contract.js')],['node',str(WB.parent/'linhhoasu/lhs/newServer/scripts/test-fashion-gear-fix.js')]]
 out=[]
 for c in cmds:
  p=subprocess.run(c,cwd=WB.parent,env=env,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=70);assert p.returncode==0,(c,(p.stdout or '')[-500:],(p.stderr or '')[-500:]);out.append((p.stdout or '').splitlines()[-1])
 return out
def preflight(s,targets):
 before=hashes(s,list(targets));state=pm2(s);assert ready(s)=={'8080':200,'8083':200};assert all(any(p['name']==n and p['status']=='online' for p in state) for n in NAMES);return before,state
def run_qa(s,stage,sid):
 target=stage+'/tools/qa_fashion_content_live_20260909.js';run(s,'node --check '+shlex.quote(target));raw=run(s,'node '+shlex.quote(target)+' '+str(sid),timeout=75);row=json.loads(next(x for x in reversed(raw.splitlines()) if x.startswith('{"result"')));assert row['result']=='PASS' and row['qaProfileRemoved'] and row['realPlayerWrites']==0;return row
def rollback(s,m):
 for e in reversed(m.get('installed',[])):
  target=e['target'];current=hashes(s,[target])[target]
  if current==e['before']:continue
  assert current==e['after'],'ROLLBACK_TARGET_DRIFT'
  if e['before']:
   run(s,'mkdir -p '+shlex.quote(e['target'].rsplit('/',1)[0]))
   install_one(s,e['backup'],target,current,e['before'])
  else:
   if current==e['after']:run(s,'rm -f -- '+shlex.quote(target))
 if m.get('restarted'):
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   run(s,'pm2 restart '+name);wait_ready(s,port)
 assert hashes(s,list(m['before']))==m['before'];m['status']='ROLLED_BACK';m['ready']=ready(s);save(m)
def stage(s):
 if RELEASE.exists():
  old=json.loads(RELEASE.read_text(encoding='utf-8'));assert old.get('status')=='ROLLED_BACK','RELEASE_EXISTS'
 local=local_test();items=candidate_files();targets=['/'+p for p in items];before,state=preflight(s,targets);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/fashion_content_'+stamp;backup='/linhhoasu/_ai_workbench/backups/fashion_content_'+stamp;run(s,'install -d -m 700 '+shlex.quote(stage+'/tools')+' '+shlex.quote(backup))
 parents=sorted({(stage+'/'+rel).rsplit('/',1)[0] for rel in items});run(s,'install -d -m 700 '+' '.join(shlex.quote(x) for x in parents))
 with s.open_sftp() as f:
  for rel,(src,expected) in items.items():
   dest=stage+'/'+rel;Path('/').joinpath('')
   # ensure remote parent via the shell once below; SFTP put is atomic enough for staged files
   try:f.put(str(src),dest)
   except Exception as error:raise RuntimeError(f'STAGE_PUT_FAILED {src} -> {dest}: {error}') from error
  f.put(str(QA),stage+'/tools/qa_fashion_content_live_20260909.js')
 m={'status':'STAGED_NOT_DEPLOYED','stage':stage,'backup':backup,'before':before,'after':{p:items[p.lstrip('/')][1] for p in targets},'candidatePathByTarget':{p:p.lstrip('/') for p in targets},'candidateCount':len(items),'beforePm2':state,'installed':[],'restarted':[],'productionSourceWrites':0,'playerDataWrites':0,'localTests':local}
 # The remote put loop needs its parent folders; if any put failed the stage is not recorded.
 m['stagedQASha']=sha(QA);m['ready']=ready(s);save(m);return m
def deploy(s,m):
 # Ensure the staged tree is immutable before any write.
 assert m['status']=='STAGED_NOT_DEPLOYED';assert hashes(s,[m['stage']+'/tools/qa_fashion_content_live_20260909.js'])[m['stage']+'/tools/qa_fashion_content_live_20260909.js']==m['stagedQASha']
 beforePm2=pm2(s);assert beforePm2==m['beforePm2'];assert hashes(s,list(m['before']))==m['before'];run(s,'install -d -m 700 '+shlex.quote(m['backup']))
 backup_by_target={}
 for i,target in enumerate(m['before']):
  backup_by_target[target]=m['backup']+'/'+str(i)+'.before'
  if m['before'][target]:run(s,'cp -a -- '+shlex.quote(target)+' '+shlex.quote(backup_by_target[target]));assert hashes(s,[backup_by_target[target]])[backup_by_target[target]]==m['before'][target]
 m['backupByTarget']=backup_by_target
 m['status']='INSTALLING';save(m)
 try:
  backend=[x for x in m['before'] if any(k in x for k in ['/newServer/src/','/lhs/configMap,json','/lhs/update/resource/assets/fashion_overlay.json','/lhs/update/resource/assets/excel/config_fashion'])]
  ordered=backend+[x for x in m['before'] if x not in backend]
  for index,target in enumerate(ordered):
   rel=m['candidatePathByTarget'][target];entry={'target':target,'before':m['before'][target],'after':m['after'][target],'backup':m['backupByTarget'][target]};m['installed'].append(entry);save(m);run(s,'mkdir -p '+shlex.quote(target.rsplit('/',1)[0]));install_one(s,m['stage']+'/'+rel,target,entry['before'],entry['after']);m['productionSourceWrites']+=1
   if target.endswith('ConfigService.js') or target.endswith('FashionBoxService.js') or target.endswith('fashion_overlay.json'):
    pass
   # Restart immediately after all backend source/config files, before client resources.
   if target==backend[-1]:
    for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:m['restarted'].append(name);save(m);run(s,'pm2 restart '+name);wait_ready(s,port)
  m['qa']={}
  for sid in [1002,1001]:m['qa'][str(sid)]=run_qa(s,m['stage'],sid)
  after=pm2(s);assert [p for p in beforePm2 if p['name'] not in NAMES]==[p for p in after if p['name'] not in NAMES];assert ready(s)=={'8080':200,'8083':200};assert hashes(s,list(m['after']))==m['after']
  m.update(status='DEPLOYED',afterPm2=after,ready=ready(s),completedAt=datetime.now(timezone.utc).isoformat());save(m);return m
 except Exception as e:m['error']=str(e);save(m);rollback(s,m);raise
def resume(s,m):
 assert m['status']=='INSTALLING';assert hashes(s,list(m['before']))[next(iter(m['before']))] in [m['before'][next(iter(m['before']))],m['after'][next(iter(m['before']))]]
 backend=[x for x in m['before'] if any(k in x for k in ['/newServer/src/','/lhs/configMap,json','/lhs/update/resource/assets/fashion_overlay.json','/lhs/update/resource/assets/excel/config_fashion'])]
 ordered=backend+[x for x in m['before'] if x not in backend];done=set()
 for e in m.get('installed',[]):
  current=hashes(s,[e['target']])[e['target']]
  if current==e['after']:done.add(e['target'])
 for target in ordered:
  if target in done:continue
  current=hashes(s,[target])[target]
  if current==m['after'][target]:
   m['installed'].append({'target':target,'before':m['before'][target],'after':m['after'][target],'backup':m['backupByTarget'][target]});save(m);done.add(target);continue
  assert current==m['before'][target],'RESUME_TARGET_DRIFT:'+target
  rel=m['candidatePathByTarget'][target];entry={'target':target,'before':m['before'][target],'after':m['after'][target],'backup':m['backupByTarget'][target]};m['installed'].append(entry);save(m);run(s,'mkdir -p '+shlex.quote(target.rsplit('/',1)[0]));install_one(s,m['stage']+'/'+rel,target,entry['before'],entry['after']);m['productionSourceWrites']+=1
 m['qa']={}
 for sid in [1002,1001]:m['qa'][str(sid)]=run_qa(s,m['stage'],sid)
 after=pm2(s);assert ready(s)=={'8080':200,'8083':200};assert hashes(s,list(m['after']))==m['after'];m.update(status='DEPLOYED',afterPm2=after,ready=ready(s),completedAt=datetime.now(timezone.utc).isoformat());save(m);return m
def main():
 action=sys.argv[1] if len(sys.argv)>1 else 'stage';assert action in ['stage','deploy','resume','verify','rollback']
 s=connect()
 try:
  if action=='stage':m=stage(s)
  else:
   m=json.loads(RELEASE.read_text(encoding='utf-8'))
   if action=='deploy':m=deploy(s,m)
   elif action=='resume':m=resume(s,m)
   elif action=='rollback':rollback(s,m)
   else:assert m['status']=='DEPLOYED' and hashes(s,list(m['after']))==m['after'] and ready(s)=={'8080':200,'8083':200}
  print(json.dumps({'action':action,'status':m['status'],'files':m.get('candidateCount'),'ready':m.get('ready'),'playerDataWrites':m.get('playerDataWrites',0)}))
 finally:s.close()
if __name__=='__main__':main()
