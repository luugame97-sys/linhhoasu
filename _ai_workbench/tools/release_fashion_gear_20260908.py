"""Guarded v2 follow-up to the deployed fashion/gear release. No data repair."""
import hashlib, json, re, shlex, sys
from pathlib import Path
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready
from deploy_farm_alchemy_20260908 import install_one, log_positions, check_new_logs

APP='/linhhoasu/lhs/newServer'; GAME='/linhhoasu/webgame/game'
LOCAL=WB.parent/'linhhoasu/lhs/newServer'; OUT=WB/'temp/fashion_gear_release_20260908_v2'
PREVIOUS=WB/'temp/fashion_gear_release_20260908/release.json'
SOURCES=['services/RoleAppearanceService.js','services/FashionTransactionService.js','services/FashionBoxService.js',
 'services/FashionBoxRepairService.js','services/RewardGrantService.js','handlers/fashion.js','handlers/item.js']
TESTS=['test-fashion-gear-fix.js','test-fashion-gear-native.js','test-farm-foundation.js','test-farm-alchemy-fix.js',
 'test-alchemy-craft.js','test-alchemy-material-sources.js','test-core-gameplay-contract.js','test-show-info-contract.js']
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))
def save(name,data):OUT.mkdir(parents=True,exist_ok=True);(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def pairs(stage):return [(LOCAL/'src'/p,stage+'/app/src/'+p,APP+'/src/'+p)for p in SOURCES]+[
 (WB.parent/'linhhoasu/webgame/game/js/lhs-fashion-gear-v1.js',stage+'/game/js/lhs-fashion-gear-v1.js',GAME+'/js/lhs-fashion-gear-v1.js'),
 (WB.parent/'linhhoasu/webgame/game/index.html',stage+'/game/index.html',GAME+'/index.html')]
def test(ssh,stage,installed=False):
 app=APP if installed else stage+'/app';game=GAME if installed else stage+'/game'
 env=f'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin FEATURE_APP={app} FEATURE_RUNTIME={app} FEATURE_GAME={GAME} FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_CLIENT={game}/js/lhs-fashion-gear-v1.js FEATURE_PATCH={GAME}/js/lhs-farm-alchemy-v2.js FEATURE_ACORN={stage}/tools/acorn.js ALCHEMY_SOURCE_ROOT={app} ALCHEMY_RUNTIME_ROOT={app} ALCHEMY_MAIN={GAME}/js/main.min_a6195824.js ALCHEMY_PATCH={GAME}/js/lhs-alchemy-v1.js MAP_RESOURCE_ROOT={GAME}/update/resource/assets/map NODE_PATH={APP}/node_modules'
 results={}
 for name in TESTS:
  output=run(ssh,env+' node '+stage+'/app/scripts/'+name,timeout=60)
  if name=='test-show-info-contract.js':assert 'show-info contract: PASS'in output;results[name]={'result':'PASS'};continue
  if name in ['test-farm-foundation.js','test-farm-alchemy-fix.js']:result=json.loads(output)
  else:result=json.loads([line for line in output.splitlines()if line.startswith('{"result"')][-1])
  assert result['result']in['PASS','ok'],name
  assert result.get('productionWrites',0)==0 and result.get('networkAttempts',0)==0,name
  results[name]=result
 return results
def stage(ssh):
 assert not(OUT/'release.json').exists(),'RELEASE_EXISTS_INSPECT_FIRST'
 previous=read(PREVIOUS);before=previous['expectedHashes'];assert hashes(ssh,list(before))==before,'LIVE_BASELINE_DRIFT'
 assert ready(ssh)=={'8080':200,'8083':200};processes=pm2(ssh)
 if (OUT/'pending.json').exists():
  p=read(OUT/'pending.json');stage=p['stage'];assert p['before']==before
 else:
  stage='/linhhoasu/_ai_workbench/temp/fashion_gear_v2_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
  run(ssh,f'install -d -m 700 {stage}/app/scripts {stage}/game/js {stage}/tools')
  run(ssh,f'cp -a {APP}/src {stage}/app/src')
  run(ssh,f'ln -s {APP}/node_modules {stage}/app/node_modules')
  save('pending.json',{'stage':stage,'before':before})
 expected={};localHashes={}
 with ssh.open_sftp()as f:
  for local,dest,live in pairs(stage):
   f.put(str(local),dest);expected[dest]=sha(local);localHashes[str(local)]=sha(local)
  for name in TESTS:
   local=LOCAL/'scripts'/name;dest=stage+'/app/scripts/'+name;f.put(str(local),dest);expected[dest]=sha(local)
  for local,dest in [(LOCAL/'node_modules/acorn/dist/acorn.js',stage+'/tools/acorn.js'),(WB/'tools/qa_fashion_gear_live_20260908.js',stage+'/tools/qa_fashion_gear_live_20260908.js')]:
   f.put(str(local),dest);expected[dest]=sha(local)
 for _,dest,_ in pairs(stage):
  if dest.endswith('.js'):run(ssh,'node --check '+dest)
 tests=test(ssh,stage);assert hashes(ssh,list(before))==before and pm2(ssh)==processes
 save('stage.json',{'status':'STAGED_NOT_DEPLOYED','stage':stage,'before':before,'expected':expected,'localHashes':localHashes,'tests':tests,'ready':ready(ssh),'beforePm2':processes})
 print(json.dumps({'status':'STAGED_NOT_DEPLOYED','stage':stage,'tests':{k:v.get('tests',v.get('count',v.get('tables')))for k,v in tests.items()}}))
def rollback(ssh,r):
 assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/fashion_gear_v2_\d{8}_\d{6}',r['backup'])
 for entry in reversed(r['installed']):
  current=hashes(ssh,[entry['target']])[entry['target']]
  if current==entry['before']:continue
  assert current==entry['after'],'ROLLBACK_DRIFT'
  install_one(ssh,entry['backup'],entry['target'],entry['after'],entry['before'])
 for name in r['restarted']:
  run(ssh,'pm2 restart '+name);wait_ready(ssh,8083 if name=='lhs-s1002'else 8080)
 assert hashes(ssh,list(r['beforeHashes']))==r['beforeHashes'];r.update(status='ROLLED_BACK',ready=ready(ssh));save('release.json',r)
def deploy(ssh):
 assert not(OUT/'release.json').exists(),'RELEASE_EXISTS_INSPECT_FIRST';m=read(OUT/'stage.json');stage=m['stage']
 assert re.fullmatch(r'/linhhoasu/_ai_workbench/temp/fashion_gear_v2_\d{8}_\d{6}',stage)
 assert hashes(ssh,list(m['before']))==m['before'] and hashes(ssh,list(m['expected']))==m['expected'],'CAS_DRIFT'
 assert {p:sha(p)for p in m['localHashes']}==m['localHashes'],'LOCAL_DRIFT'
 assert ready(ssh)=={'8080':200,'8083':200};test(ssh,stage)
 backup=stage.replace('/temp/','/backups/');run(ssh,'install -d -m 700 '+backup)
 r={'status':'INSTALLING','beforeHashes':m['before'],'expectedHashes':{live:m['expected'][dest]for _,dest,live in pairs(stage)},'beforePm2':pm2(ssh),'stage':stage,'backup':backup,'installed':[],'restarted':[],'canary':{},'liveQa':{},'playerDataRepair':False,'compensation':False}
 positions=log_positions(ssh)
 entries=[]
 for index,(_,dest,live)in enumerate(pairs(stage)):
  if m['before'][live]==m['expected'][dest]:continue
  entry={'target':live,'source':dest,'before':m['before'][live],'after':m['expected'][dest],'backup':backup+'/'+str(index)+'.before'}
  run(ssh,'cp -a -- '+shlex.quote(live)+' '+shlex.quote(entry['backup']));assert hashes(ssh,[entry['backup']])[entry['backup']]==entry['before'];entries.append(entry)
 save('release.json',r)
 try:
  for entry in entries:
   r['installed'].append(entry);save('release.json',r);install_one(ssh,entry['source'],entry['target'],entry['before'],entry['after'])
  for name,port,sid in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
   print(json.dumps({'step':'restart','name':name}),flush=True);r['restarted'].append(name);save('release.json',r)
   run(ssh,'pm2 restart '+name);wait_ready(ssh,port);r['canary'][name]=test(ssh,stage,True)
   output=run(ssh,'node '+stage+'/tools/qa_fashion_gear_live_20260908.js '+str(sid),timeout=60)
   qa=json.loads([x for x in output.splitlines()if x.startswith('{"result"')][-1]);assert qa['result']=='PASS'and qa['qaProfileRemoved']
   r['liveQa'][name]=qa;r['logs']=check_new_logs(ssh,positions);save('release.json',r)
   print(json.dumps({'step':'canary-live-qa-pass','name':name}),flush=True)
  r['afterPm2']=pm2(ssh)
  assert [p for p in r['beforePm2']if p['name']not in r['restarted']]==[p for p in r['afterPm2']if p['name']not in r['restarted']]
  for name in r['restarted']:
   a=next(p for p in r['beforePm2']if p['name']==name);b=next(p for p in r['afterPm2']if p['name']==name);assert b['status']=='online'and b['restarts']==a['restarts']+1
  assert hashes(ssh,list(r['expectedHashes']))==r['expectedHashes']
  served={}
  for host in ['127.0.0.1','103.116.105.154']:
   for url,live in [('/',GAME+'/index.html'),('/js/lhs-fashion-gear-v1.js',GAME+'/js/lhs-fashion-gear-v1.js')]:
    digest=run(ssh,'curl -fsS --max-time 10 '+shlex.quote('http://'+host+':81'+url)+' | sha256sum').split()[0];assert digest==r['expectedHashes'][live];served[host+url]=digest
  r.update(status='DEPLOYED',at=datetime.now(timezone.utc).isoformat(),ready=ready(ssh),served=served);save('release.json',r)
  with ssh.open_sftp()as f:f.put(str(OUT/'release.json'),backup+'/manifest.json')
  print(json.dumps({'status':'DEPLOYED','backup':backup,'ready':r['ready'],'liveQa':r['liveQa']}))
 except Exception as e:
  r['error']=str(e)
  try:rollback(ssh,r)
  except Exception as error:r.update(status='ROLLBACK_REQUIRES_ATTENTION',rollbackError=str(error));save('release.json',r)
  raise
def main():
 s=connect()
 try:
  action=sys.argv[1]if len(sys.argv)>1 else 'stage'
  if action=='stage':stage(s)
  elif action=='deploy':deploy(s)
  elif action=='rollback':rollback(s,read(OUT/'release.json'))
  else:raise ValueError('UNKNOWN_ACTION')
 finally:s.close()
if __name__=='__main__':main()
