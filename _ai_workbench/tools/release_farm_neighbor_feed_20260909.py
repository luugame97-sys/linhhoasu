"""Stage/deploy balanced neighbor-feed port with CAS and rollback."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions
from release_farm_manager_fix_20260909 import check_scoped_logs
APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game';OUT=WB/'temp/farm_neighbor_feed_20260909'
TARGETS={APP+'/src/handlers/farm.js':WB/'temp/farm_manager_audit_20260909/candidate-neighbor-farm.js',APP+'/src/config/farmPolicy.json':WB/'temp/farm_manager_audit_20260909/candidate-farmPolicy.json'}
TESTS=['test-farm-alchemy-fix.js','test-farm-foundation.js']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(n,x): (OUT/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def env(source,stage):return ('CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin '+f'FEATURE_APP={source} FEATURE_RUNTIME={APP} FEATURE_GAME={GAME} FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_PATCH={GAME}/js/lhs-farm-alchemy-v2.js FEATURE_ACORN={stage}/tools/acorn.js')
def tests(s,source,stage):
 out={}
 for name in TESTS:
  out[name]=json.loads(run(s,env(source,stage)+f' node {stage}/app/scripts/{name}',timeout=90));assert out[name]['result']=='PASS',name
 return out
def stage(s):
 OUT.mkdir(exist_ok=True);before=hashes(s,list(TARGETS));stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');st='/linhhoasu/_ai_workbench/temp/farm_neighbor_feed_'+stamp
 run(s,f'install -d -m 700 {st}/app/scripts {st}/tools; cp -a {APP}/src {st}/app/src; ln -s {APP}/node_modules {st}/app/node_modules')
 with s.open_sftp()as f:
  for target,local in TARGETS.items():f.put(str(local),st+'/app/src/'+target.split('/src/',1)[1])
  for name in TESTS:f.put(str(WB.parent/'linhhoasu/lhs/newServer/scripts'/name),st+'/app/scripts/'+name)
  f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),st+'/tools/acorn.js')
 run(s,'node --check '+st+'/app/src/handlers/farm.js');result=tests(s,st+'/app',st)
 meta={'status':'STAGED_NOT_DEPLOYED','stage':st,'createdAt':datetime.now(timezone.utc).isoformat(),'before':before,'candidateHashes':{k:sha(v) for k,v in TARGETS.items()},'tests':result,'ready':ready(s),'pm2':pm2(s),'playerDataRepair':False};save('stage.json',meta);print(json.dumps({'status':meta['status'],'stage':st,'tests':{k:v['count'] for k,v in result.items()},'ready':meta['ready']}))
def rollback(s,r):
 for e in reversed(r['installed']):
  cur=hashes(s,[e['target']])[e['target']]
  if cur==e['before']:continue
  assert cur==e['after'];install_one(s,e['backup'],e['target'],e['after'],e['before'])
 for n,p in reversed(r['restarted']):run(s,'pm2 restart '+n,timeout=60);wait_ready(s,p)
 r['status']='ROLLED_BACK';r['rolledBackAt']=datetime.now(timezone.utc).isoformat();r['ready']=ready(s);save('release.json',r)
def deploy(s):
 m=json.loads((OUT/'stage.json').read_text(encoding='utf-8'));assert hashes(s,list(m['before']))==m['before'];assert ready(s)=={'8080':200,'8083':200};st=m['stage'];
 for target in TARGETS:
  candidate_path=st+'/app/src/'+target.split('/src/',1)[1]
  assert hashes(s,[candidate_path])[candidate_path]==m['candidateHashes'][target]
 backup='/linhhoasu/_ai_workbench/backups/farm_neighbor_feed_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,'install -d -m 700 '+backup);positions=log_positions(s);r={'status':'INSTALLING','stage':st,'backup':backup,'beforeHashes':m['before'],'expectedHashes':m['candidateHashes'],'beforePm2':pm2(s),'installed':[],'restarted':[],'canary':{},'playerDataRepair':False};save('release.json',r)
 try:
  for i,(target,local) in enumerate(TARGETS.items()):
   b=backup+'/'+str(i)+'.before';run(s,'cp -a '+shlex.quote(target)+' '+shlex.quote(b));assert hashes(s,[b])[b]==m['before'][target];after=m['candidateHashes'][target];r['installed'].append({'target':target,'before':m['before'][target],'after':after,'backup':b});save('release.json',r);install_one(s,st+'/app/src/'+target.split('/src/',1)[1],target,m['before'][target],after)
  for n,p in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   r['restarted'].append((n,p));save('release.json',r);run(s,'pm2 restart '+n,timeout=60);wait_ready(s,p);r['canary'][n]={'tests':tests(s,APP,st),'logs':check_scoped_logs(s,positions),'ready':200};save('release.json',r)
  r.update(status='DEPLOYED',completedAt=datetime.now(timezone.utc).isoformat(),ready=ready(s),afterPm2=pm2(s),newLogs=check_scoped_logs(s,positions));save('release.json',r);print(json.dumps({'status':r['status'],'backup':backup,'ready':r['ready'],'tests':{k:v['count'] for k,v in r['canary']['lhs-s1001']['tests'].items()}}))
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
