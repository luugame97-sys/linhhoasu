from pathlib import Path
import sys,json,hashlib
sys.path.insert(0,str(Path('_ai_workbench/tools').resolve()))
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run,hashes,ready,pm2,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions
from release_fashion_box_open_20260909 import check_new_logs
from datetime import datetime,timezone
out=Path('_ai_workbench/temp/farm_assist_completion_20260909');out.mkdir(exist_ok=True)
r={};s=connect();target='/linhhoasu/lhs/newServer/src/services/FarmSocialService.js';stage='/linhhoasu/_ai_workbench/temp/farm_social_offline_20260909_095052'
try:
 before=hashes(s,[target])[target];expected=json.loads(Path('_ai_workbench/temp/farm_social_offline_20260909/release.json').read_text())['expected'][target];assert before==expected
 raw=Path('linhhoasu/lhs/newServer/src/services/FarmSocialService.js').read_bytes();after=hashlib.sha256(raw).hexdigest();b='/linhhoasu/_ai_workbench/backups/farm_assist_completion_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,'install -d -m 700 '+b)
 run(s,'cp -a '+target+' '+b+'/service.before');assert hashes(s,[b+'/service.before'])[b+'/service.before']==before
 with s.open_sftp()as f:
  f.put(str(Path('linhhoasu/lhs/newServer/src/services/FarmSocialService.js').resolve()),stage+'/app/src/services/FarmSocialService.js')
  f.put(str(Path('linhhoasu/lhs/newServer/scripts/test-farm-social-offline.js').resolve()),stage+'/app/scripts/test-farm-social-offline.js')
 env=f'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin FEATURE_GAME=/linhhoasu/webgame/game FEATURE_ACORN={stage}/tools/acorn.js FARM_BASE_TEST={stage}/app/scripts/test-farm-alchemy-fix.js '
 test=json.loads(run(s,env+f'FEATURE_APP={stage}/app node {stage}/app/scripts/test-farm-social-offline.js'));assert test['result']=='PASS'
 r={'before':before,'after':after,'backup':b,'target':target,'beforePm2':pm2(s),'tests':test,'status':'INSTALLING','restarted':[]};(out/'release.json').write_text(json.dumps(r,indent=2))
 install_one(s,stage+'/app/src/services/FarmSocialService.js',target,before,after)
 try:
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   pos=log_positions(s);r['restarted'].append(name);run(s,'pm2 restart '+name);wait_ready(s,port)
   test=json.loads(run(s,env+f'FEATURE_APP=/linhhoasu/lhs/newServer node {stage}/app/scripts/test-farm-social-offline.js'));assert test['result']=='PASS';check_new_logs(s,pos)
  r['afterPm2']=pm2(s);names=r['restarted'];assert [x for x in r['beforePm2']if x['name']not in names]==[x for x in r['afterPm2']if x['name']not in names]
  assert hashes(s,[target])[target]==after;r['status']='DEPLOYED_PENDING_NATIVE_QA';r['ready']=ready(s)
 except Exception:
  install_one(s,b+'/service.before',target,after,before)
  for n in r['restarted']:run(s,'pm2 restart '+n);wait_ready(s,8083 if n=='lhs-s1002' else 8080)
  r['status']='ROLLED_BACK';raise
 finally:(out/'release.json').write_text(json.dumps(r,indent=2))
 print(json.dumps({'status':r['status'],'tests':test['count'],'ready':r['ready']}))
finally:s.close()
