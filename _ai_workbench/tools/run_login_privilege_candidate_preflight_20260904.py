"""Run candidate Activity 9 + Activity 43/44 contracts on production dependencies, read-only."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/login_privilege_fix_candidate_20260904';APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/game'
TOOLS=['redirect_login_privilege_candidate_20260904.js','test_login_privilege_merge_static_20260904.js','test_activity9_candidate.js','test_fortune_event_full.js','test_fortune_event_real_config.js','test_fortune_player_consumption_tracking.js']
def run(s,c,timeout=300):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-16000:])
 return out
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/login_privilege_preflight_'+stamp;evidence=ROOT/'temp'/('login_privilege_candidate_preflight_'+stamp+'.json')
 try:
  run(s,'install -d -m 700 '+stage);f=s.open_sftp()
  try:
   f.put(str(C/'server/handlers/activity.js'),stage+'/activity.js');f.put(str(C/'server/handlers/account.js'),stage+'/account.js')
   for tool in TOOLS:f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
  finally:f.close()
  run(s,'node --check '+stage+'/activity.js');run(s,'node --check '+stage+'/account.js');run(s,'node --check '+stage+'/redirect_login_privilege_candidate_20260904.js')
  env=('LOGIN_PRIVILEGE_APP_ROOT='+APP+' LOGIN_PRIVILEGE_ACTIVITY_CANDIDATE='+stage+'/activity.js LOGIN_PRIVILEGE_ACCOUNT_CANDIDATE='+stage+'/account.js '
       'LOGIN_PRIVILEGE_ACTIVITY9_CANDIDATE='+APP+'/src/services/Activity9Service.js TIEN_DUYEN_CANDIDATE_ROOT=/ '
       'TIEN_DUYEN_CLIENT_CONFIG='+WEB+'/update/resource/assets/excel/config_e5ac72c2.bin TIEN_DUYEN_INDEX='+WEB+'/index.html TIEN_DUYEN_CLIENT_MAIN='+WEB+'/js/main.min_a6195824.js ')
  outputs={'static':run(s,'node '+stage+'/test_login_privilege_merge_static_20260904.js '+stage+'/activity.js '+stage+'/account.js').strip(),'activity9':run(s,'cd '+APP+' && '+env+' node -r '+stage+'/redirect_login_privilege_candidate_20260904.js '+stage+'/test_activity9_candidate.js',300).strip()}
  for tool in TOOLS[3:]:outputs[tool]=run(s,'cd '+APP+' && '+env+' FORTUNE_APP_ROOT='+APP+' node -r '+stage+'/redirect_login_privilege_candidate_20260904.js '+stage+'/'+tool,300).strip()
  outputs['core']=run(s,'cd '+APP+' && '+env+' node -r '+stage+'/redirect_login_privilege_candidate_20260904.js scripts/test-core-gameplay-contract.js',300).strip()
  payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'outputs':outputs};evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','evidence':str(evidence),'sha256':hashlib.sha256(evidence.read_bytes()).hexdigest(),'outputs':outputs},ensure_ascii=False))
 finally:
  try:run(s,'rm -rf '+shlex.quote(stage))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
