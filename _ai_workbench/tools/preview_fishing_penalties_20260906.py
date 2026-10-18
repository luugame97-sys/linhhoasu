"""Read-only account mapping and balance preflight. Never apply sanctions."""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready

WB=Path(__file__).resolve().parents[1]
AUDIT=WB/'temp/fishing_free_claim_audit_20260906T144141Z/inventory-final.json'
SCRIPT=r"""
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const APP='/linhhoasu/lhs/newServer',{MongoClient}=require(APP+'/node_modules/mongodb'),dotenv=require(APP+'/node_modules/dotenv');
const targets=__TARGETS__;
(async()=>{
 const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})),identityDbs=new Set(),runtime=[];
 for(const sid of [1001,1002]){
  const process=processes.find(p=>p.name==='lhs-s'+sid);assert(process);assert.equal(process.pm2_env.pm_cwd,APP);
  const env=Object.fromEntries(fs.readFileSync('/proc/'+process.pid+'/environ','utf8').split('\0').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
  const effective={...dotenv.parse(fs.readFileSync(APP+'/.env')),...env};
  const db=effective.IDENTITY_MONGO_DB||new URL(effective.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s'+sid).pathname.slice(1);
  assert(/^[a-zA-Z0-9_-]+$/.test(db));identityDbs.add(db);runtime.push({sid,identityDb:db,redisPrefix:effective.REDIS_PREFIX||'',pid:process.pid});
 }
 const client=new MongoClient('mongodb://127.0.0.1:27017');await client.connect();const result={time:new Date().toISOString(),runtime,accounts:[],profiles:[]};
 try{
  for(const db of identityDbs){const accounts=await client.db(db).collection('accounts').find({'roles.userId':{$in:targets.map(t=>t.userId)}},{projection:{_id:0,accountId:1,status:1,roles:1,banUntil:1,banReason:1,banCode:1,bannedAt:1,bannedBy:1,authVersion:1}}).maxTimeMS(15000).toArray();result.accounts.push(...accounts.map(a=>({...a,identityDb:db,roles:(a.roles||[]).map(r=>({userId:r.userId,serverId:r.serverId,name:r.name,roleId:r.roleId,status:r.status}))})));}
  for(const sid of [1001,1002]){
   const expected=targets.filter(t=>t.serverId===sid),players=await client.db('lhs_s'+sid).collection('players').find({userId:{$in:expected.map(t=>t.userId)}},{projection:{_id:0,userId:1,playerId:1,name:1,accountId:1,isBot:1,'items.4':1,'shopInfo.buyRecords.11001400':1,'rechargeInfo.records':1,'rechargeInfo.fishingEventShopClaims.freeDaily':1,moderation:1,updatedAt:1}}).maxTimeMS(15000).toArray();
   for(const target of expected){const p=players.find(p=>p.userId===target.userId);assert(p&&p.playerId===target.playerId&&!p.isBot,'TARGET_IDENTITY_CHANGED');const count=Math.max(0,...(p.rechargeInfo?.records||[]).filter(r=>Number(r.id)===11001400).map(r=>Number(r.count)||0));assert.equal(Number(p.shopInfo?.buyRecords?.[11001400]),count,'COUNTERS_DIFFER');const owners=result.accounts.filter(a=>a.roles.some(r=>r.userId===p.userId&&Number(r.serverId)===sid));
    result.profiles.push({serverId:sid,userId:p.userId,playerId:p.playerId,name:p.name,playerAccountId:p.accountId||null,mappedAccounts:owners.map(a=>a.accountId),accountMappingUnique:owners.length===1,
     auditedExcessBaozi:target.excessBaozi,auditedClaims:target.recordedClaims,currentClaims:count,currentBaozi:Number(p.items?.[4]||0),sufficientBalance:Number(p.items?.[4]||0)>=target.excessBaozi,existingModerationKeys:Object.keys(p.moderation||{}),newDailyLedger:p.rechargeInfo?.fishingEventShopClaims?.freeDaily||null,updatedAt:p.updatedAt});
   }
  }
 }finally{await client.close();}
 const web='/linhhoasu/webgame/gm/config.php',lines=fs.readFileSync(web,'utf8').split(/\r?\n/);
 result.webBanFunctionLocations=lines.map((l,i)=>({line:i+1,text:l.trim()})).filter(r=>/^function\s+/.test(r.text)&&/ban|lock|login|session|notice|internal/i.test(r.text));
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
"""


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    data=json.loads(AUDIT.read_text(encoding='utf-8'));targets=[p for p in data['profiles'] if p['excessClaims']>0]
    assert len(targets)==19
    script=SCRIPT.replace('__TARGETS__',json.dumps(targets,ensure_ascii=False))
    subprocess.run(['node','--check'],input=script,text=True,encoding='utf-8',capture_output=True,check=True)
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    try:
        before=pm2(ssh);deployed=json.loads((WB/'temp/fishing_contest_shop_20260906/deploy.json').read_text());assert hashes(ssh,list(deployed['expected']))==deployed['expected']
        result=json.loads(run(ssh,'node -',script,timeout=40))
        root=WB/'temp'/('fishing_penalty_preflight_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));root.mkdir()
        sftp=ssh.open_sftp()
        try:sftp.get('/linhhoasu/lhs/newServer/src/services/AccountBanService.js',str(root/'AccountBanService.js'))
        finally:sftp.close()
        assert pm2(ssh)==before
        result.update(productionWrites=0,penaltiesApplied=False,confiscationApplied=False,root=str(root),ready=ready(ssh),pm2Unchanged=True)
        (root/'preflight.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        backup=WB/'backups'/root.name;backup.mkdir()
        for name in ['session_report.md','session_report.html']:shutil.copy2(WB/'reports'/name,backup/name)
        print(json.dumps(result,ensure_ascii=False))
    finally:ssh.close()


if __name__=='__main__':main()
