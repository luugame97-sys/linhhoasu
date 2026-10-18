"""Scoped competition release runner. Stage/test first; runtime rollout is a separate mode."""
import difflib
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, wait_ready

WB=Path(__file__).resolve().parents[1]
WORK=WB.parent
OUT=WB/'temp/competitions_release_20260917'
BASE=WB/'backups/competitions_fix_20260917'
APP='/linhhoasu/lhs/newServer'
GAME='/linhhoasu/webgame/game'
MANIFEST=OUT/'release.json'
SOURCES=['src/handlers/arena.js','src/handlers/basic.js','src/handlers/cross-rival.js','src/app.js',
 'src/services/CrossArenaService.js','src/services/CrossServerEventService.js','src/services/CrossEventSettlementService.js',
 'src/services/ArenaSettlementService.js','src/db/models/CrossArenaAction.js','src/db/models/CrossEventSettlement.js',
 'src/config/competitionsRelease.js']
TESTS=['test-competitions-v3.js','test-arena-recovery-v3.js','test-cross-settlement-v3.js',
 'test-competitions-client-v3.js','test-arena-settlement.js','test-cross-server-events.js']
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(m):
    MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def ready(s):
    return {str(p):run(s,'curl -s --max-time 8 -o /dev/null -w '+shlex.quote('%{http_code}')+' http://127.0.0.1:'+str(p)+'/ready').strip() for p in [8080,8083,8084,8085]}

def stage(s):
    baseline=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))['files']
    assert hashes(s,list(baseline))==baseline,'PRODUCTION_BASELINE_DRIFT'
    assert not MANIFEST.exists(),'STAGE_EXISTS_USE_RESTAGE'
    OUT.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    m={'status':'PREPARING','stage':'/linhhoasu/_ai_workbench/temp/competitions_'+stamp,
       'backup':'/linhhoasu/_ai_workbench/backups/competitions_'+stamp,'before':dict(baseline),'after':{},
       'beforePm2':pm2(s),'baselineReady':ready(s),'productionWrites':0,'realPlayerWrites':0,'restarted':[]}
    assert all(x=='200' for x in m['baselineReady'].values())
    save(m);upload(s,m);tests(s,m)
    assert pm2(s)==m['beforePm2'],'PROCESS_CHANGED_DURING_STAGE'
    assert hashes(s,list(baseline))==baseline,'PRODUCTION_CHANGED_DURING_STAGE'
    m['status']='STAGED';save(m)
    print(json.dumps({'status':m['status'],'stage':m['stage'],'tests':m['tests']},ensure_ascii=True),flush=True)

