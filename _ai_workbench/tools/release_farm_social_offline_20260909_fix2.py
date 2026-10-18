"""Scoped social/offline farm release. Fresh live baseline, compare-and-swap, rollback."""
import json,hashlib,re,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import connect,WB
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions
from release_fashion_box_open_20260909 import check_new_logs
OUT=WB/'temp/farm_social_offline_20260909_fix2';APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game';LOCAL=WB.parent/'linhhoasu/lhs/newServer'
RELS=['services/FarmSocialService.js','services/FarmOfflineService.js','services/FarmAccessService.js','db/models/Guild.js','handlers/farm.js','handlers/guild.js','handlers/account.js','handlers/basic.js','handlers/index.js','net/WSServer.js','config/farmPolicy.json']
TESTS=['test-farm-social-offline.js','test-farm-alchemy-fix.js','test-farm-foundation.js']
CLIENT='js/lhs-farm-social-offline-v1.js'
def save(n,data): (OUT/n).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(b):return hashlib.sha256(b).hexdigest()
def read(n):return json.loads((OUT/n).read_text(encoding='utf-8'))
def targets():return [APP+'/src/'+r for r in RELS]+[GAME+'/'+CLIENT,GAME+'/index.html']
def merged(rel):
 s=(LOCAL/'src'/rel).read_text(encoding='utf-8')
 if rel=='handlers/farm.js':
  s=s.replace('"Tiên hữu"',"'道友'")
  s,n=re.subn(r'function scheduleFarmPlayerSave\(.*?\n}\n\n(?=async function loadPlayerByDbid)','',s,flags=re.S);assert n==1
  s=s.replace("const logger = require('../logger');\n",'')
 if rel=='handlers/guild.js':
  s=s.replace('"Bang hội địch"',"'敌方仙盟'").replace('`Bang hội${safeGuildId}`','`仙盟${safeGuildId}`')
  s=s.replace('const saved = await playerService.savePlayer(userId, player);','const saved = await playerService.savePlayer(userId, player, { returnSaved: false });')
 if rel=='handlers/index.js':
  before=(OUT/'before'/rel).read_text(encoding='utf-8');live=next(x for x in before.splitlines()if 'logger.info(`[Handlers] 已注册' in x)
  s=re.sub(r'^.*logger.info\(`\[Handlers\] 已注册.*$',lambda _:live,s,flags=re.M)
 return s.encode('utf-8')
def tests(s,st,installed=False):
 app=APP if installed else st+'/app';env=f'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin FEATURE_APP={app} FEATURE_GAME={GAME} FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_PATCH={GAME}/js/lhs-farm-alchemy-v2.js FEATURE_ACORN={st}/tools/acorn.js FARM_BASE_TEST={st}/app/scripts/test-farm-alchemy-fix.js'
 result={}
 for name in TESTS:
  result[name]=json.loads(run(s,env+' node '+st+'/app/scripts/'+name,timeout=60));assert result[name]['result']=='PASS',result[name]
 return result
def stage(s):
 baseline=read('baseline.json')['hashes'];assert hashes(s,list(baseline))==baseline,'BASELINE_DRIFT'
 if(OUT/'stage.json').exists():m=read('stage.json');st=m['stage'];before=m['before'];assert hashes(s,targets())==before
 else:
  st='/linhhoasu/_ai_workbench/temp/farm_social_offline_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');before=hashes(s,targets())
  run(s,f'install -d -m 700 {st}/app/scripts {st}/game/js {st}/tools; cp -a {APP}/src {st}/app/src; ln -s {APP}/node_modules {st}/app/node_modules')
  save('stage.json',{'stage':st,'before':before,'status':'PREPARING'})
 state=pm2(s);expected={}
 with s.open_sftp() as f:
  for name in TESTS:f.put(str(LOCAL/'scripts'/name),st+'/app/scripts/'+name)
  f.put(str(LOCAL/'node_modules/acorn/dist/acorn.js'),st+'/tools/acorn.js')
  for rel in RELS:
   raw=merged(rel);p=OUT/'candidate/src'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
   dest=st+'/app/src/'+rel
   with f.open(dest,'wb')as stream:stream.write(raw)
   expected[APP+'/src/'+rel]=sha(raw)
  index=(OUT/'index.before.html').read_text(encoding='utf-8');needle='"js/lhs-farm-alchemy-v2.js?v=20260909_seed_queue_v1",';assert index.count(needle)==1
  index=index.replace(needle,needle+'\n\t\t"'+CLIENT+'?v=20260909_social_offline_v1",');(OUT/'candidate/index.html').write_text(index,encoding='utf-8')
  for file,raw in [(CLIENT,(WB.parent/'linhhoasu/webgame/game'/CLIENT).read_bytes()),('index.html',index.encode())]:
   with f.open(st+'/game/'+file,'wb')as stream:stream.write(raw)
   expected[GAME+'/'+file]=sha(raw)
 for rel in RELS:
  if rel.endswith('.js'):run(s,'node --check '+st+'/app/src/'+rel)
 result=tests(s,st);assert pm2(s)==state;assert hashes(s,targets())==before
 save('stage.json',{'status':'STAGED','stage':st,'before':before,'expected':expected,'tests':result,'pm2':state,'ready':ready(s)})
 print(json.dumps({'status':'STAGED','stage':st,'tests':{k:v['count']for k,v in result.items()}}))
