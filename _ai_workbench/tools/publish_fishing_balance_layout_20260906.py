"""Client-only readability followup; no gameplay/database writes or restarts."""
import hashlib,json,sys
from datetime import datetime,timezone
import paramiko
from release_fishing_balance_20260906 import WB,ROOT,GAME,run,hashes,pm2
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
deploy=json.loads((ROOT/'deploy.json').read_text());stage=json.loads((ROOT/'stage.json').read_text());target=GAME+'/js/main.min_a6195824.js';index=GAME+'/index.html';backup='/linhhoasu/_ai_workbench/backups/fishing_balance_layout_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');done=[]
try:
 assert hashes(s,list(deploy['expected']))==deploy['expected'];before=pm2(s)
 old=(ROOT/'index.fixed.html').read_text(encoding='utf-8');new=old.replace('20260906_fishing_custom_balance_v1','20260906_fishing_custom_balance_v1_layout');assert new!=old;(ROOT/'index.fixed.html').write_text(new,encoding='utf-8')
 run(s,'install -d -m 700 '+backup);run(s,'cp -a '+target+' '+backup+'/main.before');run(s,'cp -a '+index+' '+backup+'/index.before')
 f=s.open_sftp();f.put(str(ROOT/'main.fixed.js'),backup+'/main.next.js');f.put(str(ROOT/'index.fixed.html'),backup+'/index.next.html');f.close();run(s,'node --check '+backup+'/main.next.js')
 for path,name in [(target,'main'),(index,'index')]:
  done.append((path,name));run(s,'install -m 644 '+backup+'/'+name+('.next.js'if name=='main'else'.next.html')+' '+path)
 expected={target:hashlib.sha256((ROOT/'main.fixed.js').read_bytes()).hexdigest(),index:hashlib.sha256((ROOT/'index.fixed.html').read_bytes()).hexdigest()};assert hashes(s,list(expected))==expected
 for path,url in [(target,'js/main.min_a6195824.js'),(index,'')]:assert run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/'+url+' | sha256sum').split()[0]==expected[path]
 assert pm2(s)==before
 (ROOT/'deploy-before-layout.json').write_text(json.dumps(deploy,indent=2)+'\n');deploy['expected'].update(expected);deploy['hashes'].update(expected);deploy.update(servedMainHash=expected[target],servedIndexHash=expected[index],layoutBackup=backup)
 (ROOT/'deploy.json').write_text(json.dumps(deploy,indent=2)+'\n');stage.update(clientHash=expected[target],indexHash=expected[index]);(ROOT/'stage.json').write_text(json.dumps(stage,indent=2)+'\n')
 print(json.dumps({'result':'PASS','backup':backup,'hashes':expected,'pm2Unchanged':True}))
except Exception:
 for path,name in done:run(s,'install -m 644 '+backup+'/'+name+'.before '+path)
 raise
finally:s.close()
