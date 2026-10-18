"""Deploy 2x authoritative normal-map monster slots to S1/S2 and clients."""
import hashlib,json,os,shlex,time
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/double_monsters_candidate_20260904';S=ROOT/'temp/auto_equip_audit_20260904_053525'
APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/game'
FILES={APP+'/src/services/MapMonsterService.js':C/'server/services/MapMonsterService.js',WEB+'/js/main.min_a6195824.js':C/'client/js/main.min_a6195824.js',WEB+'/index.html':C/'client/index.html'}
expected={x['remote']:x['sha256'] for x in json.loads((S/'manifest.json').read_text())['files']}
c=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/double_monsters_'+stamp;stage='/linhhoasu/_ai_workbench/temp/double_monsters_'+stamp;evidence=ROOT/'temp'/('double_monsters_deploy_'+stamp+'.json');installed=[]
def run(cmd,timeout=180):
 _,o,e=s.exec_command(cmd,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-5000:])
 return out
def h(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pm2():
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>p.name.startsWith("lhs-")).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
 return json.loads(run('pm2 jlist | node -e '+shlex.quote(js)))
def health(port):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,originalSlots:Number(m.originalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0,claims:Number(m.claims)||0,completed:Number(m.completed)||0}))})'
 return json.loads(run('curl -sS http://127.0.0.1:'+port+'/health | node -e '+shlex.quote(js)))
def wait_ready(port):run("for i in $(seq 1 60);do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:"+port+"/ready||true);[ \"$c\" = 200 ]&&exit 0;sleep 1;done;exit 1",90)
try:
 before=pm2();beforeHealth=[health('9200'),health('9201')]
 for remote in FILES:
  if run('sha256sum '+remote).split()[0]!=expected[remote]:raise RuntimeError('REMOTE_DRIFT:'+remote)
 run('install -d -m 700 '+backup+' '+stage);f=s.open_sftp()
 try:
  for remote,local in FILES.items():
   name=remote.replace('/','__').strip('_');run('cp -a '+remote+' '+backup+'/'+name);target=stage+'/'+name;f.put(str(local),target)
  for tool in ['test_double_monsters_contract.js','test_map_bot_contract.js','redirect_auto_equip_candidate.js']:
   f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
 finally:f.close()
 run('node --check '+stage+'/linhhoasu__lhs__newServer__src__services__MapMonsterService.js')
 run('node --check '+stage+'/linhhoasu__webgame__game__js__main.min_a6195824.js')
 run('node '+stage+'/test_double_monsters_contract.js '+stage+'/linhhoasu__lhs__newServer__src__services__MapMonsterService.js '+APP+' '+stage+'/linhhoasu__webgame__game__js__main.min_a6195824.js '+stage+'/linhhoasu__webgame__game__index.html',180)
 for remote,local in FILES.items():run('install -m 644 '+stage+'/'+remote.replace('/','__').strip('_')+' '+remote);installed.append(remote)
 # Capture worker-log boundaries before their one intended restart.
 logLines={n:int(run('wc -l < /root/.pm2/logs/'+n+'-out.log').strip() or 0) for n in ['lhs-real-bots','lhs-real-bots-s2']}
 run('cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env');wait_ready('8083')
 run('cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env');wait_ready('8080')
 run('pm2 restart lhs-real-bots-s2 --update-env');run('pm2 restart lhs-real-bots --update-env');run('pm2 save')
 progress=[];deadline=time.time()+720
 while time.time()<deadline:
  hs=[health('9200'),health('9201')];row={'at':datetime.now(timezone.utc).isoformat(),'s1':hs[0],'s2':hs[1]};progress.append(row);print('MONSTER_PROGRESS='+json.dumps(row),flush=True)
  if all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['originalSlots']==1233 and x['multiplier']==2 and x['invalid']==0 for x in hs):break
  time.sleep(30)
 else:raise RuntimeError('DENSITY_READY_TIMEOUT')
 time.sleep(35);final=[health('9200'),health('9201')]
 served=run('curl -sS http://127.0.0.1:81/js/main.min_a6195824.js');index=run('curl -sS http://127.0.0.1:81/')
 if 'Fq.animBorns._lhsDensity2=!0' not in served or '20260904_double_monsters1' not in index:raise RuntimeError('SERVED_CONTRACT_FAILED')
 selftest=json.loads(run('cd '+APP+' && node src/bots/RealBotWorker.js --self-test').strip().splitlines()[-1]);
 if selftest['mapMonsterSlots']!=40:raise RuntimeError('WORKER_MANIFEST_NOT_DOUBLED')
 # New worker logs must show successful targets in the appended half of at least one map.
 node="const fs=require('fs'),m=require('"+APP+"/src/services/MapMonsterService');let rows=[],args=process.argv.slice(1);for(const n of ['lhs-real-bots','lhs-real-bots-s2']){let a=Number(args.shift()),f='/root/.pm2/logs/'+n+'-out.log',l=fs.readFileSync(f,'utf8').split(/\\n/).slice(a);for(const x of l){let q=x.match(/map-farm open ok .* map=(\\d+).* index=(\\d+)/);if(q){let slots=m.getSlots(Number(q[1]));if(Number(q[2])>=slots.length/2)rows.push({worker:n,map:Number(q[1]),index:Number(q[2]),originalSlots:slots.length/2})}}}console.log('CLONE_HITS='+JSON.stringify(rows.slice(-20)))"
 cloneOut=run('cd '+APP+' && node -e '+shlex.quote(node)+' '+str(logLines['lhs-real-bots'])+' '+str(logLines['lhs-real-bots-s2']))
 cloneHits=json.loads(cloneOut.split('CLONE_HITS=',1)[1].splitlines()[0])
 if not cloneHits:raise RuntimeError('NO_CLONED_TARGET_LIVE_PROOF')
 after=pm2();errors=run("for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-real-bots-error.log /root/.pm2/logs/lhs-real-bots-s2-error.log;do echo FILE=$f;tail -120 \"$f\"|grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|invalid_target'|tail -10||true;done")
 payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'before':before,'after':after,'beforeHealth':beforeHealth,'progress':progress,'final':final,'workerSelfTestSlots':selftest['mapMonsterSlots'],'cloneTargetHits':cloneHits,'errors':errors,'hashes':{r:h(l) for r,l in FILES.items()}}
 evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':h(evidence),'slots':2466,'cloneHits':len(cloneHits),'hashes':payload['hashes']}))
except Exception:
 for remote in reversed(installed):
  try:run('cp -a '+backup+'/'+remote.replace('/','__').strip('_')+' '+remote)
  except:pass
 if installed:
  for name in ['lhs-s1002','lhs-s1001','lhs-real-bots-s2','lhs-real-bots']:
   try:run('pm2 restart '+name+' --update-env')
   except:pass
  try:run('pm2 save')
  except:pass
 raise
finally:s.close()
