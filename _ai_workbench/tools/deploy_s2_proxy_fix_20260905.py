import json,hashlib,shlex
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state,health
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/s2_login_20260905';remote='/linhhoasu/lhs/newServer/src/net/HTTPServer.js';expected='e431418a1f450819943256135678adabe51708fa24ab53cd4902dfa52efcb9cf';stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/s2_proxy_'+stamp
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'backup':backup,'installed':False};touched=False
def ready():run(s,"for n in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 result['beforePm2']=pm2_state(s);assert run(s,'sha256sum '+remote).split()[0]==expected
 run(s,f'install -d -m 700 {backup}');run(s,f'cp -a {remote} {backup}/HTTPServer.before.js')
 f=s.open_sftp();f.put(str(OUT/'HTTPServer.js'),backup+'/HTTPServer.next.js');f.put(str(WB/'tools/probe_s2_auth_20260905.js'),backup+'/probe.js');f.close()
 run(s,f'node --check {backup}/HTTPServer.next.js');run(s,f'cp -a {backup}/HTTPServer.next.js {remote}');touched=True
 # Only S1 handles the ingress proxy. No restart of S2 or unrelated processes.
 run(s,'pm2 restart lhs-s1001',timeout=35);ready()
 result['e2e']=run(s,f'S2_EXPECT_FIXED=1 node {backup}/probe.js',timeout=60)
 assert '"player500":true' in result['e2e'];assert 'QA_CLEANUP=done' in result['e2e']
 result['afterHash']=run(s,'sha256sum '+remote).split()[0];assert result['afterHash']==hashlib.sha256((OUT/'HTTPServer.js').read_bytes()).hexdigest()
 result['health']=[health(s,9200),health(s,9201)];result['afterPm2']=pm2_state(s);result['installed']=True
except Exception as e:
 result['error']=str(e)
 if touched:run(s,f'cp -a {backup}/HTTPServer.before.js {remote}');run(s,'pm2 restart lhs-s1001',timeout=35);ready();result['rollback']=True
 raise
finally:
 s.close();p=OUT/('deploy_'+stamp+'.json');p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(p),'installed':result['installed'],'error':result.get('error'),'e2e':result.get('e2e')}))
