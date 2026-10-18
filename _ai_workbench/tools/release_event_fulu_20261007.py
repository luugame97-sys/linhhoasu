"""Stage/publish/read-back one scoped event release; no direct player writes."""
import base64,hashlib,json,shlex,sys,time
from pathlib import Path
from datetime import datetime,timezone
from release_petsoul_day1_20261007 import connect,run,ready,procs

ROOT=Path(__file__).resolve().parents[2]
G=ROOT/'_ai_workbench/temp/event_goal_20261007'
O=G/'phase_ab'
M=O/'release.json'
REMOTE='/linhhoasu'
STAGE=REMOTE+'/_ai_workbench/temp/event_goal_fulu_20261007'
NODES={f'lhs-s100{i}':8080 if i==1 else 8081+i for i in range(1,8)}
def sha(b):return hashlib.sha256(b).hexdigest()
def save(m):M.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def rh(s,p):return run(s,'sha256sum '+shlex.quote(p)).split()[0]
def exists(s,p):return run(s,'test -e '+shlex.quote(p)+' && echo yes || echo no').strip()=='yes'
def put(s,p,data):
    run(s,'mkdir -p '+shlex.quote(p.rsplit('/',1)[0]))
    i,o,e=s.exec_command('base64 -d > '+shlex.quote(p),timeout=120)
    i.write(base64.b64encode(data));i.channel.shutdown_write()
    err=e.read().decode(errors='replace');rc=o.channel.recv_exit_status()
    if rc:raise RuntimeError('UPLOAD_FAILED:'+err[-300:])
    if rh(s,p)!=sha(data):raise RuntimeError('UPLOAD_HASH:'+p)
def test(s,m):
    put(s,STAGE+'/baseline.json',(G/'baseline.json').read_bytes())
    put(s,STAGE+'/phase_ab/release.json',json.dumps(m).encode())
    script=(ROOT/'_ai_workbench/tools/test_event_fulu_integrated_20261007.js').read_bytes()
    put(s,STAGE+'/test-integrated.js',script)
    command="NODE_ENV=test LOG_DIR='' EVENT_GOAL_ROOT="+shlex.quote(STAGE)+' EVENT_APP_ROOT=/linhhoasu/lhs/newServer node '+shlex.quote(STAGE+'/test-integrated.js')
    output=run(s,command,120)
    result=json.loads(output.strip().splitlines()[-1])
    if result.get('result')!='PASS' or result.get('playerWrites')!=0 or result.get('networkAttempts')!=0:raise RuntimeError('REMOTE_TEST_GATE')
    return result
def prep(s,m):
    local=json.loads((O/'integrated-test.json').read_text(encoding='utf-8-sig'))
    if local['result']!='PASS':raise RuntimeError('LOCAL_INTEGRATION')
    m['preProcesses']=procs(s);m['preReady']={n:ready(s,n,3) for n in NODES};save(m)
    for row in m['files']:
        target=REMOTE+'/'+row['relative'];observed=rh(s,target) if exists(s,target) else None
        if observed!=row['expected']:raise RuntimeError('BASELINE_CAS:'+row['relative'])
        data=(O/'candidate'/row['relative']).read_bytes()
        if sha(data)!=row['candidate']:raise RuntimeError('LOCAL_CANDIDATE_HASH:'+row['relative'])
        dest=STAGE+'/phase_ab/candidate/'+row['relative'];put(s,dest,data)
        if dest.endswith('.js'):run(s,'node --check '+shlex.quote(dest))
    # Recovery keeps the confirmed unsafe activities closed, rather than
    # restoring the old exposed handler. Remaining files use exact backups.
    recovery=json.loads((G/'phase_a/release.json').read_text(encoding='utf-8-sig'))
    m['recoveryFiles']=recovery['files']
    for row in recovery['files']:
        dest=STAGE+'/phase_a/candidate/'+row['relative']
        put(s,dest,(G/'phase_a/candidate'/row['relative']).read_bytes())
    m['remoteCandidateTests']=test(s,m)
    m['phase']='prepared';save(m)
    print(json.dumps({'phase':'prepared','targets':len(m['files']),'ready':7,'candidateTest':m['remoteCandidateTests']},ensure_ascii=False),flush=True)
