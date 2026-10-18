"""Guarded deploy of opt-in auto-equip on the two game nodes."""
from __future__ import annotations
import hashlib,json,os,shlex,time
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1]; C=ROOT/'temp/auto_equip_candidate_20260904'; S=ROOT/'temp/auto_equip_audit_20260904_044658'
APP='/linhhoasu/lhs/newServer'; CLIENT='/linhhoasu/webgame/game'
MAP={APP+'/src/services/EquipService.js':C/'server/services/EquipService.js',APP+'/src/handlers/item.js':C/'server/handlers/item.js',CLIENT+'/js/main.min_a6195824.js':C/'client/js/main.min_a6195824.js',CLIENT+'/index.html':C/'client/index.html'}
expected={x['remote']:x['sha256'] for x in json.loads((S/'manifest.json').read_text())['files']}
cred=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
if cred[0].strip()!='103.116.105.154' or cred[1].strip()!='root':raise RuntimeError('TARGET_MISMATCH')
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/auto_equip_upgrade_'+stamp;evidence=ROOT/'temp'/('auto_equip_upgrade_deploy_'+stamp+'.json')
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(cred[0].strip(),username='root',password=cred[2],look_for_keys=False,allow_agent=False,timeout=20)
installed=[];staged=[]
def run(cmd,timeout=180):
 _,o,e=ssh.exec_command(cmd,timeout=timeout);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-5000:])
 return out
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def procs():
 script='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
 return json.loads(run('pm2 jlist | node -e '+shlex.quote(script)))
def bot_counts():
 script='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,invalid:Number((r.mapMonsters||{}).invalid)||0}))})'
 return [json.loads(run('curl -sS http://127.0.0.1:'+p+'/health | node -e '+shlex.quote(script))) for p in ['9200','9201']]
def wait_ready(port):run("for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:"+port+"/ready||true); [ \"$c\" = 200 ] && exit 0;sleep 1;done;exit 1",90)
try:
 before=procs();before_bots=bot_counts()
 for remote in MAP:
  if run('sha256sum '+shlex.quote(remote)).split()[0]!=expected[remote]:raise RuntimeError('REMOTE_DRIFT:'+remote)
 run('install -d -m 700 '+backup)
 sftp=ssh.open_sftp()
 try:
  for remote,local in MAP.items():
   name=remote.replace('/','__').strip('_');base,ext=os.path.splitext(remote);target=base+'.auto-equip-'+stamp+ext;run('cp -a '+shlex.quote(remote)+' '+shlex.quote(backup+'/'+name));sftp.put(str(local),target);staged.append(target)
  for tool in ['test_auto_delegate_contract.js','test_auto_equip_handlers.js','test_auto_equip_upgrade_client.js','redirect_auto_equip_candidate.js','qa_auto_equip_live.js']:
   target='/linhhoasu/_ai_workbench/temp/'+tool+'.'+stamp;sftp.put(str(ROOT/'tools'/tool),target);staged.append(target)
 finally:sftp.close()
 svc=APP+'/src/services/EquipService.auto-equip-'+stamp+'.js';item=APP+'/src/handlers/item.auto-equip-'+stamp+'.js';main=CLIENT+'/js/main.min_a6195824.auto-equip-'+stamp+'.js';index=CLIENT+'/index.auto-equip-'+stamp+'.html'
 for f in [svc,item,main]:run('node --check '+shlex.quote(f))
 run('APP_ROOT='+APP+' EQUIP_SERVICE_PATH='+shlex.quote(svc)+' node '+shlex.quote(staged[4]))
 run('node '+shlex.quote(staged[5])+' '+shlex.quote(item)+' '+APP)
 run('node '+shlex.quote(staged[6])+' '+shlex.quote(main)+' '+shlex.quote(index))
 # Core contract redirects the normal modules to adjacent candidate filenames.
 svc_adj=APP+'/src/services/EquipService.auto-equip-candidate.js';item_adj=APP+'/src/handlers/item.auto-equip-candidate.js'
 run('cp '+shlex.quote(svc)+' '+svc_adj+';cp '+shlex.quote(item)+' '+item_adj);staged.extend([svc_adj,item_adj])
 run('cd '+APP+' && AUTO_EQUIP_APP_ROOT='+APP+' node -r '+shlex.quote(staged[7])+' scripts/test-core-gameplay-contract.js',180)
 for remote,local in MAP.items():
  base,ext=os.path.splitext(remote);target=base+'.auto-equip-'+stamp+ext;run('install -m 644 '+shlex.quote(target)+' '+shlex.quote(remote));installed.append(remote)
  if run('sha256sum '+shlex.quote(remote)).split()[0]!=digest(local):raise RuntimeError('HASH_MISMATCH')
 run('cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env',180);wait_ready('8083')
 run('cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',180);wait_ready('8080')
 # Do not compete with the staggered login storm from both existing bot workers.
 progress=[];deadline=time.time()+720
 while time.time()<deadline:
  b=bot_counts();progress.append({'phase':'pre-live-qa','at':datetime.now(timezone.utc).isoformat(),'s1':b[0],'s2':b[1]});print('BOT_PROGRESS='+json.dumps(progress[-1]),flush=True)
  if all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['invalid']==0 for x in b):break
  time.sleep(30)
 else:raise RuntimeError('BOT_PRE_QA_RECONNECT_TIMEOUT')
 time.sleep(15)
 live=run('cd '+APP+' && node '+shlex.quote(staged[8]),120)
 if 'AUTO_EQUIP_LIVE=' not in live or 'AUTO_EQUIP_CLEANUP=' not in live:raise RuntimeError('LIVE_QA_MARKER_MISSING:'+live[-1000:])
 served=run('curl -sS --max-time 30 http://127.0.0.1:81/js/main.min_a6195824.js');served_index=run('curl -sS --max-time 10 http://127.0.0.1:81/')
 for marker in ['autoEquipPowerUpgrade=function','Tự động mặc trang bị mạnh hơn','autoDelegate:!0','[LHS] AutoEquip protected equips','_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}']:
  if marker not in served:raise RuntimeError('SERVED_MARKER_MISSING:'+marker)
 if '20260904_auto_equip_upgrade1' not in served_index:raise RuntimeError('CACHE_MARKER_MISSING')
 run('pm2 save')
 # Wait for both unchanged workers to reconnect instead of restarting them.
 deadline=time.time()+720
 while time.time()<deadline:
  b=bot_counts();progress.append({'at':datetime.now(timezone.utc).isoformat(),'s1':b[0],'s2':b[1]});print('BOT_PROGRESS='+json.dumps(progress[-1]),flush=True)
  if all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['invalid']==0 for x in b):break
  time.sleep(30)
 else:raise RuntimeError('BOT_RECONNECT_TIMEOUT')
 after=procs();errors=run("for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log;do echo FILE=$f;tail -150 \"$f\"|grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|AUTO_EQUIP'|tail -20||true;done")
 payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'beforeProcesses':before,'afterProcesses':after,'beforeBots':before_bots,'botProgress':progress,'liveQa':live,'errorAudit':errors,'hashes':{r:digest(l) for r,l in MAP.items()}}
 evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':digest(evidence),'hashes':payload['hashes']},ensure_ascii=False))
except Exception:
 for remote in reversed(installed):
  try:run('cp -a '+shlex.quote(backup+'/'+remote.replace('/','__').strip('_'))+' '+shlex.quote(remote))
  except:pass
 if installed:
  try:run('cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env',180);run('cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',180);run('pm2 save')
  except:pass
 raise
finally:
 for f in staged:
  try:run('rm -f -- '+shlex.quote(f))
  except:pass
 ssh.close()
