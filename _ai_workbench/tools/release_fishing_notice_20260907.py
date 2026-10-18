"""Deploy exact native TaskModel delta + client cache version; no game restart."""
import hashlib,json,shlex,sys,stat
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run
from release_huyenvu_daily_20260906 import pm2,ready
ROOT=WB/'temp/fishing_notice_20260907';BASE=WB/'temp/fishing_audit_20260906T211352Z';GAME='/linhhoasu/webgame/game'
def h(v):return hashlib.sha256(v).hexdigest()
def main():
    sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1];ssh=connect();statePath=ROOT/'release.json'
    try:
        if mode=='deploy':
            if statePath.exists():raise RuntimeError('RELEASE_EXISTS_VERIFY_INSTEAD')
            assert json.loads((ROOT/'client-tests.json').read_text())['result']=='PASS'
            source=(ROOT/'main.fixed.js').read_bytes();backup='/linhhoasu/_ai_workbench/backups/fishing_notice_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            before=pm2(ssh);assert ready(ssh)=={'8080':200,'8083':200}
            with ssh.open_sftp()as f:
                with f.open(GAME+'/js/main.min_a6195824.js','rb')as r:old=r.read()
                assert h(old)==h((BASE/'main.js').read_bytes()),'LIVE_CLIENT_DRIFT'
                with f.open(GAME+'/index.html','rb')as r:index=r.read()
                import re
                updated,n=re.subn(rb'(js/main\.min_a6195824\.js)(?:\?[^\s"\'<>]*)?',rb'\1?v=20260907_fishing_notice_v1',index)
                assert n==1,'INDEX_SHAPE'
                (ROOT/'index.before.html').write_bytes(index);(ROOT/'index.fixed.html').write_bytes(updated)
                run(ssh,'install -d -m 700 '+backup)
                run(ssh,'cp -p '+GAME+'/js/main.min_a6195824.js '+backup+'/main.before.js; cp -p '+GAME+'/index.html '+backup+'/index.before.html')
                f.put(str(ROOT/'main.fixed.js'),backup+'/main.next.js');f.put(str(ROOT/'index.fixed.html'),backup+'/index.next.html')
                a=f.stat(GAME+'/js/main.min_a6195824.js');b=f.stat(GAME+'/index.html')
                for p,attr in [(backup+'/main.next.js',a),(backup+'/index.next.html',b)]:f.chmod(p,stat.S_IMODE(attr.st_mode));f.chown(p,attr.st_uid,attr.st_gid)
                run(ssh,'node --check '+backup+'/main.next.js')
                f.posix_rename(backup+'/main.next.js',GAME+'/js/main.min_a6195824.js')
                f.posix_rename(backup+'/index.next.html',GAME+'/index.html')
            state={'at':datetime.now(timezone.utc).isoformat(),'backup':backup,'beforePm2':before,'mainHash':h(source),'indexHash':h(updated),'beforeMainHash':h(old),'beforeIndexHash':h(index),'deployed':True}
            statePath.write_text(json.dumps(state,indent=2)+'\n')
        elif mode=='verify':state=json.loads(statePath.read_text())
        else:raise RuntimeError('MODE')
        checks={}
        for rel,key in [('js/main.min_a6195824.js','mainHash'),('index.html','indexHash')]:
            actual=run(ssh,'sha256sum '+GAME+'/'+rel).split()[0];assert actual==state[key],'DISK_HASH'
            served=run(ssh,'curl -fsS --max-time 15 '+shlex.quote('http://127.0.0.1:81/'+rel+'?verify=20260907_fishing_notice_v1')+' | sha256sum').split()[0];assert served==state[key],'HTTP_HASH';checks[rel]=True
        assert pm2(ssh)==state['beforePm2'],'PM2_CHANGED';assert ready(ssh)=={'8080':200,'8083':200}
        state.update(verifiedAt=datetime.now(timezone.utc).isoformat(),httpHashes=checks,pm2Unchanged=True,ready={'8080':200,'8083':200});statePath.write_text(json.dumps(state,indent=2)+'\n')
        print(json.dumps({k:v for k,v in state.items()if k!='beforePm2'}))
    finally:ssh.close()
if __name__=='__main__':main()
