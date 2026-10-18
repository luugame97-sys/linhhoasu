"""Client-only compatibility hotfix for default-off autoEquipUpgrade."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/auto_equip_optin_v2';paths={'/linhhoasu/webgame/game/js/main.min_a6195824.js':C/'js/main.min_a6195824.js','/linhhoasu/webgame/game/index.html':C/'index.html'}
old={'/linhhoasu/webgame/game/js/main.min_a6195824.js':'2eaa5f024dbded7cb7bfa171fd3f2211f41b415b662f40cba6a43fbfc7e63d38','/linhhoasu/webgame/game/index.html':'82470a1a38cae5a446f643c6461e80a7b64505593fbc955b250d7b0e977f107e'}
c=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/auto_equip_optin_v2_'+stamp;installed=[]
def run(cmd):
 _,o,e=s.exec_command(cmd,timeout=60);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-2000:])
 return out
def h(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
script='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
try:
 before=json.loads(run('pm2 jlist | node -e '+shlex.quote(script)))
 for remote in paths:
  if run('sha256sum '+remote).split()[0]!=old[remote]:raise RuntimeError('REMOTE_DRIFT')
 run('install -d -m 700 '+backup);f=s.open_sftp()
 try:
  for remote,local in paths.items():
   stage=remote.rsplit('.',1)[0]+'.v2.'+remote.rsplit('.',1)[1];run('cp -a '+remote+' '+backup+'/'+remote.split('/')[-1]);f.put(str(local),stage)
 finally:f.close()
 run('node --check /linhhoasu/webgame/game/js/main.min_a6195824.v2.js')
 for remote,local in paths.items():
  stage=remote.rsplit('.',1)[0]+'.v2.'+remote.rsplit('.',1)[1];run('install -m 644 '+stage+' '+remote);installed.append(remote)
 main=run('curl -sS http://127.0.0.1:81/js/main.min_a6195824.js');index=run('curl -sS http://127.0.0.1:81/')
 checks={'newFlagDefaultOff':'t.enoughPower=!1,t.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade' in main,'persistWrite':'t.writeBoolean(e.autoEquipUpgrade)' in main,'persistRead':'i.autoEquipUpgrade=e.readBoolean()' in main,'oldFlagNotUsed':'U9.autoConfig.enoughPower?this.autoEquipPowerUpgrade' not in main,'cache':'20260904_auto_equip_upgrade2' in index,'silentModePreserved':'_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}' in main}
 if not all(checks.values()):raise RuntimeError('SERVED_FAILED')
 after=json.loads(run('pm2 jlist | node -e '+shlex.quote(script)));assert before==after
 out=ROOT/'temp'/('auto_equip_optin_v2_deploy_'+stamp+'.json');payload={'result':'PASS','backup':backup,'checks':checks,'processesUnchanged':True,'hashes':{r:h(l) for r,l in paths.items()}};out.write_text(json.dumps(payload,indent=2),encoding='utf8');print(json.dumps({'result':'PASS','backup':backup,'evidence':str(out),'sha256':h(out),'hashes':payload['hashes']}))
except Exception:
 for remote in installed:run('cp -a '+backup+'/'+remote.split('/')[-1]+' '+remote)
 raise
finally:s.close()
