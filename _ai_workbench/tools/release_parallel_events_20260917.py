"""Parallel-calendar release: staged candidate, isolated QA, CAS and scoped rollback."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,wait_ready
from release_competitions_20260917 import install,arena_env,cleanup_qa
from release_kaka_end_effect_20260917 import wait_stable,qa_run,log_positions,restart_clock,check_release_logs
WB=Path(__file__).resolve().parents[1];WORK=WB.parent;OUT=WB/'temp/parallel_events_20260917';BASE=WB/'backups/parallel_events_20260917'
APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game';MANIFEST=OUT/'release.json'
FILES=['src/config/crossServerEventSchedule.json','src/services/CrossServerEventService.js','src/services/CrossEventSettlementService.js',
 'src/services/CrossArenaService.js','src/services/CrossEventScheduleService.js','src/handlers/cross-rival.js','src/handlers/arena.js','src/router.js']
CLIENT=['index.html','js/lhs-cross-events-v2.js']
TESTS=['test-parallel-events.js','test-parallel-events-client.js','test-competitions-v3.js','test-cross-settlement-v3.js',
 'test-arena-recovery-v3.js','test-competitions-client-v3.js','test-arena-power-display.js','test-cross-server-events.js']
NODES=[('lhs-s1004',8085,1004),('lhs-s1003',8084,1003),('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(m):MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def ready(s):return{str(p):run(s,'curl -fsS --max-time 8 -o /dev/null -w '+shlex.quote('%{http_code}')+' http://127.0.0.1:'+str(p)+'/ready').strip()for _,p,_ in NODES}
def test(s,m,installed=False):
    results={};loader=m['stage']+('/installed-loader.js' if installed else '/loader.js')
    env='COMPETITION_OFFLINE=1 COMPETITION_APP='+shlex.quote(APP)+' COMPETITION_CLIENT_ROOT='+shlex.quote(GAME if installed else m['stage']+'/client')+' COMPETITION_MAIN='+shlex.quote(GAME+'/js/main.min_drop100.js')+' POWER_AUDIT_FIXTURE='+shlex.quote(m['stage']+'/audit.json')
    for name in TESTS:
        output=run(s,env+' node -r '+shlex.quote(loader)+' '+shlex.quote(m['stage']+'/tests/'+name),timeout=55)
        assert 'PASS' in output,'TEST_FAILED:'+name
        results[name]=json.loads(output) if output.lstrip().startswith('{') else output.strip()
        print(json.dumps({'step':'test','name':name,'installed':installed,'result':'PASS'}),flush=True)
    core=run(s,'COMPETITION_OFFLINE=1 node -r '+shlex.quote(loader)+' '+shlex.quote(APP+'/scripts/test-core-gameplay-contract.js'),timeout=55)
    results['core']=json.loads(core);assert results['core']['result']=='ok' and results['core']['tables']==714
    m['installedTests' if installed else 'tests']=results;m['testedHashes']=dict(m['after']);save(m)
def stage(s):
    assert not MANIFEST.exists(),'RELEASE_EXISTS_USE_RESTAGE'
    baseline=json.loads((BASE/'manifest.json').read_text(encoding='utf8'))['before']
    for rel in FILES:
        baseline.setdefault(APP+'/'+rel,None)
    for rel in CLIENT:baseline.setdefault(GAME+'/'+rel,None)
    assert hashes(s,list(baseline))==baseline,'BASELINE_DRIFT'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    context=hashes(s,[APP+'/src/services/BattleService.js',APP+'/src/handlers/index.js',APP+'/src/handlers/account.js',
     GAME+'/js/main.min_drop100.js',GAME+'/js/lhs-arena-v1.js',GAME+'/js/lhs-hud-power-full-v1.js',GAME+'/js/lhs-power-cells-full-v1.js'])
    m={'status':'STAGING','stage':'/linhhoasu/_ai_workbench/temp/parallel_events_'+stamp,'backup':'/linhhoasu/_ai_workbench/backups/parallel_events_'+stamp,
     'stamp':stamp,'before':baseline,'after':{},'context':context,'beforePm2':pm2(s),'beforeArenaEnv':arena_env(s),'restarted':[],'realPlayerWrites':0}
    save(m);upload(s,m);test(s,m);assert pm2(s)==m['beforePm2'];assert hashes(s,list(baseline))==baseline
    m['status']='STAGED';save(m);print(json.dumps({'status':'STAGED','stage':m['stage']}),flush=True)
def upload(s,m):
    files={}
    for rel in FILES:
        data=(WORK/'linhhoasu/lhs/newServer'/rel).read_bytes();files['app/'+rel]=data;m['after'][APP+'/'+rel]=sha(data)
    for rel in CLIENT:
        data=(WORK/'linhhoasu/webgame/game'/rel).read_bytes();files['client/'+rel]=data;m['after'][GAME+'/'+rel]=sha(data)
    files['client/js/lhs-arena-v1.js']=(WORK/'linhhoasu/webgame/game/js/lhs-arena-v1.js').read_bytes()
    assert sha(files['client/js/lhs-arena-v1.js'])==m['context'][GAME+'/js/lhs-arena-v1.js']
    for name in TESTS:files['tests/'+name]=(WORK/'linhhoasu/lhs/newServer/scripts'/name).read_bytes()
    for name in ['qa_competitions_live_20260917.js','qa_competitions_mongo_20260917.js']:files['tools/'+name]=(WB/'tools'/name).read_bytes()
    audit=json.loads((WB/'temp/arena_power_20260917/audit.json').read_text(encoding='utf8'))
    files['audit.json']=json.dumps({'samples':[{k:v for k,v in p.items()if k in ['name','attrs','legacy','nativeWeightedSameAttrs']}for p in audit['samples']]}).encode()
    common="const log=require.resolve(APP+'/src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};if(process.env.COMPETITION_OFFLINE==='1'){const deny=()=>{throw Error('QA_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;for(const n of ['http','https']){require(n).request=deny;require(n).get=deny;}global.fetch=deny;}".replace('APP+',json.dumps(APP)+'+')
    mapping={APP+'/'+r:m['stage']+'/app/'+r for r in FILES}
    loader="""const fs=require('fs'),path=require('path'),Module=require('module'),map=MAP;
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('../src/')&&parent?.filename.startsWith(STAGE+'/tests/'))request=APP+'/'+request.slice(3);
 try{return resolve.call(this,request,parent,...rest);}catch(e){const p=request.startsWith('.')&&parent?path.resolve(path.dirname(parent.filename),request):request;
 if(e.code==='MODULE_NOT_FOUND'&&(map[p]||map[p+'.js']))return map[p]?p:p+'.js';throw e;}};
