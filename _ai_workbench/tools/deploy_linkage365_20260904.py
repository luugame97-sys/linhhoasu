"""Deploy the 365-day Great Ruler linkage window with rollback and live QA."""
import hashlib,json,os,posixpath,shlex,time
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/linkage365_candidate_20260904';SNAP=ROOT/'temp/linkage365_prod_snapshot_20260904';APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/game'
FILES={
 APP+'/src/handlers/serverList.js':C/'server/serverList.js',
 APP+'/src/handlers/serverList1.js':C/'server/serverList1.js',
 '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin':C/'config/server/config_e5ac72c2.bin',
 WEB+'/update/resource/assets/excel/config_e5ac72c2.bin':C/'config/client/config_e5ac72c2.bin',
 WEB+'/js/start.min_52ac8d58.js':C/'client/js/start.min_52ac8d58.js',
 WEB+'/index.html':C/'client/index.html',
}
BASE={x['remote']:x['sha256'] for x in json.loads((SNAP/'manifest.json').read_text())['files']};START=1788517080000;END=1820053080000
TOOLS=['test_linkage365_contract_20260904.js','test_fortune_event_full.js','test_fortune_event_real_config.js','test_fortune_player_consumption_tracking.js','test_map_bot_contract.js','qa_linkage_http_param_20260904.js','qa_linkage_map_990008_live_20260904.js']
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(s,c,timeout=300):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-12000:])
 return out
def pm2(s):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
 return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(js)))
def health(s,port):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0}))})'
 return json.loads(run(s,'curl -fsS http://127.0.0.1:'+str(port)+'/health | node -e '+shlex.quote(js)))
