"""Guarded foundation + approved farm economy release. No historical player repair."""
import hashlib,json,re,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions,check_new_logs

APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game'
OUT=WB/'temp/farm_foundation_20260908'
SOURCES=['services/ConfigService.js','protocol/Codec.js','services/GameDayService.js','services/FeatureReceiptService.js',
 'services/FarmDayService.js','services/FarmPolicyService.js','services/FarmRecoveryService.js','services/FarmShopService.js',
 'services/FarmAdService.js','services/FarmAccessService.js','services/ItemPillService.js','handlers/farm.js','handlers/alchemy.js',
 'handlers/account.js','handlers/basic.js','handlers/index.js','config/farmPolicy.json']
TESTS=['test-farm-foundation.js','test-farm-alchemy-fix.js','test-alchemy-craft.js','test-core-gameplay-contract.js','test-show-info-contract.js']
def sha(raw):return hashlib.sha256(raw).hexdigest()
def save(file,data):file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def targets(stage):return [(stage+'/app/src/'+p,APP+'/src/'+p)for p in SOURCES]+[(stage+'/game/js/lhs-farm-alchemy-v2.js',GAME+'/js/lhs-farm-alchemy-v2.js'),(stage+'/game/index.html',GAME+'/index.html')]
def local_files():return [WB.parent/'linhhoasu/lhs/newServer/src'/p for p in SOURCES]+[WB.parent/'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js',WB.parent/'linhhoasu/webgame/game/index.html']
def run_tests(s,stage,installed=False):
 source=APP if installed else stage+'/app';game=GAME if installed else stage+'/game'
 prefix=f'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin FEATURE_APP={source} FEATURE_RUNTIME={APP} FEATURE_GAME={game} FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_PATCH={game}/js/lhs-farm-alchemy-v2.js FEATURE_ACORN={stage}/tools/acorn.js ALCHEMY_SOURCE_ROOT={source} ALCHEMY_RUNTIME_ROOT={source} ALCHEMY_MAIN={GAME}/js/main.min_a6195824.js ALCHEMY_PATCH={GAME}/js/lhs-alchemy-v1.js'
 result={}
 for name in TESTS:
  output=run(s,prefix+f' node {stage}/app/scripts/{name}')
  if name=='test-show-info-contract.js':assert 'PASS' in output
  else:
   parsed=[json.loads(line)for line in output.splitlines() if line.startswith('{"result"')]
   if name in ['test-farm-foundation.js','test-farm-alchemy-fix.js']:parsed=[json.loads(output)]
   assert parsed and parsed[-1]['result']in['PASS','ok'],name+' failed'
   result[name]=parsed[-1]
 result['showInfo']='PASS'
 return result
def merge_farm(raw):
 text=raw.decode('utf-8').replace('\r','')
 oldlocal=(WB/'backups/farm_alchemy_fix_20260907/farm.local.before.js').read_text(encoding='utf-8').replace('\r','')
 oldlive=(WB/'temp/farm_alchemy_fix_20260908/before-0').read_text(encoding='utf-8').replace('\r','')
 import difflib
 a,b=oldlocal.splitlines(True),oldlive.splitlines(True)
 for op,i,j,k,l in difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes():
  if op=='replace'and j-i==1 and l-k==1 and 'Tiên hữu'in a[i]and '道友'in b[k]:
   assert a[i]in text,'FARM_MERGE_ANCHOR';text=text.replace(a[i],b[k])
 text,n=re.subn(r'function scheduleFarmPlayerSave\(.*?\n}\n\n(?=async function loadPlayerByDbid)','',text,flags=re.S)
 assert n==1;return text.replace("const logger = require('../logger');\n",'').encode('utf-8')
def stage_release(s):
 OUT.mkdir(exist_ok=True)
 previous=json.loads((WB/'temp/farm_alchemy_fix_20260908/release.json').read_text(encoding='utf-8'))
 assert hashes(s,list(previous['expectedHashes']))==previous['expectedHashes'],'LIVE_BASELINE_CHANGED'
 pending=OUT/'pending.json'
 if pending.exists():
  meta=json.loads(pending.read_text(encoding='utf-8'));stage=meta['stage'];before=meta['before']
  assert hashes(s,list(before))==before,'PENDING_BASELINE_DRIFT'
 else:
  stage='/linhhoasu/_ai_workbench/temp/farm_foundation_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
  before=hashes(s,[t for _,t in targets(stage)])
  run(s,f'install -d -m 700 {stage}/app/scripts {stage}/game/js {stage}/tools; cp -a {APP}/src {stage}/app/src; ln -s {APP}/node_modules {stage}/app/node_modules; ln -s {GAME}/js/main.min_a6195824.js {stage}/game/js/main.min_a6195824.js')
  save(pending,{'stage':stage,'before':before})
 processes=pm2(s);assert ready(s)=={'8080':200,'8083':200}
 pairs=targets(stage);localHashes={};expected={}
 with s.open_sftp()as f:
  for i,((dest,live),local)in enumerate(zip(pairs,local_files())):
   raw=local.read_bytes();localHashes[str(local)]=sha(raw)
   if before[live]:
    baseline=f.open(live,'rb').read();(OUT/f'before-{i}').write_bytes(baseline)
   if live.endswith('/handlers/farm.js'):raw=merge_farm(raw)
   if live.endswith('/handlers/index.js'):
    text=raw.decode('utf-8');line=next(x.strip()for x in baseline.decode('utf-8').replace('\r','').splitlines()if 'logger.info(`[Handlers] 已注册' in x)
    text,n=re.subn(r'logger.info\(`\[Handlers\] 已注册[^\n]+',lambda _:line,text);assert n==1;raw=text.encode('utf-8')
   with f.open(dest,'wb')as stream:stream.write(raw)
   expected[dest]=sha(raw)
  for name in TESTS:f.put(str(WB.parent/'linhhoasu/lhs/newServer/scripts'/name),stage+'/app/scripts/'+name)
  f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
 for dest,_ in pairs:
  if dest.endswith('.js'):run(s,'node --check '+dest)
 tests=run_tests(s,stage)
 assert hashes(s,list(before))==before;assert pm2(s)==processes
 report={'status':'STAGED','stage':stage,'before':before,'expected':expected,'localHashes':localHashes,'tests':tests,'ready':ready(s),'beforePm2':processes,'playerDataRepair':False}
 save(OUT/'stage.json',report);print(json.dumps({'status':'STAGED','tests':{k:v.get('count',v.get('tests'))for k,v in tests.items()if isinstance(v,dict)},'stage':stage,'ready':report['ready']}))