def upload(s,m):
    files={}
    for rel in SOURCES:
        data=(WORK/'linhhoasu/lhs/newServer'/rel).read_bytes()
        files['app/'+rel]=data;m['after'][APP+'/'+rel]=sha(data)
        if APP+'/'+rel not in m['before']:m['before'][APP+'/'+rel]=None
    for rel in ['index.html','js/lhs-arena-v1.js']:
        data=(WORK/'linhhoasu/webgame/game'/rel).read_bytes()
        files['client/'+rel]=data;m['after'][GAME+'/'+rel]=sha(data)
    # Persistent PM2 config is based on its exact live backup, not the drifted
    # local ecosystem. The appended scoped override changes S3/S4 Arena only.
    suffix=b"\n// Synchronized competition release; preserve unrelated settings.\nrequire('./src/config/competitionsRelease').apply(module.exports.apps);\n"
    config=(BASE/'ecosystem.config.js').read_bytes()+suffix
    files['app/ecosystem.config.js']=config;m['after'][APP+'/ecosystem.config.js']=sha(config)
    for name in TESTS:files['tests/'+name]=(WORK/'linhhoasu/lhs/newServer/scripts'/name).read_bytes()
    files['tools/qa_competitions_mongo_20260917.js']=(WB/'tools/qa_competitions_mongo_20260917.js').read_bytes()
    files['tools/qa_competitions_live_20260917.js']=(WB/'tools/qa_competitions_live_20260917.js').read_bytes()
    mapping={APP+'/'+rel:m['stage']+'/app/'+rel for rel in SOURCES}
    loader="""'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),map=MAP;
const originalResolve=Module._resolveFilename,originalExtension=Module._extensions['.js'];
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('../src/')&&parent&&parent.filename.startsWith(STAGE+'/tests/'))request=APP+'/'+request.slice(3);
 try{return originalResolve.call(this,request,parent,...rest);}catch(e){
  const target=request.startsWith('.')&&parent?path.resolve(path.dirname(parent.filename),request):request;
  if(e.code==='MODULE_NOT_FOUND'&&(map[target]||map[target+'.js']))return map[target]?target:target+'.js';throw e;
 }};
Module._extensions['.js']=function(m,file){if(map[file])return m._compile(fs.readFileSync(map[file],'utf8'),file);return originalExtension(m,file);};
const log=require.resolve(APP+'/src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
if(process.env.COMPETITION_OFFLINE==='1'){
 const deny=()=>{throw Error('OFFLINE_TEST_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
 for(const n of ['http','https']){require(n).request=deny;require(n).get=deny;}global.fetch=deny;
}
""".replace('MAP',json.dumps(mapping)).replace("APP+",json.dumps(APP)+'+').replace("STAGE+",json.dumps(m['stage'])+'+')
    files['loader.js']=loader.encode()
    run(s,'install -d -m 700 '+shlex.quote(m['stage']))
    with s.open_sftp() as f:
        for rel,data in files.items():
            target=m['stage']+'/'+rel
            run(s,'install -d -m 700 '+shlex.quote(str(Path(target).parent).replace('\\','/')))
            with f.open(target,'wb') as h:h.write(data)
    m['stagedHashes']={m['stage']+'/'+p:sha(b) for p,b in files.items()}
    assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'],'STAGE_READBACK_MISMATCH'
    save(m)

def tests(s,m):
    env='COMPETITION_OFFLINE=1 COMPETITION_APP='+shlex.quote(APP)+' COMPETITION_CLIENT_ROOT='+shlex.quote(m['stage']+'/client')+' COMPETITION_MAIN='+shlex.quote(GAME+'/js/main.min_drop100.js')
    results={}
    for test in TESTS:
        print(json.dumps({'step':'test','name':test}),flush=True)
        cmd=env+' node -r '+shlex.quote(m['stage']+'/loader.js')+' '+shlex.quote(m['stage']+'/tests/'+test)
        output=run(s,cmd,timeout=55)
        assert 'PASS' in output,'TEST_DID_NOT_PASS:'+test
        results[test]=output.strip()
        m['tests']=results;save(m)
    m['tests']=results;m['testsSourceHashes']=dict(m['after']);save(m)

def cleanup_qa(s,m,prefix):
    code="""const APP=ROOT,prefix=PREFIX,owner=prefix.slice(0,-2),fs=require('fs');
const {MongoClient}=require(APP+'/node_modules/mongodb'),Redis=require(APP+'/node_modules/ioredis');
const cfg={...require(APP+'/node_modules/dotenv').parse(fs.readFileSync(APP+'/.env')),...require(APP+'/ecosystem.config.js').apps.find(a=>a.name==='lhs-s1001').env};
(async()=>{if(!/^lhs_qa_comp_v3_[0-9_]+_s$/.test(prefix))throw Error('QA_PREFIX_INVALID');
const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await mongo.connect();
const redis=cfg.REDIS_URL?new Redis(cfg.REDIS_URL,{maxRetriesPerRequest:1}):new Redis({host:cfg.REDIS_HOST||'127.0.0.1',port:Number(cfg.REDIS_PORT||6379),password:cfg.REDIS_PASSWORD||undefined,maxRetriesPerRequest:1});
const removed=[];
try{for(const sid of [1001,1002,1003,1004]){const name=prefix+sid,db=mongo.db(name),collections=await db.listCollections({},{nameOnly:true}).toArray();
if(!collections.length)continue;const marker=await db.collection('qa_ownership').findOne({_id:'owner'});if(marker?.owner!==owner)throw Error('QA_OWNER_MISMATCH');
let cursor='0',keys=[];do{const x=await redis.scan(cursor,'MATCH',name+':*','COUNT',100);cursor=x[0];keys.push(...x[1]);}while(cursor!=='0');
if(keys.some(k=>!k.startsWith(name+':')))throw Error('QA_REDIS_SCOPE');if(keys.length)await redis.unlink(...keys);
await db.dropDatabase();removed.push({database:name,collections:collections.length,redisKeys:keys.length});}
console.log(JSON.stringify({result:'PASS',removed,realPlayerWrites:0}));}finally{await redis.quit();await mongo.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
""".replace('APP=ROOT,','APP='+json.dumps(APP)+',').replace('prefix=PREFIX,','prefix='+json.dumps(prefix)+',')
    return json.loads(run(s,'node -',code,timeout=55))

