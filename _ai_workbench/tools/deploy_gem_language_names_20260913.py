import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
R='/linhhoasu';D=Path(__file__).resolve().parents[2]/'_ai_workbench/temp/gem_level100_20260913';B=R+'/_ai_workbench/backups/gem_language_names_20260913_pre';F={'webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':D/'lang.native.next.bin','webgame/game/index.html':Path(__file__).resolve().parents[2]/'linhhoasu/webgame/game/index.html'};E={'webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':'c6e6051699c0c74d478b2d380522862e85debcd6f6a1dda2c92d624e21829852','webgame/game/index.html':'184f7c74cca5d85727176656a0ae1f84dde6308c17636379e019163fe25d1262'};sha=lambda b:hashlib.sha256(b).hexdigest();rp=lambda r:R+'/'+r
s=connect();ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'native gem language names 11-100'}
try:
 if run(s,'test -e '+shlex.quote(B)+' && echo yes || echo no').strip()!='no':raise RuntimeError('BACKUP_EXISTS')
 with s.open_sftp() as f:
  for r in F:
   d=f.open(rp(r),'rb').read();a=sha(d)
   if a!=E[r]:raise RuntimeError(f'CAS:{r}:{a}:{E[r]}')
 for r in F:
  dst=B+'/'+r;run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(rp(r))+' '+shlex.quote(dst))
 with s.open_sftp() as f:
  for r,p in F.items():
   t=rp(r);tmp=t+'.gemlang_tmp_20260913';f.put(str(p),tmp);f.posix_rename(tmp,t) if hasattr(f,'posix_rename') else f.rename(tmp,t)
 ev['hashes']={}
 with s.open_sftp() as f:ev['hashes']={r:sha(f.open(rp(r),'rb').read()) for r in F}
 ev['servedMarker']='20260913_gem_names_v1' in run(s,'curl -fsS http://127.0.0.1:81/index.html');ev['langHttp']=run(s,"curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin").strip()
finally:s.close()
ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('servedMarker') and ev.get('langHttp')=='200' and all(ev['hashes'][r]==sha(p.read_bytes()) for r,p in F.items()) else 'HOLD';(D/'language-deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':ev['result'],'evidence':str(D/'language-deploy.json')}))
