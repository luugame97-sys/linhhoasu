from pathlib import Path
import hashlib,json,shlex,time
from auction_ops_20261015 import connect,run

ROOT=Path(__file__).resolve().parents[2]
TASK=ROOT/'_ai_workbench/temp/tower_skill_singleflight_20261018';q=shlex.quote
FILES={'js/lhs-tower-fix-v2.js':'webgame/game/js/lhs-tower-fix-v2.js','index.html':'webgame/game/index.html'}
OLD={'js/lhs-tower-fix-v2.js':'9c93c60bf70e5f425d6abe0f3fc67e2f9d8314f1865667e57f17a3f68bb339ea','index.html':'74516add2696327de4a75cfc7d2459baca615f483e164157283fddf9963f7497'}
if __name__=='__main__':
    TASK.mkdir(parents=True,exist_ok=True);backup='/linhhoasu/_ai_workbench/backups/tower_skill_singleflight_'+time.strftime('%Y%m%d_%H%M%S');receipt={'status':'PREPARING','backup':backup,'files':{},'restarts':0,'playerWrites':0}
    for n,rel in FILES.items():
        data=(ROOT/'linhhoasu'/rel).read_bytes();(TASK/n).parent.mkdir(parents=True,exist_ok=True);(TASK/n).write_bytes(data);receipt['files'][n]={'before':OLD[n],'after':hashlib.sha256(data).hexdigest(),'remote':'/linhhoasu/'+rel}
    c=connect()
    try:
        def rh(p):return run(c,'sha256sum '+q(p)).split()[0]
        with c.open_sftp() as s:
            run(c,'install -d -m 700 '+q(backup))
            for n,m in receipt['files'].items():
                assert rh(m['remote'])==m['before'],'SOURCE_DRIFT:'+n
                b=backup+'/'+n;st=b+'.stage';run(c,'install -d -m 700 '+q(b.rsplit('/',1)[0]));run(c,'cp -p '+q(m['remote'])+' '+q(b));assert rh(b)==m['before']
                with s.open(st,'wb') as f:f.write((TASK/n).read_bytes())
                old=s.stat(m['remote']);s.chmod(st,old.st_mode&0o777);s.chown(st,old.st_uid,old.st_gid);assert rh(st)==m['after']
                if n.endswith('.js'):run(c,'node --check < '+q(st))
                m['backup']=b;m['stage']=st
            for n,m in receipt['files'].items():
                assert rh(m['remote'])==m['before'],'CAS:'+n;s.posix_rename(m['stage'],m['remote']);assert rh(m['remote'])==m['after']
            for n,m in receipt['files'].items():
                url='https://linhhoasu.lol/'+('' if n=='index.html' else 'js/lhs-tower-fix-v2.js')+'?v=20261018_tower_fix_v4'
                got=run(c,'set -o pipefail; curl -fsS --max-time 25 '+q(url)+' | sha256sum',timeout=30).split()[0];assert got==m['after'],'HTTPS:'+n;m['httpsSha256']=got
            receipt['status']='DEPLOYED_VERIFIED'
    except Exception:
        with c.open_sftp() as s:
            for m in receipt['files'].values():
                if rh(m['remote'])==m.get('after'):run(c,'cp -p '+q(m['backup'])+' '+q(m['stage']));s.posix_rename(m['stage'],m['remote'])
        receipt['status']='ROLLED_BACK';raise
    finally:(TASK/'deployment.json').write_text(json.dumps(receipt,indent=2),encoding='utf8');c.close()
    print(json.dumps(receipt))
