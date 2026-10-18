'use strict';
// Runs on a new dedicated QA database, never a production database. No game bootstrap.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(process.argv[2]),app=path.join(root,'app'),mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const suffix=crypto.randomBytes(6).toString('hex'),db='lhs_qa_fishing_'+suffix;assert(/^lhs_qa_fishing_[0-9a-f]{12}$/.test(db));
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
let now=Date.parse('2026-09-06T00:00:00+07:00')+3600000;const realDateNow=Date.now;Date.now=()=>now;
const log=require.resolve(path.join(app,'src/logger'));require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},error(){},warn(){},debug(){}}};
const Player=require(path.join(app,'src/db/models/Player'));const Bottle=require(path.join(app,'src/db/models/FishingBottle'));
let failSave=false;const service=require.resolve(path.join(app,'src/services/PlayerService'));
require.cache[service]={id:service,filename:service,loaded:true,exports:{async savePlayer(userId,p){if(failSave)throw Error('QA_EXPECTED_SAVE_FAILURE');assert(userId.startsWith('qa_batch_'+suffix));const copy={...p};delete copy._id;delete copy.__v;await Player.updateOne({userId},{$set:copy},{upsert:true});return p;},wasRecentlySaved:()=>false}};
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables(),rules=require(path.join(app,'src/config/fishingGameplayBalance.json'));
rules.schedule.enabled=true;const schedule=require(path.join(app,'src/services/FishingEventSchedule')),events=require(path.join(app,'src/services/FishingEventService')),fish=require(path.join(app,'src/handlers/fish')),soul=require(path.join(app,'src/handlers/fish-soul')),activity=require(path.join(app,'src/handlers/activity'));
let seq=0;const owned=[];function make(i){const userId='qa_batch_'+suffix+'_'+i;owned.push(userId);const p={userId,playerId:userId,name:userId,serverId:1002,isBot:false,level:116,exp:0,roleInfo:{kungfuId:4,stage:1},items:{65:1000,68:100,214:50,215:50,216:0},currencies:{gold:0,silver:0,diamond:0},fishInfo:{level:28,scene:1},systemUnlockInfo:{unlockedSystem:[215,221,329]},rechargeInfo:{monthCards:{}},activityInfo:{datas:[]},taskInfo:{},other_attr_info:{}};fish.ensureFishInfo(p);schedule.sync(p);return {userId,player:p};}
const req=s=>({requestId:'mongo_test_'+suffix+'_'+(++seq),expectedRevision:s.player.fishInfo.balanceRevision||0}),ack=r=>(Array.isArray(r)?r:[r]).find(p=>p.msgUid===1)?.data;
async function persist(s){await require(service).savePlayer(s.userId,s.player);}
async function reload(s){s.player=await Player.findOne({userId:s.userId}).lean();return s;}
async function op(s,p){return activity.handleActivityOperate({...req(s),...p},s,1);}
(async()=>{const steps=[];let success=false;await mongoose.connect('mongodb://127.0.0.1:27017/'+db,{serverSelectionTimeoutMS:5000});try{
 assert.equal(mongoose.connection.name,db);await Player.init();await Bottle.init();
 const a=make('a'),b=make('b'),c=make('c');await Promise.all([persist(a),persist(b),persist(c)]);
 const catchRequest={count:10,...req(a)};let out=ack(await fish.handleFishCatch(catchRequest,a,1));assert.equal(out.result,0);const savedCount=a.player.fishInfo.fishResult.fishInfos.length;await reload(a);assert.equal(a.player.fishInfo.fishResult.fishInfos.length,savedCount);assert(ack(await fish.handleFishCatch(catchRequest,a,1)).replayed);assert.equal(a.player.items[65],990);steps.push('normal-catch-save-relog-receipt');
 now+=2000;const soulReq={count:3,...req(b)};out=ack(await soul.handleFishSoulFishing(soulReq,b,1));assert.equal(out.result,0);await reload(b);assert(ack(await soul.handleFishSoulFishing(soulReq,b,1)).replayed);assert.equal(b.player.items[65],991);steps.push('soul-catch-save-relog');
 now=Date.parse(rules.schedule.anchor)+42*86400000+3600000;for(const s of [a,b,c]){schedule.sync(s.player);await persist(s);}
 await op(a,{id:33301,module:10,content:'Chai thật trong DB kiểm thử'});assert.equal(await Bottle.countDocuments({instance:schedule.active(a.player,33301).key}),1);
 const results=await Promise.all([op(b,{id:33301,module:11}),op(c,{id:33301,module:11})]);const holders=[b,c].filter(s=>s.player.fishInfo.eventStats[schedule.active(s.player,33301).key].bottle);assert.equal(holders.length,1);const h=holders[0];
 assert.equal(await Bottle.countDocuments({status:'held'}),1);const praiseReq={id:33301,module:13,...req(h)};out=ack(await activity.handleActivityOperate(praiseReq,h,1));assert.equal(out.result,0);await reload(h);assert(ack(await activity.handleActivityOperate(praiseReq,h,1)).replayed);assert.equal(h.player.items[216],3);
 assert.equal(ack(await op(h,{id:33301,module:14})).result,0);await reload(h);assert.equal(await Bottle.countDocuments({status:'returned'}),1);assert(h.player.items[216]>=8);steps.push('bottle-atomic-two-way-content-praise-return-replay');
 const outboxReq={id:33301,module:10,content:'Khôi phục sau DB timeout',...req(a)},update=Bottle.updateOne;let injected=true;
 Bottle.updateOne=function(...args){if(injected){injected=false;return Promise.reject(Error('QA_BOTTLE_WRITE_FAIL'));}return update.apply(this,args);};
 await assert.rejects(()=>activity.handleActivityOperate(outboxReq,a,1));Bottle.updateOne=update;await reload(a);const count=a.player.items[214];assert(ack(await activity.handleActivityOperate(outboxReq,a,1)).replayed);assert.equal(a.player.items[214],count);assert.equal(await Bottle.countDocuments({owner:a.userId}),2);steps.push('durable-bottle-outbox-recovery');
 now=Date.parse(rules.schedule.anchor)+14*86400000+3600000;for(const s of [a,b,c])schedule.sync(s.player);const w=schedule.active(a.player,33201);a.player.fishInfo.eventStats[w.key].score=100;b.player.fishInfo.eventStats[w.key].score=300;c.player.fishInfo.eventStats[w.key].score=200;await Promise.all([persist(a),persist(b),persist(c)]);const rank=await events.rank(a.player,w);assert.equal(rank.rank,3);assert.equal(rank.ranklist[0].dbid,b.userId);
 now=w.endTime+61000;await events.heartbeat(a);await reload(a);assert(a.player.fishInfo.eventStats[w.key].settled);const inventory=JSON.stringify(a.player.items);now+=16000;await events.heartbeat(a);assert.equal(JSON.stringify(a.player.items),inventory);steps.push('rank-real-mongo-order-and-once-settlement');
 success=true;
 }finally{
 // Exact ownership cleanup; leave an empty QA database, never issue dropDatabase.
 await Player.deleteMany({userId:{$in:owned}});await Bottle.deleteMany({owner:{$in:owned}});const remaining={players:await Player.countDocuments({userId:{$in:owned}}),bottles:await Bottle.countDocuments({owner:{$in:owned}})};assert.deepEqual(remaining,{players:0,bottles:0});await mongoose.disconnect();Date.now=realDateNow;
 const out={result:success?'PASS':'FAIL',db,steps,cleanup:remaining,productionWrites:0};fs.writeFileSync(path.join(root,'mongo-integration.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
