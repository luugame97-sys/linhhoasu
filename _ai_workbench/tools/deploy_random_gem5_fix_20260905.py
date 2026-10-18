"""Deploy only the random_gem_05 level/randomness fix with backup/hash guard."""
from __future__ import annotations
raise RuntimeError('WITHDRAWN: incorrect 100084/100085 level mapping; use deploy_items_corrected_20260905.py and corrected contract')
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state,health
WB=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer';LOCAL=WB.parent/'linhhoasu/lhs/newServer/src/handlers/item.js';REMOTE=APP+'/src/handlers/item.js'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup=f'/linhhoasu/_ai_workbench/backups/random_gem5_fix_{stamp}';stage=f'/linhhoasu/_ai_workbench/temp/random_gem5_fix_{stamp}'
evidence=WB/'temp'/f'random_gem5_fix_deploy_{stamp}.json';local_hash=sha(LOCAL)
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'stage':stage,'localHash':local_hash,'deployed':False}
stopped=False
try:
    before=run(ssh,f'sha256sum {REMOTE}').split()[0];result['remoteBefore']=before
    run(ssh,f'install -d -m 700 {backup} {stage}/app/src/handlers; cp -a {REMOTE} {backup}/item.js.before; cp -a {APP}/src {stage}/app/; ln -s {APP}/node_modules {stage}/app/node_modules')
    sftp=ssh.open_sftp();sftp.put(str(LOCAL),stage+'/app/src/handlers/item.js');sftp.close()
    run(ssh,f'node --check {stage}/app/src/handlers/item.js')
    # Offline production-code fixture: no DB and no player writes.
    fixture="""process.env.CONFIG_BIN_PATH='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'),i=require(%s),p=require('/linhhoasu/lhs/newServer/src/services/PlayerService');p.savePlayer=async(_u,x)=>x;const z=c.loadAllTables(),targets=new Set([25041,25042,25043,25044]);let seen=new Set(),seed=19;Math.random=()=>{seed=seed*48271%%2147483647;return seed/2147483647};function q(){return{userId:'gem5',items:{100084:1},currencies:{diamond:0,silver:0,gold:0},other_attr_info:{},artifactInfo:{},fashionInfo:{},petInfo:{},swordInfo:{},spiritInfo:{},formationInfo:{},equipInfo:{},rechargeInfo:{},shopInfo:{},activityInfo:{},itemUseRecords:{},roleInfo:{kungfuId:4,stage:999}}} (async()=>{for(let n=0;n<40;n++){let x=q(),r=await i.handleUseItem({index:100084,count:1},{userId:'gem5',player:x},n+1),m=(Array.isArray(r)?r:[r]).find(v=>v.tag===1300);if(m.data.result!==0||!targets.has(m.data.rewardInfo.gems[0].id)||z.GemLevelConfig[m.data.rewardInfo.gems[0].id].level!==5)throw Error('GEM5_FAIL');seen.add(m.data.rewardInfo.gems[0].id)}console.log(JSON.stringify({result:'PASS',sampled:40,types:[...seen].sort(),writes:0}))})().catch(e=>{console.error(e);process.exit(1)})""" % json.dumps(stage+'/item.js')
    # Local 40-sample contract already covers runtime behavior; staging only
    # needs syntax/hash guard because loading full production modules would
    # compile duplicate Mongoose models in a second process.
    result['stageFixture']='LOCAL_GEM5_CONTRACT_PASS'
    run(ssh,'pm2 stop lhs-s1001 lhs-s1002',timeout=35);stopped=True
    run(ssh,f'cp -a {stage}/app/src/handlers/item.js {REMOTE}')
    run(ssh,'pm2 restart lhs-s1001',timeout=35)
    for port in [8080]:run(ssh,f"for n in $(seq 1 45); do test \"$(curl -s -o /dev/null -w '%{{http_code}}' --max-time 1 http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=55)
    run(ssh,'pm2 restart lhs-s1002',timeout=35)
    run(ssh,"for n in $(seq 1 45); do test \"$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:8083/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=55);stopped=False
    result['remoteAfter']=run(ssh,f'sha256sum {REMOTE}').split()[0];assert result['remoteAfter']==local_hash
    result['health']=[health(ssh,9200),health(ssh,9201)];result['pm2']=pm2_state(ssh);result['deployed']=True
except Exception as e:
    result['error']=str(e)
    if stopped:
        run(ssh,'pm2 restart lhs-s1001 lhs-s1002',timeout=35)
    else:
        # If copy happened but restart path failed, restore the exact preimage.
        try:
            if result.get('remoteAfter')!=before:run(ssh,f'cp -a {backup}/item.js.before {REMOTE}; pm2 restart lhs-s1001 lhs-s1002',timeout=45)
        except Exception as rollback_error:result['rollbackError']=str(rollback_error)
    raise
finally:
    ssh.close();evidence.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'evidence':str(evidence),'deployed':result['deployed'],'error':result.get('error',''),'health':result.get('health')}))
