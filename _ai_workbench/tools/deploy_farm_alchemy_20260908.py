"""Approved limited rollout. Exact hash/CAS targets, S2 before S1, recoverable rollback.

No player data writes or migrations. QA runs real installed code with memory DB.
"""
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import connect, WB
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready

APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
OUT = WB / 'temp/farm_alchemy_fix_20260908'
REPORT = OUT / 'release.json'
GAME_NAMES = ['lhs-s1002', 'lhs-s1001']

def dump(value):
    REPORT.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def target_map(manifest):
    stage = manifest['stage']
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/temp/farm_alchemy_\d{8}_\d{6}', stage), 'UNSAFE_STAGE'
    result = []
    # Dependencies first, consumers second, entrypoint last.
    names = sorted(manifest['localHashes'], key=lambda p: (not p.startswith('services/'), p == 'net/WSServer.js', p))
    for name in names:
        assert re.fullmatch(r'(services|handlers|net)/[A-Za-z0-9_-]+\.js', name), 'UNSAFE_RELATIVE_FILE'
        result.append((stage + '/app/src/' + name, APP + '/src/' + name))
    result += [(stage + '/client.js', GAME + '/js/lhs-farm-alchemy-v2.js'), (stage + '/index.html', GAME + '/index.html')]
    assert set(t for _, t in result) == set(manifest['before']), 'TARGET_SET_CHANGED'
    assert set(s for s, _ in result) == set(manifest['candidateHashes']), 'SOURCE_SET_CHANGED'
    return result

def preflight(s, m, targets):
    assert m['status'] == 'STAGED_NOT_DEPLOYED'
    assert m['test']['result'] == 'PASS' and m['test']['count'] >= 48 and m['test']['productionWrites'] == 0
    assert hashes(s, list(m['before'])) == m['before'], 'LIVE_BASELINE_DRIFT'
    assert hashes(s, list(m['candidateHashes'])) == m['candidateHashes'], 'STAGED_ARTIFACT_DRIFT'
    assert {p: sha(WB.parent/'linhhoasu/lhs/newServer/src'/p) for p in m['localHashes']} == m['localHashes'], 'LOCAL_DRIFT'
    assert sha(WB.parent/'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js') == m['candidateHashes'][m['stage']+'/client.js']
    assert sha(WB.parent/'linhhoasu/webgame/game/index.html') == m['candidateHashes'][m['stage']+'/index.html']
    assert ready(s) == {'8080': 200, '8083': 200}, 'NOT_HEALTHY_BEFORE_DEPLOY'
    processes = pm2(s)
    assert all(len([p for p in processes if p['name'] == name and p['status'] == 'online']) == 1 for name in GAME_NAMES)
    # Verify exact disk types. Renaming a symlinked source could change targets.
    js = "const fs=require('fs');const paths=" + json.dumps([t for _, t in targets]) + ";for(const p of paths){if(fs.existsSync(p)&&!fs.lstatSync(p).isFile())throw Error('TARGET_NOT_REGULAR_FILE:'+p);}console.log('OK');"
    assert run(s, 'node -', js).strip() == 'OK'
    return processes

def fixture(s, m, installed=False):
    source = APP if installed else m['stage'] + '/app'
    client = GAME+'/js/lhs-farm-alchemy-v2.js' if installed else m['stage']+'/client.js'
    env = ('CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin '
           f'FEATURE_APP={source} FEATURE_RUNTIME={APP} FEATURE_ACORN={m["stage"]}/tools/acorn.js '
           f'FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_PATCH={client}')
    output = run(s, env + ' node ' + m['stage']+'/app/scripts/test-farm-alchemy-fix.js')
    result = json.loads(output)
    assert result['result'] == 'PASS' and result['count'] >= 48 and result['networkAttempts'] == 0, 'FIXTURE_FAILURE'
    core = json.loads(run(s, f'cd {source} && CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node scripts/test-core-gameplay-contract.js'))
    assert core['result'] == 'ok' and core['tables'] == 714, 'CORE_FAILURE'
    return {'feature': result, 'core': core}

def log_positions(s):
    paths = [f'/root/.pm2/logs/{name}-{kind}.log' for name in GAME_NAMES for kind in ['error', 'out']]
    js = "const fs=require('fs');console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,fs.existsSync(p)?fs.statSync(p).size:0]))));"
    return json.loads(run(s, 'node -', js))

