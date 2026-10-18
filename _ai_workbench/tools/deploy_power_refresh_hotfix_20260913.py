"""Deploy the urgent self power refresh hotfix with CAS and scoped restart."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'power_refresh_hotfix_20260913'
BACKUP = '/linhhoasu/_ai_workbench/backups/power_refresh_hotfix_20260913_pre'
FILES = {
  'lhs/newServer/src/services/BattleService.js': 'db3491c30d0b25e93468ff23c0f9eaf441a77231bdd10fcfba5c26f05b9aa5be',
  'lhs/newServer/src/handlers/basic.js': 'f1634bd850e4b7a926361a3afdbcab99ce12c5496d0987aa579aa8d5542276f6',
  'lhs/newServer/src/net/WSServer.js': 'b3c154630c55703394fde103c4f22055037daff1b4d4844f09b3354b465770ef',
  'webgame/game/js/lhs-power-display-v1.js': '7bfd856195967f15b44ccb9ff8270ae51b63b649d7ae0dc84f63f6ece298a971',
}
PROCS = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
PORTS = [8080, 8083, 8084]

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
  OUT.mkdir(parents=True, exist_ok=True)
  ev = {'readOnly': False, 'startedAt': datetime.now(timezone.utc).isoformat(), 'files': [], 'restarted': []}
  ssh = connect()
  try:
    with ssh.open_sftp() as s:
      for rel, expected in FILES.items():
        data = s.open('/linhhoasu/' + rel, 'rb').read(); actual = sha(data)
        if actual != expected: raise RuntimeError(f'CAS_MISMATCH:{rel}:{actual}:{expected}')
        b=OUT/'remote'/rel; b.parent.mkdir(parents=True,exist_ok=True); b.write_bytes(data)
        ev['files'].append({'file':rel,'remoteBefore':actual,'localCandidate':sha((ROOT/'linhhoasu'/rel).read_bytes())})
    for rel in FILES:
      src='/linhhoasu/'+rel; dst=BACKUP+'/'+rel
      run(ssh,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && if [ -f '+shlex.quote(src)+' ]; then cp -p '+shlex.quote(src)+' '+shlex.quote(dst)+'; fi')
    with ssh.open_sftp() as s:
      for rel in FILES:
        target='/linhhoasu/'+rel; tmp=target+'.power_refresh_tmp_20260913'
        s.put(str(ROOT/'linhhoasu'/rel),tmp)
        if hasattr(s,'posix_rename'): s.posix_rename(tmp,target)
        else: s.rename(tmp,target)
    run(ssh,'node --check /linhhoasu/lhs/newServer/src/net/WSServer.js /linhhoasu/lhs/newServer/src/handlers/basic.js /linhhoasu/lhs/newServer/src/services/BattleService.js')
    for proc in PROCS:
      run(ssh,'pm2 restart '+proc+' --update-env'); ev['restarted'].append(proc)
    ev['ready']={str(p):int(run(ssh,f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done").strip()) for p in PORTS}
    with ssh.open_sftp() as s:
      for row in ev['files']:
        row['remoteAfter']=sha(s.open('/linhhoasu/'+row['file'],'rb').read())
    ev['served']={'indexMarker':'20260913_power_display_v2' in run(ssh,'curl -sS --max-time 15 http://127.0.0.1:81/index.html'),'hudHttp':int(run(ssh,"curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-power-display-v1.js").strip()),'hudSha256':run(ssh,"curl -sS --max-time 15 http://127.0.0.1:81/js/lhs-power-display-v1.js | sha256sum | awk '{print $1}'").strip()}
    ev['processes']=[{'name':p['name'],'pid':p.get('pid'),'status':(p.get('pm2_env') or {}).get('status'),'restarts':(p.get('pm2_env') or {}).get('restart_time')} for p in json.loads(run(ssh,'pm2 jlist')) if p.get('name') in PROCS]
    ev['newErrors']=run(ssh,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -120 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module.*(PowerDisplay|NativeBonus)|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
  finally: ssh.close()
  ev['finishedAt']=datetime.now(timezone.utc).isoformat()
  ev['result']='PASS' if ev.get('ready')=={'8080':200,'8083':200,'8084':200} and all(p['status']=='online' for p in ev.get('processes',[])) and ev.get('served',{}).get('indexMarker') and ev.get('served',{}).get('hudHttp')==200 and ev.get('served',{}).get('hudSha256')==ev['files'][-1]['localCandidate'] and not ev.get('newErrors') and all(x['remoteAfter']==x['localCandidate'] for x in ev.get('files',[])) else 'HOLD'
  path=OUT/'deploy.json'; path.write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'result':ev['result'],'evidence':str(path),'ready':ev.get('ready'),'served':ev.get('served')},ensure_ascii=False))

if __name__=='__main__': main()
