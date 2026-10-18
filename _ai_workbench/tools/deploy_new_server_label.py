import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state,health
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/new_server_label_20260905';APP='/linhhoasu/lhs/newServer';remote=APP+'/src/handlers/serverList.js';local=WB.parent/'linhhoasu/lhs/newServer/src/handlers/serverList.js';expected=json.loads((OUT/'snapshot.json').read_text(encoding='utf-8'))['hash'];stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/new_server_label_'+stamp
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
r={'backup':backup,'installed':False};touched=False
def ready(port):run(s,f"for n in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 assert run(s,'sha256sum '+remote).split()[0]==expected
 r['beforePm2']=pm2_state(s);run(s,f'install -d -m 700 {backup}');run(s,f'cp -a {remote} {backup}/serverList.before.js')
 f=s.open_sftp();f.put(str(local),backup+'/serverList.next.js');f.put(str(WB/'tools/test_new_server_label.js'),backup+'/test.js');f.put(str(WB/'tools/qa_new_server_label.js'),backup+'/qa.js');f.close()
 run(s,f'node --check {backup}/serverList.next.js');r['unit']=run(s,f'node {backup}/test.js {backup}/serverList.next.js')
 run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=35);touched=True;run(s,f'cp -a {backup}/serverList.next.js {remote}');run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=35);ready(8080);ready(8083)
 r['qa']=run(s,f'node {backup}/qa.js',timeout=60);assert '"result":"PASS"' in r['qa'];assert 'LATEST_QA_CLEANUP=0' in r['qa']
 r['hash']=run(s,'sha256sum '+remote).split()[0];assert r['hash']==hashlib.sha256(local.read_bytes()).hexdigest()
 r['health']=[health(s,9200),health(s,9201)];r['afterPm2']=pm2_state(s);r['installed']=True
except Exception as e:
 r['error']=str(e)
 if touched:run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=35);run(s,f'cp -a {backup}/serverList.before.js {remote}');run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=35);ready(8080);ready(8083);r['rollback']=True
 raise
finally:
 s.close();p=OUT/('deploy_'+stamp+'.json');p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(p),'installed':r['installed'],'error':r.get('error'),'qa':r.get('qa')}))
