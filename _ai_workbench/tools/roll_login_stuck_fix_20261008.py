import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

REMOTE = '/linhhoasu'
APP = REMOTE + '/lhs/newServer'
REL = 'lhs/newServer/src/handlers/account.js'
EXPECTED = '5f92756d3a830d93895cee9738a861fe464069cfbf2067268ffd1e0be49ed9da'
NODES = {'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088}
OUT = Path(__file__).resolve().parents[2] / '_ai_workbench/temp/login_stuck_20261008'
MANIFEST = OUT / 'release.json'

def ready(s, node):
    for _ in range(45):
        try:
            d=json.loads(run(s,f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[node]}/ready'))
            if d.get('status')=='ok' and d.get('checks',{}).get('mongo') is True and d.get('checks',{}).get('redis') is True:return d
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('NOT_READY:'+node)
def pids(s):
    rows=json.loads(run(s,'pm2 jlist'));return {x.get('name'):{'pid':x.get('pid'),'status':x.get('pm2_env',{}).get('status'),'restarts':x.get('pm2_env',{}).get('restart_time')} for x in rows if x.get('name','').startswith('lhs-')}
def sha(s,p): return run(s,f"sha256sum -- {shlex.quote(p)} | awk '{{print $1}}'").strip().lower()
def save(m): MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    m=json.loads(MANIFEST.read_text(encoding='utf-8'))
    if m.get('phase')!='canary_ready': raise RuntimeError('CANARY_REQUIRED')
    with connect() as s:
        if sha(s,REMOTE+'/'+REL)!=EXPECTED: raise RuntimeError('CANDIDATE_NOT_INSTALLED')
        m['rollPreProcesses']=pids(s);m['rollPreReady']={n:ready(s,n) for n in NODES};save(m)
        for n in NODES:
            run(s,f'pm2 restart {shlex.quote(n)}')
            m.setdefault('rollingReady',{})[n]=ready(s,n);m.setdefault('restarted',[]).append(n);save(m)
        m['rollPostProcesses']=pids(s);m['rollFinalReady']={n:ready(s,n) for n in NODES};m['phase']='fleet_ready';m['fleetVerifiedAt']=datetime.now(timezone.utc).isoformat();save(m)
    print(json.dumps(m,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
