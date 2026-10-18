import hashlib,json,shlex
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
WB=Path(__file__).resolve().parents[1];R='/linhhoasu';remote=R+'/webgame/game/index.html';backup=R+'/_ai_workbench/backups/fishing_fashion_box_rank_20260913_order_pre/index.before_order_cache.html';old=b'20260913_fishing_fashion_box_rank_v1';new=b'20260913_fishing_fashion_box_rank_v2';sha=lambda b:hashlib.sha256(b).hexdigest()
s=connect();ev={}
try:
 with s.open_sftp() as f:before=f.open(remote,'rb').read()
 if old not in before:
  if new not in before:raise RuntimeError('INDEX_VERSION_UNEXPECTED')
  after=before
 else:after=before.replace(old,new,1)
 if after!=before:
  run(s,'mkdir -p '+shlex.quote(backup.rsplit('/',1)[0])+' && test ! -e '+shlex.quote(backup)+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(backup))
  with s.open_sftp() as f:
   tmp=remote+'.order_cache_tmp_20260913';f.open(tmp,'wb').write(after);f.posix_rename(tmp,remote) if hasattr(f,'posix_rename') else f.rename(tmp,remote)
 ev={'before':sha(before),'after':sha(after),'changed':after!=before,'served':new.decode() if new.decode() in run(s,'curl -fsS --max-time 20 http://127.0.0.1:81/index.html') else ''};ev['result']='PASS' if ev['served'] else 'HOLD'
finally:s.close()
(WB/'temp/fishing_fashion_box_rank_20260913_order/cachebust.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(ev,ensure_ascii=False))
