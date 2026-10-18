"""Contest6006 rank x10 + currency2percent, exact baselines and scoped rollback."""
import hashlib,json,shlex,stat,sys,urllib.request
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from preflight_fishing_rank_x10_20260907 import ROOT,APP,GAME,SERVER,CLIENT

STAGE='/linhhoasu/_ai_workbench/temp/fishing_rank_x10_20260907'
TEST_APP=STAGE+'/app'
ECONOMY=APP+'/src/config/fishingEconomy.json'
LANG=GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'
STATE=ROOT/'release.json'
CONFIG_VERSION='20260907_fishing_rank10_coin2_v1'
TARGETS=[('server.next.bin',SERVER),('economy.next.json',ECONOMY),('client.next.bin',CLIENT),('lang.next.bin',LANG),('index.next.html',GAME+'/index.html')]

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def http_hash(s,url):
    return run(s,'bash -c '+shlex.quote('set -o pipefail; curl -fsS --max-time 20 '+shlex.quote(url)+' | sha256sum')).split()[0]
def tests(s,app=TEST_APP):
    return json.loads(run(s,'node '+STAGE+'/test-rank.js '+STAGE+' '+app,timeout=45))
def runtime_probe(s):
    code=r'''const fs=require('fs'),cp=require('child_process'),dotenv=require('/linhhoasu/lhs/newServer/node_modules/dotenv');const root='/linhhoasu/lhs/newServer';const all=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const result=[];for(const name of['lhs-s1001','lhs-s1002']){const p=all.find(x=>x.name===name);const raw=Object.fromEntries(fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));const env={...dotenv.parse(fs.readFileSync(root+'/.env')),...raw};const paths=[env.CONFIG_BIN_PATH,root+'/../LHS-re/update/resource/assets/excel/config_e5ac72c2.bin',root+'/../update/resource/assets/excel/config_e5ac72c2.bin'].filter(Boolean);result.push({name,pid:p.pid,cwd:p.pm2_env.pm_cwd,config:fs.realpathSync(paths.find(x=>fs.existsSync(x)))});}console.log(JSON.stringify(result));'''
    return json.loads(run(s,'node -',code))
def log_probe(s,pre):
    # Only count newly appended error bytes/markers; never expose player/credential log lines.
    data=[{'name':r['name'],'path':r['errorLog'],'start':r['errorLogSize']} for r in pre['runtime']]
    code="const fs=require('fs'),rows="+json.dumps(data)+";console.log(JSON.stringify(rows.map(r=>{let n=fs.statSync(r.path).size,len=Math.min(Math.max(0,n-r.start),65536),b=Buffer.alloc(len),fd=fs.openSync(r.path,'r');fs.readSync(fd,b,0,len,Math.max(r.start,n-len));fs.closeSync(fd);return{name:r.name,appendedBytes:Math.max(0,n-r.start),sampleBytes:len,fatalMarkers:(b.toString().match(/TypeError|ReferenceError|SyntaxError|FATAL|UnhandledPromiseRejection/g)||[]).length};})));"
    return json.loads(run(s,'node -',code))
