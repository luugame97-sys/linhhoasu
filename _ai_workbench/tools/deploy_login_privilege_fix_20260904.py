"""Deploy Activity 9 claim/login lifecycle merge with rollback and S1/S2 live QA."""
import hashlib,json,os,shlex,time
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/login_privilege_fix_candidate_20260904';SNAP=ROOT/'temp/login_privilege_prod_snapshot_20260904';APP='/linhhoasu/lhs/newServer'
FILES={APP+'/src/handlers/activity.js':C/'server/handlers/activity.js',APP+'/src/handlers/account.js':C/'server/handlers/account.js'}
baseline={x['remote']:x['sha256'] for x in json.loads((SNAP/'manifest.json').read_text())['files']};BASE={r:baseline[r] for r in FILES}
TOOLS=['redirect_login_privilege_candidate_20260904.js','test_login_privilege_merge_static_20260904.js','test_activity9_candidate.js','test_fortune_event_full.js','test_fortune_event_real_config.js','test_fortune_player_consumption_tracking.js','qa_login_privilege_live_20260904.js']
def dg(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(s,c,timeout=300):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-16000:])
 return out
def pm2(s):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
 return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(js)))
def health(s,port):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0}))})'
 return json.loads(run(s,'curl -fsS http://127.0.0.1:'+str(port)+'/health | node -e '+shlex.quote(js)))
