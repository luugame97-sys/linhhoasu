"""Scoped client-only release: CAS checks, backup, atomic entrypoint, no restart/DB."""
import hashlib
import json
import shlex
import stat
import sys
import urllib.request
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import WB, connect, run
from release_huyenvu_daily_20260906 import pm2, ready

ROOT=WB/'temp/item_quantity_20260907'
LOCAL=WB.parent/'linhhoasu/webgame/game'
GAME='/linhhoasu/webgame/game'
PATCH='js/lhs-item-quantity-v1.js'
PRE=ROOT/'preflight.json'
STATE=ROOT/'release.json'
STATE_V2=ROOT/'release-v2.json'
UNCHANGED=['js/main.min_a6195824.js','js/egret.min_7d668222.js','js/start.min_52ac8d58.js',
           'update/resource/assets/excel/config_e5ac72c2.bin',
           'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',
           'update/resource/assets/cfg/gameEui_18e11b8e.bin']

def digest(data):return hashlib.sha256(data).hexdigest()
def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def hashes(ssh,paths):
    code="const fs=require('fs'),c=require('crypto');console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null]))));"
    return json.loads(run(ssh,'node -',code))
def check_http(ssh,rel,expected):
    # pipefail ensures an HTTP error is not hidden by the hashing pipeline.
    command='set -o pipefail; curl -fsS --max-time 20 '+shlex.quote('http://127.0.0.1:81/'+rel+'?verify=20260907_item_quantity_v1')+' | sha256sum'
    actual=run(ssh,'bash -c '+shlex.quote(command)).split()[0]
    assert actual==expected,'HTTP_HASH_'+rel
def restore_index(ssh,state):
    current=hashes(ssh,[GAME+'/index.html'])[GAME+'/index.html']
    assert current==state['indexHash'],'ROLLBACK_REFUSED_CONCURRENT_CHANGE'
    run(ssh,'cp -p '+state['backup']+'/index.before.html '+state['backup']+'/index.restore.html')
    with ssh.open_sftp() as f:f.posix_rename(state['backup']+'/index.restore.html',GAME+'/index.html')
    check_http(ssh,'index.html',state['beforeIndexHash'])
    state['rolledBack']=True
    save(STATE,state)

def deploy_v2(ssh):
    assert not STATE_V2.exists(),'V2_RELEASE_ALREADY_EXISTS'
    previous=json.loads(STATE.read_text(encoding='utf-8'))
    verify(ssh,previous)
    source=(LOCAL/PATCH).read_bytes();index=(LOCAL/'index.html').read_bytes()
    unit=json.loads((WB/'logs/item_quantity_unit_20260907.json').read_text())
    native=json.loads((ROOT/'native-result.json').read_text())
    rank=json.loads((ROOT/'rank-after.json').read_text())
    assert unit['passed'] and native['pass'] and rank['pass'],'V2_TEST_GATE'
    assert unit['patchSha256']==native['patchSha256']==rank['patchSha256']==digest(source),'V2_STALE_TEST'
    with ssh.open_sftp() as f:
        with f.open(GAME+'/index.html','rb') as handle:old_index=handle.read()
    assert index.replace(b'\r\n',b'\n')==old_index.replace(b'20260907_item_quantity_v1',b'20260907_item_quantity_v2').replace(b'\r\n',b'\n'),'V2_INDEX_SCOPE'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/item_quantity_v2_'+stamp
    run(ssh,'install -d -m 700 '+backup)
    run(ssh,'cp -p '+GAME+'/index.html '+backup+'/index.before.html')
    run(ssh,'cp -p '+GAME+'/'+PATCH+' '+backup+'/patch.before.js')
    state=dict(previous);state.update(at=datetime.now(timezone.utc).isoformat(),backup=backup,beforeIndexHash=previous['indexHash'],beforePatchHash=previous['patchHash'],indexHash=digest(index),patchHash=digest(source),version='20260907_item_quantity_v2',activated=False)
    for key in ['verifiedAt','diskAndHttpVerified','publicHttpHashes']:state.pop(key,None)
    save(STATE_V2,state)
    installed=False
    try:
        with ssh.open_sftp() as f:
            for rel,name in [(PATCH,'patch.next.js'),('index.html','index.next.html')]:
                a=f.stat(GAME+'/'+rel);dest=backup+'/'+name;f.put(str(LOCAL/rel),dest);f.chmod(dest,stat.S_IMODE(a.st_mode));f.chown(dest,a.st_uid,a.st_gid)
            run(ssh,'node --check '+backup+'/patch.next.js')
            verify(ssh,previous)
            f.posix_rename(backup+'/patch.next.js',GAME+'/'+PATCH);installed=True
            check_http(ssh,PATCH,state['patchHash'])
            f.posix_rename(backup+'/index.next.html',GAME+'/index.html');state['activated']=True
        verify(ssh,state,STATE_V2)
    except Exception:
        if installed:
            current=hashes(ssh,[GAME+'/'+PATCH,GAME+'/index.html'])
            assert current[GAME+'/'+PATCH]==state['patchHash'],'V2_ROLLBACK_PATCH_DRIFT'
            assert current[GAME+'/index.html'] in [state['indexHash'],previous['indexHash']],'V2_ROLLBACK_INDEX_DRIFT'
            run(ssh,'cp -p '+backup+'/patch.before.js '+backup+'/patch.restore.js')
            run(ssh,'cp -p '+backup+'/index.before.html '+backup+'/index.restore.html')
            with ssh.open_sftp() as f:
                f.posix_rename(backup+'/patch.restore.js',GAME+'/'+PATCH)
                f.posix_rename(backup+'/index.restore.html',GAME+'/index.html')
            state['rolledBack']=True;save(STATE_V2,state)
        raise
    return state

