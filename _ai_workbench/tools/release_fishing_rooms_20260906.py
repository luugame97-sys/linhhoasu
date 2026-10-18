"""Four-seat selectable rooms and native UI. Exact guards, S2 canary, then S1."""
import json,re,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready,digest

WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_rooms_release_20260906'
APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game'
FILES=['src/services/FishingRoomService.js','src/handlers/fish.js','src/net/WSServer.js']
VERSION='20260906_fishing_rooms_v1'
def write(name,data):
    (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
    sys.stdout.reconfigure(encoding='utf-8');action=sys.argv[1] if len(sys.argv)>1 else 'stage'
    assert action in ['stage','deploy','verify']
    c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
    s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
    manifest=json.loads((ROOT/'manifest.json').read_text());baseline=manifest['expected'];baseline[APP+'/'+FILES[0]]=None
    installed=[];restarted=[];report={}
    try:
        owner=json.loads(run(s,'pm2 jlist | node -e '+shlex.quote("let x='';process.stdin.on('data',b=>x+=b).on('end',()=>console.log(JSON.stringify(JSON.parse(x).map(p=>({name:p.name,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path})))));")))
        for name in ['lhs-s1001','lhs-s1002']:
            row=next(p for p in owner if p['name']==name);assert row['cwd']==APP and row['script']==APP+'/src/app.js'
        if action=='stage':
            assert hashes(s,list(baseline))==baseline,'BASELINE_DRIFT'
            stage='/linhhoasu/_ai_workbench/temp/fishing_rooms_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            run(s,f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
            f=s.open_sftp()
            try:
                for rel in FILES:f.put(str(ROOT/'app'/rel),stage+'/app/'+rel)
                for name in ['server.bin','main.js','main.fixed.js','client-build.json']:f.put(str(ROOT/name),stage+'/'+name)
                for name in ['test_fishing_rooms_20260906.js','test_fishing_auto_20260906.js','test_fishing_gear_fix_20260906.js','test_fishing_balance_20260906.js','test_huyenvu_daily_20260906.js','qa_fishing_rooms_v2_20260906.js']:
                    f.put(str(WB/'tools'/name),stage+'/tools/'+name)
                f.put(str(WB/'temp/fishing_auto_20260906/main.js'),stage+'/auto-original.js')
                f.put(str(WB/'temp/fishing_audit_20260906T041024Z/app/src/handlers/commerce-compat.js'),stage+'/commerce-baseline.js')
                f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
                f.get(GAME+'/index.html',str(ROOT/'index.before.html'))
            finally:f.close()
            old=(ROOT/'index.before.html').read_text(encoding='utf-8')
            updated,count=re.subn(r'(js/main\.min_a6195824\.js)(?:\?[^\s\"\'<>]*)?',r'\1?v='+VERSION,old);assert count==1
            (ROOT/'index.fixed.html').write_text(updated,encoding='utf-8')
            baseline[GAME+'/index.html']=digest(ROOT/'index.before.html')
            env=f'NODE_PATH={APP}/node_modules FISH_ACORN_PATH={stage}/tools/acorn.js FISH_ROOM_REGISTRY=1 FISH_AUTO_FRAMED=1 AUTO_ORIGINAL_MAIN={stage}/auto-original.js AUTO_SKIP_COMMERCE_DIAGNOSTICS=1 DAILY_BASE_SOURCE={stage}/commerce-baseline.js'
            tests={}
            for name in ['rooms','auto','gear_fix','balance','daily']:
                script='test_huyenvu_daily_20260906.js' if name=='daily' else 'test_fishing_'+name+'_20260906.js'
                result=json.loads(run(s,f'{env} timeout 55s node {stage}/tools/{script} {stage}',timeout=60));assert result['result']=='PASS',name+'_FAIL'
                tests[name]=result;print(json.dumps({'test':name,'count':result['count'],'result':'PASS'}),flush=True)
            for rel in FILES:run(s,f'node --check {stage}/app/{rel}')
            run(s,f'node --check {stage}/main.fixed.js')
            run(s,f'ln -s {APP}/node_modules {stage}/app/node_modules')
            core=run(s,f'cd {stage}/app && NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={stage}/server.bin node scripts/test-core-gameplay-contract.js',timeout=60)
            assert json.loads(core)['result']=='ok';assert hashes(s,list(baseline))==baseline
            report={'result':'STAGED','stage':stage,'baseline':baseline,'ownership':owner,'tests':tests,'core':json.loads(core),'beforePm2':pm2(s),'ready':ready(s),
                    'serverHashes':{rel:digest(ROOT/'app'/rel)for rel in FILES},'mainHash':digest(ROOT/'main.fixed.js'),'indexHash':digest(ROOT/'index.fixed.html'),
                    'qaHash':digest(WB/'tools/qa_fishing_rooms_v2_20260906.js')}
            write('stage.json',report);print(json.dumps({'result':'STAGED','stage':stage,'tests':sum(v['count']for v in tests.values())}));return
        stageInfo=json.loads((ROOT/'stage.json').read_text(encoding='utf-8'));baseline=stageInfo['baseline'];stage=stageInfo['stage']
        expected={**baseline,**{APP+'/'+rel:sha for rel,sha in stageInfo['serverHashes'].items()},GAME+'/js/main.min_a6195824.js':stageInfo['mainHash'],GAME+'/index.html':stageInfo['indexHash']}
        if action=='verify':
            if (ROOT/'ui-update.json').exists():
                ui=json.loads((ROOT/'ui-update.json').read_text(encoding='utf-8'));expected=ui['expected'];stageInfo={**stageInfo,'mainHash':ui['mainHash'],'indexHash':ui['indexHash']}
            if (ROOT/'final-deploy.json').exists():expected=json.loads((ROOT/'final-deploy.json').read_text(encoding='utf-8'))['expected']
            assert hashes(s,list(expected))==expected,'POSTDEPLOY_DRIFT';after=pm2(s)
            deployed=json.loads((ROOT/('final-deploy.json' if (ROOT/'final-deploy.json').exists() else 'deploy.json')).read_text(encoding='utf-8'));assert after==deployed['afterPm2']
            served={k:run(s,f'curl -fsS --max-time 15 http://127.0.0.1:81/{p} | sha256sum').split()[0]for k,p in [('main','js/main.min_a6195824.js'),('index','')]}
            assert served=={'main':stageInfo['mainHash'],'index':stageInfo['indexHash']}
            qa="""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const r={};for(const n of ['lhs_s1001','lhs_s1002'])r[n]={players:await c.db(n).collection('players').countDocuments({userId:/^qafroomv2_/}),mails:await c.db(n).collection('mails').countDocuments({userId:/^qafroomv2_/})};await c.close();console.log(JSON.stringify(r));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
            remaining=json.loads(run(s,'node -',qa));assert all(v=={'players':0,'mails':0}for v in remaining.values())
            report={'result':'VERIFIED','time':datetime.now(timezone.utc).isoformat(),'hashCount':len(expected),'changed':5,'unchanged':len(expected)-5,'ready':ready(s),'pm2':after,'served':served,'qaRemaining':remaining}
            assert report['ready']=={'8080':200,'8083':200};write('verify.json',report);print(json.dumps(report));return
        assert {rel:digest(ROOT/'app'/rel)for rel in FILES}==stageInfo['serverHashes'] and digest(ROOT/'main.fixed.js')==stageInfo['mainHash'] and digest(ROOT/'index.fixed.html')==stageInfo['indexHash']
        assert digest(WB/'tools/qa_fishing_rooms_v2_20260906.js')==stageInfo['qaHash']
        assert hashes(s,[stage+'/tools/qa_fishing_rooms_v2_20260906.js'])[stage+'/tools/qa_fishing_rooms_v2_20260906.js']==stageInfo['qaHash']
        assert hashes(s,list(baseline))==baseline,'PREINSTALL_DRIFT';before=pm2(s);assert ready(s)=={'8080':200,'8083':200}
        backup=stage.replace('/temp/','/backups/');run(s,f'install -d -m 700 {backup}')
        report={'result':'INSTALLING','startedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'stage':stage,'beforePm2':before,'liveQa':{},'fxChanged':False,'compensation':False}
        targets=[(ROOT/'app'/rel,APP+'/'+rel)for rel in FILES]+[(ROOT/'main.fixed.js',GAME+'/js/main.min_a6195824.js'),(ROOT/'index.fixed.html',GAME+'/index.html')]
        f=s.open_sftp()
        try:
            for i,(local,target)in enumerate(targets):
                if baseline[target]:run(s,f'cp -a {target} {backup}/{i}.before')
                f.put(str(local),stage+f'/install-{i}')
                if baseline[target]:assert hashes(s,[backup+f'/{i}.before'])[backup+f'/{i}.before']==baseline[target]
                assert hashes(s,[stage+f'/install-{i}'])[stage+f'/install-{i}']==digest(local)
        finally:f.close()
        for i,(_,target)in enumerate(targets[:len(FILES)]):installed.append((i,target));run(s,f'install -m 644 {stage}/install-{i} {target}')
        serverExpected={**baseline,**{APP+'/'+rel:sha for rel,sha in stageInfo['serverHashes'].items()}}
        assert hashes(s,list(serverExpected))==serverExpected
        for name,port,serverId in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
            restarted.append(name);print(json.dumps({'step':'restart-canary','name':name}),flush=True)
            run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
            qa=json.loads(run(s,f'node {stage}/tools/qa_fishing_rooms_v2_20260906.js {serverId}',timeout=60))
            assert qa['result']=='PASS' and qa['cleanupRemaining']==0,'ROOM_CANARY_FAILED'
            report['liveQa'][str(serverId)]=qa;write('canary-progress.json',report);print(json.dumps({'step':'qa-pass','server':serverId}),flush=True)
        # Publish the compatible UI only after both server canaries have passed.
        for i in range(len(FILES),len(targets)):
            target=targets[i][1];installed.append((i,target))
            run(s,f'install -m 644 {stage}/install-{i} {target}.rooms-next; mv -f {target}.rooms-next {target}')
        after=pm2(s)
        assert all(next((r for r in after if r['name']==p['name']),None)==p for p in before if p['name']not in restarted),'UNRELATED_PROCESS_CHANGED'
        assert all(p['status']=='online'for p in after) and hashes(s,list(expected))==expected
        report.update(result='DEPLOYED',afterPm2=after,expected=expected,ready=ready(s),restarted=restarted,finishedAt=datetime.now(timezone.utc).isoformat())
        assert report['ready']=={'8080':200,'8083':200};write('deploy.json',report);print(json.dumps({'result':'DEPLOYED','backup':backup,'ready':report['ready']}))
    except Exception as error:
        report.update(result='FAIL',error=str(error));write('release-error.json',report)
        if installed:
            try:
                for i,target in reversed(installed):
                    if baseline[target]:run(s,f'install -m 644 {report["backup"]}/{i}.before {target}')
                    else:run(s,f'mv {target} {report["backup"]}/{i}.rolled-back-new')
                for name in restarted:run(s,'pm2 restart '+name,timeout=60);wait_ready(s,8083 if name=='lhs-s1002'else 8080)
                report['rollbackReady']=ready(s);report['rollbackHashes']=hashes(s,list(baseline));assert report['rollbackHashes']==baseline
            except Exception as rollback_error:report['rollbackError']=str(rollback_error)
        write('release-error.json',report);raise
    finally:s.close()
if __name__=='__main__':main()
