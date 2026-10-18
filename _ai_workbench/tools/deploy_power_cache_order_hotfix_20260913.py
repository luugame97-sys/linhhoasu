"""Deploy WSServer cache-order hotfix with a single-file CAS."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
ROOT=Path(__file__).resolve().parents[2]
REL='lhs/newServer/src/net/WSServer.js'; LOCAL=ROOT/'linhhoasu'/REL
EXPECTED='159f3e5e544785d11eb19db4c253ca64b2273763ef377580a4f3ab8037c386f2'
BACKUP='/linhhoasu/_ai_workbench/backups/power_cache_order_hotfix_20260913_pre'
PROCS=['lhs-s1001','lhs-s1002','lhs-s1003'];PORTS=[8080,8083,8084]
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 ev={'startedAt':datetime.now(timezone.utc).isoformat(),'file':REL,'localCandidate':sha(LOCAL.read_bytes()),'restarted':[]}
 ssh=connect()
 try:
  with ssh.open_sftp() as s:
   data=s.open('/linhhoasu/'+REL,'rb').read();actual=sha(data)
   if actual!=EXPECTED: raise RuntimeError(f'CAS_MISMATCH:{actual}:{EXPECTED}')
   p=ROOT/'_ai_workbench/temp/power_cache_order_hotfix_20260913/remote_pre.js';p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);ev['remoteBefore']=actual
  run(ssh,'mkdir -p '+shlex.quote(BACKUP+'/lhs/newServer/src/net')+' && cp -p /linhhoasu/'+REL+' '+shlex.quote(BACKUP+'/'+REL))
  with ssh.open_sftp() as s:
   target='/linhhoasu/'+REL;tmp=target+'.cache_order_tmp_20260913';s.put(str(LOCAL),tmp)
   if hasattr(s,'posix_rename'):s.posix_rename(tmp,target)
   else:s.rename(tmp,target)
  run(ssh,'node --check /linhhoasu/'+REL)
  for proc in PROCS:run(ssh,'pm2 restart '+proc+' --update-env');ev['restarted'].append(proc)
  ev['ready']={str(p):int(run(ssh,f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done").strip()) for p in PORTS}
  with ssh.open_sftp() as s:ev['remoteAfter']=sha(s.open('/linhhoasu/'+REL,'rb').read())
  ev['processes']=[{'name':p['name'],'pid':p.get('pid'),'status':(p.get('pm2_env') or {}).get('status'),'restarts':(p.get('pm2_env') or {}).get('restart_time')} for p in json.loads(run(ssh,'pm2 jlist')) if p.get('name') in PROCS]
  ev['errors']=run(ssh,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -120 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module.*(PowerDisplay|NativeBonus)|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
 finally:ssh.close()
 ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'8080':200,'8083':200,'8084':200} and all(p['status']=='online' for p in ev.get('processes',[])) and ev.get('remoteAfter')==ev['localCandidate'] and not ev.get('errors') else 'HOLD'
 out=ROOT/'_ai_workbench/temp/power_cache_order_hotfix_20260913/deploy.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'result':ev['result'],'evidence':str(out),'ready':ev.get('ready')},ensure_ascii=False))
if __name__=='__main__':main()
