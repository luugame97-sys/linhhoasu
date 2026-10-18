"""Read-only production snapshot for Activity 9 / login privilege diagnosis."""
import hashlib,json,os
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'temp/login_privilege_prod_snapshot_20260904';APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/game'
FILES={
 APP+'/src/services/Activity9Service.js':'server/services/Activity9Service.js',
 APP+'/src/services/RechargeBenefitService.js':'server/services/RechargeBenefitService.js',
 APP+'/src/handlers/activity.js':'server/handlers/activity.js',
 APP+'/src/handlers/recharge.js':'server/handlers/recharge.js',
 APP+'/src/handlers/compat.js':'server/handlers/compat.js',
 APP+'/src/handlers/account.js':'server/handlers/account.js',
 APP+'/src/handlers/playerPayload.js':'server/handlers/playerPayload.js',
 APP+'/src/handlers/box.js':'server/handlers/box.js',
 APP+'/src/handlers/raid.js':'server/handlers/raid.js',
 APP+'/src/services/MainTaskProgressService.js':'server/services/MainTaskProgressService.js',
 APP+'/src/services/PlayerService.js':'server/services/PlayerService.js',
 APP+'/src/services/ConfigService.js':'server/services/ConfigService.js',
 APP+'/src/protocol/BinJsonUtil.js':'server/protocol/BinJsonUtil.js',
 '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin':'config/server/config_e5ac72c2.bin',
 WEB+'/update/resource/assets/excel/config_e5ac72c2.bin':'config/client/config_e5ac72c2.bin',
 WEB+'/js/main.min_a6195824.js':'client/js/main.min_a6195824.js',
 WEB+'/index.html':'client/index.html',
}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);rows=[]
 try:
  f=ssh.open_sftp()
  try:
   for remote,relative in FILES.items():
    target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True)
    try:f.get(remote,str(target));rows.append({'remote':remote,'local':str(target),'exists':True,'sha256':sha(target),'bytes':target.stat().st_size})
    except FileNotFoundError:rows.append({'remote':remote,'local':str(target),'exists':False,'sha256':'','bytes':0})
  finally:f.close()
 finally:ssh.close()
 manifest=OUT/'manifest.json';manifest.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'files':rows},indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','manifest':str(manifest),'sha256':sha(manifest),'files':rows}))
if __name__=='__main__':main()
