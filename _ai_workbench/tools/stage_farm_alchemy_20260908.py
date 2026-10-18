"""Prepare a Linux candidate only. Never install/restart live services."""
import hashlib,json,shlex,difflib,re
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import connect,run,WB
from release_huyenvu_daily_20260906 import hashes,pm2,ready
APP='/linhhoasu/lhs/newServer'; GAME='/linhhoasu/webgame/game'
FILES=['handlers/farm.js','handlers/alchemy.js','handlers/item.js','handlers/account.js','handlers/commerce-compat.js','handlers/index.js','services/AlchemyCraftService.js','services/ItemPillService.js','services/PlayerMutationService.js','net/WSServer.js','services/FeatureReceiptService.js','services/FarmAccessService.js','services/FarmShopService.js','services/FarmAdService.js','services/FarmRecoveryService.js']
OUT=WB/'temp/farm_alchemy_fix_20260908'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    OUT.mkdir(exist_ok=True);s=connect()
    try:
        paths=[APP+'/src/'+x for x in FILES]+[GAME+'/index.html',GAME+'/js/lhs-farm-alchemy-v2.js']
        before=hashes(s,paths);state=pm2(s);health=ready(s)
        pending=OUT/'pending.json'
        if pending.exists():
            saved=json.loads(pending.read_text());stage=saved['stage'];assert saved['before']==before,'BASELINE_DRIFT'
        else:
            stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/farm_alchemy_'+stamp
            run(s,f'install -d -m 700 {stage}/app/scripts {stage}/tools {stage}/before; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts/test-core-gameplay-contract.js {stage}/app/scripts/; ln -s {APP}/node_modules {stage}/app/node_modules')
            pending.write_text(json.dumps({'stage':stage,'before':before},indent=2)+'\n',encoding='utf-8')
        with s.open_sftp() as f:
            for i,p in enumerate(paths):
                if before[p]:
                    raw=f.open(p,'rb').read();(OUT/('before-'+str(i))).write_bytes(raw)
                    with f.open(stage+'/before/'+str(i),'wb')as stream:stream.write(raw)
            for p in FILES:
                f.put(str(WB.parent/'linhhoasu/lhs/newServer/src'/p),stage+'/app/src/'+p)
            # Merge the known unrelated farm translation/helper drift. Keep
            # the source checkout intact; only the staged artifact follows live.
            target=stage+'/app/src/handlers/farm.js'
            raw=f.open(target,'rb').read().decode('utf-8').replace('\r','')
            old_local=(WB/'backups/farm_alchemy_fix_20260907/farm.local.before.js').read_text(encoding='utf-8').replace('\r','').splitlines(True)
            old_live=(OUT/'before-0').read_text(encoding='utf-8').replace('\r','').splitlines(True)
            preserved=[]
            for op,a,b,c,d in difflib.SequenceMatcher(None,old_local,old_live,autojunk=False).get_opcodes():
                if op=='replace' and b-a==1 and d-c==1 and 'Tiên hữu' in old_local[a] and '道友' in old_live[c]:
                    assert old_local[a] in raw,'FARM_TRANSLATION_MERGE_CONFLICT'
                    raw=raw.replace(old_local[a],old_live[c]);preserved.append('fallback-name')
            # This local-only old async-save helper is now unused and did not
            # exist in live; do not reintroduce it as collateral drift.
            raw,n=re.subn(r'function scheduleFarmPlayerSave\(.*?\n}\n\n(?=async function loadPlayerByDbid)', '', raw, flags=re.S)
            assert n==1,'FARM_HELPER_MERGE_CONFLICT'
            raw=raw.replace("const logger = require('../logger');\n",'')
            assert 'logger.' not in raw
            with f.open(target,'wb')as stream:stream.write(raw.encode('utf-8'))
            # Keep the live registration log unchanged; local translation drift
            # is unrelated to this feature rollout.
            target=stage+'/app/src/handlers/index.js'
            raw=f.open(target,'rb').read().decode('utf-8')
            local_line='logger.info(`[Handlers] 已注册 ${totalTags} Cái handler（chứa ${stubCount} Cái stub）`);'
            live=(OUT/'before-5').read_text(encoding='utf-8').replace('\r','')
            live_line=next(line.strip() for line in live.splitlines() if 'logger.info(`[Handlers] 已注册' in line)
            assert local_line in raw
            with f.open(target,'wb')as stream:stream.write(raw.replace(local_line,live_line).encode('utf-8'))
            f.put(str(WB.parent/'linhhoasu/lhs/newServer/scripts/test-farm-alchemy-fix.js'),stage+'/app/scripts/test-farm-alchemy-fix.js')
            f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
            f.put(str(WB.parent/'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js'),stage+'/client.js')
            f.put(str(WB.parent/'linhhoasu/webgame/game/index.html'),stage+'/index.html')
        env=f'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin FEATURE_ACORN={stage}/tools/acorn.js FEATURE_APP={stage}/app FEATURE_RUNTIME={APP} FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_PATCH={stage}/client.js'
        i,o,e=s.exec_command(env+' node '+stage+'/app/scripts/test-farm-alchemy-fix.js',timeout=60)
        test=o.read().decode('utf-8');errors=e.read().decode('utf-8');code=o.channel.recv_exit_status()
        (OUT/'linux-test.json').write_text(test,encoding='utf-8');(OUT/'linux-stderr.txt').write_text(errors,encoding='utf-8')
        assert code==0,test[-10000:]+errors[-1000:]
        result=json.loads(test);assert result['result']=='PASS'
        core=run(s,f'cd {stage}/app && CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node scripts/test-core-gameplay-contract.js')
        for p in FILES:run(s,'node --check '+stage+'/app/src/'+p)
        run(s,'node --check '+stage+'/client.js')
        assert hashes(s,paths)==before,'LIVE_SOURCE_CHANGED_DURING_STAGE'
        after=pm2(s);assert after==state,'LIVE_PROCESSES_CHANGED_DURING_STAGE'
        candidateHashes=hashes(s,[stage+'/app/src/'+x for x in FILES]+[stage+'/client.js',stage+'/index.html'])
        report={'status':'STAGED_NOT_DEPLOYED','stage':stage,'at':datetime.now(timezone.utc).isoformat(),'before':before,'localHashes':{p:sha(WB.parent/'linhhoasu/lhs/newServer/src'/p) for p in FILES},'candidateHashes':candidateHashes,'test':result,'core':core,'ready':ready(s),'pm2Unchanged':True,'productionWrites':0,'preservedLiveFarmNames':len(preserved),'needsGameplayDecision':True,'blockers':['Missing authoritative mystery-seed and magic-field weights','Ad-provider verification unavailable; only configured skip-ad entitlement supported','Neighbor fertilizer and assistance not fully implemented','Daily free seed schedule and offline auto unverified']}
        (OUT/'stage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'status':report['status'],'stage':stage,'tests':result['count'],'ready':report['ready'],'pm2Unchanged':True}))
    finally:s.close()
if __name__=='__main__':main()