def ready(s,port):run(s,"for i in $(seq 1 90);do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(port)+"/ready||true);[ \"$c\" = 200 ]&&exit 0;sleep 1;done;exit 1",120)
def main():
 expected={r:dg(l) for r,l in FILES.items()};creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/login_privilege_fix_'+stamp;stage='/linhhoasu/_ai_workbench/temp/login_privilege_fix_'+stamp;evidence=ROOT/'temp'/('login_privilege_fix_deploy_'+stamp+'.json');installed=False
 try:
  before=pm2(s);beforeHealth=[health(s,9200),health(s,9201)];remoteBefore={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES}
  if remoteBefore!=BASE:raise RuntimeError('REMOTE_DRIFT:'+json.dumps(remoteBefore,sort_keys=True))
  run(s,'install -d -m 700 '+backup+' '+stage);f=s.open_sftp()
  try:
   for remote,local in FILES.items():name=remote.replace('/','__').strip('_');run(s,'cp -a '+shlex.quote(remote)+' '+shlex.quote(backup+'/'+name));f.put(str(local),stage+'/'+name)
   for tool in TOOLS:f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
  finally:f.close()
  ra=stage+'/'+list(FILES)[0].replace('/','__').strip('_');rc=stage+'/'+list(FILES)[1].replace('/','__').strip('_')
  run(s,'node --check '+ra);run(s,'node --check '+rc);run(s,'node '+stage+'/test_login_privilege_merge_static_20260904.js '+ra+' '+rc)
  env=('LOGIN_PRIVILEGE_APP_ROOT='+APP+' LOGIN_PRIVILEGE_ACTIVITY_CANDIDATE='+ra+' LOGIN_PRIVILEGE_ACCOUNT_CANDIDATE='+rc+' LOGIN_PRIVILEGE_ACTIVITY9_CANDIDATE='+APP+'/src/services/Activity9Service.js '
       'TIEN_DUYEN_CANDIDATE_ROOT=/ TIEN_DUYEN_CLIENT_CONFIG=/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin TIEN_DUYEN_INDEX=/linhhoasu/webgame/game/index.html TIEN_DUYEN_CLIENT_MAIN=/linhhoasu/webgame/game/js/main.min_a6195824.js ')
  preflight={'activity9':run(s,'cd '+APP+' && '+env+' node -r '+stage+'/redirect_login_privilege_candidate_20260904.js '+stage+'/test_activity9_candidate.js',300).strip()}
  for tool in TOOLS[3:6]:preflight[tool]=run(s,'cd '+APP+' && '+env+' FORTUNE_APP_ROOT='+APP+' node -r '+stage+'/redirect_login_privilege_candidate_20260904.js '+stage+'/'+tool,300).strip()
  preflight['core']=run(s,'cd '+APP+' && '+env+' node -r '+stage+'/redirect_login_privilege_candidate_20260904.js scripts/test-core-gameplay-contract.js',300).strip()
  for remote in FILES:name=remote.replace('/','__').strip('_');run(s,'install -m 644 '+stage+'/'+name+' '+remote)
  installed=True
  run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env',180);ready(s,8083);run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',180);ready(s,8080)
  progress=[];deadline=time.time()+720
  while time.time()<deadline:
   hs=[health(s,9200),health(s,9201)];row={'at':datetime.now(timezone.utc).isoformat(),'s1':hs[0],'s2':hs[1]};progress.append(row);print('PRIVILEGE_BOT_PROGRESS='+json.dumps(row),flush=True)
   if all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in hs):break
   time.sleep(30)
  else:raise RuntimeError('BOT_RECONNECT_TIMEOUT')
  live={'1001':run(s,'cd '+APP+' && QA_SERVER_ID=1001 QA_WS_PORT=9200 QA_DB=lhs_s1001 node '+stage+'/qa_login_privilege_live_20260904.js',180).strip()}
  s2Module=run(s,'cd '+APP+' && SERVER_ID=1002 MONGO_URI=mongodb://127.0.0.1:27017/lhs_s1002 node -e '+shlex.quote("const a=require('./src/handlers/activity'),x=require('./src/services/Activity9Service');if(typeof a.handleActivityOperate!=='function'||typeof x.ensureActivity9State!=='function')process.exit(2);console.log(JSON.stringify({result:'PASS',sharedSource:true,activity9:true}))")).strip()
  contracts={};
  for tool in TOOLS[3:6]:contracts[tool]=run(s,'cd '+APP+' && FORTUNE_APP_ROOT='+APP+' node '+stage+'/'+tool,300).strip()
  contracts['core']=run(s,'cd '+APP+' && npm run test:core-contract',300).strip()
  hashes={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};after=pm2(s);finalHealth=[health(s,9200),health(s,9201)];beforeBy={x['name']:x for x in before};afterBy={x['name']:x for x in after};unrelated=['lhs-dist','lhs-admin','lhs-real-bots','lhs-real-bots-s2'];errors=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-real-bots-error.log /root/.pm2/logs/lhs-real-bots-s2-error.log;do tail -180 \"$f\"|grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|Activity9'|tail -12||true;done").strip()
  checks={'preflight':'"sweepOpenDays":3' in preflight['activity9'] and all('PASS' in x or '"result":"ok"' in x for x in preflight.values()),'hashes':hashes==expected,'liveS1':'LOGIN_PRIVILEGE_LIVE=' in live['1001'] and '"checks":18' in live['1001'] and '"remaining":0' in live['1001'],'s2SharedModule':'"result":"PASS"' in s2Module,'contracts':all('PASS' in x or '"result":"ok"' in x for x in contracts.values()),'unrelatedUnchanged':all(beforeBy[n]['pid']==afterBy[n]['pid'] and beforeBy[n]['restarts']==afterBy[n]['restarts'] for n in unrelated),'online':len(after)==6 and all(x['status']=='online' for x in after),'health':all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in finalHealth),'errorsEmpty':errors==''}
  if not all(checks.values()):raise RuntimeError('POSTCHECK_FAILED:'+json.dumps(checks,sort_keys=True))
  payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'checks':checks,'preflight':preflight,'live':live,'s2Module':s2Module,'contracts':contracts,'beforeHashes':remoteBefore,'hashes':hashes,'beforePm2':before,'afterPm2':after,'beforeHealth':beforeHealth,'progress':progress,'finalHealth':finalHealth,'recentErrors':errors};evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':dg(evidence),'checks':checks},ensure_ascii=False))
 except Exception:
  if installed:
   for remote in FILES:name=remote.replace('/','__').strip('_');run(s,'cp -p '+backup+'/'+name+' '+remote)
   run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env',180);ready(s,8083);run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',180);ready(s,8080);print('ROLLBACK=restored',flush=True)
  raise
 finally:
  try:run(s,'rm -rf '+shlex.quote(stage))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