def wait_ready(s,port):run(s,"for i in $(seq 1 90);do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(port)+"/ready||true);[ \"$c\" = 200 ]&&exit 0;sleep 1;done;exit 1",120)
def main():
 expected={r:digest(l) for r,l in FILES.items()};creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/linkage365_'+stamp;stage='/linhhoasu/_ai_workbench/temp/linkage365_'+stamp;evidence=ROOT/'temp'/('linkage365_deploy_'+stamp+'.json');installed=False;extra=[]
 try:
  before=pm2(s);beforeHealth=[health(s,9200),health(s,9201)];remoteBefore={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES}
  if remoteBefore!=BASE:raise RuntimeError('REMOTE_DRIFT:'+json.dumps(remoteBefore,sort_keys=True))
  run(s,'install -d -m 700 '+backup+' '+stage);f=s.open_sftp()
  try:
   for remote,local in FILES.items():
    name=remote.replace('/','__').strip('_');run(s,'cp -a '+shlex.quote(remote)+' '+shlex.quote(backup+'/'+name));target=stage+'/'+local.relative_to(C).as_posix();run(s,'install -d -m 700 '+shlex.quote(posixpath.dirname(target)));f.put(str(local),target)
   for tool in TOOLS:f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
   adjacent=APP+'/src/handlers/serverList.linkage365-'+stamp+'.js';f.put(str(C/'server/serverList.js'),adjacent);extra.append(adjacent)
  finally:f.close()
  staged={r:stage+'/'+l.relative_to(C).as_posix() for r,l in FILES.items()};rmain=staged[APP+'/src/handlers/serverList.js'];rmain1=staged[APP+'/src/handlers/serverList1.js'];rstart=staged[WEB+'/js/start.min_52ac8d58.js'];rindex=staged[WEB+'/index.html'];rservercfg=staged['/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin']
  for p in [rmain,rmain1,rstart]:run(s,'node --check '+shlex.quote(p))
  contract=run(s,'node '+stage+'/test_linkage365_contract_20260904.js '+stage+' '+APP).strip()
  paramPre=run(s,'cd '+APP+' && node -e '+shlex.quote("const x=require('"+extra[0]+"').handleReqParams({keyList:['linkage']});console.log(x.param.linkage)")).strip().splitlines()[-1]
  if json.loads(paramPre)!={'index':7,'start':START,'end':END}:raise RuntimeError('STAGED_PARAM_MISMATCH:'+paramPre)
  fortune={}
  for tool in TOOLS[1:4]:fortune[tool]=run(s,'cd '+APP+' && CONFIG_BIN_PATH='+rservercfg+' FORTUNE_APP_ROOT='+APP+' node '+stage+'/'+tool,300).strip()
  core=run(s,'cd '+APP+' && CONFIG_BIN_PATH='+rservercfg+' npm run test:core-contract',300).strip()
  mapContract=run(s,'cd '+APP+' && MAP_BOT_APP_ROOT='+APP+' CONFIG_BIN_PATH='+rservercfg+' node '+stage+'/test_map_bot_contract.js',300).strip()
  for remote in FILES:run(s,'install -m 644 '+shlex.quote(staged[remote])+' '+shlex.quote(remote))
  installed=True
  run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env',180);wait_ready(s,8083);run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',180);wait_ready(s,8080)
  progress=[];deadline=time.time()+720
  while time.time()<deadline:
   hs=[health(s,9200),health(s,9201)];row={'at':datetime.now(timezone.utc).isoformat(),'s1':hs[0],'s2':hs[1]};progress.append(row);print('LINKAGE_BOT_PROGRESS='+json.dumps(row),flush=True)
   if all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in hs):break
   time.sleep(30)
  else:raise RuntimeError('BOT_RECONNECT_TIMEOUT')
  httpQa=run(s,'cd '+APP+' && node '+stage+'/qa_linkage_http_param_20260904.js',120).strip();mapQa=run(s,'cd '+APP+' && node '+stage+'/qa_linkage_map_990008_live_20260904.js',180).strip()
  runtime=run(s,'cd '+APP+' && node -e '+shlex.quote("const C=require('./src/services/ConfigService');C.loadAllTables();const x=C.get('ActivityBaseConfig');console.log(JSON.stringify({start:x.linkageStartTime,end:x.linkageEndTime,mapId:x.mapId,open:x.linkageStartTime<=Date.now()&&Date.now()<x.linkageEndTime}))")).strip().splitlines()[-1]
  served={
   'configHash':run(s,'curl -fsS http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin | sha256sum').split()[0],
   'startHash':run(s,'curl -fsS http://127.0.0.1:81/js/start.min_52ac8d58.js | sha256sum').split()[0],
   'index':run(s,'curl -fsS http://127.0.0.1:81/'),
  }
  hashes={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};after=pm2(s);finalHealth=[health(s,9200),health(s,9201)];beforeBy={x['name']:x for x in before};afterBy={x['name']:x for x in after};unrelated=['lhs-dist','lhs-admin','lhs-real-bots','lhs-real-bots-s2']
  errors=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-real-bots-error.log /root/.pm2/logs/lhs-real-bots-s2-error.log;do tail -150 \"$f\"|grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|invalid_target'|tail -10||true;done").strip()
  checks={'preflight':'"result":"PASS"' in contract and all('PASS' in x for x in fortune.values()) and '"result":"ok"' in mapContract and '"tables":714' in core,'hashes':hashes==expected,'runtime':json.loads(runtime)=={'start':START,'end':END,'mapId':990008,'open':True},'httpQa':'"result":"PASS"' in httpQa,'mapQa':'MAP_990008_LIVE=' in mapQa and 'MAP_990008_CLEANUP=' in mapQa and '"remaining":0' in mapQa,'servedConfig':served['configHash']==expected[WEB+'/update/resource/assets/excel/config_e5ac72c2.bin'],'servedStart':served['startHash']==expected[WEB+'/js/start.min_52ac8d58.js'],'servedMarker':'20260904_linkage365_v1' in served['index'],'unrelatedUnchanged':all(beforeBy[n]['pid']==afterBy[n]['pid'] and beforeBy[n]['restarts']==afterBy[n]['restarts'] for n in unrelated),'online':len(after)==6 and all(x['status']=='online' for x in after),'health':all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in finalHealth),'errorsEmpty':errors==''}
  if not all(checks.values()):raise RuntimeError('POSTCHECK_FAILED:'+json.dumps(checks,sort_keys=True))
  payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'window':{'start':START,'end':END,'durationMs':END-START},'backup':backup,'checks':checks,'contract':contract,'fortune':fortune,'core':core,'mapContract':mapContract,'httpQa':httpQa,'mapQa':mapQa,'runtime':json.loads(runtime),'beforeHashes':remoteBefore,'hashes':hashes,'served':{k:v for k,v in served.items() if k!='index'},'beforePm2':before,'afterPm2':after,'beforeHealth':beforeHealth,'progress':progress,'finalHealth':finalHealth,'recentErrors':errors};evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':digest(evidence),'window':payload['window'],'checks':checks},ensure_ascii=False))
 except Exception:
  if installed:
   for remote in FILES:
    name=remote.replace('/','__').strip('_');run(s,'cp -p '+shlex.quote(backup+'/'+name)+' '+shlex.quote(remote))
   run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env',180);wait_ready(s,8083);run(s,'cd '+APP+' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env',180);wait_ready(s,8080);print('ROLLBACK=restored',flush=True)
  raise
 finally:
  for p in extra:
   try:run(s,'rm -f -- '+shlex.quote(p))
   except Exception:pass
  try:run(s,'rm -rf '+shlex.quote(stage))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
