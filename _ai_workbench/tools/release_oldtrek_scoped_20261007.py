"""Canary the scoped OldTrek save candidate on S6 only."""
from pathlib import Path
from datetime import datetime,timezone
import base64,hashlib,json,shlex,sys
from release_petsoul_day1_20261007 import connect,run,ready,procs
ROOT=Path(__file__).resolve().parents[2]
G=ROOT/'_ai_workbench/temp/event_goal_20261007/oldtrek'
OUT=G/'canary';MAN=G/'release_candidate.json';REMOTE='/linhhoasu'
STAGE=REMOTE+'/_ai_workbench/temp/oldtrek_scoped_canary_20261007'
TARGETS=[
 {'relative':'lhs/newServer/src/handlers/old-trek.js','expected':'50939476c24ac1a011dab8c05b1481da3361e5e7f4d4afd3dc3e46a80e67ab2e','candidate':'5b7f46ffd8c4484d9d350fbf83676931c1bf625c7a4479e31dd7969664b806af','local':G/'candidate/src/handlers/old-trek.js'},
 {'relative':'lhs/newServer/src/services/PlayerService.js','expected':'f183bdb9537715cffeaa5ed55e4c6370113672f793efc08439bd985d2daf45ac','candidate':'d9bb763f034082b7f2a18f314dfb28f2e63458fb33b5d0e48640ed51bcd05579','local':G/'candidate/src/services/PlayerService.js'},
 {'relative':'lhs/newServer/src/services/OldTrekSnapshotService.js','expected':None,'candidate':'3067c54a5ec160aeb975883e709d3505416627db7661e8fd6333cd2b7dc860aa','local':G/'candidate/src/services/OldTrekSnapshotService.js'},
]
NODE='lhs-s1006'
def sha(b):return hashlib.sha256(b).hexdigest()
def rh(s,p):
    x=run(s,'sha256sum '+shlex.quote(p)+' 2>/dev/null || true').strip().split()
    return x[0] if x else None
def exists(s,p):return run(s,'test -e '+shlex.quote(p)+' && echo yes || echo no').strip()=='yes'
def put(s,p,data):
    run(s,'mkdir -p '+shlex.quote(p.rsplit('/',1)[0]))
    i,o,e=s.exec_command('base64 -d > '+shlex.quote(p),timeout=120);i.write(base64.b64encode(data));i.channel.shutdown_write();rc=o.channel.recv_exit_status()
    if rc:raise RuntimeError('UPLOAD:'+p)
    if rh(s,p)!=sha(data):raise RuntimeError('HASH:'+p)
