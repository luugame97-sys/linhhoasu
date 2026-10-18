"""Deploy mount level 1000 config and narrow handler/client guards."""
import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'_ai_workbench/temp/mount_level1000_20260913';B='/linhhoasu/_ai_workbench/backups/mount_level1000_20260913_pre';R='/linhhoasu'
F={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':D/'next/server.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':D/'next/client.bin','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':D/'next/fashion.bin','lhs/newServer/src/handlers/mount.js':D/'mount.next.js','webgame/game/index.html':D/'index.next.html','webgame/game/js/lhs-mount-fix-v1.js':D/'mount-fix.next.js'}
E={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':'0eb10cfc5a5a5ef75fce66f183eb564996f5dcaf89f6953e57b9c4e5eaed9dbd','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':'d8a5188c8cc53fe2d0dffbfae16ec3703734245c1ce2c3855341069d24d4f643','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':'31c58f08f87533121efb9e5ff0729ac94e81fb1d1e83cd15d8dccccd3070280a','lhs/newServer/src/handlers/mount.js':'510c8e68018cdb3f69316c7cdf4992d1525d0b53f3f9266fb6276b94c8cc2b25','webgame/game/index.html':'573807b467c31f377c2e9912106d75e28c50d8c21f132de74fc0ac9ba4bdbf08','webgame/game/js/lhs-mount-fix-v1.js':None}
P=['lhs-s1001','lhs-s1002','lhs-s1003'];ports={'1001':8080,'1002':8083,'1003':8084};sha=lambda b:hashlib.sha256(b).hexdigest();rp=lambda x:R+'/'+x
def main():
 cand={r:sha(p.read_bytes()) for r,p in F.items()};s=connect();ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'SwordLevelConfig 1-1000 + mount guard'}
 try:
  if run(s,'test -e '+shlex.quote(B)+' && echo yes || echo no').strip()!='no':raise RuntimeError('BACKUP_EXISTS')
  with s.open_sftp() as f:
   for r in F:
    try:d=f.open(rp(r),'rb').read();a=sha(d)
    except FileNotFoundError:d=b'';a=None
    if E[r] is None and a is not None:raise RuntimeError('EXPECTED_ABSENT:'+r)
    if E[r] is not None and a!=E[r]:raise RuntimeError(f'CAS:{r}:{a}:{E[r]}')
  for r in F:
   if E[r] is not None:
    dst=B+'/'+r;run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(rp(r))+' '+shlex.quote(dst))
  with s.open_sftp() as f:
   for r,p in F.items():
    t=rp(r);tmp=t+'.mount1000_tmp_20260913';f.put(str(p),tmp);f.posix_rename(tmp,t) if hasattr(f,'posix_rename') else f.rename(tmp,t)
  run(s,'node --check '+shlex.quote(rp('lhs/newServer/src/handlers/mount.js')))
  for n in P:run(s,'pm2 restart '+n+' --update-env')
  ev['restarted']=P;ev['ready']={sid:int(run(s,f"for i in $(seq 1 12);do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo $c&&break;sleep 2;done").strip()) for sid,p in ports.items()}
  ev['processes']=[{'name':p['name'],'status':p['pm2_env']['status'],'pid':p['pid'],'restarts':p['pm2_env']['restart_time']} for p in json.loads(run(s,'pm2 jlist')) if p['name'] in P]
  idx=run(s,'curl -fsS http://127.0.0.1:81/index.html');ev['served']={'marker':'20260913_spirit_mount_level1000_v1' in idx,'patchHttp':int(run(s,"curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-mount-fix-v1.js").strip())}
  ev['errors']=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log;do tail -100 \"$f\"|grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true;done")
  with s.open_sftp() as f:ev['hashes']={r:sha(f.open(rp(r),'rb').read()) for r in F}
 finally:s.close()
 ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'1001':200,'1002':200,'1003':200} and all(p['status']=='online' for p in ev['processes']) and ev['served']['marker'] and ev['served']['patchHttp']==200 and not ev['errors'] and all(ev['hashes'][r]==cand[r] for r in F) else 'HOLD';(D/'deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':ev['result'],'evidence':str(D/'deploy.json'),'ready':ev.get('ready'),'restarted':ev.get('restarted')}))
if __name__=='__main__':main()
