"""Run existing fortune contracts against current production source without mutations."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer';TOOLS=['test_fortune_event_full.js','test_fortune_event_real_config.js','test_fortune_player_consumption_tracking.js']
def run(s,c,timeout=240):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-12000:])
 return out
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/fortune_contracts_readonly_'+stamp;evidence=ROOT/'temp'/('fortune_contracts_prod_readonly_'+stamp+'.json')
 try:
  run(s,'install -d -m 700 '+stage);f=s.open_sftp()
  try:
   for tool in TOOLS:f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
  finally:f.close()
  outputs={}
  for tool in TOOLS:outputs[tool]=run(s,'cd '+APP+' && FORTUNE_APP_ROOT='+APP+' node '+stage+'/'+tool,240).strip()
  core=run(s,'cd '+APP+' && npm run test:core-contract',240).strip();payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'outputs':outputs,'core':core};evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','evidence':str(evidence),'sha256':hashlib.sha256(evidence.read_bytes()).hexdigest(),'outputs':outputs},ensure_ascii=False))
 finally:
  try:run(s,'rm -rf '+shlex.quote(stage))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
