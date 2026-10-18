"""Run a non-persisting recovery sweep on cloned production Player documents."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer'
def run(s,c,timeout=180):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-12000:])
 return out
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');remote='/linhhoasu/_ai_workbench/temp/a9_recovery_dry_'+stamp+'.js';evidence=ROOT/'temp'/('login_privilege_recovery_dry_run_'+stamp+'.json')
 try:
  f=s.open_sftp()
  try:f.put(str(ROOT/'tools/dry_run_login_privilege_recovery_remote_20260904.js'),remote)
  finally:f.close()
  output=run(s,'cd '+APP+' && node '+shlex.quote(remote),180);payload=json.loads(output.split('DRY_RUN_JSON=',1)[1].splitlines()[0]);evidence.write_text(json.dumps({'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'dryRun':payload},ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','evidence':str(evidence),'sha256':hashlib.sha256(evidence.read_bytes()).hexdigest(),'subjects':payload['subjects'],'results':payload['results']},ensure_ascii=False))
 finally:
  try:run(s,'rm -f -- '+shlex.quote(remote))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
