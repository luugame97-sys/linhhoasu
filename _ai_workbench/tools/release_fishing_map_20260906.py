"""One-file map transition release. Hash guard, isolated fixtures, S2 then S1, scoped rollback."""
import json, shlex, sys
from pathlib import Path
from datetime import datetime, timezone
import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready, digest

WB=Path(__file__).resolve().parents[1]
ROOT=WB/'temp/fishing_map_fix_20260906'
APP='/linhhoasu/lhs/newServer'
REL='src/handlers/fish.js'
TARGET=APP+'/'+REL
GAME='/linhhoasu/webgame/game'

def write(name,value):
    (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    action=sys.argv[1] if len(sys.argv)>1 else 'stage'
    assert action in ['stage','deploy','verify','inventory','status']
    credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
    s.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
    manifest=json.loads((ROOT/'manifest.json').read_text())
    baseline={v['remote']:v['sha256'] for v in manifest['files'].values()}
    installed=False;restarted=[];report={}
    try:
        ownership=json.loads(run(s,'pm2 jlist | node -e '+shlex.quote("let x='';process.stdin.on('data',b=>x+=b).on('end',()=>console.log(JSON.stringify(JSON.parse(x).map(p=>({name:p.name,pid:p.pid,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path})))));")))
        if action=='inventory':
            print(json.dumps(ownership));return
        if action=='status':
            qa_script="""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const n of ['lhs_s1001','lhs_s1002'])out[n]={players:await c.db(n).collection('players').countDocuments({userId:/^qa_fish_map_/}),mails:await c.db(n).collection('mails').countDocuments({userId:/^qa_fish_map_/})};await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
            state={'result':'STATUS','time':datetime.now(timezone.utc).isoformat(),'pm2':pm2(s),'ready':ready(s),
                   'sourceHash':hashes(s,[TARGET])[TARGET],'baselineHash':baseline[TARGET],
                   'qaRemaining':json.loads(run(s,'node -',qa_script))}
            write('status.json',state);print(json.dumps(state));return
        for name in ['lhs-s1001','lhs-s1002']:
            own=next(p for p in ownership if p['name']==name)
            assert own['cwd']==APP and own['script'].startswith(APP+'/'),'PROCESS_OWNERSHIP_CHANGED'
        if action=='stage':
            assert hashes(s,list(baseline))==baseline,'SOURCE_DRIFT'
            stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            stage='/linhhoasu/_ai_workbench/temp/fishing_map_'+stamp
            run(s,f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
            f=s.open_sftp()
            try:
                f.put(str(ROOT/'app'/REL),stage+'/app/'+REL)
                for name in ['server.bin','main.js','main.fixed.js','fish.before.js']:
                    f.put(str(ROOT/name),stage+'/'+name)
                for name in ['test_fishing_map_fix_20260906.js','qa_fishing_map_live_20260906.js','test_fishing_auto_20260906.js','test_fishing_gear_fix_20260906.js','test_fishing_balance_20260906.js','test_huyenvu_daily_20260906.js']:
                    f.put(str(WB/'tools'/name),stage+'/tools/'+name)
                f.put(str(WB/'temp/fishing_auto_20260906/main.js'),stage+'/auto-original.js')
                f.put(str(WB/'temp/fishing_audit_20260906T041024Z/app/src/handlers/commerce-compat.js'),stage+'/commerce-baseline.js')
                f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
            finally:f.close()
            tests={}
            env=f'NODE_PATH={APP}/node_modules FISH_ACORN_PATH={stage}/tools/acorn.js AUTO_ORIGINAL_MAIN={stage}/auto-original.js AUTO_SKIP_COMMERCE_DIAGNOSTICS=1 DAILY_BASE_SOURCE={stage}/commerce-baseline.js'
            for name in ['map_fix','auto','gear_fix','balance','daily']:
                script='test_huyenvu_daily_20260906.js' if name=='daily' else 'test_fishing_'+name+'_20260906.js'
                tests[name]=json.loads(run(s,f'{env} node {stage}/tools/{script} {stage}',timeout=60))
                assert tests[name]['result']=='PASS',name+'_FAIL'
                print(json.dumps({'test':name,'result':'PASS','count':tests[name]['count']}),flush=True)
            run(s,'node --check '+stage+'/app/'+REL)
            run(s,f'ln -s {APP}/node_modules {stage}/app/node_modules')
            core=run(s,f'cd {stage}/app && NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={stage}/server.bin node scripts/test-core-gameplay-contract.js',timeout=60)
            assert hashes(s,list(baseline))==baseline,'DRIFT_DURING_STAGING'
            report={'result':'STAGED','stage':stage,'baseline':baseline,'ownership':ownership,'beforePm2':pm2(s),'ready':ready(s),
                    'tests':tests,'core':core,'candidateHash':digest(ROOT/'app'/REL),
                    'qaToolHash':digest(WB/'tools/qa_fishing_map_live_20260906.js')}
            write('stage.json',report)
            print(json.dumps({'result':'STAGED','stage':stage,'tests':{k:v['count']for k,v in tests.items()},'ready':report['ready']}));return
        staged=json.loads((ROOT/'stage.json').read_text(encoding='utf-8'));stage=staged['stage']
        expected={**staged['baseline'],TARGET:staged['candidateHash']}
        if action=='verify':
            current=hashes(s,list(expected));assert current==expected,'POSTDEPLOY_HASH_MISMATCH'
            before=json.loads((ROOT/'deploy.json').read_text(encoding='utf-8'))['afterPm2']
            after=pm2(s);assert after==before,'PROCESS_CHANGED_SINCE_DEPLOY'
            report={'result':'VERIFIED','hashCount':len(current),'changedFiles':[TARGET],'unchangedCount':len(current)-1,'pm2':after,'ready':ready(s),
                    'servedMainHash':run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum').split()[0]}
            assert report['ready']=={'8080':200,'8083':200}
            assert report['servedMainHash']==expected[GAME+'/js/main.min_a6195824.js']
            write('verify.json',report);print(json.dumps(report));return
        assert digest(ROOT/'app'/REL)==staged['candidateHash'],'CANDIDATE_CHANGED_RESTAGE'
        assert digest(WB/'tools/qa_fishing_map_live_20260906.js')==staged['qaToolHash'],'QA_CHANGED_RESTAGE'
        assert hashes(s,list(staged['baseline']))==staged['baseline'],'PREINSTALL_DRIFT'
        assert hashes(s,[stage+'/app/'+REL])[stage+'/app/'+REL]==staged['candidateHash'],'STAGED_FILE_DRIFT'
        assert hashes(s,[stage+'/tools/qa_fishing_map_live_20260906.js'])[stage+'/tools/qa_fishing_map_live_20260906.js']==staged['qaToolHash'],'STAGED_QA_DRIFT'
        before=pm2(s);assert ready(s)=={'8080':200,'8083':200}
        backup=stage.replace('/temp/','/backups/')
        run(s,f'install -d -m 700 {backup}; cp -a {TARGET} {backup}/fish.js.before')
        assert hashes(s,[backup+'/fish.js.before'])[backup+'/fish.js.before']==staged['baseline'][TARGET]
        report={'startedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'stage':stage,'beforePm2':before,
                'liveQa':{},'compensation':False,'clientChanged':False,'databaseMigration':False}
        installed=True;run(s,f'install -m 644 {stage}/app/{REL} {TARGET}')
        assert hashes(s,[TARGET])[TARGET]==staged['candidateHash']
        for name,port,serverId in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
            print(json.dumps({'step':'restart-canary','name':name}),flush=True)
            restarted.append(name);run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
            qa=json.loads(run(s,f'node {stage}/tools/qa_fishing_map_live_20260906.js {serverId}',timeout=60))
            assert qa['result']=='PASS' and qa['qaCleanupRemaining']==0,'MAP_CANARY_FAILED'
            report['liveQa'][str(serverId)]=qa;write('canary-progress.json',report)
            print(json.dumps({'step':'qa-pass','server':serverId}),flush=True)
        after=pm2(s);untouched=[p for p in before if p['name']not in restarted]
        assert all(next((q for q in after if q['name']==p['name']),None)==p for p in untouched),'UNRELATED_PROCESS_CHANGED'
        assert all(p['status']=='online'for p in after)
        assert hashes(s,list(expected))==expected,'FINAL_HASH_MISMATCH'
        report.update(result='DEPLOYED',afterPm2=after,ready=ready(s),expected=expected,restarted=restarted,hashCount=len(expected),
                      finishedAt=datetime.now(timezone.utc).isoformat())
        assert report['ready']=={'8080':200,'8083':200}
        write('deploy.json',report)
        print(json.dumps({'result':'DEPLOYED','backup':backup,'hashCount':len(expected),'restarted':restarted,'ready':report['ready']}))
    except Exception as error:
        report.update(result='FAIL',error=str(error))
        write('release-error.json',report)
        if installed:
            try:
                run(s,f'install -m 644 {report["backup"]}/fish.js.before {TARGET}')
                for name in restarted:
                    run(s,'pm2 restart '+name,timeout=60)
                    wait_ready(s,8083 if name=='lhs-s1002' else 8080)
                report['rollbackReady']=ready(s)
                report['rollbackHash']=hashes(s,[TARGET])[TARGET]
                assert report['rollbackHash']==staged['baseline'][TARGET]
            except Exception as rollback_error:
                report['rollbackError']=str(rollback_error)
        write('release-error.json',report);raise
    finally:s.close()

if __name__=='__main__':main()
