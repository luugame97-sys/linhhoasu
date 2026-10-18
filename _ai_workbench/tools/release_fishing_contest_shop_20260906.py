"""Guarded free-gift and paid-limit fix, exact targets, S2 before S1."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready, digest

WB = Path(__file__).resolve().parents[1]
ROOT = WB / 'temp/fishing_contest_shop_20260906'
APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
FILES = ['src/services/FishingEventShopService.js','src/services/FishingEventSchedule.js','src/handlers/item.js','src/services/RechargeRewardResolver.js','src/handlers/compat.js','src/handlers/recharge.js']
TESTS = ['test_fishing_contest_free_20260906.js','test_fishing_contest_paid_20260906.js','test_fishing_gameplay_events_20260906.js']


def write(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    action = sys.argv[1]
    assert action in ['stage','deploy','verify','accept-verified-canary-rollback']
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    baseline = manifest['expected']
    creds = (WB / 'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(), username='root', password=creds[2], look_for_keys=False, allow_agent=False, timeout=20)
    installed = []
    restarted = []
    report = {}
    try:
        if action == 'accept-verified-canary-rollback':
            failure=json.loads((ROOT/'release-error.json').read_text())
            assert failure['rollbackReady']=={'8080':200,'8083':200}
            assert '1010 !== 10' in failure['error']
            assert hashes(ssh,list(baseline))==baseline
            assert hashes(ssh,[APP+'/'+FILES[0]])[APP+'/'+FILES[0]] is None
            current=pm2(ssh)
            for old in manifest['pm2']:
                actual=next(p for p in current if p['name']==old['name'])
                if old['name']=='lhs-s1002':assert actual['status']=='online' and actual['restarts']==old['restarts']+2
                else:assert actual==old
            backup=WB/'backups/fishing_contest_shop_20260906'
            for name in ['manifest.json','release-error.json','stage.json']:
                dest=backup/('canary1-'+name)
                assert not dest.exists()
                dest.write_bytes((ROOT/name).read_bytes())
            manifest['pm2']=current
            manifest['verifiedCanaryRollback']=datetime.now(timezone.utc).isoformat()
            write('manifest.json',manifest)
            print(json.dumps({'result':'ROLLBACK_VERIFIED','ready':ready(ssh),'pm2':current}))
            return
        if action == 'verify':
            deploy = json.loads((ROOT / 'deploy.json').read_text())
            assert hashes(ssh,list(deploy['expected'])) == deploy['expected']
            assert pm2(ssh) == deploy['afterPm2']
            stats = json.loads(run(ssh,'node -',"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const o={};for(const n of ['lhs_s1001','lhs_s1002']){const d=c.db(n);o[n]={qa:await d.collection('players').countDocuments({userId:/^qafshop_/}),mail:await d.collection('mails').countDocuments({userId:/^qafshop_/}),bottles:await d.collection('fishingbottles').countDocuments({owner:/^qafshop_/})};}await c.close();console.log(JSON.stringify(o));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""))
            assert all(v['qa']==v['mail']==v['bottles']==0 for v in stats.values())
            served={k:run(ssh,f'curl -fsS --max-time 15 http://127.0.0.1:81/{p} | sha256sum').split()[0] for k,p in [('main','js/main.min_a6195824.js'),('index','')]}
            assert served['main']==deploy['expected'][GAME+'/js/main.min_a6195824.js'] and served['index']==deploy['expected'][GAME+'/index.html']
            result={'result':'VERIFIED','time':datetime.now(timezone.utc).isoformat(),'hashCount':len(deploy['expected']),'pm2':pm2(ssh),'ready':ready(ssh),'served':served,'stats':stats}
            assert result['ready']=={'8080':200,'8083':200}
            write('verify.json',result)
            print(json.dumps(result))
            return
        assert hashes(ssh,list(baseline)) == baseline, 'SOURCE_DRIFT'
        assert pm2(ssh) == manifest['pm2'], 'PROCESS_DRIFT'
        assert ready(ssh) == {'8080':200,'8083':200}
        if action == 'stage':
            stage='/linhhoasu/_ai_workbench/temp/fishing_shop_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            run(ssh,f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
            sftp=ssh.open_sftp()
            try:
                for rel in FILES:sftp.put(str(ROOT/'app'/rel),stage+'/app/'+rel)
                for name in ['server.bin','main.js','main.fixed.js','index.fixed.html','client-build.json']:sftp.put(str(ROOT/name),stage+'/'+name)
                for name in [*TESTS,'qa_fishing_contest_shop_live_20260906.js']:sftp.put(str(WB/'tools'/name),stage+'/tools/'+name)
            finally:sftp.close()
            for rel in FILES:run(ssh,'node --check '+stage+'/app/'+rel)
            run(ssh,'node --check '+stage+'/main.fixed.js')
            env=f'NODE_PATH={APP}/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={stage}/server.bin'
            tests={}
            for name in TESTS:
                tests[name]=json.loads(run(ssh,f'{env} timeout 55s node {stage}/tools/{name} {stage}',timeout=60))
                assert tests[name]['result']=='PASS',name
                print(json.dumps({'test':name,'count':tests[name]['count'],'result':'PASS'}),flush=True)
            core=json.loads(run(ssh,f'cd {stage}/app && {env} timeout 55s node scripts/test-core-gameplay-contract.js',timeout=60))
            assert core['result']=='ok'
            expected={**baseline,**{APP+'/'+rel:digest(ROOT/'app'/rel) for rel in FILES},GAME+'/js/main.min_a6195824.js':digest(ROOT/'main.fixed.js'),GAME+'/index.html':digest(ROOT/'index.fixed.html')}
            assert hashes(ssh,list(baseline))==baseline
            assert pm2(ssh)==manifest['pm2']
            out={'result':'STAGED','stage':stage,'files':FILES,'expected':expected,'tests':tests,'core':core,'productionWrites':0,'qaHash':digest(WB/'tools/qa_fishing_contest_shop_live_20260906.js')}
            write('stage.json',out)
            print(json.dumps({'result':'STAGED','stage':stage,'checks':sum(v['count'] for v in tests.values()),'core':core['result']}))
            return
        staged=json.loads((ROOT/'stage.json').read_text())
        assert staged['result']=='STAGED'
        stage=staged['stage'];expected=staged['expected'];backup=stage.replace('/temp/','/backups/')
        assert digest(WB/'tools/qa_fishing_contest_shop_live_20260906.js')==staged['qaHash']
        targets=[(ROOT/'app'/rel,APP+'/'+rel) for rel in FILES]+[(ROOT/'main.fixed.js',GAME+'/js/main.min_a6195824.js'),(ROOT/'index.fixed.html',GAME+'/index.html')]
        run(ssh,f'install -d -m 700 {backup}')
        report={'result':'INSTALLING','backup':backup,'startedAt':datetime.now(timezone.utc).isoformat(),'beforePm2':pm2(ssh),'liveQa':{}}
        sftp=ssh.open_sftp()
        try:
            for i,(local,remote) in enumerate(targets):
                assert digest(local)==expected[remote]
                if baseline.get(remote):run(ssh,f'cp -a {remote} {backup}/{i}.before')
                sftp.put(str(local),stage+f'/install-{i}')
                assert hashes(ssh,[stage+f'/install-{i}'])[stage+f'/install-{i}']==expected[remote]
        finally:sftp.close()
        for i,(_,remote) in enumerate(targets[:-2]):
            installed.append((i,remote));run(ssh,f'install -m 644 {stage}/install-{i} {remote}.shop-next; mv -f {remote}.shop-next {remote}')
        for name,port,sid in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
            restarted.append(name);print(json.dumps({'step':'restart','name':name}),flush=True)
            run(ssh,'pm2 restart '+name,timeout=60);wait_ready(ssh,port)
            qa=json.loads(run(ssh,f'node {stage}/tools/qa_fishing_contest_shop_live_20260906.js {sid}',timeout=60));assert qa['result']=='PASS'
            report['liveQa'][str(sid)]=qa;write('deploy-progress.json',report);print(json.dumps({'step':'qa-pass','server':sid}),flush=True)
        for i in range(len(targets)-2,len(targets)):
            remote=targets[i][1];installed.append((i,remote));run(ssh,f'install -m 644 {stage}/install-{i} {remote}.shop-next; mv -f {remote}.shop-next {remote}')
        after=pm2(ssh)
        assert all(next(q for q in after if q['name']==p['name'])==p for p in report['beforePm2'] if p['name'] not in restarted)
        assert hashes(ssh,list(expected))==expected
        report.update(result='DEPLOYED',finishedAt=datetime.now(timezone.utc).isoformat(),afterPm2=after,expected=expected,ready=ready(ssh))
        write('deploy.json',report);print(json.dumps({'result':'DEPLOYED','backup':backup,'ready':report['ready']}))
    except Exception as error:
        report.update(result='FAIL',error=str(error))
        if installed:
            for i,remote in reversed(installed):
                if baseline.get(remote):run(ssh,f'install -m 644 {report["backup"]}/{i}.before {remote}')
                else:run(ssh,f'mv {remote} {report["backup"]}/{i}.rolled-back-new')
            for name in restarted:run(ssh,'pm2 restart '+name,timeout=60);wait_ready(ssh,8083 if name=='lhs-s1002' else 8080)
            report['rollbackReady']=ready(ssh)
        write('release-error.json',report)
        raise
    finally:ssh.close()


if __name__=='__main__':main()