def rollback(s,r):
 for row in reversed(r['installed']):
  cur=hashes(s,[row['target']])[row['target']]
  if cur==row['before']:continue
  assert cur==row['after'],'ROLLBACK_DRIFT'
  if row['before']:install_one(s,row['backup'],row['target'],row['after'],row['before'])
  else:run(s,'mv -- '+shlex.quote(row['target'])+' '+shlex.quote(row['backup']+'.disabled'))
 for name,port in r['restarted']:run(s,'pm2 restart '+name);wait_ready(s,port)
 assert hashes(s,list(r['before']))==r['before'];r.update(status='ROLLED_BACK',ready=ready(s));save('release.json',r)
def deploy(s):
 m=read('stage.json');assert m['status']=='STAGED';st=m['stage'];assert hashes(s,targets())==m['before'];assert ready(s)=={'8080':200,'8083':200}
 if (OUT/'release.json').exists():
  previous=read('release.json');assert previous['status']=='ROLLED_BACK','RELEASE_ALREADY_EXISTS'
  save('attempt-1.json',previous)
 mapping={APP+'/src/'+r:st+'/app/src/'+r for r in RELS};mapping.update({GAME+'/'+r:st+'/game/'+r for r in [CLIENT,'index.html']})
 assert hashes(s,list(mapping.values()))=={v:m['expected'][k]for k,v in mapping.items()}
 backup=st.replace('/temp/','/backups/')+'_'+datetime.now(timezone.utc).strftime('%H%M%S');run(s,'install -d -m 700 '+backup)
 r={'status':'INSTALLING','stage':st,'backup':backup,'before':m['before'],'expected':m['expected'],'installed':[],'restarted':[],'canary':{},'beforePm2':pm2(s)}
 # All backups are verified before any production source is replaced.
 for i,t in enumerate(targets()):
  if m['before'][t]:run(s,'cp -a -- '+shlex.quote(t)+' '+backup+'/'+str(i)+'.before');assert hashes(s,[backup+'/'+str(i)+'.before'])[backup+'/'+str(i)+'.before']==m['before'][t]
 save('release.json',r)
 def put(t):
  i=targets().index(t);row={'target':t,'before':m['before'][t],'after':m['expected'][t],'backup':backup+'/'+str(i)+'.before'};r['installed'].append(row);save('release.json',r);install_one(s,mapping[t],t,row['before'],row['after'])
 try:
  for rel in RELS:put(APP+'/src/'+rel)
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   positions=log_positions(s);r['restarted'].append((name,port));save('release.json',r);run(s,'pm2 restart '+name);wait_ready(s,port)
   r['canary'][name]={'tests':tests(s,st,True),'logs':check_new_logs(s,positions)};save('release.json',r);print(json.dumps({'canary':name,'result':'PASS'}),flush=True)
  put(GAME+'/'+CLIENT);put(GAME+'/index.html')
  assert hashes(s,targets())==m['expected'];after=pm2(s);names=['lhs-s1001','lhs-s1002'];assert [p for p in r['beforePm2']if p['name']not in names]==[p for p in after if p['name']not in names]
  served=run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/'+CLIENT+' | sha256sum').split()[0];assert served==m['expected'][GAME+'/'+CLIENT]
  r.update(status='DEPLOYED_PENDING_NATIVE_QA',ready=ready(s),afterPm2=after,servedHash=served);save('release.json',r)
  with s.open_sftp()as f:
   with f.open(backup+'/manifest.json','w')as o:o.write(json.dumps(r))
  print(json.dumps({'status':r['status'],'backup':backup,'ready':r['ready']}))
 except Exception as e:
  r['error']=str(e);save('release.json',r)
  try:rollback(s,r)
  except Exception as rb:r['status']='ROLLBACK_REQUIRES_ATTENTION';r['rollbackError']=str(rb);save('release.json',r)
  raise
if __name__=='__main__':
 action=sys.argv[1]if len(sys.argv)>1 else 'stage';s=connect()
 try:
  if action=='stage':stage(s)
  elif action=='deploy':deploy(s)
  elif action=='rollback':rollback(s,read('release.json'))
 finally:s.close()
