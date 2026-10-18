'use strict';
// Read-only inventory. No application start, schedulers, model initialization or writes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const {execFileSync}=require('child_process');
const app='/linhhoasu/lhs/newServer';
const {MongoClient}=require(app+'/node_modules/mongodb');
const proc=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8*1024*1024}));
const nodes=proc.filter(p=>/^lhs-s100[1-7]$/.test(p.name));
const envFile=require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env'));
const effective=p=>({...envFile,...p.pm2_env.env,...p.pm2_env});
const env=effective(nodes.find(p=>p.name==='lhs-s1001'));
for(const k of ['CONFIG_BIN_PATH','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_46_ENABLED','ROLE_LEVEL_2000_ENABLED','EVENT_ROTATION_ENABLED','EVENT_ROTATION_NATIVE_ENABLED'])if(env[k]!=null)process.env[k]=String(env[k]);
// Only suppress diagnostics from the read-only config decoder.
const loggerPath=require.resolve(app+'/src/logger');
require.cache[loggerPath]={id:loggerPath,filename:loggerPath,loaded:true,exports:new Proxy({},{get:()=>()=>{}})};
const config=require(app+'/src/services/ConfigService');
const tables=config.loadAllTables();
const schedule=JSON.parse(fs.readFileSync(app+'/src/config/crossServerEventSchedule.json'));
const rotation=JSON.parse(fs.readFileSync(app+'/src/config/eventRotation.json'));
const policy=JSON.parse(fs.readFileSync(app+'/src/config/eventRewardSettlement.json'));
const sourceFiles=['src/handlers/activity.js','src/handlers/cross-rival.js','src/handlers/arena.js','src/router.js','src/services/CrossArenaService.js','src/services/CrossServerEventService.js','src/services/CrossEventScheduleService.js','src/services/CrossEventSettlementService.js','src/services/EventRotationRegistry.js','src/services/ActivityCycleSchedule.js','src/services/EventRewardSettlementService.js','src/services/FishingEventSchedule.js','src/services/TopArenaStateService.js','src/config/crossServerEventSchedule.json','src/config/eventRotation.json','src/config/eventRewardSettlement.json','src/app.js'];
const out={at:new Date().toISOString(),source:{},schedule,rotation,policy,nodes:[],configs:{},logs:[],db:[]};
for(const rel of sourceFiles){const f=app+'/'+rel;if(!fs.existsSync(f)){out.source[rel]={missing:true};continue;}const b=fs.readFileSync(f);out.source[rel]={sha256:crypto.createHash('sha256').update(b).digest('hex'),mtime:fs.statSync(f).mtime.toISOString(),text:b.toString('utf8')};}
const tableNames=Object.keys(tables).filter(n=>/^(Activity(21|27|30|37|43|44|49|52|Base|Config)|CrossRival|CrossArena|TopArena|SystemConfig|Invest)/.test(n));
for(const n of tableNames)out.configs[n]=tables[n];
const logRx=/CrossEvent|CrossArena|EVENT_ROTATION|CROSS_|TOP_ARENA|EventSettlement|OldTrek.*(fail|error)|TypeError|uncaught|unhandled/i;
for(const p of nodes){
 const e=effective(p),port=Number(e.HTTP_PORT);let ready;
 try{const r=await fetch('http://127.0.0.1:'+port+'/ready',{signal:AbortSignal.timeout(4000)});ready={http:r.status,body:await r.json()};}catch(err){ready={error:err.name};}
 out.nodes.push({name:p.name,pid:p.pid,status:p.pm2_env.status,started:new Date(p.pm2_env.pm_uptime).toISOString(),port,serverId:e.SERVER_ID,identityDb:e.IDENTITY_MONGO_DB||null,flags:Object.fromEntries(['EVENT_ROTATION_ENABLED','EVENT_ROTATION_NATIVE_ENABLED','CROSS_EVENT_ENABLED','EVENT_SETTLEMENT_ENABLED','OLD_TREK_SETTLEMENT_ENABLED'].map(k=>[k,e[k]??null])),ready});
 for(const key of ['pm_err_log_path','pm_out_log_path']){const f=p.pm2_env[key];if(!f||!fs.existsSync(f))continue;const size=fs.statSync(f).size,buf=Buffer.alloc(Math.min(size,262144)),fd=fs.openSync(f,'r');fs.readSync(fd,buf,0,buf.length,Math.max(0,size-buf.length));fs.closeSync(fd);const hits=buf.toString('utf8').split('\n').filter(x=>logRx.test(x));out.logs.push({node:p.name,file:path.basename(f),bytesRead:buf.length,count:hits.length,recent:hits.slice(-12).map(x=>x.slice(0,450))});}
}
const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});
await client.connect();
try{
 const now=Date.now();
 for(let sid=1001;sid<=1007;sid++){
  const db=client.db('lhs_s'+sid),collections=await db.listCollections({name:{$in:['crosseventsettlements','eventrewardsettlements','oldtreksettlements','crossevententries','serverconfigs']}},{nameOnly:true}).toArray(),row={server:sid,collections:collections.map(x=>x.name),settlements:{}};
  for(const coll of collections.filter(x=>/settlements$/.test(x.name))){row.settlements[coll.name]=await db.collection(coll.name).aggregate([{$sort:{updatedAt:-1}},{$limit:12},{$project:{_id:1,state:1,event:1,period:1,cycleKey:1,sourceCycleKey:1,cursorAt:1,cutoffAt:1,endTime:1,completedAt:1,updatedAt:1,lastError:1,recipientCount:{$size:{$ifNull:['$recipients',[]]}},deliveredCount:{$size:{$ifNull:['$delivered',[]]}},expiredCount:{$size:{$ifNull:['$expired',[]]}}}}],{maxTimeMS:5000}).toArray();}
  if(collections.some(c=>c.name==='crossevententries'))row.rosters=await db.collection('crossevententries').aggregate([{$group:{_id:{event:'$event',cycle:'$cycleKey'},count:{$sum:1},serverIds:{$addToSet:'$serverId'}}}],{maxTimeMS:5000}).toArray();
  row.activeActivities=await db.collection('players').aggregate([{$match:{isBot:{$ne:true}}},{$project:{'activityInfo.datas':1}},{$unwind:'$activityInfo.datas'},{$match:{'activityInfo.datas.startTime':{$lte:now},'activityInfo.datas.endTime':{$gt:now}}},{$group:{_id:'$activityInfo.datas.id',players:{$sum:1},endMin:{$min:'$activityInfo.datas.endTime'},endMax:{$max:'$activityInfo.datas.endTime'}}},{$sort:{_id:1}}],{maxTimeMS:8000}).toArray();
  if(sid===1001){const p=await db.collection('players').findOne({accountId:'vanduc97'},{projection:{_id:0,level:1,serverId:1,'activityInfo.datas':1,'activityInfo.disabledEntryIds':1}});row.referencePlayer=p;}
  out.db.push(row);
 }
}finally{await client.close();}
console.log(JSON.stringify(out));
