"""Publish the three-file QA hotfix with exact hashes and rolling readiness."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,shlex,sys
from release_petsoul_day1_20261007 import connect,run,ready,procs
from release_event_fulu_20261007 import put,rh,exists,NODES
ROOT=Path(__file__).resolve().parents[2]
G=ROOT/'_ai_workbench/temp/event_goal_20261007'
O=G/'fulu_qa_hotfix';M=O/'release.json'
STAGE='/linhhoasu/_ai_workbench/temp/fulu_qa_hotfix_20261007'
REMOTE='/linhhoasu'
def sha(b):return hashlib.sha256(b).hexdigest()
def save(m):M.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def build():
    previous=json.loads((G/'phase_ab/release.json').read_text(encoding='utf-8-sig'))
    if previous['phase']!='verified_qa_pending':raise RuntimeError('BASE_RELEASE_NOT_VERIFIED')
    old={r['relative']:r for r in previous['files']}
    sources={
      'lhs/newServer/src/services/Activity52TaskService.js':G/'fulu/candidate/services/Activity52TaskService.js',
      'webgame/game/js/lhs-event-maintenance-v1.js':G/'exposure/candidate/webgame/game/js/lhs-event-maintenance-v1.js',
    }
    files=[]
    for rel,p in sources.items():
        target=O/'candidate'/rel;target.parent.mkdir(parents=True,exist_ok=True);data=p.read_bytes();target.write_bytes(data)
        files.append(dict(relative=rel,expected=old[rel]['candidate'],candidate=sha(data)))
    rel='webgame/game/index.html';data=(G/'phase_ab/candidate'/rel).read_text(encoding='utf-8')
    anchor='lhs-event-maintenance-v1.js?v=20261007_event_gate_v1'
    if data.count(anchor)!=1:raise RuntimeError('INDEX_ANCHOR')
    data=data.replace(anchor,'lhs-event-maintenance-v1.js?v=20261007_event_gate_v2').encode()
    p=O/'candidate'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    files.append(dict(relative=rel,expected=old[rel]['candidate'],candidate=sha(data)))
    save(dict(phase='candidate',files=files,qaOnly='Talo/S1',directPlayerWrites=0))
    print(json.dumps(dict(phase='candidate',files=len(files))))
def prepare(s,m):
    local=json.loads((O/'integrated-test.json').read_text(encoding='utf-8-sig'))
    if local['result']!='PASS':raise RuntimeError('LOCAL_TEST')
    m['preProcesses']=procs(s);m['preReady']={n:ready(s,n,3) for n in NODES}
    for row in m['files']:
        target=REMOTE+'/'+row['relative']
        if rh(s,target)!=row['expected']:raise RuntimeError('PREIMAGE:'+row['relative'])
        data=(O/'candidate'/row['relative']).read_bytes()
        if sha(data)!=row['candidate']:raise RuntimeError('CANDIDATE_HASH')
        put(s,STAGE+'/candidate/'+row['relative'],data)
        if target.endswith('.js'):run(s,'node --check '+shlex.quote(STAGE+'/candidate/'+row['relative']))
    put(s,STAGE+'/release.json',json.dumps(m).encode())
    put(s,STAGE+'/baseline.json',(G/'baseline.json').read_bytes())
    put(s,STAGE+'/phase_ab/release.json',(G/'phase_ab/release.json').read_bytes())
    put(s,STAGE+'/test.js',(ROOT/'_ai_workbench/tools/test_event_fulu_integrated_20261007.js').read_bytes())
    cmd="NODE_ENV=test LOG_DIR='' EVENT_GOAL_ROOT="+shlex.quote(STAGE)+' EVENT_BASE_IS_PRODUCTION=1 EVENT_PATCH_ROOT='+shlex.quote(STAGE)+' EVENT_APP_ROOT=/linhhoasu/lhs/newServer node '+shlex.quote(STAGE+'/test.js')
    result=json.loads(run(s,cmd,120).strip().splitlines()[-1])
    if result['result']!='PASS' or result['playerWrites'] or result['networkAttempts']:raise RuntimeError('REMOTE_TEST')
    m['remoteTest']=result;m['phase']='prepared';save(m);print(json.dumps(dict(phase=m['phase'],test=result)))
def publish(s,m):
    if m['phase']!='prepared':raise RuntimeError('PREPARE_REQUIRED')
    for row in m['files']:
        if rh(s,REMOTE+'/'+row['relative'])!=row['expected']:raise RuntimeError('FINAL_CAS')
    backup='/linhhoasu/_ai_workbench/backups/fulu_qa_hotfix_20261007_'+datetime.now(timezone.utc).strftime('%H%M%S')
    if exists(s,backup):raise RuntimeError('BACKUP_EXISTS')
    run(s,'mkdir -p '+shlex.quote(backup));m['backup']=backup;m['published']=[];m['restarted']=[];save(m)
    for row in m['files']:
        target=REMOTE+'/'+row['relative'];copy=backup+'/'+row['relative']
        run(s,'mkdir -p '+shlex.quote(copy.rsplit('/',1)[0])+' && cp -p '+shlex.quote(target)+' '+shlex.quote(copy))
        if rh(s,copy)!=row['expected']:raise RuntimeError('BACKUP_HASH')
    for row in m['files']:
        target=REMOTE+'/'+row['relative'];temp=target+'.fulu_qa_hotfix.tmp'
        if exists(s,temp) or rh(s,target)!=row['expected']:raise RuntimeError('PUBLISH_CAS')
        run(s,'cp '+shlex.quote(STAGE+'/candidate/'+row['relative'])+' '+shlex.quote(temp)+' && chmod --reference='+shlex.quote(target)+' '+shlex.quote(temp)+' && chown --reference='+shlex.quote(target)+' '+shlex.quote(temp))
        if rh(s,temp)!=row['candidate']:raise RuntimeError('TEMP_HASH')
        run(s,'mv -f '+shlex.quote(temp)+' '+shlex.quote(target));m['published'].append(row['relative']);save(m)
    for n in NODES:
        run(s,'pm2 restart '+shlex.quote(n),60);m['restarted'].append(n);save(m)
        m.setdefault('rollingReady',{})[n]=ready(s,n,30);save(m);print(json.dumps(dict(server=n,ready='ok')),flush=True)
    m['phase']='published';save(m)
def verify(s,m):
    if any(rh(s,REMOTE+'/'+r['relative'])!=r['candidate'] for r in m['files']):raise RuntimeError('INSTALLED_HASH')
    m['finalReady']={n:ready(s,n,3) for n in NODES};m['finalProcesses']=procs(s)
    old={p['name']:p for p in m['preProcesses']};new={p['name']:p for p in m['finalProcesses']}
    if any(new.get(n,{}).get('pid')!=p['pid'] for n,p in old.items() if n not in NODES):raise RuntimeError('UNRELATED_PROCESS_CHANGED')
    for r in m['files']:
        if not r['relative'].startswith('webgame/game/'):continue
        url='https://linhhoasu.lol/'+r['relative'].removeprefix('webgame/game/')+'?v=20261007_fulu_qa_hotfix'
        if run(s,'curl -fsS --max-time 15 '+shlex.quote(url)+' | sha256sum',25).split()[0]!=r['candidate']:raise RuntimeError('PUBLIC_HASH')
    m['phase']='verified_qa_pending';m['result']='PASS';m['verifiedAt']=datetime.now(timezone.utc).isoformat();save(m)
    print(json.dumps(dict(phase=m['phase'],ready=7,qaOnly=m['qaOnly'],backup=m['backup'])))
def rollback(s,m):
    for r in m['files']:
        if r['relative'] not in m.get('published',[]):continue
        target=REMOTE+'/'+r['relative'];old=m['backup']+'/'+r['relative']
        if rh(s,target)==r['expected']:continue
        if rh(s,target)!=r['candidate'] or rh(s,old)!=r['expected']:raise RuntimeError('ROLLBACK_CAS')
        temp=target+'.fulu_qa_restore.tmp';run(s,'cp -p '+shlex.quote(old)+' '+shlex.quote(temp)+' && mv -f '+shlex.quote(temp)+' '+shlex.quote(target))
    for n in m.get('restarted',[]):run(s,'pm2 restart '+shlex.quote(n),60);ready(s,n,30)
    m['phase']='rolled_back_qa_only';save(m);print(json.dumps(dict(phase=m['phase'])))
if __name__=='__main__':
    action=sys.argv[1]
    if action=='build':build()
    else:
        m=json.loads(M.read_text(encoding='utf-8-sig'));s=connect()
        try:{'prepare':prepare,'publish':publish,'verify':verify,'rollback':rollback}[action](s,m)
        except Exception as e:m['lastError']=str(e);save(m);raise
        finally:s.close()
