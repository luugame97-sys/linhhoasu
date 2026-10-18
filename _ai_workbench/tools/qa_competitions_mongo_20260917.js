'use strict';
// Integration QA against installed dependencies and staged candidate source.
// Every write is confined to four marker-owned QA databases and Redis prefixes.
const assert=require('assert/strict'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const APP=process.env.COMPETITION_APP||'/linhhoasu/lhs/newServer';
const prefix=String(process.env.COMPETITION_QA_PREFIX||''),sid=Number(process.argv[2]),mode=process.argv[3]||'flow';
assert(/^lhs_qa_comp_v3_[0-9_]+_s$/.test(prefix));assert([1001,1002,1003,1004].includes(sid));
const database=prefix+sid,owner=prefix.slice(0,-2);
assert(!/^lhs_s\d+$/.test(database));
const settings={...require(APP+'/node_modules/dotenv').parse(fs.readFileSync(APP+'/.env')),
 ...require(APP+'/ecosystem.config.js').apps.find(a=>a.name==='lhs-s1001').env};
process.env.MONGO_URI='mongodb://127.0.0.1:27017/'+database;
process.env.IDENTITY_MONGO_DB=prefix+'1001';process.env.CROSS_GAME_DB_PREFIX=prefix;process.env.SERVER_ID=String(sid);
const mongoose=require(APP+'/node_modules/mongoose'),Redis=require(APP+'/node_modules/ioredis');
mongoose.set('autoCreate',false);mongoose.set('autoIndex',false);
const Player=require(APP+'/src/db/models/Player'),GameServer=require(APP+'/src/db/models/GameServer');
const Account=require(APP+'/src/db/models/Account'),players=require(APP+'/src/services/PlayerService');
const cross=require(APP+'/src/services/CrossServerEventService'),cfg=require(APP+'/src/services/ConfigService');
const Entry=require(APP+'/src/db/models/CrossEventEntry'),Action=require(APP+'/src/db/models/CrossArenaAction');
const serviceModule=require(APP+'/src/services/CrossArenaService'),arena=require(APP+'/src/handlers/arena');
const cycle=cross.cycleFor('crossArena',Date.parse(cross.schedule.anchor)+7*86400000);
const baseTime=cycle.startTime+3600000;
let now=baseTime+91000+(sid-1001)*40000;
const service=serviceModule.createService({clock:()=>now});
const uid='qa_comp_mongo_'+sid;
const ack=(p,t)=>(Array.isArray(p)?p:[p]).find(x=>x.tag===t)?.data;
const plain=v=>JSON.parse(JSON.stringify(v));
const economy=p=>plain({items:p.items,currencies:p.currencies});
let redis;
const result={serverId:sid,mode,scope:'marker-owned QA Mongo/Redis; direct handlers, not native login',realPlayerWrites:0,checks:[]};
async function owned(db){assert.equal((await db.collection('qa_ownership').findOne({_id:'owner'}))?.owner,owner,'QA_OWNERSHIP_MISMATCH');}
function redisClient(){return settings.REDIS_URL?new Redis(settings.REDIS_URL,{keyPrefix:database+':',maxRetriesPerRequest:1})
 :new Redis({host:settings.REDIS_HOST||'127.0.0.1',port:Number(settings.REDIS_PORT||6379),password:settings.REDIS_PASSWORD||undefined,
 keyPrefix:database+':',maxRetriesPerRequest:1});}
async function main(){
 await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000});
 try{
  const db=mongoose.connection.db;
  if(mode==='seed'){
   const names=(await db.listCollections({}, {nameOnly:true}).toArray()).map(r=>r.name);
   assert.equal(names.length,0,'QA_DATABASE_ALREADY_EXISTS');
   await db.collection('qa_ownership').insertOne({_id:'owner',owner,createdAt:new Date()});
   const p=await players.createPlayer(uid,'QA Arena '+sid,{serverId:sid,accountId:uid});
   p.playerId=uid;p.serverId=sid;p.level=120;p.arenaScore=1000;p.items[10]=30;p.items[110]=30;
   p.currencies={gold:0,diamond:1000,silver:10000};p.isBot=false;p.managedBot=false;
   assert(await players.savePlayer(uid,p,{returnSaved:false}));
   if(sid===1001){for(const id of [1001,1002,1003,1004])await GameServer.create({serverId:id,pageId:1,pageName:'QA',serverName:'QA '+id,status:1,running:true,openTime:baseTime-30*86400000});}
   result.checks.push('owned QA seed created');
  }else{
   await owned(db);let p=await players.loadPlayer(uid);assert(p);
   const s={serverId:sid,userId:uid,player:p};
   if(mode==='info'){
    now=baseTime;const before=economy(p),r=ack(await service.info({},s,1),5000);
    if(sid===1004){assert.equal(r.code,'CROSS_ARENA_SERVER_NOT_IN_POOL');assert.deepEqual(economy(await players.loadPlayer(uid)),before);}
    else{assert.equal(r.result,0,JSON.stringify(r));assert(r.ranklist.some(row=>row.dbid===String(p._id)));assert.equal(await Entry.countDocuments({event:'crossArena',playerId:uid}),1);
     const top=await cross.upsertScore({event:'topArena',serverId:sid,playerId:uid,userId:uid,name:p.name,level:p.level,score:2000-sid},baseTime);assert(top.accepted);}
    result.checks.push(sid===1004?'S4 denied without economic writes':'real Mongo roster published');
   }else if(mode==='flow'){
    if(sid!==1004){
     const info=ack(await service.info({},s,2),5000);assert.equal(info.result,0,JSON.stringify(info));
     const target=info.challengelist.find(r=>!r.isRobot&&r.serverId!==sid);assert(target,'CROSS_TARGET_MISSING');
     const profile=await service.profile(target.serverId,target.dbid);assert.equal(String(profile._id),target.dbid);
     const before=await players.loadPlayer(uid),request={type:16,enemyid:target.dbid,requestId:'mongo_cross_'+sid+'_fight_1',
      cycleKey:info.cycleKey,challengeVersion:info.challengeVersion};
     const first=ack(await service.fight(request,s,3),2300);assert.equal(first.result,0,JSON.stringify(first));
     const after=await players.loadPlayer(uid);assert.equal(after.items[110],before.items[110]-1);
     const expected=first.win?10:5;assert.equal(Number(after.items[89]||0)-Number(before.items[89]||0),expected);
     assert.equal(after.currencies.silver,before.currencies.silver);assert.equal(first.fightResult.entitys[1].dbid,target.dbid);
     s.player=await players.loadPlayer(uid);const replay=ack(await service.fight(request,s,4),2300);
     assert.equal(replay.result,0,JSON.stringify(replay));assert(replay.recovered);assert.equal(replay.fightResult.entitys.length,2);
     assert.deepEqual(economy(await players.loadPlayer(uid)),economy(after));
     assert.equal(await Action.countDocuments({playerId:uid,kind:'fight'}),1);
     result.checks.push('real cross-server profile and combat attrs','correct ticket/reward saved in Mongo','relog replay no duplicate','one durable shared action');
    }
    redis=redisClient();await redis.ping();require(APP+'/src/db/redis').getClient=()=>redis;
    // No other accounts are registered in the QA identity DB, so ordinary Arena
    // tests use configured robots and cannot touch a live player/protection row.
    assert.equal(await Account.countDocuments({}),0);
    s.player=await players.loadPlayer(uid);const info=ack(await arena.handleArenaInfo({},s,10),2600);assert(info.challengelist.length);
    const target=info.challengelist.find(r=>r.isRobot);assert(target);
    const request={type:2,enemyid:target.dbid,challengeVersion:target.challengeVersion,requestId:'mongo_arena_'+sid+'_fight_1'};
    const before=await players.loadPlayer(uid),first=ack(await arena.handleArenaFight2300(request,s,11),2300);
    assert.equal(first.result,0,JSON.stringify(first));const after=await players.loadPlayer(uid);assert.equal(after.items[10],before.items[10]-1);
    s.player=await players.loadPlayer(uid);const replay=ack(await arena.handleArenaFight2300(request,s,12),2300);
    assert.equal(replay.result,0,JSON.stringify(replay));assert(replay.recovered);assert.equal(replay.fightResult.entitys.length,2);assert(replay.fightResult.events.length);
    assert.deepEqual(economy(await players.loadPlayer(uid)),economy(after));
    result.checks.push('Arena Mongo/Redis single debit','Arena relog complete replay');
   }else if(mode==='settlement'){
    if(sid!==1004){
     const cutoff=cycle.startTime+23*3600000;now=cutoff+60000;
     const settlement=require(APP+'/src/services/CrossEventSettlementService').createService({serverId:sid,clock:()=>now});
     const r=await settlement.settleWindow({cycle,period:'day',cutoffAt:cutoff});assert(r.localDone);
     const Mail=require(APP+'/src/db/models/Mail');const mail=await Mail.findOne({userId:uid,eventKey:{$regex:'^cross:'}}).lean();assert(mail);assert.equal(mail.targetServerId,sid);
     const count=await Mail.countDocuments({userId:uid});await settlement.settleWindow({cycle,period:'day',cutoffAt:cutoff});assert.equal(await Mail.countDocuments({userId:uid}),count);
     result.checks.push('cross daily snapshot from all QA player DBs','mail delivered in owner DB only','settlement replay no duplicate mail');
     now=cycle.endTime+60000;await settlement.tick();
     const rows=await Mail.find({userId:uid}).lean();
     assert(rows.some(m=>m.batchId==='cross_crossArena_'+cycle.key));
     const topCycle=cross.cycleFor('topArena',cycle.startTime);
     assert(rows.some(m=>m.batchId==='cross_topArena_'+topCycle.key));
     const size=rows.length;await settlement.tick();assert.equal(await Mail.countDocuments({userId:uid}),size);
     result.checks.push('parallel weekly payouts at same cutoff in real Mongo','weekly cursor replay no duplicate');
    }
   }else throw Error('UNKNOWN_QA_MODE');
  }
  result.result='PASS';console.log(JSON.stringify(result));
 }finally{if(redis)await redis.quit();await mongoose.disconnect();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