def rollback(s,r):
 for row in reversed(r['installed']):
  h=hashes(s,[row['target']])[row['target']]
  if h==row['before']:continue
  assert h==row['after'],'ROLLBACK_DRIFT'
  if row['before']:install_one(s,row['backup'],row['target'],row['after'],row['before'])
  else:run(s,'mv -- '+shlex.quote(row['target'])+' '+shlex.quote(row['backup']+'.new-disabled'))
 for name in r['restarted']:
  run(s,'pm2 restart '+name);wait_ready(s,8083 if name=='lhs-s1002' else 8080)
 r['status']='ROLLED_BACK';r['ready']=ready(s);save(OUT/'release.json',r)
def deploy(s):
 m=json.loads((OUT/'stage.json').read_text(encoding='utf-8'));stage=m['stage'];pairs=targets(stage)
 assert re.fullmatch(r'/linhhoasu/_ai_workbench/temp/farm_foundation_\d{8}_\d{6}',stage)
 if (OUT/'release.json').exists():raise RuntimeError('RELEASE_EXISTS_INSPECT_FIRST')
 assert hashes(s,list(m['before']))==m['before'];assert hashes(s,list(m['expected']))==m['expected']
 assert {p:sha(Path(p).read_bytes())for p in m['localHashes']}==m['localHashes']
 assert ready(s)=={'8080':200,'8083':200};run_tests(s,stage)
 backup=stage.replace('/temp/','/backups/');run(s,'install -d -m 700 '+backup)
 r={'status':'INSTALLING','stage':stage,'backup':backup,'beforeHashes':m['before'],'expectedHashes':{target:m['expected'][src]for src,target in pairs},'beforePm2':pm2(s),'installed':[],'restarted':[],'canary':{},'playerDataRepair':False}
 positions=log_positions(s)
 for i,(_,target)in enumerate(pairs):
  if m['before'][target]:
   run(s,f'cp -a -- {target} {backup}/{i}.before');assert hashes(s,[f'{backup}/{i}.before'])[f'{backup}/{i}.before']==m['before'][target]
 save(OUT/'release.json',r)
 try:
  assert hashes(s,list(m['before']))==m['before']
  for i,(source,target)in enumerate(pairs):
   entry={'target':target,'before':m['before'][target],'after':m['expected'][source],'backup':f'{backup}/{i}.before'};r['installed'].append(entry);save(OUT/'release.json',r)
   install_one(s,source,target,entry['before'],entry['after'])
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   r['restarted'].append(name);save(OUT/'release.json',r);print(json.dumps({'restarting':name}),flush=True)
   run(s,'pm2 restart '+name);wait_ready(s,port)
   r['canary'][name]=run_tests(s,stage,True);r['logs']=check_new_logs(s,positions);save(OUT/'release.json',r)
   print(json.dumps({'canary':'PASS','name':name}),flush=True)
  r['afterPm2']=pm2(s)
  assert [p for p in r['beforePm2']if p['name']not in r['restarted']]==[p for p in r['afterPm2']if p['name']not in r['restarted']]
  for name in r['restarted']:
   a=next(p for p in r['beforePm2']if p['name']==name);b=next(p for p in r['afterPm2']if p['name']==name)
   assert b['status']=='online'and b['restarts']==a['restarts']+1
  assert hashes(s,list(r['expectedHashes']))==r['expectedHashes']
  served={}
  for host in ['127.0.0.1','103.116.105.154']:
   for url,target in [('/',GAME+'/index.html'),('/js/lhs-farm-alchemy-v2.js',GAME+'/js/lhs-farm-alchemy-v2.js')]:
    h=run(s,'curl -fsS --max-time 15 '+shlex.quote('http://'+host+':81'+url)+' | sha256sum').split()[0];assert h==r['expectedHashes'][target];served[host+url]=h
  r.update(status='DEPLOYED',at=datetime.now(timezone.utc).isoformat(),ready=ready(s),served=served);save(OUT/'release.json',r)
  with s.open_sftp()as f:
   with f.open(backup+'/manifest.json','w')as stream:stream.write(json.dumps(r,indent=2))
  print(json.dumps({'status':r['status'],'backup':backup,'ready':r['ready']}))
 except Exception as error:
  r['error']=str(error)
  try:rollback(s,r)
  except Exception as e:r.update(status='ROLLBACK_REQUIRES_ATTENTION',rollbackError=str(e));save(OUT/'release.json',r)
  raise
def main():
 action=sys.argv[1]if len(sys.argv)>1 else 'stage';s=connect()
 try:
  if action=='stage':stage_release(s)
  elif action=='deploy':deploy(s)
  elif action=='rollback':rollback(s,json.loads((OUT/'release.json').read_text(encoding='utf-8')))
  else:raise ValueError('Unknown action')
 finally:s.close()
if __name__=='__main__':main()