def verify(s,state):
    assert state['result']=='DEPLOYED','NOT_DEPLOYED'
    assert hashes(s,list(state['expected']))==state['expected'],'LIVE_HASH_DRIFT'
    health=ready(s);assert health=={'8080':200,'8083':200},'NOT_READY'
    after=pm2(s)
    for p in state['beforePm2']:
        q=next(x for x in after if x['name']==p['name'])
        if p['name'] in ['lhs-s1001','lhs-s1002']:
            assert q['status']=='online' and q['pid']!=p['pid'] and q['restarts']==p['restarts']+1,'RESTART_COUNT'
        else:assert p==q,'UNRELATED_PROCESS_CHANGED'
    paths=runtime_probe(s);assert all(r['config']==SERVER and r['cwd']==APP for r in paths),'RUNTIME_CONFIG_CHANGED'
    public={}
    for rel,remote in [('update/resource/assets/excel/config_e5ac72c2.bin',CLIENT),('update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',LANG),('index.html',GAME+'/index.html')]:
        assert http_hash(s,'http://127.0.0.1:81/'+rel+'?v='+CONFIG_VERSION)==state['expected'][remote]
        request=urllib.request.Request('http://103.116.105.154:81/'+rel+'?v='+CONFIG_VERSION,headers={'Cache-Control':'no-cache'})
        with urllib.request.urlopen(request,timeout=20) as response:actual=hashlib.sha256(response.read()).hexdigest()
        assert actual==state['expected'][remote],'PUBLIC_HASH'
        public[rel]=actual
    logs=log_probe(s,state['preflight']);assert all(x['fatalMarkers']==0 for x in logs),'NEW_FATAL_LOG'
    state.update(verifiedAt=datetime.now(timezone.utc).isoformat(),afterPm2=after,ready=health,runtime=paths,httpHashes=public,errorLogSummary=logs)
    save(STATE,state)

