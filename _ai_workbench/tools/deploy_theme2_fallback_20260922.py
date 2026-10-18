"""CAS deploy presentation-only 15502 fallback; no PM2 restart or player writes."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'linhhoasu/webgame/game'
BACKUP='/linhhoasu/_ai_workbench/backups/theme2_fallback_20260922';STAGE='/linhhoasu/_ai_workbench/temp/theme2_fallback_20260922'
FILES=['index.html','js/lhs-theme2-fallback-v1.js']
REMOTE='/linhhoasu/webgame/game';EXPECTED={'index.html':'2c9a38c9a6bc750c5bb312d07e89760ca78f91c53281dc2d23758da64695dfd9','js/lhs-theme2-fallback-v1.js':''}
def main():
 local={rel:(APP/rel).read_bytes() for rel in FILES};assert b'lhs-theme2-fallback-v1.js?v=20260922_theme2_fallback_v1' in local['index.html']
 s=connect();before={}
 try:
  with s.open_sftp() as sf:
   run(s,'install -d -m 700 '+shlex.quote(BACKUP));run(s,'install -d -m 700 '+shlex.quote(STAGE))
   for rel in FILES:
    rp=REMOTE+'/'+rel
    try:old=sf.open(rp,'rb').read()
    except FileNotFoundError:old=b''
    before[rel]=old;bp=BACKUP+'/'+rel.replace('/','__')+'.before'
    try:saved=sf.open(bp,'rb').read()
    except FileNotFoundError:
     with sf.open(bp,'wb') as f:f.write(old)
     sf.chmod(bp,0o600)
    else:
     if saved!=old:raise RuntimeError('BACKUP_DRIFT:'+rel)
    if EXPECTED[rel] and hashlib.sha256(old).hexdigest()!=EXPECTED[rel]:raise RuntimeError('REMOTE_CAS_DRIFT:'+rel)
    staged=STAGE+'/'+str(int(time.time()))+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
    with sf.open(staged,'wb') as f:f.write(local[rel])
    sf.chmod(staged,0o600);sf.posix_rename(staged,rp)
  out={'result':'DEPLOYED','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'pm2Restart':False,'backup':BACKUP,'files':{r:{'before':hashlib.sha256(before[r]).hexdigest(),'after':hashlib.sha256(local[r]).hexdigest()} for r in FILES}}
  (ROOT/'_ai_workbench/temp/theme2_fallback_20260922/release.json').parent.mkdir(parents=True,exist_ok=True);(ROOT/'_ai_workbench/temp/theme2_fallback_20260922/release.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8');print(json.dumps(out,indent=2))
 finally:s.close()
if __name__=='__main__':main()
