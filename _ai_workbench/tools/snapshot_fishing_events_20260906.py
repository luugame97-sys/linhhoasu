"""Read-only source/config snapshot for fishing event readiness, without player data."""
import hashlib,json,shutil,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready
WB=Path(__file__).resolve().parents[1];BASE=WB/'temp/fishing_rooms_release_20260906'
def main():
 sys.stdout.reconfigure(encoding='utf-8');expected=json.loads((BASE/'final-deploy.json').read_text(encoding='utf-8'))['expected']
 cred=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(cred[0].strip(),username='root',password=cred[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  assert hashes(s,list(expected))==expected,'PRODUCTION_DRIFT'
  root=WB/'temp'/('fishing_events_audit_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));root.mkdir()
  shutil.copytree(BASE/'app',root/'app')
  for p in (root/'app/src').rglob('*'):
   if p.is_file():assert hashlib.sha256(p.read_bytes()).hexdigest()==expected['/linhhoasu/lhs/newServer/'+p.relative_to(root/'app').as_posix()]
  f=s.open_sftp()
  try:
   for name,remote in [('main.js','/linhhoasu/webgame/game/js/main.min_a6195824.js'),('server.bin','/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'),('client.bin','/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),('lang.bin','/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')]:
    f.get(remote,str(root/name));assert hashlib.sha256((root/name).read_bytes()).hexdigest()==expected[remote]
  finally:f.close()
  report={'root':str(root),'time':datetime.now(timezone.utc).isoformat(),'expected':expected,'pm2':pm2(s),'ready':ready(s),'remoteWrites':0,'playerReads':0}
  (root/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({k:v for k,v in report.items()if k!='expected'}))
 finally:s.close()
if __name__=='__main__':main()
