"""Deploy two client artifacts only, without restarting services or changing DB."""
import json,hashlib,shlex
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/server_status_color_20260905';manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/server_status_color_'+stamp
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
r={'backup':backup,'installed':False};changed=[]
try:
 r['beforePm2']=pm2_state(s)
 for k,row in manifest.items():assert run(s,'sha256sum '+shlex.quote(row['remote'])).split()[0]==row['sha256'],'DRIFT:'+k
 run(s,f'install -d -m 700 {backup}')
 f=s.open_sftp()
 for k,row in manifest.items():
  run(s,f'cp -a {shlex.quote(row["remote"])} {backup}/{k}.before')
  f.put(str(OUT/k),backup+'/'+k+'.next')
 f.close();run(s,f'node --check {backup}/main.js.next') if False else None
 # main is checked locally as .js; node --check cannot infer .next extension.
 run(s,f'node --check < {backup}/main.js.next')
 for k,row in manifest.items():
  assert run(s,'sha256sum '+shlex.quote(row['remote'])).split()[0]==row['sha256']
  run(s,f'cp -a {backup}/{k}.next {shlex.quote(row["remote"])}');changed.append(k)
 r['hashes']={k:run(s,'sha256sum '+shlex.quote(row['remote'])).split()[0] for k,row in manifest.items()}
 for k,h in r['hashes'].items():assert h==hashlib.sha256((OUT/k).read_bytes()).hexdigest()
 r['servedMainHash']=run(s,"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v=20260905_server_status_color_v1' | sha256sum").split()[0];assert r['servedMainHash']==r['hashes']['main.js']
 r['afterPm2']=pm2_state(s);assert r['beforePm2']==r['afterPm2'];r['installed']=True
except Exception as e:
 r['error']=str(e)
 for k in changed:run(s,f'cp -a {backup}/{k}.before {shlex.quote(manifest[k]["remote"])}')
 r['rolledBack']=bool(changed);raise
finally:
 s.close();p=OUT/('deploy_'+stamp+'.json');p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(p),'installed':r['installed'],'error':r.get('error'),'hashes':r.get('hashes')}))
