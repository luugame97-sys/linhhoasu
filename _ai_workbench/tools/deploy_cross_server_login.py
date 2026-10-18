import json,hashlib,shlex
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,health,pm2_state
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/cross_server_login_20260905';APP='/linhhoasu/lhs/newServer';manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'));files=['src/services/AccountService.js','src/handlers/account.js']
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/cross_server_login_'+stamp;stage='/linhhoasu/_ai_workbench/temp/cross_server_login_'+stamp
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
r={'backup':backup,'stage':stage,'installed':False};touched=False
def ready(p):run(s,f"for n in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 r['beforePm2']=pm2_state(s)
 for f in files:assert run(s,'sha256sum '+shlex.quote(APP+'/'+f)).split()[0]==manifest[f],'DRIFT:'+f
 run(s,f'install -d -m 700 {stage}/app {backup}')
 run(s,f'cp -a {APP}/src {stage}/app/ && ln -s {APP}/node_modules {stage}/app/node_modules')
 sf=s.open_sftp()
 for i,f in enumerate(files):sf.put(str(OUT/f),stage+'/app/'+f);run(s,f'cp -a {APP}/{f} {backup}/{i}.before');run(s,'node --check '+stage+'/app/'+f)
 sf.put(str(WB/'tools/test_cross_server_session.js'),stage+'/test.js');sf.put(str(WB/'tools/qa_native_s2_switch.js'),stage+'/qa.js');sf.close()
 r['contract']=run(s,f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app node {stage}/test.js',timeout=60);assert '"result":"PASS"' in r['contract']
 run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=35);touched=True
 for f in files:run(s,f'cp -a {stage}/app/{f} {APP}/{f}')
 run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=35);ready(8080);ready(8083)
 r['e2e']=run(s,f'EXPECT_SWITCH_FIXED=1 node {stage}/qa.js',timeout=60);assert '"result":"PASS"' in r['e2e'];assert 'SWITCH_QA_CLEANUP=0' in r['e2e']
 r['hashes']={f:run(s,'sha256sum '+APP+'/'+f).split()[0] for f in files};assert all(r['hashes'][f]==hashlib.sha256((OUT/f).read_bytes()).hexdigest() for f in files)
 r['health']=[health(s,9200),health(s,9201)];r['afterPm2']=pm2_state(s);r['installed']=True
except Exception as e:
 r['error']=str(e)
 if touched:
  run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=35)
  for i,f in enumerate(files):run(s,f'cp -a {backup}/{i}.before {APP}/{f}')
  run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=35);ready(8080);ready(8083);r['rolledBack']=True
 raise
finally:
 s.close();p=OUT/('deploy_'+stamp+'.json');p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(p),'installed':r['installed'],'error':r.get('error'),'contract':r.get('contract'),'e2e':r.get('e2e')}))
