"""Promote verified seven-file fix; repair proven missing ownership once."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko
from stage_fashion_fix_20260905 import run,pm2,FILES,WB,REL,APP

def main():
    sys.stdout.reconfigure(encoding='utf-8');stageInfo=json.loads((REL/'stage.json').read_text(encoding='utf-8'))
    assert stageInfo['passed'] and stageInfo['tests']['test_fashion_writer_20260905.js']['cases']>=18
    assert json.loads((REL/'verification.json').read_text())['passed']
    stage=stageInfo['stage'];stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup='/linhhoasu/_ai_workbench/backups/fashion_fix_'+stamp
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    result={'stage':stage,'backup':backup,'sourceInstalled':False,'repairCommitted':False,'startedAt':datetime.now(timezone.utc).isoformat()};stopped=False;installed=False
    def save(): (REL/('deploy_'+stamp+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    def ready(port):run(s,f'for n in $(seq 1 45); do test "$(curl -s --max-time 1 -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{port}/ready)" = 200 && exit 0; sleep 1; done; exit 1',timeout=55)
    try:
        result['before']=pm2(s)
        for rel in FILES:
            actual=run(s,f'if test -f {APP}/{rel}; then sha256sum {APP}/{rel}; else echo MISSING; fi').split()[0]
            assert actual==(stageInfo['beforeHashes'][rel]or'MISSING'),'production drift '+rel
            assert run(s,f'sha256sum {stage}/app/{rel}').split()[0]==stageInfo['candidateHashes'][rel]
            assert hashlib.sha256((REL/'app'/rel).read_bytes()).hexdigest()==stageInfo['candidateHashes'][rel]
        run(s,f'install -d -m 700 {backup}/source {backup}/players')
        for rel in FILES:
            if stageInfo['beforeHashes'][rel]:run(s,f'install -d -m 700 {backup}/source/{str(Path(rel).parent).replace(chr(92),chr(47))} && cp -a {APP}/{rel} {backup}/source/{rel}')
        result['backupReady']=True;save()
        run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=45);stopped=True
        state=pm2(s)
        assert all(p['status']=='stopped' and not p['pid'] for p in state if p['name']in['lhs-s1001','lhs-s1002'])
        # No other process is restarted. The stopped game processes cannot
        # write stale snapshots over the repair while it is committed.
        for rel in FILES:run(s,f'cp -a {stage}/app/{rel} {APP}/{rel}')
        installed=True;result['sourceInstalled']=True;save()
        for rel in FILES:run(s,f'node --check {APP}/{rel}')
        env=f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH={stage}/server.bin CONFIG_BIN_PATH={stage}/server.bin'
        preview=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'))
        result['stoppedPreview']=preview
        # Require the same eligible roles/IDs as the reviewed staging preview.
        def signatures(p):return {db:sorted((r['subject'],tuple((x['id'],x['bagBefore']) for x in r['items'])) for r in d['subjects']) for db,d in p['dbs'].items()}
        assert signatures(preview)==signatures(stageInfo['repairPreview']),'repair preview changed; no DB commit'
        result['repairStarted']=True;save()
        result['repair']=json.loads(run(s,f'{env} FASHION_REPAIR_MAINTENANCE=stopped-s1001-s1002 FASHION_REPAIR_BACKUP={backup}/players node {stage}/tools/repair_fashion_ownership_20260905.js --commit'))
        result['repairCommitted']=True;save()
        result['secondDryRun']=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'))
        assert all(d['eligiblePlayers']==0 for d in result['secondDryRun']['dbs'].values())
        run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=45);stopped=False;ready(8080);ready(8083)
        result['after']=pm2(s)
        for before in result['before']:
            if before['name']not in['lhs-s1001','lhs-s1002']:
                after=next(p for p in result['after']if p['name']==before['name']);assert after['pid']==before['pid'] and after['restarts']==before['restarts']
        result['hashes']={rel:run(s,f'sha256sum {APP}/{rel}').split()[0] for rel in FILES};assert result['hashes']==stageInfo['candidateHashes']
        result['postRestartDryRun']=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'))
        assert all(d['eligiblePlayers']==0 for d in result['postRestartDryRun']['dbs'].values())
        result['ready']={'s1001':200,'s1002':200};result['passed']=True
    except Exception as e:
        result['error']=str(e)
        if installed and not result.get('repairStarted'):
            for rel in FILES:
                if stageInfo['beforeHashes'][rel]:run(s,f'cp -a {backup}/source/{rel} {APP}/{rel}')
                else:run(s,f'mv {APP}/{rel} {backup}/source/unused-new-service.js')
            result['sourceRolledBack']=True
        if stopped:
            run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=45);stopped=False;result['restartedAfterError']=True
        raise
    finally:
        result['finishedAt']=datetime.now(timezone.utc).isoformat();save();s.close()
    print(json.dumps({'passed':result['passed'],'backup':backup,'evidence':str(REL/('deploy_'+stamp+'.json')),'ready':result['ready'],'repair':{db:{k:d[k]for k in['eligiblePlayers','activations','updated']}for db,d in result['repair']['dbs'].items()},'unrelatedProcessesUnchanged':True},ensure_ascii=False))
if __name__=='__main__':main()
