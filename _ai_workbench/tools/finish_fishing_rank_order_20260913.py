import hashlib,json,shlex
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
WB=Path(__file__).resolve().parents[1];STAGE=WB/'temp/fishing_fashion_box_rank_20260913_order';R='/linhhoasu';remote=R+'/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin';cand=STAGE/'fashion.bin.next.bin';backup=R+'/_ai_workbench/backups/fishing_fashion_box_rank_20260913_order_pre/config_fashion.before_order.bin';sha=lambda b:hashlib.sha256(b).hexdigest()
s=connect();ev={}
try:
 with s.open_sftp() as f:before=f.open(remote,'rb').read()
 ev['before']=sha(before);ev['candidate']=sha(cand.read_bytes())
 if ev['before']==ev['candidate']:
  ev['changed']=False
 else:
  # Candidate was built from this exact remote baseline; never overwrite drift.
  if ev['before']!='a0cb60e65d39e26e541873bae24e6cd7b64c31e10c439bd62bbe360c9c631225':raise RuntimeError('CAS_DRIFT')
  run(s,'mkdir -p '+shlex.quote(backup.rsplit('/',1)[0])+' && test ! -e '+shlex.quote(backup)+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(backup))
  with s.open_sftp() as f:
   tmp=remote+'.order_tmp_20260913';f.put(str(cand),tmp);f.posix_rename(tmp,remote) if hasattr(f,'posix_rename') else f.rename(tmp,remote);ev['after']=sha(f.open(remote,'rb').read())
  ev['changed']=True
 ev['served']=run(s,"curl -fsS --max-time 20 http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin?v=20260913_fishing_fashion_box_rank_v2 | sha256sum | awk '{print $1}'").strip();ev['ready']={str(p):run(s,"curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+'/ready').strip() for p in [8080,8083,8084]};ev['result']='PASS' if ev['served']==ev['candidate'] and set(ev['ready'].values())=={'200'} else 'HOLD'
finally:s.close()
(STAGE/'order-final.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(ev,ensure_ascii=False))
