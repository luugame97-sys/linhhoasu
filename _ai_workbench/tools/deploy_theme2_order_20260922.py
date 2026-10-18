"""Move fallback before main bundle; CAS static index update only."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];local=ROOT/'linhhoasu/webgame/game/index.html';REMOTE='/linhhoasu/webgame/game/index.html';STAGE='/linhhoasu/_ai_workbench/temp/theme2_fallback_20260922';EXPECTED='d2f82fca576178b7bc640aa1deb642cd92bba8935116b655fb13f3fe2163109c'
def main():
 data=local.read_bytes();assert b'lhs-theme2-fallback-v1.js?v=20260922_theme2_fallback_v1' in data
 s=connect()
 try:
  with s.open_sftp() as sf:
   old=sf.open(REMOTE,'rb').read();actual=hashlib.sha256(old).hexdigest()
   if actual!=EXPECTED:raise RuntimeError('INDEX_CAS_DRIFT:'+actual)
   staged=STAGE+'/index_'+str(int(time.time()))+'.html';run(s,'install -d -m 700 '+shlex.quote(STAGE))
   with sf.open(staged,'wb') as f:f.write(data)
   sf.chmod(staged,0o644);sf.posix_rename(staged,REMOTE)
  out={'result':'DEPLOYED','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'pm2Restart':False,'before':actual,'after':hashlib.sha256(data).hexdigest()}
  (ROOT/'_ai_workbench/temp/theme2_fallback_20260922/order_release.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8');print(json.dumps(out,indent=2))
 finally:s.close()
if __name__=='__main__':main()
