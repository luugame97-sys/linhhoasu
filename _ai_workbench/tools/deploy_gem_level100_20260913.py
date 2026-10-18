"""Deploy Gem level 11..100 templates and compose recipe with CAS."""
import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'_ai_workbench/temp/gem_level100_20260913';R='/linhhoasu';B=R+'/_ai_workbench/backups/gem_level100_20260913_pre'
F={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':D/'server.next.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':D/'client.next.bin','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':D/'fashion.next.bin','webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':D/'lang.next.bin','webgame/game/index.html':ROOT/'linhhoasu/webgame/game/index.html'}
E={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':'2501ff9b7b4f3bbdc6f1f294d5c8c098fe491681e2c2af9c11e72db3a9552ed9','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':'9caeb0c08652e2383e1fdfaf35ff522aff02fbf22012d118772d8bf0a1409653','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':'afc5270b920ff386df791b637c1d0b1e8ad1e49aa9b44cf32444600c155bf2cf','webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':'7d8d7aef89650e5f3f718e17b59ca697eaeb2138ca5948f4190ab50afc5c8b4b','webgame/game/index.html':'8da4fa02285bf08c4bc3926f87c938f48249c5939069c9e463c8e95016940891'}
P=['lhs-s1001','lhs-s1002','lhs-s1003'];ports={'1001':8080,'1002':8083,'1003':8084};sha=lambda b:hashlib.sha256(b).hexdigest();rp=lambda x:R+'/'+x
def main():
 cand={r:sha(p.read_bytes()) for r,p in F.items()};s=connect();ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'Gem type23-28 levels11-100, 3-to-1'}
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
    t=rp(r);tmp=t+'.gem100_tmp_20260913';f.put(str(p),tmp);f.posix_rename(tmp,t) if hasattr(f,'posix_rename') else f.rename(tmp,t)
  run(s,'node -e '+shlex.quote("const fs=require('fs'),c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');for(const p of ['/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin']){const t=c.decodeTables(fs.readFileSync(p));if(Object.keys(t.GemLevelConfig).length!==588||t.GemBaseConfig.maxQuickLevel!==100||t.GemLevelConfig[25096].level!==10)process.exit(2)}"))
  for n in P:run(s,'pm2 restart '+n+' --update-env')
  ev['restarted']=P;ev['ready']={sid:int(run(s,f"for i in $(seq 1 12);do c=$(curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo $c&&break;sleep 2;done").strip()) for sid,p in ports.items()};ev['processes']=[{'name':p['name'],'status':p['pm2_env']['status'],'pid':p['pid']} for p in json.loads(run(s,'pm2 jlist')) if p['name'] in P];ev['served']={'marker':'20260913_gem_level100_v1' in run(s,'curl -fsS http://127.0.0.1:81/index.html'),'langHttp':run(s,"curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin").strip()};ev['errors']=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log;do tail -80 \"$f\"|grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true;done")
  with s.open_sftp() as f:ev['hashes']={r:sha(f.open(rp(r),'rb').read()) for r in F}
 finally:s.close()
 ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'1001':200,'1002':200,'1003':200} and all(p['status']=='online' for p in ev['processes']) and ev['served']['marker'] and ev['served']['langHttp']=='200' and not ev['errors'] and all(ev['hashes'][r]==cand[r] for r in F) else 'HOLD';(D/'deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':ev['result'],'evidence':str(D/'deploy.json'),'ready':ev.get('ready'),'restarted':ev.get('restarted')}))
if __name__=='__main__':main()
