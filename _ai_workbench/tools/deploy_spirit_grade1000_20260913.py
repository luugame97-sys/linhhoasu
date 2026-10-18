"""Scoped production deploy for SpiritGradeConfig 41..1000."""
import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];STAGE=ROOT/'_ai_workbench/temp/spirit_grade1000_20260913';OUT=STAGE;RR='/linhhoasu';BACK=RR+'/_ai_workbench/backups/spirit_grade1000_20260913_pre';
FILES={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':STAGE/'server.next.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':STAGE/'client.next.bin','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':STAGE/'client-fashion.next.bin','webgame/game/index.html':STAGE/'index.next.html','lhs/newServer/src/handlers/spirit.js':STAGE/'spirit.next.js'}
EXPECTED={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':'0f36cdc14acbdc7298ec949e003df7f05a588d242d2647f48b8630c03c7a1460','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':'9ce07ad2047aa3a749f5760a0b0ee9c0560b4e7ee5ebbd030ed7e610e60d3864','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':'74772281ec3949cc4c47ad831a35d1040ecdb83797111cebf8c8866ac288c08f','webgame/game/index.html':'51fe591ab221dffdbee3e30c9534b8e03d4e7e4b1384c42957b30011f4be0ac7','lhs/newServer/src/handlers/spirit.js':'73a9d7f0b8965d23f0c88a3bbe93ea36e89b9adeaa8babfc4d01edf4feeacd37'}
PROCS=['lhs-s1001','lhs-s1002','lhs-s1003'];PORTS={'1001':8080,'1002':8083,'1003':8084};sha=lambda b:hashlib.sha256(b).hexdigest();rp=lambda r:RR+'/'+r
def main():
 OUT.mkdir(parents=True,exist_ok=True);cand={r:sha(p.read_bytes()) for r,p in FILES.items()};ssh=connect();ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'SpiritGradeConfig 1-40 preserved + 41-1000'}
 try:
  if run(ssh,'test -e '+shlex.quote(BACK)+' && echo yes || echo no').strip()!='no':raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
  with ssh.open_sftp() as s:
   for r in FILES:
    d=s.open(rp(r),'rb').read();a=sha(d)
    if a!=EXPECTED[r]:raise RuntimeError(f'CAS_MISMATCH:{r}:{a}:{EXPECTED[r]}')
    b=OUT/'remote_before'/r;b.parent.mkdir(parents=True,exist_ok=True);b.write_bytes(d)
  for r in FILES:
   dst=BACK+'/'+r;run(ssh,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(rp(r))+' '+shlex.quote(dst))
  with ssh.open_sftp() as s:
   for r,p in FILES.items():
    t=rp(r);tmp=t+'.spirit_grade1000_tmp_20260913';s.put(str(p),tmp);s.posix_rename(tmp,t) if hasattr(s,'posix_rename') else s.rename(tmp,t)
  run(ssh,'node --check '+shlex.quote(rp('lhs/newServer/src/handlers/spirit.js')))
  for n in PROCS:run(ssh,'pm2 restart '+n+' --update-env')
  ev['restarted']=PROCS;ev['ready']={sid:int(run(ssh,f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready||true); [ \"$c\" = 200 ]&&echo $c&&break;sleep 2;done").strip()) for sid,p in PORTS.items()}
  ev['processes']=[{'name':p['name'],'pid':p['pid'],'status':p['pm2_env']['status'],'restarts':p['pm2_env']['restart_time']} for p in json.loads(run(ssh,'pm2 jlist')) if p['name'] in PROCS]
  idx=run(ssh,'curl -fsS --max-time 20 http://127.0.0.1:81/index.html');ev['served']={'indexMarker':'20260913_spirit_grade1000_v1' in idx,'indexSha':sha(idx.encode()),'configHttp':run(ssh,"curl -fsS http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin?v=20260913_spirit_grade1000_v1|sha256sum|awk '{print $1}'").strip()}
  ev['recentErrors']=run(ssh,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log;do tail -100 \"$f\"|grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true;done")
  with ssh.open_sftp() as s:
   ev['hashes']={r:sha(s.open(rp(r),'rb').read()) for r in FILES}
 finally:ssh.close()
 ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'1001':200,'1002':200,'1003':200} and all(p['status']=='online' for p in ev.get('processes',[])) and ev.get('served',{}).get('indexMarker') and not ev.get('recentErrors') and all(ev['hashes'][r]==cand[r] for r in FILES) else 'HOLD';(OUT/'deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':ev['result'],'evidence':str(OUT/'deploy.json'),'ready':ev.get('ready'),'restarted':ev.get('restarted')}))
if __name__=='__main__':main()
