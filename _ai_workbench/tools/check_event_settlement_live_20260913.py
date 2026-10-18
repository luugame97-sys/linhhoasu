"""Read-only recovery inventory; never import/run the deployment module."""
import json
from snapshot_web_multiserver_20260906 import connect, run

JS = r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const all=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'}));
const ps=all.filter(p=>/^lhs-s100[123]$/.test(p.name));
const result={at:new Date().toISOString(),processes:ps.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime,cwd:p.pm2_env.pm_cwd,enabled:p.pm2_env.EVENT_SETTLEMENT_ENABLED,activation:p.pm2_env.EVENT_SETTLEMENT_ACTIVATION_AT}))};
const root='/linhhoasu/lhs/newServer',backup='/linhhoasu/_ai_workbench/backups/event_settlement_fix_20260913_pre';
const hash=f=>fs.existsSync(f)?crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;
result.files=['src/app.js','ecosystem.config.js','src/services/EventRewardSettlementService.js'].map(f=>({file:f,live:hash(root+'/'+f),backup:hash(backup+'/'+f)}));
result.ready={};for(const port of [8080,8083,8084])try{result.ready[port]=cp.execFileSync('curl',['-fsS','--max-time','5','-o','/dev/null','-w','%{http_code}','http://127.0.0.1:'+port+'/ready'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})}catch(e){result.ready[port]='failed';}
result.errors=ps.map(p=>({name:p.name,tail:fs.existsSync(p.pm2_env.pm_err_log_path)?fs.readFileSync(p.pm2_env.pm_err_log_path,'utf8').split('\n').slice(-15):[]}));
(async()=>{const MongoClient=require(root+'/node_modules/mongodb').MongoClient;result.db=[];for(const p of ps){const c=new MongoClient(p.pm2_env.MONGO_URI,{serverSelectionTimeoutMS:5000});try{await c.connect();const db=c.db();const filter={eventKey:/^(activity44-rank|fishing-rank|event_rank_v2_)/};result.db.push({name:db.databaseName,settlementMails:await db.collection('mails').countDocuments(filter),receipts:await db.collection('eventrewardsettlements').aggregate([{$project:{_id:1,state:1,recipients:{$size:'$recipients'},delivered:{$size:'$delivered'}}}]).toArray()});}finally{await c.close();}}
const cfg=require(root+'/src/services/ConfigService'),service=require(root+'/src/services/EventRewardSettlementService');
const rewardGrant=require(root+'/src/services/RewardGrantService');let n=0;for(const name of ['Activity44RankConfig','Activity6RankConfig','Activity33RankConfig']){const t=cfg.get(name);for(const id of (name==='Activity44RankConfig'?[44001,44002,44051,44052]:name==='Activity6RankConfig'?[6006]:Object.keys(t))){for(const r of Object.values(t[id]||{})){rewardGrant.assertRewardRowsSupported(r.rewards);n++;}}}result.rewardBracketsValidated=n;
result.latestFiles=['src/config/eventRewardSettlement.json','src/handlers/activity.js','src/services/FishingEventService.js','src/services/NewYearEventSchedule.js','src/db/models/EventRewardSettlement.js'].map(f=>({file:f,sha256:hash(root+'/'+f)}));
result.cutoffs=JSON.parse(fs.readFileSync(root+'/src/config/eventRewardSettlement.json')).newYearWindows;
console.log(JSON.stringify(result));})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
'''

if __name__ == '__main__':
    ssh=connect()
    try:
        import sys
        if '--event-data' in sys.argv:
            JS=r'''
const fs=require('fs'),cp=require('child_process');const root='/linhhoasu/lhs/newServer';const ps=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[123]$/.test(p.name));
const {MongoClient}=require(root+'/node_modules/mongodb');const config=require(root+'/src/services/ConfigService');const rules=JSON.parse(fs.readFileSync(root+'/src/config/fishingGameplayBalance.json'));const out={at:new Date().toISOString(),schedule:rules.schedule,db:[]};
(async()=>{for(const p of ps){const c=new MongoClient(p.pm2_env.MONGO_URI);try{await c.connect();const d=c.db();const docs=await d.collection('players').find({'fishInfo.eventStats':{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{serverId:1,'fishInfo.eventStats':1}}).toArray();const stats={};for(const x of docs)for(const [key,s]of Object.entries(x.fishInfo?.eventStats||{})){stats[key]||={id:s.id,start:s.start,end:s.end,participants:0,positive:0,settled:0};stats[key].participants++;if(s.score>0)stats[key].positive++;if(s.settled)stats[key].settled++;}const windows=await d.collection('players').aggregate([{$match:{isBot:{$ne:true},managedBot:{$ne:true},'activityInfo.datas.id':44001}},{$unwind:'$activityInfo.datas'},{$match:{'activityInfo.datas.id':44001}},{$group:{_id:null,n:{$sum:1},earliest:{$min:'$activityInfo.datas.startTime'},latestEnd:{$max:'$activityInfo.datas.endTime'}}}]).toArray();out.db.push({name:d.databaseName,servers:await d.collection('gameservers').find({serverId:p.pm2_env.SERVER_ID},{projection:{_id:0,serverId:1,openTime:1}}).toArray(),stats,kimma:windows});}finally{await c.close();}}out.config={contest:config.get('Activity6RankConfig')[6006],fishIds:Object.keys(config.get('Activity33RankConfig'))};console.log(JSON.stringify(out));})().catch(e=>{console.error(e.name);process.exitCode=1;});
'''
        print(run(ssh,'node',JS))
    finally: ssh.close()
