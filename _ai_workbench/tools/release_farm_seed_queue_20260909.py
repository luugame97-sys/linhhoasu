"""Stage/deploy serialized one-key planting client patch with CAS/rollback."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions
from release_farm_manager_fix_20260909 import check_scoped_logs
OUT=WB/'temp/farm_seed_queue_fix_20260909';GAME='/linhhoasu/webgame/game'
TARGETS={GAME+'/js/lhs-farm-alchemy-v2.js':WB/'temp/farm_seed_queue_fix_20260909/candidate-client.js',GAME+'/index.html':WB/'temp/farm_seed_queue_fix_20260909/candidate-index.html'}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(n,x):(OUT/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def stage(s):
 OUT.mkdir(exist_ok=True);before=hashes(s,list(TARGETS));stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');st='/linhhoasu/_ai_workbench/temp/farm_seed_queue_'+stamp;run(s,f'install -d -m 700 {st}/tools')
 with s.open_sftp()as f:
  for target,local in TARGETS.items():f.put(str(local),st+'/candidate-'+Path(target).name)
  f.put(str(WB/'tools/test_farm_seed_queue_20260909.js'),st+'/tools/test.js')
 run(s,'node --check '+st+'/candidate-lhs-farm-alchemy-v2.js');out=run(s,'FEATURE_PATCH='+st+'/candidate-lhs-farm-alchemy-v2.js node '+st+'/tools/test.js');assert '"result":"PASS"' in out.replace(' ','')
 meta={'status':'STAGED_NOT_DEPLOYED','stage':st,'createdAt':datetime.now(timezone.utc).isoformat(),'before':before,'candidateHashes':{k:sha(v) for k,v in TARGETS.items()},'tests':{'seedQueue':'PASS'},'ready':ready(s),'pm2':pm2(s),'playerDataRepair':False};save('stage.json',meta);print(json.dumps({'status':meta['status'],'stage':st,'tests':meta['tests'],'ready':meta['ready']}))
def rollback(s,r):
 for e in reversed(r['installed']):
  cur=hashes(s,[e['target']])[e['target']]
  if cur==e['before']:continue
  assert cur==e['after'];install_one(s,e['backup'],e['target'],e['after'],e['before'])
 for n,p in reversed(r['restarted']):run(s,'pm2 restart '+n,timeout=60);wait_ready(s,p)
 r['status']='ROLLED_BACK';r['rolledBackAt']=datetime.now(timezone.utc).isoformat();r['ready']=ready(s);save('release.json',r)
def deploy(s):
 m=json.loads((OUT/'stage.json').read_text(encoding='utf-8'));assert hashes(s,list(m['before']))==m['before'];assert ready(s)=={'8080':200,'8083':200};st=m['stage']
 for target in TARGETS:
  cp=st+'/candidate-'+Path(target).name;assert hashes(s,[cp])[cp]==m['candidateHashes'][target]
 backup='/linhhoasu/_ai_workbench/backups/farm_seed_queue_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,'install -d -m 700 '+backup);positions=log_positions(s);r={'status':'INSTALLING','stage':st,'backup':backup,'beforeHashes':m['before'],'expectedHashes':m['candidateHashes'],'beforePm2':pm2(s),'installed':[],'restarted':[],'canary':{},'playerDataRepair':False};save('release.json',r)
 try:
  for i,(target,local) in enumerate(TARGETS.items()):
   b=backup+'/'+str(i)+'.before';run(s,'cp -a '+shlex.quote(target)+' '+shlex.quote(b));assert hashes(s,[b])[b]==m['before'][target];after=m['candidateHashes'][target];r['installed'].append({'target':target,'before':m['before'][target],'after':after,'backup':b});save('release.json',r);install_one(s,st+'/candidate-'+Path(target).name,target,m['before'][target],after)
  for n,p in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   r['restarted'].append((n,p));save('release.json',r);run(s,'pm2 restart '+n,timeout=60);wait_ready(s,p);r['canary'][n]={'ready':200,'logs':check_scoped_logs(s,positions)};save('release.json',r)
  served={}
  for host in ['127.0.0.1','103.116.105.154']:
   for url,target in [('/',GAME+'/index.html'),('/js/lhs-farm-alchemy-v2.js?v=20260909_seed_queue_v1',GAME+'/js/lhs-farm-alchemy-v2.js')]:
    h=run(s,'curl -fsS --max-time 15 '+shlex.quote('http://'+host+':81'+url)+' | sha256sum').split()[0];assert h==r['expectedHashes'][target],f'HTTP_ARTIFACT_MISMATCH {host}{url}';served[host+url]=h
  r.update(status='DEPLOYED',completedAt=datetime.now(timezone.utc).isoformat(),ready=ready(s),afterPm2=pm2(s),served=served,newLogs=check_scoped_logs(s,positions));save('release.json',r);print(json.dumps({'status':r['status'],'backup':backup,'ready':r['ready'],'served':served}))
 except Exception as e:
  r['error']=str(e);save('release.json',r)
  if r['installed']:rollback(s,r)
  raise
def main():
 a=sys.argv[1] if len(sys.argv)>1 else 'stage';s=connect()
 try:
  if a=='stage':stage(s)
  elif a=='deploy':deploy(s)
  elif a=='rollback':rollback(s,json.loads((OUT/'release.json').read_text(encoding='utf-8')))
  else:raise ValueError(a)
 finally:s.close()
if __name__=='__main__':main()
