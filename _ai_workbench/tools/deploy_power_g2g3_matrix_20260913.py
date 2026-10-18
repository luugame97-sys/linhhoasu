"""Promote the completed G2/G3 matrix artifacts with exact remote CAS."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/power_g2g3_matrix_20260913'
BACKUP='/linhhoasu/_ai_workbench/backups/power_g2g3_matrix_20260913_pre'
FILES={
 'lhs/newServer/src/net/WSServer.js':'0d38ded201d1de541317ba6f6bf98ec87161b89bffc786d2d92eaedaa4424989',
 'webgame/game/js/lhs-power-display-v1.js':'2def82797a68e914c73016d392afeaca246a68146132e2efa0e2eb02119a080d',
}
PROCS=['lhs-s1001','lhs-s1002','lhs-s1003'];PORTS=[8080,8083,8084]
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 OUT.mkdir(parents=True,exist_ok=True); ev={'startedAt':datetime.now(timezone.utc).isoformat(),'files':[],'restarted':[]}
 ssh=connect()
 try:
  with ssh.open_sftp() as s:
   for rel,expected in FILES.items():
    data=s.open('/linhhoasu/'+rel,'rb').read();actual=sha(data)
    if actual!=expected: raise RuntimeError(f'CAS_MISMATCH:{rel}:{actual}:{expected}')
    p=OUT/'remote'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    ev['files'].append({'file':rel,'remoteBefore':actual,'localCandidate':sha((ROOT/'linhhoasu'/rel).read_bytes())})
  for rel in FILES:
   src='/linhhoasu/'+rel;dst=BACKUP+'/'+rel
   run(ssh,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(src)+' '+shlex.quote(dst))
  with ssh.open_sftp() as s:
   for rel in FILES:
    target='/linhhoasu/'+rel;tmp=target+'.g2g3_tmp_20260913';s.put(str(ROOT/'linhhoasu'/rel),tmp)
    if hasattr(s,'posix_rename'):s.posix_rename(tmp,target)
    else:s.rename(tmp,target)
  run(ssh,'node --check /linhhoasu/lhs/newServer/src/net/WSServer.js')
  for proc in PROCS: run(ssh,'pm2 restart '+proc+' --update-env');ev['restarted'].append(proc)
  ev['ready']={str(p):int(run(ssh,f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done").strip()) for p in PORTS}
  with ssh.open_sftp() as s:
   for row in ev['files']:row['remoteAfter']=sha(s.open('/linhhoasu/'+row['file'],'rb').read())
  ev['served']={'indexMarker':'20260913_power_display_v2' in run(ssh,'curl -sS --max-time 15 http://127.0.0.1:81/index.html'),'hudHttp':int(run(ssh,"curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-power-display-v1.js").strip()),'hudSha256':run(ssh,"curl -sS --max-time 15 http://127.0.0.1:81/js/lhs-power-display-v1.js | sha256sum | awk '{print $1}'").strip()}
  ev['processes']=[{'name':p['name'],'pid':p.get('pid'),'status':(p.get('pm2_env') or {}).get('status'),'restarts':(p.get('pm2_env') or {}).get('restart_time')} for p in json.loads(run(ssh,'pm2 jlist')) if p.get('name') in PROCS]
  ev['errors']=run(ssh,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -160 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module.*(PowerDisplay|NativeBonus)|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
 finally:ssh.close()
 ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'8080':200,'8083':200,'8084':200} and all(p['status']=='online' for p in ev.get('processes',[])) and ev.get('served',{}).get('indexMarker') and ev.get('served',{}).get('hudHttp')==200 and ev.get('served',{}).get('hudSha256')==ev['files'][-1]['localCandidate'] and all(x['remoteAfter']==x['localCandidate'] for x in ev.get('files',[])) and not ev.get('errors') else 'HOLD'
 out=OUT/'deploy.json';out.write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'result':ev['result'],'evidence':str(out),'ready':ev.get('ready'),'served':ev.get('served')},ensure_ascii=False))
if __name__=='__main__':main()
