"""Deploy only task reward routing, with isolated source fixture and rollback."""
import hashlib,json,shlex
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,health,pm2_state
WB=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer';local=WB.parent/'linhhoasu/lhs/newServer/src/handlers/task.js'
expected=json.loads((WB/'temp/gem_source_fix_20260905/audit.json').read_text(encoding='utf-8'))['sourceHashes']['src/handlers/task.js']
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/gem_task_'+stamp;backup='/linhhoasu/_ai_workbench/backups/gem_task_'+stamp
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'stage':stage,'backup':backup,'installed':False,'beforeHash':expected};touched=False
def ready(port):run(s,f"for n in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 assert run(s,f'sha256sum {APP}/src/handlers/task.js').split()[0]==expected,'source drift'
 result['beforePm2']=pm2_state(s)
 run(s,f'install -d -m 700 {stage}/app {backup}')
 run(s,f'cp -a {APP}/src {stage}/app/ && ln -s {APP}/node_modules {stage}/app/node_modules')
 f=s.open_sftp();f.put(str(local),stage+'/app/src/handlers/task.js');f.put(str(WB/'tools/test_gem_task_source_20260905.js'),stage+'/test.js');f.close()
 run(s,f'node --check {stage}/app/src/handlers/task.js')
 env=f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
 result['stageTest']=run(s,f'{env} node {stage}/test.js',timeout=60);assert '"result":"PASS"' in result['stageTest']
 assert run(s,f'sha256sum {APP}/src/handlers/task.js').split()[0]==expected
 run(s,f'cp -a {APP}/src/handlers/task.js {backup}/task.js.before')
 run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=30);touched=True
 run(s,f'cp -a {stage}/app/src/handlers/task.js {APP}/src/handlers/task.js')
 run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=30);ready(8080);ready(8083)
 result['afterHash']=run(s,f'sha256sum {APP}/src/handlers/task.js').split()[0];assert result['afterHash']==hashlib.sha256(local.read_bytes()).hexdigest()
 result['productionTest']=run(s,f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={APP} LHS_CONFIG_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node {stage}/test.js',timeout=60)
 result['health']=[health(s,9200),health(s,9201)];result['afterPm2']=pm2_state(s);result['installed']=True
except Exception as error:
 result['error']=str(error)
 if touched:
  run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=30);run(s,f'cp -a {backup}/task.js.before {APP}/src/handlers/task.js');run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=30);ready(8080);ready(8083);result['rolledBack']=True
 raise
finally:
 s.close();target=WB/'temp/gem_source_fix_20260905'/('deploy_'+stamp+'.json');target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(target),'installed':result['installed'],'error':result.get('error'),'health':result.get('health')}))
