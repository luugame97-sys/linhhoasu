"""CAS/backup/static-only rollout for Pet result guards; no PM2 or player writes."""
import hashlib, json, shlex, time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT=Path(__file__).resolve().parents[2]
GAME=ROOT/'linhhoasu/webgame/game'
BUNDLE=GAME/'js/main.min_drop100.js'; INDEX=GAME/'index.html'
REMOTE_BUNDLE='/linhhoasu/webgame/game/js/main.min_drop100.js'; REMOTE_INDEX='/linhhoasu/webgame/game/index.html'
BACKUP='/linhhoasu/_ai_workbench/backups/pet_client_result_guard_20260924'
STAGE_ROOT='/linhhoasu/_ai_workbench/temp/pet_client_result_guard_20260924'
NEW_KEY='20260924_pet_result_guard_v1'
BEFORE_BUNDLE='0e662b2b3c405cfea3981032d90ba7751e13cb78de004ebfda5f479586aa0ed2'
BEFORE_INDEX='55769cf9e1692aaccb2890c091ea9a11b56dab09d57af79ac0790291756a9029'

def sha(data): return hashlib.sha256(data).hexdigest()
def read(sf,path):
    with sf.open(path,'rb') as f:return f.read()
def put(sf,path,data,attrs):
    with sf.open(path,'wb') as f:f.write(data)
    sf.chmod(path,attrs.st_mode&0o777)
    try: sf.chown(path,attrs.st_uid,attrs.st_gid)
    except OSError: pass

def main():
    candidate={REMOTE_BUNDLE:BUNDLE.read_bytes(),REMOTE_INDEX:INDEX.read_bytes()}
    if sha(candidate[REMOTE_BUNDLE])=='': raise RuntimeError('EMPTY_CANDIDATE')
    if NEW_KEY.encode() not in candidate[REMOTE_INDEX]: raise RuntimeError('CACHE_KEY_MISSING')
    if sha(candidate[REMOTE_BUNDLE])=='0e662b2b3c405cfea3981032d90ba7751e13cb78de004ebfda5f479586aa0ed2': raise RuntimeError('PATCH_NOT_PRESENT')
    if sha(candidate[REMOTE_INDEX])==BEFORE_INDEX: raise RuntimeError('INDEX_NOT_BUMPED')
    ssh=connect(); stage=None
    try:
      with ssh.open_sftp() as sf:
        remote_before={REMOTE_BUNDLE:read(sf,REMOTE_BUNDLE),REMOTE_INDEX:read(sf,REMOTE_INDEX)}
        attrs={p:sf.stat(p) for p in remote_before}
        if sha(remote_before[REMOTE_BUNDLE])!=BEFORE_BUNDLE: raise RuntimeError('REMOTE_BUNDLE_CAS_DRIFT:'+sha(remote_before[REMOTE_BUNDLE]))
        if sha(remote_before[REMOTE_INDEX])!=BEFORE_INDEX: raise RuntimeError('REMOTE_INDEX_CAS_DRIFT:'+sha(remote_before[REMOTE_INDEX]))
        try: sf.stat(BACKUP); backup_exists=True
        except FileNotFoundError: backup_exists=False
        if not backup_exists: run(ssh,'install -d -m 700 '+shlex.quote(BACKUP))
        for remote,data in remote_before.items():
            bp=BACKUP+'/'+Path(remote).name+'.before'
            try: old=read(sf,bp)
            except FileNotFoundError:
                if backup_exists: raise RuntimeError('REMOTE_BACKUP_MISSING:'+bp)
                put(sf,bp,data,attrs[remote]);sf.chmod(bp,0o600)
            else:
                if old!=data: raise RuntimeError('REMOTE_BACKUP_DRIFT:'+bp)
        if read(sf,REMOTE_BUNDLE)!=remote_before[REMOTE_BUNDLE] or read(sf,REMOTE_INDEX)!=remote_before[REMOTE_INDEX]: raise RuntimeError('REMOTE_CAS_DRIFT_PRE_STAGE')
        stage=STAGE_ROOT+'_'+str(int(time.time()));run(ssh,'install -d -m 700 '+shlex.quote(stage))
        sb=stage+'/main.min_drop100.js';si=stage+'/index.html'
        put(sf,sb,candidate[REMOTE_BUNDLE],attrs[REMOTE_BUNDLE]);put(sf,si,candidate[REMOTE_INDEX],attrs[REMOTE_INDEX])
        run(ssh,'node --check '+shlex.quote(sb))
        check=run(ssh,'node -e '+shlex.quote("const fs=require('fs'),s=fs.readFileSync(process.argv[1],'utf8');const a=['!t||t.result!==0||!Array.isArray(t.data)','if(!t||t.result!==0||!t.data)return void(c&&c(t))','if(!t||t.result!==0||!t.data)return void(h&&h(t))','if(!t||t.result!==0){S.ins().showTips'];if(a.some(x=>!s.includes(x)))process.exit(2);console.log('PET_RESULT_GUARD_STAGE_PASS');")+' '+shlex.quote(sb)).strip()
        if check!='PET_RESULT_GUARD_STAGE_PASS':raise RuntimeError('STAGE_MARKER_CHECK_FAILED:'+check)
        sf.posix_rename(sb,REMOTE_BUNDLE);sf.posix_rename(si,REMOTE_INDEX)
      served=run(ssh,'curl -fsS '+shlex.quote('http://127.0.0.1:81/js/main.min_drop100.js?v='+NEW_KEY));served_index=run(ssh,'curl -fsS http://127.0.0.1:81/index.html')
      if sha(served.encode())!=sha(candidate[REMOTE_BUNDLE]):raise RuntimeError('SERVED_BUNDLE_HASH_MISMATCH:'+sha(served.encode()))
      if NEW_KEY not in served_index:raise RuntimeError('SERVED_INDEX_CACHE_KEY_MISSING')
      if 'PET_RESULT_GUARD' in served: raise RuntimeError('UNEXPECTED_MARKER')
      release={'result':'DEPLOYED_STATIC_ONLY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'pm2Restart':False,'before':{p:{'sha256':sha(d),'bytes':len(d)} for p,d in remote_before.items()},'after':{'bundle':sha(candidate[REMOTE_BUNDLE]),'index':sha(candidate[REMOTE_INDEX]),'servedBundle':sha(served.encode()),'cacheKey':NEW_KEY},'backup':BACKUP,'stageCheck':check}
      out=ROOT/'_ai_workbench/temp/pet_client_result_guard_20260924_release.json';out.write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(release,ensure_ascii=False,indent=2))
    except Exception:
      # No rollback is attempted unless a publish occurred; CAS/stage errors do
      # not touch live files. The script intentionally stops on any mismatch.
      raise
    finally:
      if stage:
        try: run(ssh,'rm -rf -- '+shlex.quote(stage))
        except Exception: pass
      ssh.close()
if __name__=='__main__':main()
