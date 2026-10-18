"""Deploy only the bounded BidKing guide watchdog and cache-buster."""
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    '/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js': ('linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js', '61c8fb3bda6fa198f877c9df46d49d9193154cbf311fc71d50a3d75334ee6244'),
    '/linhhoasu/webgame/game/index.html': ('linhhoasu/webgame/game/index.html', '9edbd7999d8487e59d0c01b37887fcf5d9d49419bb8907371615c2f2439c2dc2'),
}
def sha(data): return hashlib.sha256(data).hexdigest()
def main():
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/bidking_guide_v5_{stamp}'
    report={'at':datetime.now(timezone.utc).isoformat(),'backup':backup,'directPlayerWrites':0,'files':{}}
    ssh=connect()
    try:
        with ssh.open_sftp() as sftp:
            before={}
            for remote,(_,expected) in FILES.items():
                data=sftp.open(remote,'rb').read()
                if sha(data)!=expected: raise RuntimeError('CAS_DRIFT:'+remote)
                before[remote]=data
            run(ssh,'mkdir '+shlex.quote(backup))
            for remote,(local,_) in FILES.items():
                payload=(ROOT/local).read_bytes(); saved=backup+'/'+remote.rsplit('/',1)[-1]; staged=remote+'.stage-'+stamp+('.js' if remote.endswith('.js') else '.html')
                with sftp.open(saved,'wb') as f:f.write(before[remote])
                with sftp.open(staged,'wb') as f:f.write(payload)
                if sha(sftp.open(saved,'rb').read())!=sha(before[remote]):raise RuntimeError('BACKUP_HASH_MISMATCH')
                if sha(sftp.open(staged,'rb').read())!=sha(payload):raise RuntimeError('STAGE_HASH_MISMATCH')
                if remote.endswith('.js'):run(ssh,'node --check '+shlex.quote(staged))
                if sha(sftp.open(remote,'rb').read())!=sha(before[remote]):raise RuntimeError('PRE_SWAP_CAS_DRIFT')
                run(ssh,'chown --reference='+shlex.quote(remote)+' '+shlex.quote(staged))
                run(ssh,'chmod --reference='+shlex.quote(remote)+' '+shlex.quote(staged))
                sftp.posix_rename(staged,remote)
                if sha(sftp.open(remote,'rb').read())!=sha(payload):raise RuntimeError('LIVE_HASH_MISMATCH')
                report['files'][remote]={'before':sha(before[remote]),'after':sha(payload)}
        addon=run(ssh,'curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js').encode(); index=run(ssh,'curl -fsS --max-time 10 http://127.0.0.1:81/').encode()
        report['served']={'addonHash':sha(addon),'indexHash':sha(index),'v5':'20260921_v5' in addon,'indexV5':'lhs-oldtrek-errors-v1.js?v=20260921_v5' in index}
        report['status']='DEPLOYED'; print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
    finally:
        ssh.close();(ROOT/'_ai_workbench/temp/bidking_guide_v5_deploy_20260921.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