def main():
    ROOT.mkdir(exist_ok=True);mode=sys.argv[1];ssh=connect()
    try:
        if mode=='deploy-v2':
            state=deploy_v2(ssh);print(json.dumps({k:v for k,v in state.items() if k not in ['beforePm2','unchanged']},ensure_ascii=False));return
        if mode=='verify-v2':
            state=json.loads(STATE_V2.read_text(encoding='utf-8'));verify(ssh,state,STATE_V2);print(json.dumps({'verified':True,'patchHash':state['patchHash'],'version':state['version'],'ready':state['ready']}));return
        if mode=='rollback-v2':
            state=json.loads(STATE_V2.read_text(encoding='utf-8'));verify(ssh,state,STATE_V2)
            backup=state['backup'];previous=json.loads(STATE.read_text(encoding='utf-8'))
            assert hashes(ssh,[backup+'/patch.before.js',backup+'/index.before.html'])=={backup+'/patch.before.js':state['beforePatchHash'],backup+'/index.before.html':state['beforeIndexHash']},'V2_BACKUP_HASH'
            run(ssh,'cp -p '+backup+'/patch.before.js '+backup+'/patch.restore.js')
            run(ssh,'cp -p '+backup+'/index.before.html '+backup+'/index.restore.html')
            with ssh.open_sftp() as f:
                f.posix_rename(backup+'/patch.restore.js',GAME+'/'+PATCH)
                f.posix_rename(backup+'/index.restore.html',GAME+'/index.html')
            verify(ssh,previous);state['rolledBack']=True;save(STATE_V2,state);print(json.dumps({'rolledBack':True,'restoredVersion':'v1'}));return
        if mode=='preflight':
            assert not STATE.exists(),'RELEASE_ALREADY_EXISTS'
            paths=[GAME+'/'+rel for rel in ['index.html',PATCH]+UNCHANGED]
            baseline=hashes(ssh,paths)
            assert baseline[GAME+'/'+PATCH] is None,'PATCH_PATH_ALREADY_EXISTS'
            for rel in ['index.html']+UNCHANGED:
                assert baseline[GAME+'/'+rel]==digest((LOCAL/rel).read_bytes()),'LOCAL_LIVE_DRIFT_'+rel
            with ssh.open_sftp() as f:
                with f.open(GAME+'/index.html','rb') as handle:before=handle.read()
            (ROOT/'index.before.html').write_bytes(before)
            state={'at':datetime.now(timezone.utc).isoformat(),'hashes':baseline,'pm2':pm2(ssh),'ready':ready(ssh)}
            assert state['ready']=={'8080':200,'8083':200}
            save(PRE,state);print(json.dumps({'preflight':True,'matched':len(UNCHANGED)+1,'ready':state['ready']}));return
        if mode=='deploy':
            assert not STATE.exists(),'RELEASE_ALREADY_EXISTS'
            pre=json.loads(PRE.read_text(encoding='utf-8'))
            assert hashes(ssh,list(pre['hashes']))==pre['hashes'],'PRODUCTION_DRIFT'
            patch=(LOCAL/PATCH).read_bytes();index=(LOCAL/'index.html').read_bytes()
            expected_index=(ROOT/'index.before.html').read_bytes().replace(
                b'"js/main.min_a6195824.js?v=20260907_fishing_notice_v1"',
                b'"js/main.min_a6195824.js?v=20260907_fishing_notice_v1",\n\t\t"js/lhs-item-quantity-v1.js?v=20260907_item_quantity_v1"')
            # Account for existing CRLF without normalizing unrelated content.
            assert index.replace(b'\r\n',b'\n')==expected_index.replace(b'\r\n',b'\n'),'INDEX_SCOPE'
            assert index.count(PATCH.encode())==1,'INDEX_DUPLICATE'
            unit=json.loads((WB/'logs/item_quantity_unit_20260907.json').read_text())
            native=json.loads((ROOT/'native-result.json').read_text())
            rank=json.loads((ROOT/'rank-after.json').read_text())
            assert unit['passed'] and native['pass'] and rank['pass'],'TEST_GATE'
            assert unit['patchSha256']==native['patchSha256']==rank['patchSha256']==digest(patch),'STALE_TEST_EVIDENCE'
            stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            backup='/linhhoasu/_ai_workbench/backups/item_quantity_'+stamp
            run(ssh,'install -d -m 700 '+backup)
            run(ssh,'cp -p '+GAME+'/index.html '+backup+'/index.before.html')
            state={'at':datetime.now(timezone.utc).isoformat(),'backup':backup,'indexHash':digest(index),
                   'patchHash':digest(patch),'beforeIndexHash':pre['hashes'][GAME+'/index.html'],
                   'beforePm2':pm2(ssh),'unchanged':{p:h for p,h in pre['hashes'].items() if p not in [GAME+'/index.html',GAME+'/'+PATCH]},'activated':False}
            save(STATE,state)
            with ssh.open_sftp() as f:
                for rel,next_name in [(PATCH,'patch.next.js'),('index.html','index.next.html')]:
                    attr=f.stat(GAME+('/js/main.min_a6195824.js' if rel==PATCH else '/index.html'))
                    dest=backup+'/'+next_name;f.put(str(LOCAL/rel),dest);f.chmod(dest,stat.S_IMODE(attr.st_mode));f.chown(dest,attr.st_uid,attr.st_gid)
                run(ssh,'node --check '+backup+'/patch.next.js')
                assert hashes(ssh,list(pre['hashes']))==pre['hashes'],'FINAL_CAS_FAILED'
                f.posix_rename(backup+'/patch.next.js',GAME+'/'+PATCH)
                check_http(ssh,PATCH,state['patchHash'])
                f.posix_rename(backup+'/index.next.html',GAME+'/index.html')
                state['activated']=True;save(STATE,state)
            try:verify(ssh,state)
            except Exception:
                restore_index(ssh,state)
                raise
        elif mode=='verify':
            state=json.loads(STATE.read_text(encoding='utf-8'));verify(ssh,state)
        elif mode=='rollback':
            state=json.loads(STATE.read_text(encoding='utf-8'));restore_index(ssh,state)
        else:raise RuntimeError('UNKNOWN_MODE')
        print(json.dumps({k:v for k,v in state.items() if k not in ['beforePm2','unchanged']},ensure_ascii=False))
    finally:ssh.close()

