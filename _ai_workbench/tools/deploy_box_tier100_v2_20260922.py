"""Bump box-tier client cache key and add runtime-ready logging; static only."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'linhhoasu/webgame/game';REMOTE='/linhhoasu/webgame/game';BACKUP='/linhhoasu/_ai_workbench/backups/box_tier100_v2_20260922';STAGE='/linhhoasu/_ai_workbench/temp/box_tier100_v2_20260922';EXPECTED={'index.html':'a057a3f6938dc7cc9cefffe1d794502cb91df31a083bfdf73262d863869c70ef','js/lhs-box-tier100-v1.js':'9f77a7cc4f2c57f7d0f68c46804c941abbf9727a4cc66b145a4e15b34b093af1'}
def main():
    local={r:(APP/r).read_bytes() for r in EXPECTED};assert b'20260922_box_tier100_v2' in local['index.html'];assert b'20260922_box_tier100_v2' in local['js/lhs-box-tier100-v1.js']
    s=connect();before={}
    try:
        with s.open_sftp() as sf:
            run(s,'install -d -m 700 '+shlex.quote(BACKUP));run(s,'install -d -m 700 '+shlex.quote(STAGE))
            for rel,expected in EXPECTED.items():
                rp=REMOTE+'/'+rel;old=sf.open(rp,'rb').read();actual=hashlib.sha256(old).hexdigest()
                if actual!=expected:raise RuntimeError('CAS_DRIFT:'+rel+':'+actual)
                before[rel]=old;bp=BACKUP+'/'+rel.replace('/','__')+'.before'
                try:saved=sf.open(bp,'rb').read()
                except FileNotFoundError:
                    with sf.open(bp,'wb') as f:f.write(old)
                    sf.chmod(bp,0o600)
                else:
                    if saved!=old:raise RuntimeError('BACKUP_DRIFT:'+rel)
                staged=STAGE+'/'+str(int(time.time()))+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
                with sf.open(staged,'wb') as f:f.write(local[rel])
                sf.chmod(staged,0o644);sf.posix_rename(staged,rp)
        out={'result':'DEPLOYED','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'pm2Restart':False,'backup':BACKUP,'files':{r:{'before':hashlib.sha256(before[r]).hexdigest(),'after':hashlib.sha256(local[r]).hexdigest()} for r in EXPECTED}}
        (ROOT/'_ai_workbench/temp/box_tier100_v2_20260922').mkdir(parents=True,exist_ok=True);(ROOT/'_ai_workbench/temp/box_tier100_v2_20260922/release.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8');print(json.dumps(out,indent=2))
    finally:s.close()
if __name__=='__main__':main()
