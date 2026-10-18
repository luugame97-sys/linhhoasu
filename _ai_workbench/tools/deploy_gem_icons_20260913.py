import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
R='/linhhoasu';D=Path(__file__).resolve().parents[2]/'_ai_workbench/temp/gem_level100_20260913';B=R+'/_ai_workbench/backups/gem_level100_icons_20260913_pre';F={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':D/'server.next.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':D/'client.next.bin','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':D/'fashion.next.bin'};E={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':'79c80225663b3723188b2fe8205ce9765af0e3791d3f742894d89aa43b355627','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':'f7926c132ad9a3c80dd70cc0f07f438e6dd5aad181169689b9446962dda945c3','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':'ec2ec85211ed315c8c5fd07459f88034cc56e896a0e07062ce6b45394b5b8464'};P=['lhs-s1001','lhs-s1002','lhs-s1003'];sha=lambda b:hashlib.sha256(b).hexdigest();rp=lambda x:R+'/'+x
s=connect();ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'Gem new item existing-icon correction'}
try:
 if run(s,'test -e '+shlex.quote(B)+' && echo yes || echo no').strip()!='no':raise RuntimeError('BACKUP_EXISTS')
 with s.open_sftp() as f:
  for r in F:
   a=sha(f.open(rp(r),'rb').read());
   if a!=E[r]:raise RuntimeError(f'CAS:{r}:{a}:{E[r]}')
 for r in F:
  dst=B+'/'+r;run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(rp(r))+' '+shlex.quote(dst))
 with s.open_sftp() as f:
  for r,p in F.items():
   t=rp(r);tmp=t+'.gemicon_tmp_20260913';f.put(str(p),tmp);f.posix_rename(tmp,t) if hasattr(f,'posix_rename') else f.rename(tmp,t)
 for n in P:run(s,'pm2 restart '+n+' --update-env')
 ev['restarted']=P;ev['ready']={str(p):int(run(s,f"for i in $(seq 1 12);do c=$(curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo $c&&break;sleep 2;done").strip()) for p in [8080,8083,8084]}
 ev['processes']=[{'name':p['name'],'status':p['pm2_env']['status'],'pid':p['pid']} for p in json.loads(run(s,'pm2 jlist')) if p['name'] in P];ev['errors']=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log;do tail -80 \"$f\"|grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true;done")
 with s.open_sftp() as f:ev['hashes']={r:sha(f.open(rp(r),'rb').read()) for r in F}
finally:s.close()
ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'8080':200,'8083':200,'8084':200} and all(p['status']=='online' for p in ev['processes']) and not ev['errors'] and all(ev['hashes'][r]==sha(p.read_bytes()) for r,p in F.items()) else 'HOLD';(D/'icons-deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':ev['result'],'ready':ev.get('ready'),'restarted':ev.get('restarted')}))
