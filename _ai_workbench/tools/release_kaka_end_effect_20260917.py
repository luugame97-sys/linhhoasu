"""One-file, hash-guarded release for native end-effect selection. Explicit owner-approved scope."""
import difflib
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone

sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, wait_ready

APP='/linhhoasu/lhs/newServer'
TARGET=APP+'/src/handlers/fashion.js'
OUT=WB/'temp/kaka_end_effect_release_20260917'
MANIFEST=OUT/'release.json'
LOCAL=WB.parent/'linhhoasu/lhs/newServer/src/handlers/fashion.js'
NODES=[('lhs-s1004',8085,1004),('lhs-s1003',8084,1003),('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]

def sha(data): return hashlib.sha256(data).hexdigest()
def save(m): MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def ready_all(s):
    return {str(port):int(run(s,'curl -s --max-time 8 -o /dev/null -w '+shlex.quote('%{http_code}')+' http://127.0.0.1:'+str(port)+'/ready')) for _,port,_ in NODES}
def log_positions(s):
    paths=['/root/.pm2/logs/'+name+'-'+kind+'.log' for name,_,_ in NODES for kind in ['error','out']]
    return json.loads(run(s,'node -',"const fs=require('fs');console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,fs.existsSync(p)?fs.statSync(p).size:0]))));"))
def wait_stable(s,name,port):
    samples=[]
    for n in range(40):
        output=run(s,'curl -s --max-time 8 -o /dev/null -w '+shlex.quote('%{http_code} %{time_total}')+' http://127.0.0.1:'+str(port)+'/ready').split()
        samples.append({'status':int(output[0]),'seconds':float(output[1])})
        # Cold bot reconnects also take 0.3-1s on the unmodified baseline.
        # Health and subsequent SDK/WS acceptance are the release gates;
        # do not impose a new 500ms latency SLO on this cosmetic fix.
        if n>=7 and all(x['status']==200 and x['seconds']<2 for x in samples[-4:]):return samples
        if n%5==0:print(json.dumps({'step':'settling','name':name,'sample':samples[-1]}),flush=True)
        time.sleep(2)
    raise RuntimeError('NODE_NOT_STABLE:'+name)
def qa_run(s,command):
    # Drain progress as it arrives; do not mistake a silent startup interval for completion.
    i,o,e=s.exec_command(command,timeout=150)
    lines=[]
    for line in o:
        lines.append(line)
        if line.startswith('QA_PROGRESS='):print(line.strip(),flush=True)
    code=o.channel.recv_exit_status()
    if code:raise RuntimeError((''.join(lines)+e.read().decode('utf-8','replace'))[-6000:])
    return ''.join(lines)
def restart_clock(s,name):
    expr="let x='';process.stdin.on('data',b=>x+=b).on('end',()=>{const p=JSON.parse(x).find(p=>p.name==="+json.dumps(name)+");console.log(JSON.stringify({now:Date.now(),started:p.pm2_env.pm_uptime,timezone:p.pm2_env.LOG_TIMEZONE||'Asia/Shanghai'}));});"
    return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(expr)))
