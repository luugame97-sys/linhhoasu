"""Read-only snapshot of production files required to reopen linkage for 365 days."""
import hashlib,json,os
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'temp/linkage365_prod_snapshot_20260904'
FILES={
 '/linhhoasu/lhs/newServer/src/handlers/serverList.js':'server/serverList.js',
 '/linhhoasu/lhs/newServer/src/handlers/serverList1.js':'server/serverList1.js',
 '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin':'config/server/config_e5ac72c2.bin',
 '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':'config/client/config_e5ac72c2.bin',
 '/linhhoasu/webgame/game/js/start.min_52ac8d58.js':'client/js/start.min_52ac8d58.js',
 '/linhhoasu/webgame/game/index.html':'client/index.html',
}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);rows=[]
 try:
  f=ssh.open_sftp()
  try:
   for remote,relative in FILES.items():target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True);f.get(remote,str(target));rows.append({'remote':remote,'local':str(target),'sha256':sha(target),'bytes':target.stat().st_size})
  finally:f.close()
 finally:ssh.close()
 manifest=OUT/'manifest.json';manifest.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'files':rows},indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','manifest':str(manifest),'sha256':sha(manifest),'files':rows}))
if __name__=='__main__':main()
