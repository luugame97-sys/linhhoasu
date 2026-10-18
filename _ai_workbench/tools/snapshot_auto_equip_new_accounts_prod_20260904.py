"""Read-only production snapshot for the new-account auto-equip UI audit."""
import hashlib,json,os
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'temp/auto_equip_new_accounts_prod_20260904'
REMOTE='/linhhoasu/webgame/game'
FILES=('js/main.min_a6195824.js','index.html','update/resource/assets/cfg/gameEui_18e11b8e.bin')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  f=s.open_sftp();rows=[]
  try:
   for relative in FILES:
    target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True);f.get(REMOTE+'/'+relative,str(target));rows.append({'remote':REMOTE+'/'+relative,'local':str(target),'sha256':sha(target),'bytes':target.stat().st_size})
  finally:f.close()
 finally:s.close()
 manifest=OUT/'manifest.json';manifest.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'files':rows},indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','manifest':str(manifest),'sha256':sha(manifest),'files':rows}))
if __name__=='__main__':main()
