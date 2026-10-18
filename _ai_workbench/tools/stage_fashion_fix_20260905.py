"""Stage only; inventory production and run memory tests plus repair preview."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko

WB=Path(__file__).resolve().parents[1];REL=WB/'temp/fashion_fix_20260905';APP='/linhhoasu/lhs/newServer'
BASE=WB/'temp/fashion_channels_20260905T140803Z'
FILES=['src/services/PlayerMutationService.js','src/services/PlayerService.js','src/net/WSServer.js','src/handlers/account.js','src/services/RewardGrantService.js','src/handlers/item.js','src/handlers/recharge.js']
def run(s,cmd,timeout=60):
    _,out,err=s.exec_command(cmd,timeout=timeout);o=out.read().decode('utf-8','replace');e=err.read().decode('utf-8','replace');code=out.channel.recv_exit_status()
    if code:raise RuntimeError(('Remote exit '+str(code)+' '+e+o)[-6000:])
    return o
def pm2(s):
    script="let x='';process.stdin.on('data',d=>x+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(x).filter(p=>p.name.startsWith('lhs')).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,mode:p.pm2_env.exec_mode,instances:p.pm2_env.instances,cwd:p.pm2_env.pm_cwd,restarts:p.pm2_env.restart_time,serverId:p.pm2_env.SERVER_ID,mongoDb:p.pm2_env.MONGO_DB||p.pm2_env.MONGODB_DATABASE||'',multiLogin:p.pm2_env.WS_ALLOW_MULTI_LOGIN||''})))));"
    return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(script)))
def main():
    sys.stdout.reconfigure(encoding='utf-8');creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/fashion_fix_'+stamp
    manifest=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'));result={'stage':stage,'productionInstalled':False,'files':FILES,'beforeHashes':{},'candidateHashes':{},'tests':{}}
    try:
        result['inventory']=pm2(s)
        for name in ['lhs-s1001','lhs-s1002']:
            row=next(p for p in result['inventory'] if p['name']==name)
            assert row['status']=='online' and row['cwd']==APP and row['mode']=='fork_mode','runtime scope changed'
        for rel in FILES:
            expected=manifest['files'].get('app/'+rel,{}).get('sha256');remote=run(s,f'if test -f {APP}/{rel}; then sha256sum {APP}/{rel}; else echo MISSING; fi').split()[0]
            assert remote==(expected or 'MISSING'),'source drift '+rel
            result['beforeHashes'][rel]=expected;result['candidateHashes'][rel]=hashlib.sha256((REL/'app'/rel).read_bytes()).hexdigest()
        run(s,f'install -d -m 700 {stage}/app {stage}/tools && cp -a {APP}/src {stage}/app/ && ln -s {APP}/node_modules {stage}/app/node_modules')
        sf=s.open_sftp()
        try:
            for rel in FILES+['src/services/FashionInventoryRepairService.js']:sf.put(str(REL/'app'/rel),stage+'/app/'+rel)
            for name in ['server.bin','client.bin','lang.bin','web_inventory.json']:sf.put(str(REL/name),stage+'/'+name)
            for name in ['test_fashion_writer_20260905.js','test_fashion_repair_20260905.js','audit_fashion_channels_fixture_20260905.js','repair_fashion_ownership_20260905.js']:sf.put(str(WB/'tools'/name),stage+'/tools/'+name)
        finally:sf.close()
        for rel in FILES:run(s,f'node --check {stage}/app/{rel}')
        env=f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH={stage}/server.bin CONFIG_BIN_PATH={stage}/server.bin'
        for name in ['test_fashion_writer_20260905.js','test_fashion_repair_20260905.js']:
            result['tests'][name]=json.loads(run(s,f'{env} node {stage}/tools/{name}').strip().splitlines()[-1]);assert result['tests'][name]['result']=='PASS'
        run(s,f'{env} node {stage}/tools/audit_fashion_channels_fixture_20260905.js {stage}')
        sf=s.open_sftp()
        try:fixture=json.loads(sf.file(stage+'/fixture.json').read())
        finally:sf.close()
        result['fixtureSummary']=fixture['summary'];result['gates']={'routeFailures':fixture['summary']['routeFailures'],'cashMissing':fixture['summary']['cashOnlineMissingPackages'],'suitFailures':fixture['summary']['suitFailures'],'duplicateMismatch':len([r for r in fixture['routes'] if any(x['actual']!=x['expected'] for x in r.get('duplicateSwaps',[]))]),'invalidConsumption':len([r for r in fixture['staleBagProbes'] if r.get('bag')!=1 or r.get('owned') or r.get('result')==0])};assert all(v==0 for v in result['gates'].values())
        result['repairPreview']=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'))
        result['afterInventory']=pm2(s);assert result['afterInventory']==result['inventory'],'production process changed during staging'
        result['passed']=True
    finally:
        s.close();(REL/'stage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'stage':stage,'passed':result['passed'],'inventory':result['inventory'],'gates':result['gates'],'repairPreview':{db:{k:d[k] for k in ['scanned','eligiblePlayers','activations','updated']} for db,d in result['repairPreview']['dbs'].items()},'productionInstalled':False},ensure_ascii=False))
if __name__=='__main__':main()