def isolated(s,m):
    assert m['status']=='STAGED'
    assert hashes(s,list(m['before']))==m['before'],'PRODUCTION_BASELINE_DRIFT'
    assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'],'STAGE_DRIFT'
    prefix='lhs_qa_comp_v3_'+m['stage'].split('competitions_')[-1]+'_s'
    results=[];before=pm2(s)
    try:
        for phase in ['seed','info','flow','settlement']:
            for sid in [1001,1002,1003,1004]:
                print(json.dumps({'step':'mongo-qa','phase':phase,'serverId':sid}),flush=True)
                cmd='COMPETITION_APP='+shlex.quote(APP)+' COMPETITION_QA_PREFIX='+shlex.quote(prefix)+' node -r '+shlex.quote(m['stage']+'/loader.js')+' '+shlex.quote(m['stage']+'/tools/qa_competitions_mongo_20260917.js')+' '+str(sid)+' '+phase
                output=run(s,cmd,timeout=55)
                r=json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{')))
                assert r['result']=='PASS';results.append(r);m['isolatedQa']=results;save(m)
    except Exception as e:
        m['isolatedError']=str(e)[-6000:];save(m);raise
    finally:
        m['isolatedCleanup']=cleanup_qa(s,m,prefix);save(m)
        assert pm2(s)==before,'PRODUCTION_PROCESS_CHANGED'
    m.pop('isolatedError',None);m['isolatedReady']=ready(s);m['isolatedSourceHashes']=dict(m['after']);save(m)
    print(json.dumps({'result':'PASS','phases':len(results),'cleanup':m['isolatedCleanup'],'ready':m['isolatedReady']},ensure_ascii=True),flush=True)

def live_qa(s,m,sid,preflight=False):
    from release_kaka_end_effect_20260917 import qa_run
    m.pop('productionWrites',None);m['ownedProductionQa']=True;save(m)
    cmd='node '+shlex.quote(m['stage']+'/tools/qa_competitions_live_20260917.js')+' '+str(sid)+(' --preflight' if preflight else '')
    output=qa_run(s,cmd)
    r=json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{')))
    assert r['result']=='PASS' and r['realPlayerWrites']==0 and r['qaResidue']==0
    m.setdefault('authPreflight' if preflight else 'nodeQa',{})[str(sid)]=r;save(m)
    return r

def arena_env(s):
    code="let x='';process.stdin.on('data',b=>x+=b).on('end',()=>console.log(JSON.stringify(Object.fromEntries(JSON.parse(x).filter(p=>/^lhs-s100[1-4]$/.test(p.name)).map(p=>[p.name,Object.fromEntries(['ARENA_SETTLEMENT_ENABLED','ARENA_SETTLEMENT_APPROVED','ARENA_SETTLEMENT_ACTIVATION_AT'].map(k=>[k,p.pm2_env[k]??null]))])))));"
    return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(code)))

