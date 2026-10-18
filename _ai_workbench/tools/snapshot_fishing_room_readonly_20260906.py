"""Read-only room audit snapshot. No player collection, gameplay RPC or remote writes."""
import hashlib,json,shutil,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready
WB=Path(__file__).resolve().parents[1]
BASE=WB/'temp/fishing_audit_20260906T051014Z'
EXPECTED=WB/'temp/fishing_auto_fx_20260906/deploy.json'
def main():
 sys.stdout.reconfigure(encoding='utf-8');action=sys.argv[1] if len(sys.argv)>1 else 'snapshot'
 assert action in ['snapshot','verify']
 expected=json.loads(EXPECTED.read_text(encoding='utf-8'))['expected']
 credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
 s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
 s.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  assert hashes(s,list(expected))==expected,'PRODUCTION_SOURCE_DRIFT'
  if action=='snapshot':
   root=WB/'temp'/('fishing_room_audit_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));root.mkdir(exist_ok=False)
   shutil.copytree(BASE/'app',root/'app');shutil.copy2(BASE/'server.bin',root/'server.bin')
   f=s.open_sftp()
   try:f.get('/linhhoasu/webgame/game/js/main.min_a6195824.js',str(root/'main.js'))
   finally:f.close()
   file_manifest={}
   for local in sorted((root/'app/src').rglob('*')):
    if local.is_file():
     remote='/linhhoasu/lhs/newServer/'+local.relative_to(root/'app').as_posix();digest=hashlib.sha256(local.read_bytes()).hexdigest()
     assert digest==expected[remote],str(local);file_manifest[local.relative_to(root).as_posix()]={'remote':remote,'sha256':digest}
   for name,remote in [('main.js','/linhhoasu/webgame/game/js/main.min_a6195824.js'),('server.bin','/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin')]:
    digest=hashlib.sha256((root/name).read_bytes()).hexdigest();assert digest==expected[remote];file_manifest[name]={'remote':remote,'sha256':digest}
   assert hashes(s,list(expected))==expected,'DRIFT_DURING_READ'
   report={'result':'SNAPSHOT_VERIFIED','generatedAt':datetime.now(timezone.utc).isoformat(),'root':str(root),'files':file_manifest,'expected':expected,'pm2':pm2(s),'ready':ready(s),'remoteWrites':0,'playerReads':0,'gameplayRequests':0}
   (root/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
   print(json.dumps({k:v for k,v in report.items()if k not in ['files','expected']},ensure_ascii=False));return
  root=Path(sys.argv[2]).resolve();manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
  assert root.is_relative_to((WB/'temp').resolve())
  after=pm2(s);assert after==manifest['pm2'],'PROCESS_CHANGED_DURING_AUDIT'
  report={'result':'VERIFIED_UNCHANGED','time':datetime.now(timezone.utc).isoformat(),'hashCount':len(expected),'pm2':after,'ready':ready(s),'remoteWrites':0,'playerReads':0,'gameplayRequests':0}
  assert report['ready']=={'8080':200,'8083':200}
  (root/'postcheck.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
 finally:s.close()
if __name__=='__main__':main()
