"""Display-only power patch: selected source CAS, staged tests, per-node SDK/WS QA."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,wait_ready
from release_competitions_20260917 import install,arena_env
from release_kaka_end_effect_20260917 import wait_stable,qa_run,log_positions,restart_clock,check_release_logs
WB=Path(__file__).resolve().parents[1];WORK=WB.parent;OUT=WB/'temp/arena_power_20260917';BASE=WB/'backups/arena_power_20260917'
APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game';MANIFEST=OUT/'release.json'
FILES=['src/services/ArenaReadModelService.js','src/handlers/arena.js','src/handlers/basic.js','src/services/CrossArenaService.js']
TESTS=['test-arena-power-display.js','test-arena-recovery-v3.js','test-competitions-v3.js','test-cross-settlement-v3.js']
NODES=[('lhs-s1004',8085,1004),('lhs-s1003',8084,1003),('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(m):MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def ready(s):return {str(p):run(s,'curl -fsS --max-time 8 -o /dev/null -w '+shlex.quote('%{http_code}')+' http://127.0.0.1:'+str(p)+'/ready').strip() for _,p,_ in NODES}
def test(s,m,installed=False):
    result={};loader=m['stage']+('/installed-loader.js' if installed else '/loader.js')
    env='COMPETITION_APP='+shlex.quote(APP)+' COMPETITION_MAIN='+shlex.quote(GAME+'/js/main.min_drop100.js')+' POWER_AUDIT_FIXTURE='+shlex.quote(m['stage']+'/audit.json')
    for name in TESTS:
        print(json.dumps({'step':'test','name':name,'installed':installed}),flush=True)
        out=run(s,env+' node -r '+shlex.quote(loader)+' '+shlex.quote(m['stage']+'/tests/'+name),timeout=55)
        obj=json.loads(out);assert obj['result']=='PASS';result[name]=obj
    core=run(s,'node -r '+shlex.quote(loader)+' '+shlex.quote(APP+'/scripts/test-core-gameplay-contract.js'),timeout=55)
    result['core']=json.loads(core);assert result['core']['result']=='ok' and result['core']['tables']==714
    m['installedTests' if installed else 'tests']=result;save(m)
def stage(s):
    assert not MANIFEST.exists(),'RELEASE_EXISTS'
    before=json.loads((BASE/'manifest.json').read_text(encoding='utf8'))['before'];assert hashes(s,list(before))==before
    audit=json.loads((OUT/'audit.json').read_text(encoding='utf8'))
    context={APP+'/src/services/BattleService.js':audit['hashes']['src/services/BattleService.js']}
    context.update({GAME+'/'+k[7:]:v for k,v in audit['hashes'].items() if k.startswith('client/')})
    assert hashes(s,list(context))==context,'CONTEXT_DRIFT'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    m={'status':'STAGING','stage':'/linhhoasu/_ai_workbench/temp/arena_power_'+stamp,'backup':'/linhhoasu/_ai_workbench/backups/arena_power_'+stamp,
      'before':before,'after':{},'context':context,'beforePm2':pm2(s),'beforeArenaEnv':arena_env(s),'restarted':[],'nodeQa':{},'realPlayerWrites':0}
    save(m);files={}
    for rel in FILES:
        data=(WORK/'linhhoasu/lhs/newServer'/rel).read_bytes();files['app/'+rel]=data;m['after'][APP+'/'+rel]=sha(data)
    for name in TESTS:files['tests/'+name]=(WORK/'linhhoasu/lhs/newServer/scripts'/name).read_bytes()
    files['qa.js']=(WB/'tools/qa_competitions_live_20260917.js').read_bytes()
    files['audit.json']=json.dumps({'samples':[{k:v for k,v in p.items() if k in ['name','attrs','legacy','nativeWeightedSameAttrs']} for p in audit['samples']]}).encode()
    mapping={APP+'/'+r:m['stage']+'/app/'+r for r in FILES}
    common="const p=require.resolve("+json.dumps(APP+'/src/logger')+");require.cache[p]={id:p,filename:p,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};const deny=()=>{throw Error('QA_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;for(const n of ['http','https']){require(n).request=deny;require(n).get=deny;}global.fetch=deny;"
    loader="const fs=require('fs'),Module=require('module'),map="+json.dumps(mapping)+";const original=Module._extensions['.js'];Module._extensions['.js']=function(m,f){if(map[f])return m._compile(fs.readFileSync(map[f],'utf8'),f);return original(m,f);};"+common
    files['loader.js']=loader.encode();files['installed-loader.js']=common.encode()
    run(s,'install -d -m 700 '+shlex.quote(m['stage']))
    with s.open_sftp() as f:
        for rel,data in files.items():
            target=m['stage']+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(str(Path(target).parent).replace('\\','/')))
            with f.open(target,'wb') as h:h.write(data)
    m['stagedHashes']={m['stage']+'/'+r:sha(b) for r,b in files.items()};assert hashes(s,list(m['stagedHashes']))==m['stagedHashes'];save(m)
    test(s,m);assert hashes(s,list(before))==before;assert pm2(s)==m['beforePm2'];m['status']='STAGED';save(m)
    print(json.dumps({'status':'STAGED','stage':m['stage']}),flush=True)
def deploy(s,m):
    assert m['status']=='STAGED';assert hashes(s,list(m['before']))==m['before'];assert hashes(s,list(m['context']))==m['context']
    assert hashes(s,list(m['stagedHashes']))==m['stagedHashes']
    for rel in FILES:assert sha((WORK/'linhhoasu/lhs/newServer'/rel).read_bytes())==m['after'][APP+'/'+rel]
    assert all(v=='200' for v in ready(s).values());m['status']='DEPLOYING';m['deployBeforePm2']=pm2(s);save(m)
    try:
        install(s,m);m['installed']=True;save(m)
        for name,port,sid in NODES:
            positions=log_positions(s);clock=restart_clock(s,name);m['restarted'].append(name);save(m)
            print(json.dumps({'step':'restart','serverId':sid}),flush=True);run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
            started=restart_clock(s,name);m.setdefault('stable',{})[str(sid)]=wait_stable(s,name,port);save(m)
            out=qa_run(s,'node '+shlex.quote(m['stage']+'/qa.js')+' '+str(sid)+' --power')
            obj=json.loads(next(line for line in reversed(out.splitlines()) if line.startswith('{')))
            assert obj['result']=='PASS' and obj['qaResidue']==0 and obj['realPlayerWrites']==0;m['nodeQa'][str(sid)]=obj
            m.setdefault('logs',{})[str(sid)]=check_release_logs(s,positions,name,{'before':clock['now'],'started':started['started'],'timezone':started['timezone']})
            current=pm2(s);assert all(next((p for p in current if p['name']==b['name']),None)==b for b in m['deployBeforePm2'] if b['name'] not in m['restarted'])
            save(m);print(json.dumps({'step':'node-pass','serverId':sid}),flush=True)
        test(s,m,True);assert hashes(s,list(m['after']))==m['after'];assert hashes(s,list(m['context']))==m['context']
        assert arena_env(s)==m['beforeArenaEnv'];m['ready']=ready(s);m['afterPm2']=pm2(s);m['status']='DEPLOYED';save(m)
        print(json.dumps({'status':m['status'],'ready':m['ready'],'backup':m['backup']}),flush=True)
    except Exception as e:
        m['error']=str(e)[-7000:];save(m)
        if m.get('installed'):
            install(s,m,True)
            for name,port,_ in NODES:
                if name in m['restarted']:run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
            m['status']='ROLLED_BACK';m['rollbackReady']=ready(s);save(m)
        raise
def main():
    s=connect()
    try:
        mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
        if mode=='stage':stage(s)
        elif mode=='deploy':deploy(s,json.loads(MANIFEST.read_text(encoding='utf8')))
        elif mode=='verify':
            m=json.loads(MANIFEST.read_text(encoding='utf8'));assert m['status']=='DEPLOYED';assert hashes(s,list(m['after']))==m['after'];assert hashes(s,list(m['context']))==m['context'];assert arena_env(s)==m['beforeArenaEnv'];print(json.dumps({'result':'PASS','ready':ready(s),'pm2':pm2(s)}))
        else:raise RuntimeError('UNKNOWN_MODE')
    finally:s.close()
if __name__=='__main__':main()