def check_new_logs(s, positions):
    js = r"""const fs=require('fs');const pos=POSITIONS;const result=[];for(const[p,start]of Object.entries(pos)){if(!fs.existsSync(p))continue;const len=fs.statSync(p).size;const offset=len<start?0:start;const size=Math.min(len-offset,262144);if(!size)continue;const f=fs.openSync(p,'r'),b=Buffer.alloc(size);fs.readSync(f,b,0,size,len-size);fs.closeSync(f);const lines=b.toString('utf8').split('\n');const failures=lines.filter(x=>/uncaught exception|unhandled rejection|startup failed|TypeError|ReferenceError|SyntaxError|Cannot find module|FARM_WRITER_NOT_LOCKED|FARM_TARGET_NOT_LOCKED|PLAYER_LOCK_UPGRADE_DENIED/.test(x));result.push({file:p,newBytes:len-offset,failures:failures.map(x=>x.replace(/user=\S+/g,'user=[redacted]').slice(0,400)).slice(-10),mongooseReservedWarning:lines.some(x=>/reserved schema/.test(x))});}console.log(JSON.stringify(result));""".replace('POSITIONS', json.dumps(positions))
    result = json.loads(run(s, 'node -', js))
    assert not any(r['failures'] for r in result), 'POST_RESTART_ERROR_MARKER: '+json.dumps(result)
    return result

def install_one(s, source, target, expect_current, expected_new):
    js = """const fs=require('fs'),c=require('crypto');const a=ARGS;const hash=p=>fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;if(hash(a.target)!==a.before||hash(a.source)!==a.after)throw Error('INSTALL_CAS_FAILURE');const tmp=a.target+'.farm-release-next';if(fs.existsSync(tmp))throw Error('TEMP_ALREADY_EXISTS');fs.copyFileSync(a.source,tmp);fs.chmodSync(tmp,0o644);fs.renameSync(tmp,a.target);if(hash(a.target)!==a.after)throw Error('POST_INSTALL_HASH_FAILURE');console.log('OK');""".replace('ARGS',json.dumps({'source':source,'target':target,'before':expect_current,'after':expected_new}))
    assert run(s, 'node -', js).strip() == 'OK'

def rollback(s, report):
    backup = report['backup']; assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/farm_alchemy_release_\d{8}_\d{6}', backup)
    for entry in reversed(report['installed']):
        target = entry['target']; current = hashes(s, [target])[target]
        if current == entry['before']: continue
        assert current == entry['after'], 'ROLLBACK_TARGET_CHANGED:'+target
        if entry['before']:
            install_one(s, entry['backup'], target, entry['after'], entry['before'])
        else:
            # Recoverable move; retain new files as rollback evidence.
            run(s, 'mv -- '+shlex.quote(target)+' '+shlex.quote(backup+'/'+str(entry['index'])+'.rolled-back-new'))
    for name in report['restarted']:
        run(s, 'pm2 restart '+name)
        wait_ready(s, 8083 if name=='lhs-s1002' else 8080)
    assert hashes(s,list(report['beforeHashes'])) == report['beforeHashes'], 'ROLLBACK_HASH_MISMATCH'
    report.update(status='ROLLED_BACK', rollbackReady=ready(s), rollbackAt=datetime.now(timezone.utc).isoformat())
    dump(report)

