"""Rollback the broken runtime checkbox patch to the verified task-guide build."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1];WEB='/linhhoasu/webgame/game';SOURCE='/linhhoasu/_ai_workbench/backups/auto_equip_new_accounts_20260904_063245'
FILES={WEB+'/js/main.min_a6195824.js':('linhhoasu__webgame__game__js__main.min_a6195824.js','8a18b89869e8a7b22c15383cbf0cc503635825f46f2f1a874f70a5b23ed7567a','3465c04109b4e9f86bdde981cb26d5fa2c674e42250d8f9bb09657979a7150a6'),WEB+'/index.html':('linhhoasu__webgame__game__index.html','aba269b7ad48114f7b1454457080b01e3a0862374256dcb8bc23bc476c57c25e','039efcbe9102f7006e3354f27241a5e41f3a227745218aa7c06b0d998086cb0e')}
def run(s,c,timeout=120):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-5000:])
 return out
def sha(path):return run(SSH,'sha256sum '+shlex.quote(path)).split()[0]
def main():
 global SSH
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();SSH=paramiko.SSHClient();SSH.load_system_host_keys();SSH.set_missing_host_key_policy(paramiko.RejectPolicy());SSH.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');recovery='/linhhoasu/_ai_workbench/backups/auto_equip_new_accounts_broken_'+stamp;evidence=ROOT/'temp'/('auto_equip_new_accounts_rollback_'+stamp+'.json');installed=False
 try:
  before={p:sha(p) for p in FILES}
  if any(before[p]!=FILES[p][1] for p in FILES):raise RuntimeError('REMOTE_DRIFT:'+json.dumps(before,sort_keys=True))
  run(SSH,'install -d -m 700 '+recovery)
  for remote,(name,_broken,old) in FILES.items():
   if sha(SOURCE+'/'+name)!=old:raise RuntimeError('BACKUP_HASH_MISMATCH:'+remote)
   run(SSH,'cp -a '+remote+' '+recovery+'/'+name)
  for remote,(name,_broken,_old) in FILES.items():run(SSH,'cp -p '+SOURCE+'/'+name+' '+remote)
  installed=True
  after={p:sha(p) for p in FILES};served=run(SSH,'curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum').split()[0];index=run(SSH,'curl -fsS http://127.0.0.1:81/')
  checks={'hashes':all(after[p]==FILES[p][2] for p in FILES),'servedHash':served==FILES[WEB+'/js/main.min_a6195824.js'][2],'servedMarker':'20260904_task_guide_restore1' in index}
  if not all(checks.values()):raise RuntimeError('ROLLBACK_POSTCHECK:'+json.dumps(checks))
  payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'source':SOURCE,'recoveryBackup':recovery,'before':before,'after':after,'checks':checks};evidence.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','recoveryBackup':recovery,'evidence':str(evidence),'sha256':hashlib.sha256(evidence.read_bytes()).hexdigest(),'checks':checks}))
 except Exception:
  if installed:
   for remote,(name,_broken,_old) in FILES.items():run(SSH,'cp -p '+recovery+'/'+name+' '+remote)
   print('ROLLBACK_OF_ROLLBACK=restored-broken-build',flush=True)
  raise
 finally:SSH.close()
if __name__=='__main__':main()