for(const ext of ['.js','.json']){const original=Module._extensions[ext];Module._extensions[ext]=function(m,p){if(!map[p])return original(m,p);
 const text=fs.readFileSync(map[p],'utf8');if(ext==='.json'){m.exports=JSON.parse(text);return;}return m._compile(text,p);};}
""".replace('MAP',json.dumps(mapping)).replace('STAGE+',json.dumps(m['stage'])+'+').replace('APP+',json.dumps(APP)+'+')
    files['loader.js']=(loader+common).encode();files['installed-loader.js']=common.encode()
    run(s,'install -d -m 700 '+shlex.quote(m['stage']))
    with s.open_sftp() as f:
        for rel,data in files.items():
            target=m['stage']+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(str(Path(target).parent).replace('\\','/')))
            with f.open(target,'wb') as h:h.write(data)
    m['stagedHashes']={m['stage']+'/'+r:sha(b)for r,b in files.items()};assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'];save(m)
def isolated(s,m):
    assert m['status']=='STAGED';assert m['testedHashes']==m['after'];assert hashes(s,list(m['before']))==m['before']
    prefix='lhs_qa_comp_v3_'+m['stamp']+'_s';results=[];before=pm2(s)
    try:
        for phase in ['seed','info','flow','settlement']:
            for sid in [1001,1002,1003,1004]:
                output=run(s,'COMPETITION_APP='+shlex.quote(APP)+' COMPETITION_QA_PREFIX='+shlex.quote(prefix)+' node -r '+shlex.quote(m['stage']+'/loader.js')+' '+shlex.quote(m['stage']+'/tools/qa_competitions_mongo_20260917.js')+' '+str(sid)+' '+phase,timeout=55)
                obj=json.loads(next(x for x in reversed(output.splitlines())if x.startswith('{')));assert obj['result']=='PASS';results.append(obj)
                print(json.dumps({'step':'mongo-redis','phase':phase,'serverId':sid,'result':'PASS'}),flush=True)
    finally:
        m['isolatedResults']=results;m['isolatedCleanup']=cleanup_qa(s,m,prefix);save(m);assert pm2(s)==before
    m['isolatedHashes']=dict(m['after']);save(m)
def deploy(s,m):
    assert m['status']=='STAGED';assert m.get('isolatedHashes')==m['after']==m['testedHashes']
    visual=json.loads((OUT/'visual.json').read_text(encoding='utf8'));assert visual['result']=='PASS' and not visual['errors'] and not visual['warnings'],'NATIVE_CALENDAR_QA_REQUIRED'
    m['nativeCalendarQa']=visual
    assert hashes(s,list(m['before']))==m['before'];assert hashes(s,list(m['context']))==m['context'];assert hashes(s,list(m['stagedHashes']))==m['stagedHashes']
    for rel in FILES:assert sha((WORK/'linhhoasu/lhs/newServer'/rel).read_bytes())==m['after'][APP+'/'+rel]
    for rel in CLIENT:assert sha((WORK/'linhhoasu/webgame/game'/rel).read_bytes())==m['after'][GAME+'/'+rel]
    rules=json.loads((WORK/'linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json').read_text(encoding='utf8'))
    now=int(run(s,"node -p 'Date.now()'").strip());activation=int(datetime.fromisoformat(rules['independent']['crossArena']['activationAt']).timestamp()*1000)
    cutoff=((activation+25200000)//86400000+1)*86400000-25200000-3600000
    assert activation<=now<cutoff-600000,'RELEASE_MUST_FINISH_BEFORE_FIRST_DAILY_CUTOFF'
    assert all(v=='200'for v in ready(s).values());m['status']='DEPLOYING';m['deployBeforePm2']=pm2(s);save(m)
    try:
        install(s,m);m['installed']=True;save(m)
        for name,port,sid in NODES:
            positions=log_positions(s);clock=restart_clock(s,name);m['restarted'].append(name);save(m)
            print(json.dumps({'step':'restart','serverId':sid}),flush=True);run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
            started=restart_clock(s,name);m.setdefault('stable',{})[str(sid)]=wait_stable(s,name,port);save(m)
            output=qa_run(s,'node '+shlex.quote(m['stage']+'/tools/qa_competitions_live_20260917.js')+' '+str(sid)+' --power --parallel')
            obj=json.loads(next(x for x in reversed(output.splitlines())if x.startswith('{')));assert obj['result']=='PASS' and obj['qaResidue']==0 and obj['realPlayerWrites']==0
            m.setdefault('nodeQa',{})[str(sid)]=obj
            # PM2 uptime has milliseconds, while Winston lines only have seconds.
            # A final old-process Redis close can share the new uptime's second.
            # Round that exclusive boundary up; only the two existing, known
            # shutdown patterns are classified as warnings, on this node only.
            # Every other error and all errors in later seconds remain fatal.
            window={'before':clock['now'],'started':((started['started']//1000)+1)*1000,'timezone':started['timezone']}
            m.setdefault('restartWindows',{})[str(sid)]={'before':clock,'after':started,'logBoundary':window}
            m.setdefault('logs',{})[str(sid)]=check_release_logs(s,positions,name,window)
            current=pm2(s);assert all(next((p for p in current if p['name']==b['name']),None)==b for b in m['deployBeforePm2']if b['name']not in m['restarted'])
            save(m);print(json.dumps({'step':'node-pass','serverId':sid}),flush=True)
        test(s,m,True);verify(s,m);m['afterPm2']=pm2(s);m['status']='DEPLOYED';save(m)
        print(json.dumps({'status':m['status'],'ready':m['ready'],'backup':m['backup']}),flush=True)
    except Exception as e:
        m['error']=str(e)[-7000:];save(m)
        if m.get('installed'):
            install(s,m,True)
            for name,port,_ in NODES:
                if name in m['restarted']:run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
            m['status']='ROLLED_BACK';m['rollbackReady']=ready(s);save(m)
        raise
def verify(s,m):
    assert hashes(s,list(m['after']))==m['after'];assert hashes(s,list(m['context']))==m['context'];assert arena_env(s)==m['beforeArenaEnv']
    for rel in CLIENT:
        digest=run(s,'curl -fsS --max-time 12 '+shlex.quote('http://103.116.105.154:81/'+rel)+' | sha256sum').split()[0]
        assert digest==m['after'][GAME+'/'+rel],'PUBLIC_HASH_MISMATCH:'+rel
    m['ready']=ready(s);assert all(v=='200'for v in m['ready'].values());save(m)
def audit(s,m):
    verify(s,m)
    code=r"""const APP='/linhhoasu/lhs/newServer',p=require.resolve(APP+'/src/logger');require.cache[p]={id:p,filename:p,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const {MongoClient}=require(APP+'/node_modules/mongodb'),calendar=require(APP+'/src/services/CrossEventScheduleService'),cross=require(APP+'/src/services/CrossServerEventService');
(async()=>{const db=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await db.connect();try{
const id=db.db('lhs_s1001'),now=Date.now(),servers=await id.collection('gameservers').find({serverId:{$in:[1001,1002,1003,1004]}},{projection:{_id:0,serverId:1,openTime:1,running:1,status:1}}).sort({serverId:1}).toArray();
const gates=servers.map(s=>({serverId:s.serverId,openTime:s.openTime,events:Object.fromEntries(cross.EVENTS.map(e=>[e,calendar.describe(e,{serverId:s.serverId,level:120},s,now)]))}));
const entries=await id.collection('crossevententries').aggregate([{$group:{_id:{cycleKey:'$cycleKey',event:'$event'},count:{$sum:1},maxScore:{$max:'$score'}}}]).toArray();
const settlements=await id.collection('crosseventsettlements').find({},{projection:{_id:1,event:1,cycleKey:1,sourceCycleKey:1,period:1,state:1,cursorAt:1,cutoffAt:1}}).sort({cutoffAt:-1}).limit(20).toArray();
console.log(JSON.stringify({result:'PASS',now,schedule:cross.schedule,gates,entries,settlements,productionWrites:0}));
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
    result=json.loads(run(s,'node -',code,timeout=55));result['pm2']=pm2(s);result['ready']=m['ready']
    assert result['schedule']['version']=='cross-parallel-v2';assert result['schedule']['rotation']==['crossRival','topArena']
    assert result['schedule']['serverIds']==[1001,1002,1003]
    assert all(x['events']['crossArena']['cycle']for x in result['gates']);assert result['gates'][3]['events']['crossArena']['reason']=='SERVER_NOT_IN_POOL'
    (OUT/'post-live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'result':'PASS','now':result['now'],'gates':[{ 'serverId':x['serverId'],'crossArena':x['events']['crossArena']['reason']or'OPEN','crossRival':x['events']['crossRival']['reason']or'OPEN','topArena':x['events']['topArena']['reason']or'OPEN'}for x in result['gates']],'ready':result['ready']}),flush=True)
def main():
    s=connect()
    try:
        mode=sys.argv[1]if len(sys.argv)>1 else'stage'
        if mode=='stage':stage(s)
        else:
            m=json.loads(MANIFEST.read_text(encoding='utf8'))
            if mode=='restage':
                assert m['status']in ['STAGING','STAGED','ROLLED_BACK']
                if m['status']=='ROLLED_BACK':
                    assert hashes(s,list(m['before']))==m['before'],'ROLLBACK_BASELINE_DRIFT'
                    m.setdefault('attempts',[]).append({k:m[k]for k in ['status','backup','deployBeforePm2','restarted','nodeQa','logs','restartWindows','error','rollbackReady']if k in m})
                    m['backup']=m['backup']+'_retry';m['restarted']=[];m.pop('installed',None);m.pop('error',None);m['nodeQa']={};save(m)
                prior=dict(m['after']);upload(s,m);test(s,m)
                if m.get('isolatedHashes')==prior and all(m['after'][p]==v for p,v in prior.items()if p.startswith(APP+'/')):m['isolatedHashes']=dict(m['after'])
                m['status']='STAGED';save(m)
            elif mode=='isolated':isolated(s,m)
            elif mode=='deploy':deploy(s,m)
            elif mode=='verify':verify(s,m);print(json.dumps({'result':'PASS','ready':m['ready'],'status':m['status']}))
            elif mode=='audit':audit(s,m)
            else:raise RuntimeError('UNKNOWN_MODE')
    finally:s.close()
if __name__=='__main__':main()