def install(s,m,rollback=False):
    code=r"""const fs=require('fs'),path=require('path'),crypto=require('crypto'),m=MANIFEST,rollback=ROLLBACK;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const rel=t=>t.startsWith('/linhhoasu/lhs/newServer/')?'app/'+t.slice('/linhhoasu/lhs/newServer/'.length):'client/'+t.slice('/linhhoasu/webgame/game/'.length);
const targets=Object.keys(m.after);
for(const t of targets){if(!t.startsWith('/linhhoasu/lhs/newServer/')&&!t.startsWith('/linhhoasu/webgame/game/'))throw Error('TARGET_SCOPE');
 const current=sha(t);if(rollback){if(current!==m.after[t]&&current!==m.before[t])throw Error('ROLLBACK_EXTERNAL_DRIFT');}
 else if(current!==m.before[t]||sha(m.stage+'/'+rel(t))!==m.after[t])throw Error('INSTALL_CAS_DRIFT');}
if(!rollback){fs.mkdirSync(m.backup,{recursive:false,mode:0o700});
 for(const t of targets){if(m.before[t]===null)continue;const b=m.backup+'/'+rel(t);fs.mkdirSync(path.dirname(b),{recursive:true,mode:0o700});fs.copyFileSync(t,b,fs.constants.COPYFILE_EXCL);}
 if(fs.existsSync('/root/.pm2/dump.pm2'))fs.copyFileSync('/root/.pm2/dump.pm2',m.backup+'/pm2-dump.before',fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(m.backup+'/manifest.json',JSON.stringify({before:m.before,after:m.after},null,2),{flag:'wx',mode:0o600});}
function write(t,src,expected){const data=fs.readFileSync(src),stat=fs.existsSync(t)?fs.statSync(t):null,tmp=t+'.competition-v3.tmp';
 if(fs.existsSync(tmp))throw Error('TEMP_TARGET_EXISTS');fs.writeFileSync(tmp,data,{flag:'wx',mode:stat?stat.mode:0o644});
 if(stat)fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,t);if(sha(t)!==expected)throw Error('WRITE_HASH_FAILED');}
const installed=[];
try{for(const t of targets){if(rollback){if(sha(t)===m.before[t])continue;if(m.before[t]===null)fs.unlinkSync(t);else write(t,m.backup+'/'+rel(t),m.before[t]);}
 else{write(t,m.stage+'/'+rel(t),m.after[t]);installed.push(t);}}}
catch(e){if(!rollback)for(const t of installed.reverse()){if(sha(t)!==m.after[t])continue;if(m.before[t]===null)fs.unlinkSync(t);else write(t,m.backup+'/'+rel(t),m.before[t]);}throw e;}
console.log(JSON.stringify({result:'PASS',rollback,files:targets.length}));
""".replace('m=MANIFEST,','m='+json.dumps(m)+',').replace('rollback=ROLLBACK;','rollback='+('true' if rollback else 'false')+';')
    return json.loads(run(s,'node -',code,timeout=55))

def rollback_release(s,m):
    install(s,m,True)
    for name in m['restarted']:
        prior=m['beforeArenaEnv'][name]
        env=' '.join(k+'='+shlex.quote('' if v is None else str(v)) for k,v in prior.items())
        run(s,env+' pm2 restart '+shlex.quote(name)+' --update-env',timeout=60)
        port={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085}[name]
        wait_ready(s,port)
    # Restore the previous PM2 boot snapshot, not a reconstructed global config.
    run(s,'node -',"const fs=require('fs'),p="+json.dumps(m['backup']+'/pm2-dump.before')+";if(fs.existsSync(p))fs.copyFileSync(p,'/root/.pm2/dump.pm2');")
    m['status']='ROLLED_BACK';m['rollbackReady']=ready(s);save(m)

