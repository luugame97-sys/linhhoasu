"""CAS deploy theme2 fallback v2 (mapping patch, no PM2 restart/player writes)."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'linhhoasu/webgame/game';REMOTE='/linhhoasu/webgame/game';STAGE='/linhhoasu/_ai_workbench/temp/theme2_fallback_20260922';EXPECTED={'index.html':'0984931580aacf218cc283cb716ed11abc41682ad0e7c83f3e18e616b3516e14','js/lhs-theme2-fallback-v1.js':'f428dc220aa9bb8717ba9e22b0bb1a703baacd8cb18edc35b580a935110b3e8f'}
def main():
 local={r:(APP/r).read_bytes() for r in EXPECTED};s=connect();out={'result':'DEPLOYED','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'pm2Restart':False,'files':{}}
 try:
  with s.open_sftp() as sf:
   for rel,expected in EXPECTED.items():
    rp=REMOTE+'/'+rel;old=sf.open(rp,'rb').read();actual=hashlib.sha256(old).hexdigest()
    if actual!=expected:raise RuntimeError('CAS_DRIFT:'+rel+':'+actual)
    staged=STAGE+'/v2_'+str(int(time.time()))+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
    with sf.open(staged,'wb') as f:f.write(local[rel])
    sf.chmod(staged,0o644);sf.posix_rename(staged,rp)
    out['files'][rel]={'before':actual,'after':hashlib.sha256(local[rel]).hexdigest()}
  (ROOT/'_ai_workbench/temp/theme2_fallback_20260922/v2_release.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8');print(json.dumps(out,indent=2))
 finally:s.close()
if __name__=='__main__':main()
