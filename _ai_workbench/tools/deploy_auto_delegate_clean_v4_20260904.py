"""Guarded client-only deploy of the clean auto-delegate controls v4."""
import hashlib,json,os,posixpath,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/auto_delegate_clean_v4_candidate_20260904';WEB='/linhhoasu/webgame/game';APP='/linhhoasu/lhs/newServer'
FILES={WEB+'/js/main.min_a6195824.js':C/'js/main.min_a6195824.js',WEB+'/index.html':C/'index.html'}
BASE={WEB+'/js/main.min_a6195824.js':'119448ca7b4e7df1ac3aef7e513144eaaf38b7e90ba3fa63f53c5df636fe8495',WEB+'/index.html':'6bd3d47f526217d1c5f6660dd8d7824fe116b8ac315536cf322db7461f24698d'}
EUI=WEB+'/update/resource/assets/cfg/gameEui_18e11b8e.bin';EUI_HASH='0f47c283f404bb5ad9a8654d9087faeafff4564f865c3ff86eaf14f9630a9128'
TESTS=['test_auto_delegate_clean_controls_v4_20260904.js','audit_auto_delegate_all_controls_20260904.js','test_auto_equip_fsm_runtime_20260904.js','test_auto_equip_new_accounts_20260904.js','test_auto_equip_optin_v2.js']
def dg(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(s,c,timeout=180):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-8000:])
 return out
def pm2(s):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
 return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(js)))
def health(s,port):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0}))})'
 return json.loads(run(s,'curl -fsS http://127.0.0.1:'+str(port)+'/health | node -e '+shlex.quote(js)))
def main():
 expected={r:dg(l) for r,l in FILES.items()};creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/auto_delegate_clean_v4_'+stamp;stage='/linhhoasu/_ai_workbench/temp/auto_delegate_clean_v4_'+stamp;evidence=ROOT/'temp'/('auto_delegate_clean_v4_deploy_'+stamp+'.json');installed=False
 try:
  before=pm2(s);beforeHealth=[health(s,9200),health(s,9201)];remoteBefore={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};euiHash=run(s,'sha256sum '+shlex.quote(EUI)).split()[0]
  if remoteBefore!=BASE:raise RuntimeError('REMOTE_DRIFT:'+json.dumps(remoteBefore,sort_keys=True))
  if euiHash!=EUI_HASH:raise RuntimeError('EUI_DRIFT:'+euiHash)
  run(s,'install -d -m 700 '+backup+' '+stage);f=s.open_sftp()
  try:
   for remote,local in FILES.items():
    name=remote.replace('/','__').strip('_');run(s,'cp -a '+remote+' '+backup+'/'+name);f.put(str(local),stage+'/'+name)
   for tool in TESTS:f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
  finally:f.close()
  rmain=stage+'/'+list(FILES)[0].replace('/','__').strip('_');rindex=stage+'/'+list(FILES)[1].replace('/','__').strip('_')
  run(s,'node --check '+rmain)
  contracts={
   'clean':run(s,'node '+stage+'/test_auto_delegate_clean_controls_v4_20260904.js '+rmain+' '+rindex).strip(),
   'controls':run(s,'node '+stage+'/audit_auto_delegate_all_controls_20260904.js '+rmain).strip(),
   'fsm':run(s,'node '+stage+'/test_auto_equip_fsm_runtime_20260904.js '+rmain).strip(),
   'ui':run(s,'node '+stage+'/test_auto_equip_new_accounts_20260904.js '+rmain+' '+rindex+' '+EUI+' '+APP).strip(),
   'optin':run(s,'node '+stage+'/test_auto_equip_optin_v2.js '+rmain+' '+rindex).strip(),
  }
  for remote in FILES:
   name=remote.replace('/','__').strip('_');run(s,'install -m 644 '+stage+'/'+name+' '+remote)
  installed=True
  hashes={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};servedHash=run(s,'curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum').split()[0];servedIndex=run(s,'curl -fsS http://127.0.0.1:81/');after=pm2(s);afterHealth=[health(s,9200),health(s,9201)]
  checks={'contracts':all(('"result":"PASS"' in x or ('"result": "PASS"' in x)) for x in contracts.values()),'hashes':hashes==expected,'servedHash':servedHash==expected[list(FILES)[0]],'servedMarker':'20260904_auto_delegate_clean_v4' in servedIndex,'euiUnchanged':run(s,'sha256sum '+shlex.quote(EUI)).split()[0]==EUI_HASH,'pm2Unchanged':before==after,'pm2Online':len(after)==6 and all(x['status']=='online' for x in after),'health':all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in afterHealth)}
  if not all(checks.values()):raise RuntimeError('POSTCHECK_FAILED:'+json.dumps(checks,sort_keys=True))
  payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'checks':checks,'contracts':contracts,'beforeHashes':remoteBefore,'hashes':hashes,'euiHash':euiHash,'beforePm2':before,'afterPm2':after,'beforeHealth':beforeHealth,'afterHealth':afterHealth};evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':dg(evidence),'checks':checks},ensure_ascii=False))
 except Exception:
  if installed:
   for remote in FILES:
    name=remote.replace('/','__').strip('_');run(s,'cp -p '+backup+'/'+name+' '+remote)
   print('ROLLBACK=restored',flush=True)
  raise
 finally:
  try:run(s,'rm -rf '+shlex.quote(stage))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
