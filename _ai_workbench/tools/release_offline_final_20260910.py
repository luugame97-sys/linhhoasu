from pathlib import Path
import sys,json,hashlib
from datetime import datetime,timezone
sys.path.insert(0,str(Path('_ai_workbench/tools').resolve()))
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run,hashes,ready,pm2,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions
from release_farm_manager_fix_20260909 import check_scoped_logs as check_new_logs
out=Path('_ai_workbench/temp/farm_offline_final_20260910');out.mkdir(exist_ok=True)
app='/linhhoasu/lhs/newServer';game='/linhhoasu/webgame/game';stage='/linhhoasu/_ai_workbench/temp/farm_social_offline_20260909_095052';s=connect();r={'installed':[],'restarted':[]}
try:
 targets=[app+'/src/services/FarmOfflineService.js',game+'/js/lhs-farm-social-offline-v1.js',game+'/index.html'];before=hashes(s,targets);assert ready(s)=={'8080':200,'8083':200}
 backup='/linhhoasu/_ai_workbench/backups/offline_final_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,'install -d -m 700 '+backup)
 with s.open_sftp()as f:
  idx=f.open(targets[2],'rb').read();newidx=idx.replace(b'social-offline-v1.js?v=20260909_social_offline_v4',b'social-offline-v1.js?v=20260910_offline_v5');assert idx!=newidx
  raws=[Path('linhhoasu/lhs/newServer/src/services/FarmOfflineService.js').read_bytes(),Path('linhhoasu/webgame/game/js/lhs-farm-social-offline-v1.js').read_bytes(),newidx]
  for i,(t,raw)in enumerate(zip(targets,raws)):
   original=f.open(t,'rb').read();(out/('before-'+str(i))).write_bytes(original);run(s,'cp -a '+t+' '+backup+'/'+str(i));assert hashes(s,[backup+'/'+str(i)])[backup+'/'+str(i)]==before[t]
   with f.open(stage+'/offline-final-'+str(i),'wb')as w:w.write(raw)
  f.put(str(Path('linhhoasu/lhs/newServer/scripts/test-farm-social-offline.js').resolve()),stage+'/app/scripts/test-farm-social-offline.js')
  f.put(str(Path('linhhoasu/lhs/newServer/src/services/FarmOfflineService.js').resolve()),stage+'/app/src/services/FarmOfflineService.js')
 env=f'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin FEATURE_GAME={game} FEATURE_ACORN={stage}/tools/acorn.js FARM_BASE_TEST={stage}/app/scripts/test-farm-alchemy-fix.js '
 test=json.loads(run(s,env+f'FEATURE_APP={stage}/app node {stage}/app/scripts/test-farm-social-offline.js'));assert test['result']=='PASS'
 r.update(status='INSTALLING',backup=backup,before=before,beforePm2=pm2(s),tests=test)
 for i,t in enumerate(targets):
  row={'target':t,'before':before[t],'after':hashlib.sha256(raws[i]).hexdigest(),'backup':backup+'/'+str(i)};r['installed'].append(row);(out/'release.json').write_text(json.dumps(r,indent=2));install_one(s,stage+'/offline-final-'+str(i),t,row['before'],row['after'])
 for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
  pos=log_positions(s);r['restarted'].append(name);run(s,'pm2 restart '+name);wait_ready(s,port)
  test=json.loads(run(s,env+f'FEATURE_APP={app} node {stage}/app/scripts/test-farm-social-offline.js'));assert test['result']=='PASS';check_new_logs(s,pos)
 r.update(status='DEPLOYED_PENDING_NATIVE',ready=ready(s),afterPm2=pm2(s));(out/'release.json').write_text(json.dumps(r,indent=2));print(json.dumps({'status':r['status'],'tests':test['count'],'ready':r['ready']}))
except Exception as e:
 r['error']=str(e)
 for row in reversed(r['installed']):
  if hashes(s,[row['target']])[row['target']]==row['after']:install_one(s,row['backup'],row['target'],row['after'],row['before'])
 for n in r['restarted']:run(s,'pm2 restart '+n);wait_ready(s,8083 if n=='lhs-s1002' else 8080)
 r['status']='ROLLED_BACK';(out/'release.json').write_text(json.dumps(r,indent=2));raise
finally:s.close()
