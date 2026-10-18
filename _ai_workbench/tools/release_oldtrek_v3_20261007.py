"""Prepare/publish/verify a CPU-scoped OldTrek S6 canary."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shlex, sys
from release_oldtrek_scoped_20261007 import connect, run, ready, procs, rh, exists, put

ROOT = Path(__file__).resolve().parents[2]
G = ROOT / '_ai_workbench/temp/event_goal_20261007/oldtrek'
OUT = G / 'canary_v3'
MAN = OUT / 'receipt.json'
REMOTE = '/linhhoasu'
STAGE = REMOTE + '/_ai_workbench/temp/oldtrek_v3_20261007'
NODE = 'lhs-s1006'
TARGETS = [
    ('lhs/newServer/src/handlers/old-trek.js', '50939476c24ac1a011dab8c05b1481da3361e5e7f4d4afd3dc3e46a80e67ab2e', 'eb97499d5028ab0eba59181ab5d4cd601de2010939551db67120f98fc4e3849e', G/'candidate/src/handlers/old-trek.js'),
    ('lhs/newServer/src/services/PlayerService.js', 'f183bdb9537715cffeaa5ed55e4c6370113672f793efc08439bd985d2daf45ac', 'f06f0368f4d85bae34b3c2ff6852b9372d56946efd6495295bf0f2f5209c18f3', G/'candidate/src/services/PlayerService.js'),
    ('lhs/newServer/src/services/OldTrekSnapshotService.js', '3067c54a5ec160aeb975883e709d3505416627db7661e8fd6333cd2b7dc860aa', 'd6b6281240105278116fa5c9ba559ad9402dc5f303b9507c63c734cdd7dafb8c', G/'candidate/src/services/OldTrekSnapshotService.js'),
    ('lhs/newServer/src/handlers/old-trek-legacy-v5.js', None, '50939476c24ac1a011dab8c05b1481da3361e5e7f4d4afd3dc3e46a80e67ab2e', G/'candidate/src/handlers/old-trek-legacy-v5.js'),
]

def sha(data): return hashlib.sha256(data).hexdigest()
def save(m): OUT.mkdir(parents=True, exist_ok=True); MAN.write_text(json.dumps(m, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def load(): return json.loads(MAN.read_text(encoding='utf-8-sig'))
def build():
    for name in ('scoped-tests.json', 'handler-tests.json', 'fulu-interleave-fixed.json'):
        obj = json.loads((G/name).read_text(encoding='utf-8-sig'))
        if not obj.get('pass', True) or obj.get('productionWrites', 0) or obj.get('networkCalls', 0): raise RuntimeError('TEST:'+name)
    rows=[]
    for rel, expected, candidate, src in TARGETS:
        data=src.read_bytes()
        if sha(data)!=candidate: raise RuntimeError('LOCAL_HASH:'+rel)
        rows.append({'relative':rel,'expected':expected,'candidate':candidate})
    save({'phase':'candidate','version':'oldtrek_scoped_cas_v3_20261007','flag':'OLD_TREK_SCOPED_CAS=1','node':NODE,'files':rows,'playerWrites':0})
    print(json.dumps({'phase':'candidate','files':len(rows),'scope':NODE,'playerWrites':0}))
def prepare(s,m):
    m['preProcesses']=procs(s); m['preNode']=next(x for x in m['preProcesses'] if x['name']==NODE)
    for rel,expected,candidate,src in TARGETS:
        target=REMOTE+'/'+rel; actual=rh(s,target)
        if actual!=expected: raise RuntimeError('PREIMAGE:'+rel+':'+str(actual))
        put(s,STAGE+'/candidate/'+rel,src.read_bytes())
        if rel.endswith('.js'): run(s,'node --check '+shlex.quote(STAGE+'/candidate/'+rel))
    m['phase']='prepared'; m['preparedAt']=datetime.now(timezone.utc).isoformat(); save(m)
    print(json.dumps({'phase':m['phase'],'ready':ready(s,NODE,3)}))
def publish(s,m):
    if m['phase']!='prepared': raise RuntimeError('PREPARE_REQUIRED')
    backup=REMOTE+'/_ai_workbench/backups/oldtrek_v3_20261007_'+datetime.now(timezone.utc).strftime('%H%M%S')
    run(s,'mkdir -p '+shlex.quote(backup)); m['backup']=backup; m['published']=[]; save(m)
    for rel,expected,candidate,src in TARGETS:
        target=REMOTE+'/'+rel
        if expected is not None:
            dest=backup+'/'+rel; run(s,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0])+' && cp -p '+shlex.quote(target)+' '+shlex.quote(dest))
            if rh(s,dest)!=expected: raise RuntimeError('BACKUP_HASH:'+rel)
        if rh(s,target)!=expected: raise RuntimeError('CAS:'+rel)
    for rel,expected,candidate,src in TARGETS:
        target=REMOTE+'/'+rel; temp=target+'.oldtrek_v3.tmp'
        run(s,'cp '+shlex.quote(STAGE+'/candidate/'+rel)+' '+shlex.quote(temp)+' && chmod 640 '+shlex.quote(temp)+' && chown root:www '+shlex.quote(temp)+' && mv -f '+shlex.quote(temp)+' '+shlex.quote(target))
        if rh(s,target)!=candidate: raise RuntimeError('PUBLISH_HASH:'+rel)
        m['published'].append(rel); save(m)
    run(s,'OLD_TREK_SCOPED_CAS=1 pm2 restart lhs-s1006 --update-env',60)
    m['phase']='canary_published'; m['restartedAt']=datetime.now(timezone.utc).isoformat(); m['ready']=ready(s,NODE,30); save(m)
    print(json.dumps({'phase':m['phase'],'ready':m['ready']}))
def verify(s,m):
    for rel,expected,candidate,src in TARGETS:
        if rh(s,REMOTE+'/'+rel)!=candidate: raise RuntimeError('INSTALLED_HASH:'+rel)
    m['phase']='canary_verified'; m['result']='PASS'; m['postReady']=ready(s,NODE,3); m['verifiedAt']=datetime.now(timezone.utc).isoformat(); save(m)
    print(json.dumps({'phase':m['phase'],'ready':m['postReady'],'backup':m['backup'],'playerWrites':0}))
def rollback(s,m):
    if not m.get('backup'): raise RuntimeError('NO_BACKUP')
    for rel,expected,candidate,src in TARGETS:
        target=REMOTE+'/'+rel
        if expected is None:
            if rh(s,target)==candidate: run(s,'rm -f '+shlex.quote(target))
            continue
        if rh(s,target)==expected: continue
        if rh(s,target)!=candidate or rh(s,m['backup']+'/'+rel)!=expected: raise RuntimeError('ROLLBACK_CAS:'+rel)
        temp=target+'.oldtrek_v3.restore'; run(s,'cp -p '+shlex.quote(m['backup']+'/'+rel)+' '+shlex.quote(temp)+' && mv -f '+shlex.quote(temp)+' '+shlex.quote(target))
    run(s,'OLD_TREK_SCOPED_CAS=0 pm2 restart lhs-s1006 --update-env',60); ready(s,NODE,30)
    m['phase']='rolled_back'; m['rolledBackAt']=datetime.now(timezone.utc).isoformat(); save(m); print(json.dumps({'phase':m['phase'],'playerWrites':0}))
if __name__=='__main__':
    action=sys.argv[1]
    if action=='build': build()
    else:
        m=load(); s=connect()
        try: {'prepare':prepare,'publish':publish,'verify':verify,'rollback':rollback}[action](s,m)
        except Exception as e: m['lastError']=str(e); save(m); raise
        finally: s.close()
