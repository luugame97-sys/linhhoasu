"""Deploy exact system107 condition and durable first-task claim; preserve other tables."""
import json,hashlib,shlex
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,health,pm2_state
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/delegate_first_task_20260905';APP='/linhhoasu/lhs/newServer'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
inputs={'server.bin':OUT/'server.next.bin','client.bin':OUT/'client.next.bin','index.html':OUT/'index.html','task.js':WB.parent/'linhhoasu/lhs/newServer/src/handlers/task.js'}
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup='/linhhoasu/_ai_workbench/backups/delegate_first_task_'+stamp;stage='/linhhoasu/_ai_workbench/temp/delegate_first_task_'+stamp
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'backup':backup,'stage':stage,'installed':False};touched=False
def ready(port):run(s,f"for n in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 result['beforePm2']=pm2_state(s)
 for k,r in manifest.items():assert run(s,'sha256sum '+shlex.quote(r['remote'])).split()[0]==r['sha256'],'REMOTE_DRIFT:'+k
 run(s,f'install -d -m 700 {backup} {stage}/app')
 run(s,f'cp -a {APP}/src {stage}/app/ && ln -s {APP}/node_modules {stage}/app/node_modules')
 sf=s.open_sftp()
 for k,p in inputs.items():
  run(s,f'cp -a {shlex.quote(manifest[k]["remote"])} {backup}/{k}.before')
  sf.put(str(p),stage+'/'+k)
 sf.put(str(inputs['task.js']),stage+'/app/src/handlers/task.js')
 sf.put(str(WB/'tools/test_delegate_first_task.js'),stage+'/test.js');sf.close()
 run(s,f'node --check {stage}/task.js')
 result['stageTest']=run(s,f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH={stage}/server.bin node {stage}/test.js',timeout=60)
 assert '"result":"PASS"' in result['stageTest']
 for k,r in manifest.items():assert run(s,'sha256sum '+shlex.quote(r['remote'])).split()[0]==r['sha256'],'DRIFT_BEFORE_COMMIT:'+k
 run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=30);touched=True
 for k,r in manifest.items():run(s,f'cp -a {stage}/{k} {shlex.quote(r["remote"])}')
 run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=30);ready(8080);ready(8083)
 result['afterHashes']={k:run(s,'sha256sum '+shlex.quote(r['remote'])).split()[0] for k,r in manifest.items()}
 assert all(result['afterHashes'][k]==hashlib.sha256(inputs[k].read_bytes()).hexdigest() for k in inputs)
 result['productionTest']=run(s,f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={APP} LHS_CONFIG_PATH={manifest["server.bin"]["remote"]} node {stage}/test.js',timeout=60)
 result['health']=[health(s,9200),health(s,9201)];result['afterPm2']=pm2_state(s)
 result['httpConfigHash']=run(s,"curl -fsS 'http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin?v=20260905_delegate_first_task_v1' | sha256sum").split()[0]
 assert result['httpConfigHash']==result['afterHashes']['client.bin'];result['installed']=True
except Exception as error:
 result['error']=str(error)
 if touched:
  run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=30)
  for k,r in manifest.items():run(s,f'cp -a {backup}/{k}.before {shlex.quote(r["remote"])}')
  run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=30);ready(8080);ready(8083);result['rolledBack']=True
 raise
finally:
 s.close();target=OUT/('deploy_'+stamp+'.json');target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(target),'installed':result['installed'],'error':result.get('error'),'health':result.get('health')}))