def main():
    s=connect();mode=sys.argv[1];state=None;installed=[];restarted=[]
    try:
        pre=json.loads((ROOT/'preflight.json').read_text(encoding='utf-8'))
        if mode=='stage':
            assert not STATE.exists(),'RELEASE_ALREADY_STARTED'
            assert hashes(s,list(pre['baseline']))==pre['baseline'],'BASELINE_DRIFT'
            assert pm2(s)==pre['pm2'],'PROCESS_DRIFT'
            run(s,'install -d -m 700 '+TEST_APP)
            run(s,'cp -a '+APP+'/src '+TEST_APP+'/')
            run(s,'cp -a '+APP+'/scripts '+TEST_APP+'/')
            run(s,'test -e '+TEST_APP+'/node_modules || ln -s '+APP+'/node_modules '+TEST_APP+'/node_modules')
            with s.open_sftp() as f:
                for name,_ in TARGETS:f.put(str(ROOT/name),STAGE+'/'+name)
                f.put(str(WB/'tools/test_fishing_rank_x10_20260907.js'),STAGE+'/test-rank.js')
                f.put(str(ROOT/'economy.next.json'),TEST_APP+'/src/config/fishingEconomy.json')
            for name,_ in TARGETS:assert hashes(s,[STAGE+'/'+name])[STAGE+'/'+name]==digest(ROOT/name)
            result=tests(s);assert result['result']=='PASS' and result['tests']==34
            assert result['configSha256']==digest(ROOT/'server.next.bin') and result['economySha256']==digest(ROOT/'economy.next.json'),'TEST_EVIDENCE_HASH'
            core=run(s,'NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH='+STAGE+'/server.next.bin node '+TEST_APP+'/scripts/test-core-gameplay-contract.js',timeout=45)
            assert '"result": "ok"' in core or '"result":"ok"' in core
            stage={'at':datetime.now(timezone.utc).isoformat(),'stage':STAGE,'tests':result,'core':core,'targetHashes':{remote:digest(ROOT/name) for name,remote in TARGETS}}
            save(ROOT/'stage.json',stage);print(json.dumps({'staged':True,'tests':result['tests'],'core':'PASS','ready':ready(s)}));return
        if mode=='verify':
            state=json.loads(STATE.read_text(encoding='utf-8'));verify(s,state)
            print(json.dumps({'verified':True,'ready':state['ready'],'errorLogs':state['errorLogSummary'],'backup':state['backup']}));return
        assert mode=='deploy','UNKNOWN_MODE';assert not STATE.exists(),'ALREADY_RUN_REVIEW_STATE'
        stage=json.loads((ROOT/'stage.json').read_text(encoding='utf-8'));assert stage['tests']['result']=='PASS'
        client_check=json.loads((ROOT/'client-check.json').read_text(encoding='utf-8'))
        assert client_check['result']=='PASS' and client_check['clientSha256']==digest(ROOT/'client.next.bin') and client_check['langSha256']==digest(ROOT/'lang.next.bin'),'CLIENT_TEST_GATE'
        assert stage['targetHashes']=={remote:digest(ROOT/name) for name,remote in TARGETS},'CANDIDATE_CHANGED'
        assert hashes(s,list(pre['baseline']))==pre['baseline'],'BASELINE_DRIFT';assert pm2(s)==pre['pm2'],'PM2_DRIFT';assert ready(s)=={'8080':200,'8083':200}
        expected=dict(pre['baseline']);expected.update(stage['targetHashes'])
        backup='/linhhoasu/_ai_workbench/backups/fishing_rank_x10_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        run(s,'install -d -m 700 '+backup)
        state={'result':'PREPARING','backup':backup,'beforePm2':pm2(s),'expected':expected,'preflight':pre,'installed':[],'restarted':[]};save(STATE,state)
        with s.open_sftp() as f:
            for i,(name,remote) in enumerate(TARGETS):
                run(s,'cp -p '+shlex.quote(remote)+' '+backup+'/'+str(i)+'.before')
                a=f.stat(remote);dest=backup+'/'+str(i)+'.next';f.put(str(ROOT/name),dest);f.chmod(dest,stat.S_IMODE(a.st_mode));f.chown(dest,a.st_uid,a.st_gid)
                assert hashes(s,[dest,backup+'/'+str(i)+'.before'])=={dest:expected[remote],backup+'/'+str(i)+'.before':pre['baseline'][remote]},'BACKUP_STAGE_HASH'
            assert hashes(s,list(pre['baseline']))==pre['baseline'],'FINAL_CAS'
            # Install authoritative binary and economy rules before reloading either server.
            for i in [0,1]:
                f.posix_rename(backup+'/'+str(i)+'.next',TARGETS[i][1]);installed.append(i);state['installed']=installed;save(STATE,state)
        for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
            restarted.append(name);state['restarted']=restarted;save(STATE,state)
            run(s,'pm2 restart '+name,timeout=55);wait_ready(s,port)
            check=tests(s,APP);assert check['result']=='PASS' and check['tests']==34
            state.setdefault('postRestartFixture',{})[name]=check;save(STATE,state)
            print(json.dumps({'step':'ready-and-fixture-pass','process':name,'checks':check['tests']}),flush=True)
        # Publish client table + cache token only after both authoritative servers are ready.
        with s.open_sftp() as f:
            for i in [2,3,4]:
                remote=TARGETS[i][1];assert hashes(s,[remote])[remote]==pre['baseline'][remote],'CLIENT_CAS'
                f.posix_rename(backup+'/'+str(i)+'.next',remote);installed.append(i);state['installed']=installed;save(STATE,state)
        state['result']='DEPLOYED';verify(s,state)
        print(json.dumps({'result':'DEPLOYED','backup':backup,'ready':state['ready'],'errorLogs':state['errorLogSummary']}))
    except Exception as exc:
        if mode=='deploy' and state:
            state.update(result='FAILED',error=str(exc));save(STATE,state)
            if installed:
                # Fail closed on concurrent modification; restore only files installed by this run.
                with s.open_sftp() as f:
                    for i in reversed(installed):
                        remote=TARGETS[i][1];assert hashes(s,[remote])[remote]==state['expected'][remote],'ROLLBACK_DRIFT'
                        restore=state['backup']+'/'+str(i)+'.restore';run(s,'cp -p '+state['backup']+'/'+str(i)+'.before '+restore);f.posix_rename(restore,remote)
                for name in restarted:
                    run(s,'pm2 restart '+name,timeout=55);wait_ready(s,8083 if name=='lhs-s1002' else 8080)
                assert hashes(s,list(pre['baseline']))==pre['baseline'],'ROLLBACK_HASH'
                state.update(rolledBack=True,rollbackReady=ready(s));save(STATE,state)
        raise
    finally:s.close()

if __name__=='__main__':main()