def main():
    action = sys.argv[1] if len(sys.argv)>1 else 'preflight'
    m = json.loads((OUT/'stage.json').read_text(encoding='utf-8'));targets=target_map(m)
    s = connect()
    report = {'status': 'PREFLIGHT', 'installed': [], 'restarted': []}
    try:
        if action=='rollback':
            report=json.loads(REPORT.read_text(encoding='utf-8'));rollback(s,report);print('ROLLED_BACK');return
        assert action in ['preflight','deploy']
        if REPORT.exists():
            previous=json.loads(REPORT.read_text(encoding='utf-8'))
            assert previous['status'] not in ['DEPLOYED','INSTALLING','FAILED_ROLLBACK_REQUIRED'], 'RELEASE_ALREADY_RUN_CHECK_REPORT'
        before=preflight(s,m,targets)
        tested=fixture(s,m)
        if action=='preflight':
            print(json.dumps({'status':'PREFLIGHT_PASS','tests':tested['feature']['count'],'files':len(targets),'ready':ready(s)}));return
        stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup='/linhhoasu/_ai_workbench/backups/farm_alchemy_release_'+stamp
        run(s,'install -d -m 700 '+backup)
        expected={target:m['candidateHashes'][source]for source,target in targets}
        positions=log_positions(s)
        report.update(status='INSTALLING',at=datetime.now(timezone.utc).isoformat(),backup=backup,stage=m['stage'],beforeHashes=m['before'],expectedHashes=expected,beforePm2=before,preflight=tested,
            approvedScope='Release tested fixes; restrict unresolved mystery weights, provider ads, assistance and neighbor fertilizer. No data repair.',canary={})
        # Verify backups completely before the first production write.
        for i,(_,target) in enumerate(targets):
            if m['before'][target]:
                run(s,'cp -a -- '+shlex.quote(target)+' '+backup+'/'+str(i)+'.before')
                assert hashes(s,[backup+'/'+str(i)+'.before'])[backup+'/'+str(i)+'.before']==m['before'][target]
        dump(report)
        with s.open_sftp() as f:
            with f.open(backup+'/release-manifest.json','w')as stream:stream.write(json.dumps(report,indent=2))
        assert hashes(s,list(m['before']))==m['before'],'PREINSTALL_DRIFT'
        for i,(source,target)in enumerate(targets):
            entry={'index':i,'target':target,'before':m['before'][target],'after':expected[target],'backup':backup+'/'+str(i)+'.before'}
            report['installed'].append(entry);dump(report)
            install_one(s,source,target,entry['before'],entry['after'])
        assert hashes(s,list(expected))==expected
        for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
            report['restarted'].append(name);dump(report)
            print(json.dumps({'step':'restart','server':name}),flush=True)
            run(s,'pm2 restart '+name);wait_ready(s,port)
            check=fixture(s,m,True)
            logs=check_new_logs(s,positions)
            report['canary'][name]={'ready':200,'installedCodeFixture':check,'newLogs':logs};dump(report)
            print(json.dumps({'step':'canary-pass','server':name,'tests':check['feature']['count']}),flush=True)
        after=pm2(s)
        assert [p for p in before if p['name']not in GAME_NAMES]==[p for p in after if p['name']not in GAME_NAMES], 'UNRELATED_PROCESS_CHANGED'
        for name in GAME_NAMES:
            a=next(p for p in before if p['name']==name);b=next(p for p in after if p['name']==name)
            assert b['status']=='online' and b['pid']!=a['pid'] and b['restarts']==a['restarts']+1, 'UNEXPECTED_RESTART_COUNT'
        served={}
        for host in ['127.0.0.1','103.116.105.154']:
            for url,target in [('/',GAME+'/index.html'),('/js/lhs-farm-alchemy-v2.js',GAME+'/js/lhs-farm-alchemy-v2.js')]:
                digest=run(s,'curl -fsS --max-time 15 '+shlex.quote('http://'+host+':81'+url)+' | sha256sum').split()[0]
                assert digest==expected[target],'HTTP_ARTIFACT_MISMATCH'
                served[host+url]=digest
        assert hashes(s,list(expected))==expected
        assert ready(s)=={'8080':200,'8083':200}
        report.update(status='DEPLOYED',completedAt=datetime.now(timezone.utc).isoformat(),afterPm2=after,ready=ready(s),servedHashes=served,newLogs=check_new_logs(s,positions),playerDataRepair=False)
        dump(report)
        print(json.dumps({'status':report['status'],'backup':backup,'ready':report['ready'],'testsPerCanary':48,'unchangedOtherProcesses':len(after)-2}))
    except Exception as error:
        report['error']=str(error)
        if report['installed']:
            try:rollback(s,report)
            except Exception as rollbackError:
                report.update(status='FAILED_ROLLBACK_REQUIRED',rollbackError=str(rollbackError));dump(report)
        else:
            report['status']='PREFLIGHT_FAILED';dump(report)
        raise
    finally:s.close()

if __name__=='__main__':main()