def check_release_logs(s,positions,name,window):
    code=r"""const fs=require('fs'),pos=POSITIONS,scope=NAME,w=WINDOW;
const fmt=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:w.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;};
const start=fmt(w.before),end=fmt(w.started),out=[];
for(const[file,from]of Object.entries(pos)){if(!fs.existsSync(file))continue;const size=fs.statSync(file).size,offset=size<from?0:from,n=size-offset;if(n>8*1024*1024)throw Error('LOG_WINDOW_LIMIT');const b=Buffer.alloc(n),fd=fs.openSync(file,'r');fs.readSync(fd,b,0,n,offset);fs.closeSync(fd);
const failures=[],shutdownWarnings=[];for(const line of b.toString('utf8').split('\n')){
 if(!/uncaught exception|unhandled rejection|startup failed|stop server failed|TypeError|ReferenceError|SyntaxError|Cannot find module|PLAYER_LOCK_UPGRADE_DENIED|\[Redis\].*write EPIPE/.test(line))continue;
 const timestamp=/^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\]/.exec(line)?.[1];
 const known=/\[Redis\].*write EPIPE$/.test(line)||line.endsWith('[App] unhandled rejection: Error: Connection is closed.');
 const cleaned=line.replace(/user=\S+|userId[=:]\s*\S+/gi,'user=[redacted]').slice(0,500);
 if(file.includes('/'+scope+'-')&&known&&timestamp&&timestamp>=start&&timestamp<end)shutdownWarnings.push(cleaned);else failures.push(cleaned);
}out.push({file,newBytes:n,failures,shutdownWarnings});}console.log(JSON.stringify(out));"""
    code=code.replace('POSITIONS',json.dumps(positions)).replace('NAME',json.dumps(name)).replace('WINDOW',json.dumps(window))
    r=json.loads(run(s,'node -',code))
    assert not any(x['failures'] for x in r),'NEW_PROCESS_ERRORS:'+json.dumps(r)
    return r
