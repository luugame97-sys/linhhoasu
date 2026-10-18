"""Disable the experimental offline manager without touching player data."""
import hashlib, json, re, shlex, sys
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import hashes, pm2, ready, run, wait_ready
from deploy_farm_alchemy_20260908 import install_one

APP='/linhhoasu/lhs/newServer'; GAME='/linhhoasu/webgame/game'; OUT=WB/'temp/farm_offline_disabled_20260910'; MANIFEST=OUT/'release.json'
TARGETS=[APP+'/src/services/FarmOfflineService.js',APP+'/src/config/farmPolicy.json',GAME+'/js/lhs-farm-social-offline-v1.js',GAME+'/index.html']
NAMES=[('lhs-s1002',8083),('lhs-s1001',8080)]
LOCAL={TARGETS[0]:WB.parent/'linhhoasu/lhs/newServer/src/services/FarmOfflineService.js',TARGETS[1]:WB.parent/'linhhoasu/lhs/newServer/src/config/farmPolicy.json',TARGETS[2]:WB.parent/'linhhoasu/webgame/game/js/lhs-farm-social-offline-v1.js',TARGETS[3]:WB.parent/'linhhoasu/webgame/game/index.html'}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(x): OUT.mkdir(parents=True,exist_ok=True); MANIFEST.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def load(): return json.loads(MANIFEST.read_text(encoding='utf-8'))
def stage(s):
  assert ready(s)=={'8080':200,'8083':200}
  patch=LOCAL[TARGETS[2]].read_text(encoding='utf-8'); policy=json.loads(LOCAL[TARGETS[1]].read_text(encoding='utf-8'))
  assert "version: '20260910_social_only_v1'" in patch and 'setInterval(function(){' not in patch and "button.label = 'Cài offline'" not in patch
  assert policy['offline']['enabled'] is False and policy['offline']['maxHours']==0
  before=hashes(s,TARGETS); stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); stage='/linhhoasu/_ai_workbench/temp/farm_offline_disabled_'+stamp
  run(s,'install -d -m 700 '+shlex.quote(stage)); staged={}
  with s.open_sftp() as f:
    for i,t in enumerate(TARGETS): staged[t]=stage+'/'+str(i)+'.candidate'; f.put(str(LOCAL[t]),staged[t])
  expected={t:sha(LOCAL[t]) for t in TARGETS}; assert hashes(s,list(staged.values()))=={staged[t]:expected[t] for t in TARGETS}
  save({'status':'STAGED','at':datetime.now(timezone.utc).isoformat(),'before':before,'expected':expected,'stage':stage,'staged':staged,'targets':TARGETS,'checks':{'offlineDisabled':True,'noOfflineUi':True,'socialAssistPreserved':True,'playerDataUntouched':True}})
  print(json.dumps({'status':'STAGED','targets':len(TARGETS),'ready':ready(s)}))
def deploy(s):
  r=load(); assert r['status']=='STAGED' and hashes(s,TARGETS)==r['before'] and ready(s)=={'8080':200,'8083':200}
  assert hashes(s,list(r['staged'].values()))=={r['staged'][t]:r['expected'][t] for t in TARGETS}
  backup='/linhhoasu/_ai_workbench/backups/farm_offline_disabled_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); run(s,'install -d -m 700 '+backup); r.update(status='INSTALLING',backup=backup,installed=[],restarted=[]); save(r)
  try:
    for i,t in enumerate(TARGETS):
      b=backup+'/'+str(i)+'.before'; run(s,'cp -a -- '+shlex.quote(t)+' '+shlex.quote(b)); assert hashes(s,[b])[b]==r['before'][t]
      row={'target':t,'before':r['before'][t],'after':r['expected'][t],'backup':b}; r['installed'].append(row); save(r); install_one(s,r['staged'][t],t,row['before'],row['after'])
    for name,port in NAMES:
      r['restarted'].append(name); save(r); run(s,'pm2 restart '+name); wait_ready(s,port)
    assert hashes(s,TARGETS)==r['expected']; r.update(status='DEPLOYED',ready=ready(s),afterPm2=pm2(s)); save(r); print(json.dumps({'status':r['status'],'backup':backup,'ready':r['ready']}))
  except Exception:
    save(r); rollback(s); raise
def rollback(s):
  r=load(); assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/farm_offline_disabled_\d{8}_\d{6}',r['backup'])
  for row in reversed(r.get('installed',[])):
    cur=hashes(s,[row['target']])[row['target']]
    if cur==row['before']: continue
    assert cur==row['after']; install_one(s,row['backup'],row['target'],row['after'],row['before'])
  for name in r.get('restarted',[]): run(s,'pm2 restart '+name); wait_ready(s,8083 if name=='lhs-s1002' else 8080)
  assert hashes(s,TARGETS)==r['before']; r.update(status='ROLLED_BACK',ready=ready(s)); save(r); print(json.dumps({'status':r['status'],'ready':r['ready']}))
def verify(s):
  r=load(); expected=r['expected'] if r['status']=='DEPLOYED' else r['before']; result={'status':r['status'],'hashes':hashes(s,TARGETS),'ready':ready(s)}; assert result['hashes']==expected; print(json.dumps(result))
if __name__=='__main__':
  action=sys.argv[1] if len(sys.argv)>1 else 'stage'; assert action in {'stage','deploy','rollback','verify'}
  s=connect()
  try: {'stage':stage,'deploy':deploy,'rollback':rollback,'verify':verify}[action](s)
  finally: s.close()