def save(m):OUT.mkdir(parents=True,exist_ok=True);(OUT/'receipt.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def build():
    for p in [G/'candidate-tests.json',G/'scoped-tests.json',G/'handler-tests.json',G/'fulu-interleave-fixed.json']:
        x=json.loads(p.read_text(encoding='utf-8-sig'))
        if not (x.get('pass',True) and x.get('productionWrites',0)==0 and x.get('networkCalls',0)==0):raise RuntimeError('TEST:'+p.name)
    for r in TARGETS:
        if sha(r['local'].read_bytes())!=r['candidate']:raise RuntimeError('LOCAL_HASH:'+r['relative'])
    m={'phase':'candidate','result':'PASS','files':[{k:v for k,v in r.items() if k!='local'} for r in TARGETS],'scope':'S6 only','playerWrites':0}
    save(m)
    print(json.dumps({'result':'PASS','files':len(TARGETS),'scope':'S6 only','playerWrites':0}))
def prepare(s,m):
    m['preProcesses']=procs(s);m['preNode']=next(x for x in m['preProcesses'] if x['name']==NODE);m['preparedAt']=datetime.now(timezone.utc).isoformat()
    for r in TARGETS:
        target=REMOTE+'/'+r['relative'];actual=rh(s,target)
        if actual!=r['expected']:raise RuntimeError('PREIMAGE:'+r['relative']+':'+str(actual))
        put(s,STAGE+'/candidate/'+r['relative'],r['local'].read_bytes())
        if r['relative'].endswith('.js'):run(s,'node --check '+shlex.quote(STAGE+'/candidate/'+r['relative']))
        r['observed']=actual
    m['phase']='prepared';save(m);print(json.dumps({'phase':m['phase'],'node':NODE,'ready':ready(s,NODE,3)}))
def publish(s,m):
    if m.get('phase')!='prepared':raise RuntimeError('PREPARE_REQUIRED')
    backup=m.get('backup') or (REMOTE+'/_ai_workbench/backups/oldtrek_scoped_canary_20261007_'+datetime.now(timezone.utc).strftime('%H%M%S'))
    if not exists(s,backup):run(s,'mkdir -p '+shlex.quote(backup))
    m['backup']=backup;m['published']=m.get('published',[]);save(m)
    for r in TARGETS:
        target=REMOTE+'/'+r['relative']
        if r['expected'] is not None and r['relative'] not in m.get('published',[]):
            dest=backup+'/'+r['relative'];run(s,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0])+' && cp -p '+shlex.quote(target)+' '+shlex.quote(dest))
            if rh(s,dest)!=r['expected']:raise RuntimeError('BACKUP_HASH')
        if rh(s,target) not in [r['expected'],r['candidate']]:raise RuntimeError('CAS:'+r['relative'])
    for r in TARGETS:
        target=REMOTE+'/'+r['relative'];tmp=target+'.oldtrek_canary.tmp'
        if r['relative'] in m['published'] and rh(s,target)==r['candidate']:continue
        if exists(s,tmp):run(s,'rm -f '+shlex.quote(tmp))
        if rh(s,target) not in [r['expected'],r['candidate']]:raise RuntimeError('CAS_FINAL:'+r['relative'])
        mode=('chmod --reference='+shlex.quote(target)+' '+shlex.quote(tmp)+' && chown --reference='+shlex.quote(target)+' '+shlex.quote(tmp)) if exists(s,target) else ('chmod 640 '+shlex.quote(tmp)+' && chown root:www '+shlex.quote(tmp))
        run(s,'cp '+shlex.quote(STAGE+'/candidate/'+r['relative'])+' '+shlex.quote(tmp)+' && '+mode+' && mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
        if rh(s,target)!=r['candidate']:raise RuntimeError('PUBLISH_HASH')
        m['published'].append(r['relative']);save(m)
    run(s,'pm2 restart '+NODE,60);m['restartedAt']=datetime.now(timezone.utc).isoformat();m['ready']=ready(s,NODE,30);save(m)
    if m['ready'].get('status')!='ok':raise RuntimeError('CANARY_NOT_READY')
    m['phase']='canary_published';save(m);print(json.dumps({'phase':m['phase'],'node':NODE,'ready':m['ready']}))
def verify(s,m):
    for r in TARGETS:
        if rh(s,REMOTE+'/'+r['relative'])!=r['candidate']:raise RuntimeError('INSTALLED_HASH')
    m['postProcesses']=procs(s);m['postReady']=ready(s,NODE,3);m['phase']='canary_verified';m['result']='PASS';m['verifiedAt']=datetime.now(timezone.utc).isoformat();save(m)
    print(json.dumps({'phase':m['phase'],'node':NODE,'ready':m['postReady'],'backup':m['backup'],'playerWrites':0}))
def rollback(s,m):
    if not m.get('backup'):raise RuntimeError('NO_BACKUP')
    for r in TARGETS:
        target=REMOTE+'/'+r['relative'];actual=rh(s,target)
        if r['expected'] is None:
            # Keep the unreferenced helper inert; cached consumers may still
            # hold it until their process exits. Restored code does not use it.
            if actual not in [None,r['candidate']]:raise RuntimeError('ROLLBACK_HELPER_DRIFT')
            continue
        if actual==r['expected']:continue
        if actual!=r['candidate']:raise RuntimeError('ROLLBACK_CAS')
        src=m['backup']+'/'+r['relative'];tmp=target+'.oldtrek_restore.tmp'
        if rh(s,src)!=r['expected'] or exists(s,tmp):raise RuntimeError('ROLLBACK_BACKUP_HASH')
        run(s,'cp -p '+shlex.quote(src)+' '+shlex.quote(tmp)+' && mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
        if rh(s,target)!=r['expected']:raise RuntimeError('ROLLBACK_RESTORED_HASH')
    run(s,'pm2 restart '+NODE,60);ready(s,NODE,30);m['phase']='canary_rolled_back';m['rolledBackAt']=datetime.now(timezone.utc).isoformat();save(m);print(json.dumps({'phase':m['phase'],'playerWrites':0}))
if __name__=='__main__':
    action=sys.argv[1];build() if action=='build' else None
    if action!='build':
      m=json.loads((OUT/'receipt.json').read_text(encoding='utf-8-sig'));s=connect()
      try:{'prepare':prepare,'publish':publish,'verify':verify,'rollback':rollback}[action](s,m)
      except Exception as e:m['lastError']=str(e);save(m);raise
      finally:s.close()