def tests(s,m,installed=False):
    env={'FEATURE_APP':APP,'FEATURE_MAIN':'/linhhoasu/webgame/game/js/main.min_drop100.js'}
    if not installed:env['FASHION_CANDIDATE']=m['stage']+'/fashion.js'
    prefix=' '.join(k+'='+shlex.quote(v) for k,v in env.items())
    results={}
    for name in ['test-fashion-end-effect.js','test-fashion-gear-fix.js']:
        output=run(s,prefix+' node -r '+shlex.quote(m['stage']+'/loader.js')+' '+shlex.quote(m['stage']+'/'+name),timeout=55)
        r=json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{"result"')))
        assert r['result']=='PASS' and r['productionWrites']==r['networkAttempts']==0
        results[name]=r
    return results

def stage(s):
    assert not MANIFEST.exists(),'RELEASE_EXISTS_USE_VERIFY'
    baseline=json.loads((OUT/'baseline.json').read_text(encoding='utf-8'))
    assert hashes(s,list(baseline['files']))==baseline['files'],'LIVE_BASELINE_DRIFT'
    assert ready_all(s)=={str(p):200 for _,p,_ in NODES}
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    folder='/linhhoasu/_ai_workbench/temp/kaka_end_effect_'+stamp
    m={'status':'STAGING','stage':folder,'backup':folder.replace('/temp/','/backups/'),'before':baseline['files'][TARGET],
       'after':sha(LOCAL.read_bytes()),'context':{k:v for k,v in baseline['files'].items() if k!=TARGET},
       'beforePm2':pm2(s),'restarted':[],'nodeQa':{},'realPlayerWrites':0}
    old=(OUT/'fashion.before.js').read_bytes();assert sha(old)==m['before']
    (OUT/'review.diff').write_text(''.join(difflib.unified_diff(old.decode().splitlines(True),LOCAL.read_text(encoding='utf-8').splitlines(True),fromfile='live/fashion.js',tofile='candidate/fashion.js')),encoding='utf-8')
    loader="""'use strict';
const path=require('path'),fs=require('fs'),Module=require('module');
const app=process.env.FEATURE_APP,log=require.resolve(path.join(app,'src/logger'));
require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const candidate=process.env.FASHION_CANDIDATE,target=path.join(app,'src/handlers/fashion.js'),original=Module._extensions['.js'];
if(candidate)Module._extensions['.js']=function(m,filename){if(filename===target)return m._compile(fs.readFileSync(candidate,'utf8'),filename);return original(m,filename);};
"""
    files={'fashion.js':LOCAL.read_bytes(),'loader.js':loader.encode(),
       'qa_kaka_end_effect_live_20260917.js':(WB/'tools/qa_kaka_end_effect_live_20260917.js').read_bytes()}
    for n in ['test-fashion-end-effect.js','test-fashion-gear-fix.js']:files[n]=(WB.parent/'linhhoasu/lhs/newServer/scripts'/n).read_bytes()
    run(s,'install -d -m 700 '+shlex.quote(folder))
    with s.open_sftp() as f:
        for name,data in files.items():
            with f.open(folder+'/'+name,'wb') as stream:stream.write(data)
    m['stagedHashes']={folder+'/'+n:sha(data) for n,data in files.items()}
    assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'];save(m)
    run(s,'node --check '+shlex.quote(folder+'/fashion.js'))
    run(s,'node --check '+shlex.quote(folder+'/qa_kaka_end_effect_live_20260917.js'))
    m['tests']=tests(s,m);assert hashes(s,[TARGET])[TARGET]==m['before'];assert pm2(s)==m['beforePm2']
    m['status']='STAGED';save(m)
    print(json.dumps({'status':m['status'],'stage':folder,'tests':m['tests']},ensure_ascii=False),flush=True)

def replace(s,m,rollback=False):
    expected=m['after'] if rollback else m['before']
    source=m['backup']+'/fashion.js.before' if rollback else m['stage']+'/fashion.js'
    desired=m['before'] if rollback else m['after']
    code="""const fs=require('fs'),crypto=require('crypto');
const t=TARGET,s=SOURCE,e=EXPECTED,d=DESIRED,b=BACKUP;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
if(sha(fs.readFileSync(t))!==e)throw Error('TARGET_CAS_MISMATCH');
const next=fs.readFileSync(s);if(sha(next)!==d)throw Error('CANDIDATE_HASH_MISMATCH');
if(!ROLLBACK){fs.mkdirSync(b,{recursive:false,mode:0o700});fs.copyFileSync(t,b+'/fashion.js.before',fs.constants.COPYFILE_EXCL);}
const stat=fs.statSync(t),temp=t+'.kaka-end-effect.tmp';
fs.writeFileSync(temp,next,{flag:'wx',mode:stat.mode});fs.chownSync(temp,stat.uid,stat.gid);fs.renameSync(temp,t);
if(sha(fs.readFileSync(t))!==d)throw Error('INSTALLED_HASH_MISMATCH');console.log(JSON.stringify({sha256:d}));
"""
    for k,v in {'TARGET':TARGET,'SOURCE':source,'EXPECTED':expected,'DESIRED':desired,'BACKUP':m['backup']}.items():code=code.replace(k,json.dumps(v))
    code=code.replace('ROLLBACK','true' if rollback else 'false')
    if not rollback:run(s,'install -d -m 700 /linhhoasu/_ai_workbench/backups')
    return json.loads(run(s,'node -',code))

def rollback(s,m):
    current=hashes(s,[TARGET])[TARGET]
    if current==m['after']:replace(s,m,True)
    else:assert current==m['before'],'ROLLBACK_REFUSED_EXTERNAL_SOURCE_DRIFT'
    for name,port,_ in NODES:
        if name in m['restarted']:
            run(s,'pm2 restart '+shlex.quote(name),timeout=60);wait_ready(s,port)
    m['status']='ROLLED_BACK';m['rollbackReady']=ready_all(s);save(m)

def retry_stage(s,m):
    assert m['status']=='ROLLED_BACK'
    assert hashes(s,[TARGET])[TARGET]==m['before'],'ROLLBACK_NOT_CONFIRMED'
    assert hashes(s,list(m['context']))==m['context'],'CONTEXT_DRIFT'
    previous={k:m.get(k) for k in ['backup','restarted','nodeQa','error','rollbackReady']}
    target=m['stage']+'/qa_kaka_end_effect_live_20260917.js'
    data=(WB/'tools/qa_kaka_end_effect_live_20260917.js').read_bytes()
    with s.open_sftp() as f:
        with f.open(target,'wb') as stream:stream.write(data)
    m['stagedHashes'][target]=sha(data)
    run(s,'node --check '+shlex.quote(target))
    output=qa_run(s,'node '+shlex.quote(target)+' 1004 --baseline')
    m['authPreflight']=json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{"result"')))
    assert m['authPreflight']['result']=='PASS' and m['authPreflight']['qaResidue']==0
    m.setdefault('priorAttempts',[]).append(previous)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    m['backup']='/linhhoasu/_ai_workbench/backups/kaka_end_effect_'+stamp
    m['installed']=False;m['restarted']=[];m['nodeQa']={};m.pop('error',None)
    m['status']='STAGED';save(m)
    print(json.dumps({'status':m['status'],'authPreflight':m['authPreflight']}),flush=True)

def deploy(s,m):
    assert m['status']=='STAGED'
    assert sha(LOCAL.read_bytes())==m['after'],'LOCAL_CANDIDATE_DRIFT'
    assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'],'STAGE_DRIFT'
    assert hashes(s,list(m['context']))==m['context'],'CONTEXT_DRIFT'
    assert hashes(s,[TARGET])[TARGET]==m['before'],'PREDEPLOY_DRIFT'
    state=pm2(s);assert all(any(p['name']==n and p['status']=='online' for p in state) for n,_,_ in NODES)
    m['deployBeforePm2']=state;m['status']='DEPLOYING';save(m)
    try:
        replace(s,m);m['installed']=True;save(m)
        for name,port,sid in NODES:
            positions=log_positions(s)
            before_clock=restart_clock(s,name)
            print(json.dumps({'step':'restart','name':name}),flush=True)
            m['restarted'].append(name);save(m);run(s,'pm2 restart '+shlex.quote(name),timeout=60);wait_ready(s,port)
            after_clock=restart_clock(s,name)
            window={'before':before_clock['now'],'started':after_clock['started'],'timezone':after_clock['timezone']}
            m.setdefault('restartWindows',{})[str(sid)]=window;save(m)
            m.setdefault('stableReadiness',{})[str(sid)]=wait_stable(s,name,port)
            qa=qa_run(s,'node '+shlex.quote(m['stage']+'/qa_kaka_end_effect_live_20260917.js')+' '+str(sid))
            r=json.loads(next(line for line in reversed(qa.splitlines()) if line.startswith('{"result"')))
            assert r['result']=='PASS' and r['qaResidue']==0 and r['realPlayerWrites']==0
            m['nodeQa'][str(sid)]=r
            m.setdefault('logs',{})[str(sid)]=check_release_logs(s,positions,name,window)
            current=pm2(s)
            assert all(next((q for q in current if q['name']==p['name']),None)==p for p in state if p['name'] not in m['restarted']),'UNRELATED_PROCESS_CHANGED'
            save(m);print(json.dumps({'step':'qa-pass','serverId':sid,'qa':r}),flush=True)
        m['installedTests']=tests(s,m,True);m['ready']=ready_all(s);assert all(v==200 for v in m['ready'].values())
        assert hashes(s,[TARGET])[TARGET]==m['after'];assert hashes(s,list(m['context']))==m['context']
        m['afterPm2']=pm2(s);m['status']='DEPLOYED';save(m)
        print(json.dumps({'status':'DEPLOYED','backup':m['backup'],'ready':m['ready'],'restarted':m['restarted']}),flush=True)
    except Exception as e:
        m['error']=str(e);save(m)
        if m.get('installed'):rollback(s,m)
        raise

def main():
    action=sys.argv[1] if len(sys.argv)>1 else 'stage'
    s=connect()
    try:
        if action=='stage':stage(s)
        else:
            m=json.loads(MANIFEST.read_text(encoding='utf-8'))
            if action=='deploy':deploy(s,m)
            elif action=='retry-stage':retry_stage(s,m)
            elif action=='rollback':rollback(s,m)
            elif action=='verify':
                print(json.dumps({'status':m['status'],'hashMatches':hashes(s,[TARGET])[TARGET]==m['after'],'ready':ready_all(s),'pm2':pm2(s)}))
            else:raise ValueError('UNKNOWN_ACTION')
    finally:s.close()

if __name__=='__main__':main()