def verify(ssh,state,output=STATE):
    assert not state.get('rolledBack'),'RELEASE_ROLLED_BACK'
    expected=dict(state['unchanged']);expected[GAME+'/index.html']=state['indexHash'];expected[GAME+'/'+PATCH]=state['patchHash']
    assert hashes(ssh,list(expected))==expected,'DISK_HASH_MISMATCH'
    check_http(ssh,PATCH,state['patchHash']);check_http(ssh,'index.html',state['indexHash'])
    public={}
    for rel,expected_hash in [(PATCH,state['patchHash']),('index.html',state['indexHash'])]:
        request=urllib.request.Request('http://103.116.105.154:81/'+rel+'?verify=20260907_item_quantity_v1',headers={'Cache-Control':'no-cache'})
        with urllib.request.urlopen(request,timeout=20) as response:
            actual=digest(response.read())
        assert actual==expected_hash,'PUBLIC_HTTP_HASH_'+rel
        public[rel]=actual
    assert pm2(ssh)==state['beforePm2'],'PROCESS_CHANGED'
    assert ready(ssh)=={'8080':200,'8083':200},'READY_FAILED'
    state.update(verifiedAt=datetime.now(timezone.utc).isoformat(),diskAndHttpVerified=True,publicHttpHashes=public,pm2Unchanged=True,ready={'8080':200,'8083':200})
    save(output,state)

if __name__=='__main__':main()