def deploy(s,m):
    from release_kaka_end_effect_20260917 import wait_stable,log_positions,restart_clock,check_release_logs
    assert m['status']=='STAGED'
    assert set(m.get('authPreflight',{}))=={'1001','1002','1003','1004'},'AUTH_PREFLIGHT_REQUIRED'
    assert m.get('isolatedSourceHashes')==m['after'],'CURRENT_INTEGRATION_QA_REQUIRED'
    assert m.get('testsSourceHashes')==m['after'],'CURRENT_TESTS_REQUIRED'
    assert m.get('stagingCoreSourceHashes')==m['after'],'CURRENT_CORE_CONTRACT_REQUIRED'
    visual=json.loads((OUT/'visual.json').read_text(encoding='utf-8'));assert visual['result']=='PASS' and not visual['errors'] and not visual['warnings'],'NATIVE_UI_QA_REQUIRED'
    assert hashes(s,list(m['before']))==m['before'],'PREDEPLOY_SOURCE_DRIFT'
    assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'],'STAGE_DRIFT'
    for rel in SOURCES:assert sha((WORK/'linhhoasu/lhs/newServer'/rel).read_bytes())==m['after'][APP+'/'+rel],'LOCAL_SOURCE_DRIFT'
    assert all(x=='200' for x in ready(s).values())
    policy=json.loads(run(s,'node -',"const p=require("+json.dumps(m['stage']+'/app/src/config/competitionsRelease.js')+");console.log(JSON.stringify(p));"))
    now=int(run(s,"node -p 'Date.now()'").strip());activation=int(policy['activationAt'])
    first_cutoff=((activation+7*3600000)//86400000+1)*86400000-7*3600000-3600000
    assert activation<=now<first_cutoff,'ACTIVATION_WINDOW_EXPIRED_RESTAGE_POLICY'
    m['beforeArenaEnv']=arena_env(s);m['deployBeforePm2']=pm2(s);m['status']='DEPLOYING';m['restarted']=[];save(m)
    try:
        install(s,m);m['installed']=True;save(m)
        for name,port,sid in [('lhs-s1004',8085,1004),('lhs-s1003',8084,1003),('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
            positions=log_positions(s);before_clock=restart_clock(s,name)
            env=' '.join(k+'='+shlex.quote(str(v)) for k,v in policy['env'].items())+' ' if sid in [1003,1004] else ''
            command=env+'pm2 restart '+name+(' --update-env' if env else '')
            print(json.dumps({'step':'restart','serverId':sid}),flush=True);m['restarted'].append(name);save(m)
            run(s,command,timeout=60);wait_ready(s,port);after_clock=restart_clock(s,name)
            window={'before':before_clock['now'],'started':after_clock['started'],'timezone':after_clock['timezone']}
            m.setdefault('stableReadiness',{})[str(sid)]=wait_stable(s,name,port);save(m)
            live_qa(s,m,sid)
            m.setdefault('logs',{})[str(sid)]=check_release_logs(s,positions,name,window)
            state=pm2(s)
            assert all(next((q for q in state if q['name']==p['name']),None)==p for p in m['deployBeforePm2'] if p['name'] not in m['restarted']),'UNRELATED_PROCESS_CHANGED'
            save(m);print(json.dumps({'step':'node-pass','serverId':sid}),flush=True)
        assert hashes(s,list(m['after']))==m['after'],'FINAL_HASH_DRIFT'
        m['afterArenaEnv']=arena_env(s);assert all(v['ARENA_SETTLEMENT_ENABLED']=='1' and v['ARENA_SETTLEMENT_APPROVED']=='1' for v in m['afterArenaEnv'].values())
        core_output=run(s,'node -r '+shlex.quote(m['stage']+'/loader-installed.js')+' '+shlex.quote(APP+'/scripts/test-core-gameplay-contract.js'),timeout=55)
        m['installedCore']=json.loads(next(line for line in reversed(core_output.splitlines()) if line.startswith('{')))
        assert m['installedCore']['result']=='ok' and m['installedCore']['tables']==714
        run(s,'pm2 save',timeout=60);m['ready']=ready(s);assert all(v=='200' for v in m['ready'].values())
        m['afterPm2']=pm2(s);m['status']='DEPLOYED';save(m)
        print(json.dumps({'status':'DEPLOYED','backup':m['backup'],'ready':m['ready'],'nodeQa':m['nodeQa']},ensure_ascii=True),flush=True)
    except Exception as e:
        m['error']=str(e)[-6000:];save(m)
        if m.get('installed'):rollback_release(s,m)
        else:m['status']='INSTALL_FAILED';m['installFailureHashes']=hashes(s,list(m['before']));save(m)
        raise

def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
    s=connect()
    try:
        if mode=='stage':stage(s)
        elif mode=='restage':
            m=json.loads(MANIFEST.read_text(encoding='utf-8'));assert m['status'] in ['PREPARING','STAGED']
            assert hashes(s,list(m['before']))==m['before'],'BASELINE_DRIFT'
            upload(s,m);tests(s,m);m['status']='STAGED';save(m);print(json.dumps({'status':'STAGED','stage':m['stage']}))
        elif mode=='tests':tests(s,json.loads(MANIFEST.read_text(encoding='utf-8')))
        elif mode=='qa-upload':
            m=json.loads(MANIFEST.read_text(encoding='utf-8'));assert m['status']=='STAGED'
            name='qa_competitions_mongo_20260917.js';target=m['stage']+'/tools/'+name
            assert hashes(s,[target])[target]==m['stagedHashes'][target],'QA_STAGE_DRIFT'
            data=(WB/'tools'/name).read_bytes()
            with s.open_sftp() as f:
                with f.open(target,'wb') as h:h.write(data)
            run(s,'node --check '+shlex.quote(target));m['stagedHashes'][target]=sha(data);save(m)
            print(json.dumps({'qaUpdated':name}))
        elif mode=='isolated':isolated(s,json.loads(MANIFEST.read_text(encoding='utf-8')))
        elif mode=='preflight':
            m=json.loads(MANIFEST.read_text(encoding='utf-8'));assert m['status']=='STAGED'
            assert hashes(s,list(m['before']))==m['before'],'BASELINE_DRIFT'
            for sid in [1004,1003,1002,1001]:live_qa(s,m,sid,True)
            print(json.dumps({'result':'PASS','preflight':m['authPreflight']}),flush=True)
        elif mode=='deploy':deploy(s,json.loads(MANIFEST.read_text(encoding='utf-8')))
        elif mode=='recover-stage':
            m=json.loads(MANIFEST.read_text(encoding='utf-8'))
            assert m['status'] in ['DEPLOYING','ROLLED_BACK','INSTALL_FAILED']
            assert hashes(s,list(m['before']))==m['before'],'ROLLBACK_NOT_CONFIRMED'
            health=ready(s);assert all(v=='200' for v in health.values())
            m.setdefault('priorAttempts',[]).append({k:m.get(k) for k in ['backup','restarted','nodeQa','error','deployBeforePm2']})
            m['priorAttempts'][-1].update({'rollbackReady':health,'rollbackPm2':pm2(s),'baselineHashesRestored':True})
            m['backup']='/linhhoasu/_ai_workbench/backups/competitions_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            m['status']='STAGED';m['installed']=False;m['restarted']=[];m['nodeQa']={};m.pop('error',None);save(m)
            print(json.dumps({'status':'STAGED','rollbackConfirmed':True,'backup':m['backup']}),flush=True)
        elif mode=='core':
            m=json.loads(MANIFEST.read_text(encoding='utf-8'))
            source="const p=require.resolve('/linhhoasu/lhs/newServer/src/logger');require.cache[p]={id:p,filename:p,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};const deny=()=>{throw Error('OFFLINE_TEST_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;for(const n of ['http','https']){require(n).request=deny;require(n).get=deny;}global.fetch=deny;"
            target=m['stage']+'/loader-installed.js'
            with s.open_sftp() as f:
                with f.open(target,'wb') as h:h.write(source.encode())
            m['stagedHashes'][target]=sha(source.encode())
            output=run(s,'COMPETITION_OFFLINE=1 node -r '+shlex.quote(m['stage']+'/loader.js')+' '+shlex.quote(APP+'/scripts/test-core-gameplay-contract.js'),timeout=55)
            m['stagingCore']=json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{')))
            assert m['stagingCore']['result']=='ok' and m['stagingCore']['tables']==714
            m['stagingCoreSourceHashes']=dict(m['after']);save(m);print(output)
        else:raise RuntimeError('No runtime mutation mode implemented yet')
    finally:s.close()
if __name__=='__main__':main()
