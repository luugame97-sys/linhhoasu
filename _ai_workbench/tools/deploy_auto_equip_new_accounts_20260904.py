"""Deploy auto-equip visibility for both old/new account panel states."""

import hashlib,json,os,posixpath,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1]
C=ROOT/'temp/auto_equip_fsm_v3_candidate_20260904'
WEB='/linhhoasu/webgame/game'
FILES={WEB+'/js/main.min_a6195824.js':C/'js/main.min_a6195824.js',WEB+'/index.html':C/'index.html'}
BASE={WEB+'/js/main.min_a6195824.js':'f5490e4a2339eb9f13adfee20d7f82f79fc5099ca8de3826445e9432a72abd6d',WEB+'/index.html':'aba269b7ad48114f7b1454457080b01e3a0862374256dcb8bc23bc476c57c25e'}
EUI=WEB+'/update/resource/assets/cfg/gameEui_18e11b8e.bin';EUI_HASH='0f47c283f404bb5ad9a8654d9087faeafff4564f865c3ff86eaf14f9630a9128'

def dg(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(s,c,timeout=120):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-5000:])
 return out
def pm2(s):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
 return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(js)))
def health(s,port):
 js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0}))})'
 return json.loads(run(s,'curl -fsS http://127.0.0.1:'+str(port)+'/health | node -e '+shlex.quote(js)))
def main():
 expected={r:dg(l) for r,l in FILES.items()};creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
 s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/auto_equip_new_accounts_'+stamp;stage='/linhhoasu/_ai_workbench/temp/auto_equip_new_accounts_'+stamp;evidence=ROOT/'temp'/('auto_equip_new_accounts_deploy_'+stamp+'.json');installed=False
 try:
  before=pm2(s);beforeHealth=[health(s,9200),health(s,9201)];remoteBefore={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};remoteEui=run(s,'sha256sum '+shlex.quote(EUI)).split()[0]
  if remoteBefore!=BASE:raise RuntimeError('REMOTE_DRIFT:'+json.dumps(remoteBefore,sort_keys=True))
  if remoteEui!=EUI_HASH:raise RuntimeError('EUI_DRIFT:'+remoteEui)
  run(s,'install -d -m 700 '+backup+' '+stage);f=s.open_sftp()
  try:
   for remote,local in FILES.items():
    name=remote.replace('/','__').strip('_');run(s,'cp -a '+remote+' '+backup+'/'+name);f.put(str(local),stage+'/'+name)
   f.put(str(ROOT/'tools/test_auto_equip_new_accounts_20260904.js'),stage+'/test_auto_equip_new_accounts_20260904.js');f.put(str(ROOT/'tools/test_auto_equip_fsm_runtime_20260904.js'),stage+'/test_auto_equip_fsm_runtime_20260904.js')
  finally:f.close()
  rmain=stage+'/'+list(FILES)[0].replace('/','__').strip('_');rindex=stage+'/'+list(FILES)[1].replace('/','__').strip('_')
  run(s,'node --check '+rmain)
  contractUi=run(s,'node '+stage+'/test_auto_equip_new_accounts_20260904.js '+rmain+' '+rindex+' '+EUI+' /linhhoasu/lhs/newServer').strip();contractFsm=run(s,'node '+stage+'/test_auto_equip_fsm_runtime_20260904.js '+rmain).strip()
  for remote in FILES:
   name=remote.replace('/','__').strip('_');run(s,'install -m 644 '+stage+'/'+name+' '+remote)
  installed=True
  hashes={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};servedHash=run(s,'curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum').split()[0];servedIndex=run(s,'curl -fsS http://127.0.0.1:81/');after=pm2(s);afterHealth=[health(s,9200),health(s,9201)]
  checks={'contractUi':'"result":"PASS"' in contractUi,'contractFsm':'"result":"PASS"' in contractFsm,'hashes':hashes==expected,'servedHash':servedHash==expected[list(FILES)[0]],'servedMarker':'20260904_auto_equip_fsm_v3' in servedIndex,'euiUnchanged':run(s,'sha256sum '+shlex.quote(EUI)).split()[0]==EUI_HASH,'pm2Unchanged':before==after,'pm2Online':len(after)==6 and all(x['status']=='online' for x in after),'health':all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in afterHealth)}
  if not all(checks.values()):raise RuntimeError('POSTCHECK_FAILED:'+json.dumps(checks,sort_keys=True))
  payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'checks':checks,'contracts':{'ui':contractUi,'fsm':contractFsm},'beforeHashes':remoteBefore,'hashes':hashes,'euiHash':remoteEui,'beforePm2':before,'afterPm2':after,'beforeHealth':beforeHealth,'afterHealth':afterHealth}
  evidence.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':dg(evidence),'checks':checks}))
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