def pub(s,m):
    if m['phase']!='prepared':raise RuntimeError('PREPARE_FIRST')
    if not m.get('recoveryFiles'):
        recovery=json.loads((G/'phase_a/release.json').read_text(encoding='utf-8-sig'))
        m['recoveryFiles']=recovery['files']
        for row in recovery['files']:
            put(s,STAGE+'/phase_a/candidate/'+row['relative'],(G/'phase_a/candidate'/row['relative']).read_bytes())
        save(m)
    for row in m['files']:
        target=REMOTE+'/'+row['relative'];observed=rh(s,target) if exists(s,target) else None
        if observed!=row['expected']:raise RuntimeError('FINAL_CAS:'+row['relative'])
    backup=REMOTE+'/_ai_workbench/backups/event_goal_fulu_20261007_'+datetime.now(timezone.utc).strftime('%H%M%S')
    if exists(s,backup):raise RuntimeError('BACKUP_EXISTS')
    run(s,'mkdir -p '+shlex.quote(backup));m['backup']=backup;m['published']=[];m['restarted']=[];save(m)
    put(s,backup+'/manifest.json',json.dumps(m).encode())
    for row in m['files']:
        if row['expected'] is None:continue
        target=REMOTE+'/'+row['relative'];dest=backup+'/'+row['relative']
        run(s,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0])+' && cp -p '+shlex.quote(target)+' '+shlex.quote(dest))
        if rh(s,dest)!=row['expected']:raise RuntimeError('BACKUP_HASH')
    # Helpers first, then compatible persistence/handlers, client last.
    rows=sorted(m['files'],key=lambda r:(r['relative'].startswith('webgame/'),r['expected'] is not None,r['relative']=='webgame/game/index.html'))
    for row in rows:
        target=REMOTE+'/'+row['relative'];src=STAGE+'/phase_ab/candidate/'+row['relative'];tmp=target+'.event_fulu_20261007.tmp'
        if exists(s,tmp):raise RuntimeError('TEMP_EXISTS:'+tmp)
        observed=rh(s,target) if exists(s,target) else None
        if observed!=row['expected']:raise RuntimeError('PUBLISH_CAS:'+row['relative'])
        run(s,'cp '+shlex.quote(src)+' '+shlex.quote(tmp))
        if row['expected'] is None:run(s,'chmod 644 '+shlex.quote(tmp))
        else:run(s,'chmod --reference='+shlex.quote(target)+' '+shlex.quote(tmp)+' && chown --reference='+shlex.quote(target)+' '+shlex.quote(tmp))
        if rh(s,tmp)!=row['candidate']:raise RuntimeError('TMP_HASH')
        run(s,'mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
        m['published'].append(row['relative']);save(m)
    for n in NODES:
        run(s,'pm2 restart '+shlex.quote(n),60);m['restarted'].append(n);save(m)
        m.setdefault('rollingReady',{})[n]=ready(s,n,30);save(m)
        print(json.dumps({'phase':'rolling','server':n,'ready':'ok'}),flush=True)
    m['phase']='published';save(m)
def verify(s,m):
    m['finalHashes']={r['relative']:rh(s,REMOTE+'/'+r['relative']) for r in m['files']}
    if any(m['finalHashes'][r['relative']]!=r['candidate'] for r in m['files']):raise RuntimeError('INSTALLED_HASH')
    m['finalReady']={n:ready(s,n,3) for n in NODES};m['finalProcesses']=procs(s)
    old={p['name']:p for p in m['preProcesses']};new={p['name']:p for p in m['finalProcesses']}
    if any(new.get(n,{}).get('pid')!=v['pid'] for n,v in old.items() if n not in NODES):raise RuntimeError('NON_GAME_PROCESS_CHANGED')
    if any(new[n].get(k)!=v.get(k) for n,v in old.items() for k in ['launch','disabled','ignore']):raise RuntimeError('ENV_CHANGED')
    js="const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'),t=c.loadAllTables(),r=require('/linhhoasu/lhs/newServer/src/services/EventRotationRegistry');console.log(JSON.stringify({mountMax:Object.keys(t.SwordLevelConfig[7]).length,petsoulDay:t.SystemConfig[231].openDay,families:r.snapshot().families.map(f=>({key:f.key,enabled:f.enabled})),fuluService:typeof require('/linhhoasu/lhs/newServer/src/services/Activity52Service').operate,tasks:require('/linhhoasu/lhs/newServer/src/services/Activity52TaskService').IDS}));"
    m['runtime']=json.loads(run(s,"EVENT_ROTATION_NATIVE_ENABLED=1 EVENT_ROTATION_ENABLED=1 node -e "+shlex.quote(js),120).strip().splitlines()[-1])
    if m['runtime']['mountMax']!=5000 or m['runtime']['petsoulDay']!=1:raise RuntimeError('PRIOR_FEATURE_REGRESSION')
    enabled={r['key']:r['enabled'] for r in m['runtime']['families']}
    if any(enabled[k] for k in ['monopoly','knife_reward','secret_treasure','fulu']):raise RuntimeError('UNSAFE_ROTATION_OPEN')
    m['public']={}
    for r in m['files']:
        if not r['relative'].startswith('webgame/game/js/'):continue
        url='http://127.0.0.1:81/'+r['relative'].removeprefix('webgame/game/')+'?v='+m['version']
        h=run(s,'curl -fsS --max-time 15 '+shlex.quote(url)+' | sha256sum',25).split()[0]
        if h!=r['candidate']:raise RuntimeError('PUBLIC_HASH:'+r['relative'])
        m['public'][r['relative']]=h
    index=run(s,'curl -fsS --max-time 10 http://127.0.0.1:81/index.html',20)
    if 'lhs-fulu-safe-v1.js?v=20261007_fulu_safe_v1' not in index or 'lhs-event-maintenance-v1.js?v=20261007_event_gate_v1' not in index:raise RuntimeError('PUBLIC_INDEX')
    m['result']='PASS';m['phase']='verified_qa_pending';m['playerBackfillWrites']=0;m['verifiedAt']=datetime.now(timezone.utc).isoformat();m.pop('lastError',None);save(m)
    print(json.dumps({'phase':m['phase'],'result':'PASS','ready':7,'qaOnly':'Talo/S1','backup':m['backup']},ensure_ascii=False),flush=True)
def rollback(s,m):
    if not m.get('backup'):raise RuntimeError('ROLLBACK_BACKUP_REQUIRED')
    recovery={r['relative']:r for r in m['recoveryFiles']}
    for row in m['files']:
        if row['relative'] not in m.get('published',[]):continue
        target=REMOTE+'/'+row['relative']
        if not target.startswith(REMOTE+'/lhs/newServer/') and not target.startswith(REMOTE+'/webgame/game/'):raise RuntimeError('ROLLBACK_TARGET_SCOPE')
        if row['relative'] in recovery:
            rec=recovery[row['relative']];src=STAGE+'/phase_a/candidate/'+row['relative'];expected=rec['candidate']
        elif row['expected'] is not None:
            src=m['backup']+'/'+row['relative'];expected=row['expected']
        else:
            # Unreferenced specialized helpers stay inert; deleting them is
            # unnecessary for recovery and must not race a cached consumer.
            continue
        actual=rh(s,target)
        if actual==expected:continue
        if actual!=row['candidate'] or rh(s,src)!=expected:raise RuntimeError('ROLLBACK_CAS:'+row['relative'])
        tmp=target+'.event_recovery_20261007.tmp'
        run(s,'cp -p '+shlex.quote(src)+' '+shlex.quote(tmp)+' && mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
        if rh(s,target)!=expected:raise RuntimeError('ROLLBACK_HASH')
    for n in m.get('restarted',[]):
        run(s,'pm2 restart '+shlex.quote(n),60);ready(s,n,30)
    m['phase']='recovered_event_maintenance';m['recoveryAt']=datetime.now(timezone.utc).isoformat();save(m)
    print(json.dumps({'phase':m['phase'],'unsafeEventsRemainClosed':True,'playerWrites':0}),flush=True)
def main():
    action=sys.argv[1] if len(sys.argv)>1 else 'prepare';m=json.loads(M.read_text(encoding='utf-8-sig'));s=connect()
    try:{'prepare':prep,'publish':pub,'verify':verify,'rollback':rollback}[action](s,m)
    except Exception as e:m['lastError']=str(e);save(m);raise
    finally:s.close()
if __name__=='__main__':main()
