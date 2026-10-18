"""Promote only two client artifacts with baseline/hash/HTTP/rollback guards."""
import json,hashlib,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from stage_fashion_fix_20260905 import run,pm2
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/component_client_fix_20260905';manifest=json.loads((OUT/'manifest.json').read_text());tests=json.loads((OUT/'test_results.json').read_text());equip=json.loads((OUT/'equip_contract.json').read_text())
assert tests['result']=='PASS' and tests['checks']>=17 and equip['result']=='PASS'
if '--layout-followup' in sys.argv:
 previous=json.loads((OUT/'deploy_20260905_163554.json').read_text());assert previous['installed']
 for key in ['main.js','index.html']:manifest[key]['sha256']=previous['hashes'][key]
targets=['main.js','index.html'];stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/component_client_'+stamp
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
r={'backup':backup,'installed':False,'targets':targets,'startedAt':datetime.now(timezone.utc).isoformat()};changed=[]
try:
 r['beforePm2']=pm2(s)
 for name,row in manifest.items():assert run(s,'sha256sum '+shlex.quote(row['remote'])).split()[0]==row['sha256'],'DRIFT '+name
 for name in targets:assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==tests['hashes'][name]
 run(s,f'install -d -m 700 {backup}')
 f=s.open_sftp()
 try:
  for name in targets:
   run(s,f'cp -a {shlex.quote(manifest[name]["remote"])} {backup}/{name}.before')
   f.put(str(OUT/name),backup+'/'+name+'.next');f.chmod(backup+'/'+name+'.next',0o644)
 finally:f.close()
 run(s,f'node --check < {backup}/main.js.next')
 for name in targets:
  assert run(s,'sha256sum '+shlex.quote(manifest[name]['remote'])).split()[0]==manifest[name]['sha256']
  run(s,f'cp -a {backup}/{name}.next {shlex.quote(manifest[name]["remote"])}');changed.append(name)
 r['hashes']={name:run(s,'sha256sum '+shlex.quote(manifest[name]['remote'])).split()[0]for name in targets};assert r['hashes']==tests['hashes']
 r['servedMainHash']=run(s,"curl -fsS --max-time 15 'http://127.0.0.1:81/js/main.min_a6195824.js?v=20260905_component_native_v2' | sha256sum").split()[0];assert r['servedMainHash']==r['hashes']['main.js']
 r['servedIndexHash']=run(s,"curl -fsS --max-time 15 'http://127.0.0.1:81/' | sha256sum").split()[0];assert r['servedIndexHash']==r['hashes']['index.html']
 icon='http://127.0.0.1:81/update/resource/assets/atlas_ui/0_common/icon/prop/icon_fashion_2804_d65f786a.png'
 r['iconHash']=run(s,'curl -fsS --max-time 10 '+shlex.quote(icon)+' | sha256sum').split()[0]
 assert r['iconHash']==hashlib.sha256((OUT/'assets/icon_fashion_2804_d65f786a.png').read_bytes()).hexdigest()
 r['ready']={p:run(s,f'curl -fsS -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{p}/ready')for p in[8080,8083]};assert all(v=='200'for v in r['ready'].values())
 r['afterPm2']=pm2(s);assert r['beforePm2']==r['afterPm2']
 r['unchanged']={name:run(s,'sha256sum '+shlex.quote(row['remote'])).split()[0]==row['sha256'] for name,row in manifest.items()if name not in targets};assert all(r['unchanged'].values())
 r['installed']=True
except Exception as e:
 r['error']=str(e)
 for name in changed:run(s,f'cp -a {backup}/{name}.before {shlex.quote(manifest[name]["remote"])}')
 r['rolledBack']=bool(changed);raise
finally:
 r['finishedAt']=datetime.now(timezone.utc).isoformat();(OUT/('deploy_'+stamp+'.json')).write_text(json.dumps(r,indent=2)+'\n');s.close()
print(json.dumps({'installed':r['installed'],'backup':backup,'hashes':r['hashes'],'ready':r['ready'],'pm2Unchanged':r['beforePm2']==r['afterPm2'],'configAndResourcesUnchanged':all(r['unchanged'].values())}))
