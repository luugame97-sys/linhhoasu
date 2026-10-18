"""Live QA and postcheck; scoped to ephemeral QA roles only."""
import json,sys,shlex
from datetime import datetime,timezone
import paramiko
from release_fishing_balance_20260906 import WB,ROOT,APP,FILES,run,hashes,pm2,ready
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
deploy=json.loads((ROOT/'deploy.json').read_text(encoding='utf-8'));stage=deploy['stage'];result={'startedAt':datetime.now(timezone.utc).isoformat()}
try:
 f=s.open_sftp();f.put(str(WB/'tools/qa_fishing_balance_live_20260906.js'),stage+'/tools/qa_fishing_balance_live_20260906.js');f.close()
 out=run(s,'node '+stage+'/tools/qa_fishing_balance_live_20260906.js',timeout=60);result['qa']=json.loads(out);assert result['qa']['result']=='PASS'
 result['hashes']=hashes(s,list(deploy['expected']));assert result['hashes']==deploy['expected']
 result['ready']=ready(s);assert result['ready']=={'8080':200,'8083':200}
 result['pm2']=pm2(s);assert result['pm2']==deploy['afterPm2']
 result['gameErrorTail']=run(s,"tail -n 60 /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log").strip()
 # Evidence can contain operational logs; keep it private in the workbench.
 result['result']='PASS';(ROOT/'live-qa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'result':'PASS','qa':result['qa'],'ready':result['ready'],'sourceHashVerified':True,'processesStable':True}))
except Exception as e:
 result.update(result='FAIL',error=str(e));(ROOT/'live-qa-error.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');raise
finally:s.close()
