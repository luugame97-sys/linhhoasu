import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
WB=Path(__file__).resolve().parents[1];STAGE=WB/'temp/fishing_fashion_box_rank_20260913';R='/linhhoasu';APP=R+'/webgame/game';rel='index.html';remote=APP+'/'+rel;backup=R+'/_ai_workbench/backups/fishing_fashion_box_rank_20260913_pre/index.before_cachebust.html';sha=lambda b:hashlib.sha256(b).hexdigest()
s=connect();ev={'at':datetime.now(timezone.utc).isoformat()}
try:
 with s.open_sftp() as f: before=f.open(remote,'rb').read()
 old=b"var translationVersion = '20260913_gem_names_v1';";new=b"var translationVersion = '20260913_fishing_fashion_box_rank_v1';"
 if old not in before:
  if new not in before: raise RuntimeError('INDEX_VERSION_UNEXPECTED')
  after=before
 else: after=before.replace(old,new,1)
 if after!=before:
  run(s,'mkdir -p '+shlex.quote(backup.rsplit('/',1)[0])+' && test ! -e '+shlex.quote(backup)+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(backup))
  with s.open_sftp() as f:
   tmp=remote+'.cachebust_tmp_20260913';f.put(str(STAGE/'index.cachebust.html'),tmp) if (STAGE/'index.cachebust.html').exists() else f.open(tmp,'wb').write(after)
   if hasattr(f,'posix_rename'):f.posix_rename(tmp,remote)
   else:f.rename(tmp,remote)
  ev.update({'before':sha(before),'after':sha(after),'changed':True})
 else:ev.update({'before':sha(before),'after':sha(after),'changed':False})
 ev['servedVersion']=run(s,"curl -fsS --max-time 20 http://127.0.0.1:81/index.html | rg -o '20260913_fishing_fashion_box_rank_v1' | head -1").strip();ev['result']='PASS' if ev['servedVersion']=='20260913_fishing_fashion_box_rank_v1' else 'HOLD'
finally:s.close()
(STAGE/'cachebust.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(ev,ensure_ascii=False))
