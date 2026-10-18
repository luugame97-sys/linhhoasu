import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
WB=Path(__file__).resolve().parents[1]; STAGE=WB/'temp/fishing_fashion_box_rank_20260913'; R='/linhhoasu'; rel='webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'; remote=R+'/'+rel; cand=STAGE/'fashion.bin.next.bin'; backup=R+'/_ai_workbench/backups/fishing_fashion_box_rank_20260913_pre/config_fashion.before_retry.bin'; sha=lambda b:hashlib.sha256(b).hexdigest()
s=connect(); ev={'at':datetime.now(timezone.utc).isoformat(),'remote':remote,'candidate':sha(cand.read_bytes())}
try:
 with s.open_sftp() as f:
  before=f.open(remote,'rb').read();ev['before']=sha(before)
  if ev['before']!= 'fe640bd12b88a138c70e311d01ac4a480072621dcb865c535f79d44e6b72f746': raise RuntimeError('CAS_DRIFT')
  run(s,'mkdir -p '+shlex.quote(backup.rsplit('/',1)[0])+' && test ! -e '+shlex.quote(backup)+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(backup))
  tmp=remote+'.fashionrank_tmp_retry_20260913';f.put(str(cand),tmp);f.posix_rename(tmp,remote) if hasattr(f,'posix_rename') else f.rename(tmp,remote);ev['after']=sha(f.open(remote,'rb').read());assert ev['after']==ev['candidate']
 ev['served']=run(s,"curl -fsS --max-time 20 http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin?v=20260913_fishing_fashion_box_rank | sha256sum | awk '{print $1}'").strip();assert ev['served']==ev['candidate']
 ev['ready']={str(p):run(s,"curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+'/ready').strip() for p in [8080,8083,8084]};ev['result']='PASS'
finally:s.close()
(STAGE/'overlay-final.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(ev,ensure_ascii=False))
