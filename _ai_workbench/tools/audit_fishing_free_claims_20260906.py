"""Read-only inventory of free fishing contest package 11001400, S1/S2 only."""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready

WB = Path(__file__).resolve().parents[1]
RELEASE = WB / 'temp/fishing_contest_shop_20260906'
SCRIPT = r"""
const fs=require('fs'),path=require('path'),cp=require('child_process');
const APP='/linhhoasu/lhs/newServer',{MongoClient}=require(APP+'/node_modules/mongodb'),dotenv=require(APP+'/node_modules/dotenv');
(async()=>{
 const client=new MongoClient('mongodb://127.0.0.1:27017');await client.connect();
 const result={readAt:new Date().toISOString(),packageId:11001400,unitReward:{id:4,count:10},servers:{},runtime:{},logs:[]};
 const ownQa=/^(?:qafull_|qafshop_|qa_room_)/;
 try{
  for(const sid of [1001,1002]){
   const db=client.db('lhs_s'+sid),collection=db.collection('players');
   const pipeline=[{$project:{_id:0,userId:1,playerId:1,name:1,level:1,serverId:1,isBot:1,createTime:1,createdAt:1,updatedAt:1,
    baozi:'$items.4',shopCount:'$shopInfo.buyRecords.11001400',lastAnyShopBuyAt:'$shopInfo.lastBuyTime',
    rechargeRecords:{$filter:{input:{$cond:[{$isArray:'$rechargeInfo.records'},'$rechargeInfo.records',[]]},as:'r',cond:{$in:['$$r.id',[11001400,'11001400']]}}},
    newDailyLedger:'$rechargeInfo.fishingEventShopClaims.freeDaily',
    activityRows:{$filter:{input:{$cond:[{$isArray:'$activityInfo.datas'},'$activityInfo.datas',[]]},as:'a',cond:{$in:['$$a.id',[6006,6056]]}}}}},
    {$project:{userId:1,playerId:1,name:1,level:1,serverId:1,isBot:1,createTime:1,createdAt:1,updatedAt:1,baozi:1,shopCount:1,lastAnyShopBuyAt:1,newDailyLedger:1,
      rechargeRecords:{$map:{input:'$rechargeRecords',as:'r',in:{id:'$$r.id',count:'$$r.count'}}},
      activityRows:{$map:{input:'$activityRows',as:'a',in:{id:'$$a.id',start:'$$a.startTime',end:'$$a.endTime',freeCounter:'$$a.buyRecords.11001400'}}}}}];
   const rows=await collection.aggregate(pipeline,{maxTimeMS:20000}).toArray();
   const real=rows.filter(p=>p.isBot!==true&&!ownQa.test(String(p.userId||'')));
   const positive=real.filter(p=>Number(p.shopCount)>0||p.rechargeRecords.some(r=>Number(r.count)>0)||Number(p.newDailyLedger?.count)>0);
   result.servers[sid]={totalProfiles:rows.length,excludedBots:rows.filter(p=>p.isBot===true).length,excludedOwnQa:rows.filter(p=>p.isBot!==true&&ownQa.test(String(p.userId||''))).length,
     realProfilesScanned:real.length,profilesWithAnyClaimEvidence:positive.length,profiles:positive};
  }
  const hello=await client.db('admin').command({hello:1});
  result.mongo={replicaSet:!!hello.setName,hasOplog:(await client.db('local').listCollections({name:'oplog.rs'},{nameOnly:true}).toArray()).length>0};
 }finally{await client.close();}
 const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
 const dirs=new Set();
 for(const sid of [1001,1002]){
  const process=processes.find(p=>p.name==='lhs-s'+sid);if(!process)throw Error('PROCESS_MISSING');
  if(process.pm2_env.pm_cwd!==APP)throw Error('PROCESS_OWNERSHIP_MISMATCH');
  const inherited=Object.fromEntries(fs.readFileSync('/proc/'+process.pid+'/environ','utf8').split('\0').filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  const env={...dotenv.parse(fs.readFileSync(APP+'/.env')),...inherited};
  const logDir=env.LOG_DIR||path.join(APP,'logs');dirs.add(logDir);
  result.runtime[sid]={pid:process.pid,logDir,logLevel:env.LOG_LEVEL||'info',logTimezone:env.LOG_TIMEZONE||'Asia/Shanghai',loginBaoziMin:Number(env.LOGIN_BAOZI_MIN||1000)};
  for(const file of [process.pm2_env.pm_out_log_path,process.pm2_env.pm_err_log_path].filter(Boolean))if(fs.existsSync(file)){
   const stat=fs.statSync(file);result.logs.push({file,size:stat.size,mtime:stat.mtime.toISOString(),source:'pm2',server:sid});
  }
 }
 for(const dir of dirs)if(fs.existsSync(dir))for(const name of fs.readdirSync(dir)){
  if(!/\.log$/.test(name))continue;
  const file=path.join(dir,name),stat=fs.statSync(file);if(stat.isFile())result.logs.push({file,size:stat.size,mtime:stat.mtime.toISOString(),source:'game'});
 }
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
"""


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    subprocess.run(['node','--check'],input=SCRIPT,text=True,encoding='utf-8',check=True,capture_output=True)
    deployed=json.loads((RELEASE/'deploy.json').read_text(encoding='utf-8'))
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    try:
        expected=deployed['expected'];assert hashes(ssh,list(expected))==expected,'PRODUCTION_DRIFT'
        before=pm2(ssh);root=WB/'temp'/('fishing_free_claim_audit_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));root.mkdir()
        data=json.loads(run(ssh,'node -',SCRIPT,timeout=45))
        assert pm2(ssh)==before,'PROCESS_CHANGED_DURING_READ'
        result={'root':str(root),'productionWrites':0,'processUnchanged':True,'hashCount':len(expected),'ready':ready(ssh),'pm2':before,**data}
        (root/'inventory-raw.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        backup=WB/'backups'/root.name;backup.mkdir()
        for name in ['session_report.md','session_report.html']:shutil.copy2(WB/'reports'/name,backup/name)
        print(json.dumps({**{k:v for k,v in result.items() if k not in ['servers','logs','pm2']},'servers':{k:{**{n:v for n,v in s.items() if n!='profiles'},'profiles':s['profiles']}for k,s in data['servers'].items()},'logs':data['logs']},ensure_ascii=False))
    finally:ssh.close()


if __name__=='__main__':main()
