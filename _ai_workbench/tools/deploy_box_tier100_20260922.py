"""CAS deploy sequential drop-tier 11..100; no DB/player writes."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]; APP=ROOT/'linhhoasu'
FILES=['lhs/newServer/src/config/dropLevel100.js','lhs/newServer/src/handlers/box.js','webgame/game/index.html','webgame/game/js/lhs-box-tier100-v1.js']
REMOTE='/linhhoasu'; BACKUP='/linhhoasu/_ai_workbench/backups/box_tier100_20260922'; STAGE='/linhhoasu/_ai_workbench/temp/box_tier100_20260922'
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
EXPECTED={'lhs/newServer/src/config/dropLevel100.js':'5f2ecc2fe402bdf830f9fe992f4cb441e80371b261166fff286cff05d4ade2cd','lhs/newServer/src/handlers/box.js':'fedd71afa21640dff416cc310185cbec7e8f245b34c04911a33f7adf1452c2ab','webgame/game/index.html':'afbf950bb1c690f4ef80e8eb4b8298ec9e60093a40c46f6c0238c5fb36673bf4','webgame/game/js/lhs-box-tier100-v1.js':''}
def sha(b):return hashlib.sha256(b).hexdigest()
def ready(s,p):
    return run(s,f"for i in $(seq 1 90);do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1").strip()
def main():
    local={rel:(APP/rel).read_bytes() for rel in FILES}
    if 'js/lhs-box-tier100-v1.js?v=20260922_box_tier100_v1' not in local['webgame/game/index.html'].decode('utf8'):
        raise RuntimeError('CLIENT_INDEX_REFERENCE_MISSING')
    if b'extendBoxTier100' not in local['lhs/newServer/src/config/dropLevel100.js'] or b'maxOpenCount' not in local['lhs/newServer/src/handlers/box.js']:
        raise RuntimeError('SERVER_TIER_MARKER_MISSING')
    s=connect();before={};published=[];touched=[]
    try:
      with s.open_sftp() as sf:
        run(s,'install -d -m 700 '+shlex.quote(BACKUP)); run(s,'install -d -m 700 '+shlex.quote(STAGE))
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
          expected=EXPECTED[rel]
          if expected and sha(old)!=expected:raise RuntimeError('REMOTE_CAS_DRIFT:'+rel+':'+sha(old))
          if rel.endswith('.js') and rel.startswith('lhs/'):
            run(s,'node --check '+shlex.quote(REMOTE+'/'+rel))
          staged=STAGE+'/'+str(int(time.time()))+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
          with sf.open(staged,'wb') as f:f.write(local[rel])
          sf.chmod(staged,0o600)
          if rel.endswith('.js') and rel.startswith('lhs/'):
            run(s,'node --check '+shlex.quote(staged))
          sf.posix_rename(staged,rp);published.append(rel)
      for name,port in NODES:
        run(s,'pm2 restart '+name+' --update-env');touched.append(name)
        if ready(s,port)!='200':raise RuntimeError('READY_FAILED:'+name)
      out={'result':'DEPLOYED_AND_READY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'backup':BACKUP,'files':{r:{'before':sha(before[r]),'after':sha(local[r])} for r in FILES},'restartOrder':touched,'readiness':{str(p):run(s,f'curl -fsS http://127.0.0.1:{p}/ready').strip() for _,p in NODES}}
      (ROOT/'_ai_workbench/temp/box_tier100_20260922/release.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
    except Exception:
      try:
        with s.open_sftp() as sf:
          for rel in published:
            tmp=STAGE+'/rollback_'+str(int(time.time()))+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(tmp.rsplit('/',1)[0]))
            with sf.open(tmp,'wb') as f:f.write(before[rel])
            sf.chmod(tmp,0o600);sf.posix_rename(tmp,REMOTE+'/'+rel)
        for name,port in NODES:
          if name in touched:run(s,'pm2 restart '+name+' --update-env');ready(s,port)
      finally:s.close()
      raise
    s.close()
if __name__=='__main__':main()
