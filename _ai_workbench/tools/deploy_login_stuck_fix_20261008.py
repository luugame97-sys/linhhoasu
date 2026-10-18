"""Canary/roll the login tag=1 deferred normalization save fix.
Scope is account.js only; player data and Mongo schema are untouched.
"""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/linhhoasu'
REL = 'lhs/newServer/src/handlers/account.js'
REMOTE_FILE = REMOTE + '/' + REL
CANDIDATE = ROOT / '_ai_workbench/temp/login_stuck_20261008/candidate' / REL
BEFORE = '282fae1c55a760df55f6452b1ff705e803d39772b2b189c8c49ec555c2f968a7'
NODES = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088}
OUT = ROOT / '_ai_workbench/temp/login_stuck_20261008'
MANIFEST = OUT / 'release.json'

def sha(data): return hashlib.sha256(data).hexdigest()
def rsha(s, path): return run(s, f"sha256sum -- {shlex.quote(path)} | awk '{{print $1}}'").strip().lower()
def ready(s, node):
    for _ in range(45):
        try:
            d=json.loads(run(s,f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[node]}/ready'))
            if d.get('status')=='ok' and d.get('checks',{}).get('mongo') is True and d.get('checks',{}).get('redis') is True:return d
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('NOT_READY:'+node)
def save(m):
    OUT.mkdir(parents=True,exist_ok=True);MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def pids(s):
    rows=json.loads(run(s,'pm2 jlist'));return {x.get('name'):{'pid':x.get('pid'),'status':x.get('pm2_env',{}).get('status'),'restarts':x.get('pm2_env',{}).get('restart_time')} for x in rows if x.get('name','').startswith('lhs-')}

def main():
    data=CANDIDATE.read_bytes();candidate=sha(data)
    if candidate==BEFORE: raise RuntimeError('CANDIDATE_UNCHANGED')
    manifest={'phase':'candidate','version':'login_deferred_save_20261008_v1','relative':REL,'before':BEFORE,'candidate':candidate,'playerWrites':0}
    with connect() as s:
        actual=rsha(s,REMOTE_FILE)
        if actual!=BEFORE: raise RuntimeError(f'CAS_MISMATCH:{actual}')
        manifest['preProcesses']=pids(s);manifest['preReady']={n:ready(s,n) for n in NODES};save(manifest)
        stamp=datetime.now(timezone.utc).strftime('%H%M%S');backup=f'{REMOTE}/_ai_workbench/backups/login_stuck_fix_20261008_{stamp}'
        run(s,'mkdir -p '+shlex.quote(backup));run(s,'cp -p '+shlex.quote(REMOTE_FILE)+' '+shlex.quote(backup+'/'+Path(REL).name))
        if rsha(s,backup+'/'+Path(REL).name)!=BEFORE: raise RuntimeError('BACKUP_HASH')
        manifest['backup']=backup;save(manifest)
        stage=REMOTE+'/_ai_workbench/temp/login_stuck_20261008/candidate/'+Path(REL).name
        run(s,'mkdir -p '+shlex.quote(stage.rsplit('/',1)[0]))
        # Upload via base64 through stdin, avoiding shell interpolation.
        import base64
        i,o,e=s.exec_command('base64 -d > '+shlex.quote(stage),timeout=120);i.write(base64.b64encode(data));i.channel.shutdown_write()
        if o.channel.recv_exit_status()!=0 or rsha(s,stage)!=candidate: raise RuntimeError('STAGE_HASH')
        run(s,'node --check '+shlex.quote(stage))
        tmp=REMOTE_FILE+'.login_stuck_20261008.tmp'
        if rsha(s,REMOTE_FILE)!=BEFORE: raise RuntimeError('PUBLISH_CAS')
        run(s,'cp '+shlex.quote(stage)+' '+shlex.quote(tmp)+' && chmod --reference='+shlex.quote(REMOTE_FILE)+' '+shlex.quote(tmp)+' && chown --reference='+shlex.quote(REMOTE_FILE)+' '+shlex.quote(tmp))
        if rsha(s,tmp)!=candidate: raise RuntimeError('TEMP_HASH')
        run(s,'mv -f '+shlex.quote(tmp)+' '+shlex.quote(REMOTE_FILE))
        if rsha(s,REMOTE_FILE)!=candidate: raise RuntimeError('INSTALLED_HASH')
        manifest['installed']=candidate;manifest['canary']='lhs-s1001';save(manifest)
        run(s,'pm2 restart lhs-s1001')
        manifest['canaryReady']=ready(s,'lhs-s1001');manifest['canaryPid']=pids(s).get('lhs-s1001');save(manifest)
        manifest['phase']='canary_ready';save(manifest)
        print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
