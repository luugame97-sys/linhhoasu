'use strict';
// Actual SDK + production WS protocol. Both combatants are owned temporary QA
// documents; no real player is attacked, rewarded, or edited.
const APP='/linhhoasu/lhs/newServer';
const assert=require('assert/strict'),crypto=require('crypto'),http=require('http');
const {MongoClient,ObjectId}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt');
const WS=require(APP+'/node_modules/ws'),Redis=require(APP+'/node_modules/ioredis');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec'),{packRequest,unpackResponse}=require(APP+'/src/protocol/ReqCodec');
const sid=Number(process.argv[2]),preflight=process.argv.includes('--preflight');assert([1001,1002,1003,1004].includes(sid));
const powerMode=process.argv.includes('--power');
const parallelMode=process.argv.includes('--parallel');
let nativePower;
if(powerMode){
 const fs=require('fs'),vm=require('vm'),lp=require.resolve(APP+'/src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
 const source=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js','utf8'),fn=source.match(/calPowerByAttr=(function\(t\)\{[^}]+\}return Math\.ceil\(i\)\})/);assert(fn);
 nativePower=vm.runInNewContext('('+fn[1]+')',{Y:{Config:require(APP+'/src/services/ConfigService').loadAllTables()}});
}
const cfg=require(APP+'/ecosystem.config.js').apps.find(p=>p.name==='lhs-s1001').env;
const redis=new Redis(cfg.REDIS_URL,{keyPrefix:cfg.AUTH_REDIS_PREFIX,maxRetriesPerRequest:1});
const scoped=new Redis(cfg.REDIS_URL,{keyPrefix:'s'+sid+':',maxRetriesPerRequest:1});
const db=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000});
const suffix=crypto.randomBytes(6).toString('hex'),accountId='qa_cpt_'+suffix,password='Qa7_'+crypto.randomBytes(12).toString('hex');
const tokens=new Set(),receiptKeys=new Set(),pending=new Set(),packets=[];let ws,uid=84000,auth,created=false,heartbeat,owned,victim,phase='init';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function progress(value){phase=value;console.log('QA_PROGRESS='+JSON.stringify({serverId:sid,phase}));}
function sdk(){return new Promise((resolve,reject)=>{const body=packRequest(2820,{uid:accountId,token:password,serverId:sid});
 const req=http.request({host:'127.0.0.1',port:81,path:'/gameMsg.do',method:'POST',headers:{Host:'103.116.105.154:81','Content-Type':'application/octet-stream','Content-Length':body.length}},res=>{
  const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{try{const r=unpackResponse(Buffer.concat(chunks));if(r.userToken)tokens.add(r.userToken);resolve(r);}catch(e){reject(e);}});});
 req.on('error',reject);req.setTimeout(12000,()=>req.destroy(Error('SDK_TIMEOUT')));req.end(body);});}
function receive(tag,msgUid){const promise=new Promise((resolve,reject)=>{const w={tag,msgUid,resolve,reject,t:setTimeout(()=>{pending.delete(w);reject(Error('RPC_TIMEOUT_'+tag+' phase='+phase));},45000)};pending.add(w);});promise.catch(()=>{});return promise;}
async function rpc(tag,data){const seq=++uid,p=receive(tag,seq);
 if(tag===2300&&[2,3].includes(data?.type)&&data.requestId&&owned){const raw=`fight:${sid}:${owned.playerId}:${data.requestId}:${data.logUid||data.enemyid||''}:${data.challengeVersion||''}`;receiptKeys.add(crypto.createHash('sha256').update(raw).digest('hex'));}
 ws.send(Pack(tag,data,seq));return p;}
async function login(){
 const end=Date.now()+40000;do{auth=await sdk();if(auth.ret===0||auth.code!=='SERVER_NODE_UNAVAILABLE'||Date.now()>=end)break;await wait(1000);}while(true);
 assert.equal(auth.ret,0,'SDK_AUTH:'+(auth.code||'NO_CODE'));assert.equal(auth.userId,owned.userId);
 const snapshot=receive(500);ws=new WS('ws://127.0.0.1:81/'+(sid===1001?'ws':'ws-s'+(sid-1000)),{headers:{Origin:'http://127.0.0.1'}});
 ws.on('message',raw=>{try{const b=Buffer.from(raw),rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));for(const p of Array.isArray(rows)?rows:[rows]){packets.push(p);for(const w of [...pending])if(p.tag===w.tag&&(w.msgUid==null||w.msgUid===p.msgUid)){clearTimeout(w.t);pending.delete(w);w.resolve(p.data);}}}catch(e){for(const w of [...pending]){clearTimeout(w.t);pending.delete(w);w.reject(e);}}});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 const r=await rpc(1,{userid:auth.userId,userToken:auth.userToken,platformuid:auth.uid,serverid:sid});assert.equal(r.result,0);
 heartbeat=setInterval(()=>{if(ws?.readyState===WS.OPEN)ws.send(Pack(11,{},++uid));},5000);heartbeat.unref();return snapshot;
}
async function close(){clearInterval(heartbeat);if(ws&&ws.readyState!==WS.CLOSED){const closed=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([closed,wait(800)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}await wait(700);}
async function main(){
 await db.connect();const accounts=db.db('lhs_s1001').collection('accounts'),players=db.db('lhs_s'+sid).collection('players');
 const result={result:'FAIL',serverId:sid,preflight,realPlayerWrites:0,checks:[]};
 try{
  assert.equal(await accounts.countDocuments({accountId}),0);
  await accounts.insertOne({accountId,passwordHash:await bcrypt.hash(password,10),status:1,authVersion:1,roles:[],activeRoleByServer:{},createdAt:new Date()});created=true;
  progress('sdk-create-owned-role');auth=await sdk();assert.equal(auth.ret,0,'SDK_SEED:'+(auth.code||'NO_CODE'));
  owned=await players.findOne({accountId,userId:auth.userId});assert(owned&&Number(owned.serverId)===sid,'QA_ROLE_IDENTITY');
  victim=JSON.parse(JSON.stringify(owned));victim._id=new ObjectId();victim.userId='qa_cpt_victim_'+suffix;victim.playerId=victim.userId;
  victim.name='QA Enemy '+suffix.slice(0,5);victim.qaOwner=accountId;victim.isBot=true;victim.managedBot=true;victim.level=120;
  victim.arenaProtectUntil=0;victim.arenaScore=1000;victim.arenaLoglist=[];victim.arenaReceiptLedger=[];victim.createdAt=new Date();victim.updatedAt=new Date();
  await players.insertOne(victim);
  const lossUid=1900000000,day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const patch={qaOwner:accountId,level:120,arenaScore:0,arenaDayKey:day,arenaDailyCount:0,arenaProtectUntil:Date.now()+3600000,
   'items.10':20,'items.110':20,'currencies.silver':10000,arenaLoglist:[{uid:lossUid,fightId:'qa_seeded_loss_'+suffix,dbid:String(victim._id),name:victim.name,
    level:120,avatar:11300,avatarFrame:-1,kungfuId:4,score:-10,scorechange:-10,revenge:0,logtime:Math.floor(Date.now()/1000)}]};
  const cas=await players.updateOne({_id:owned._id,accountId,userId:owned.userId,updatedAt:owned.updatedAt},{$set:patch});assert.equal(cas.modifiedCount,1,'QA_SEED_CAS');
  progress('native-login');await login();const read=()=>players.findOne({_id:owned._id,accountId,qaOwner:accountId});
  const info=await rpc(2600,{});assert(Array.isArray(info.challengelist));result.checks.push('SDK login and Arena info');
  if(powerMode){
   assert(info.ranklist.length>0);assert(info.ranklist.every(r=>r.powerUnit==='native-weighted-point'));
   assert(info.challengelist.every(r=>r.powerUnit==='native-weighted-point'));
   const profile=await rpc(500,{playerId:String(victim._id)});assert.equal(profile.result,0);
   assert.equal(profile.power,nativePower(profile.totalAttr));assert(profile.power>profile.powerScore);
   result.checks.push('rank/top/challenge use native display unit','profile power matches native attr formula');
  }
  if(preflight){
   const before=await read(),old=await rpc(2300,{type:3,enemyid:String(lossUid),requestId:'qa_baseline_'+suffix});
   assert.equal(old.result,-1);assert.equal(old.code,'ARENA_TARGET_STALE');assert.equal((await read()).items[10],before.items[10]);
   result.checks.push('baseline revenge outside list reproduced without debit');
  }
  if(!preflight){
   if(parallelMode){
    const schedule=await rpc(6199,{});assert.equal(schedule.result,0);assert.equal(schedule.version,'cross-parallel-v2');
    const row=schedule.events.crossArena;result.calendar=schedule;
    assert.equal(row.cycle.event,'crossArena');assert.equal(schedule.events.crossRival.cycle.key,'C0_1789318800000');assert.equal(schedule.events.topArena.open,false);
    const before=await read(),cross=await rpc(5000,{});
    if(row.open){
     assert.equal(cross.result,0,JSON.stringify(cross));assert.equal(cross.cycleKey,row.cycle.key);
     const target=cross.challengelist.find(r=>r.isRobot);assert(target,'OWNED_QA_ROBOT_REQUIRED');
     const request={type:16,enemyid:target.dbid,cycleKey:cross.cycleKey,challengeVersion:cross.challengeVersion,requestId:'qa_parallel_'+suffix};
     const fight=await rpc(2300,request);assert.equal(fight.result,0,JSON.stringify(fight));assert.equal(fight.fightResult.entitys.length,2);
     const after=await read();assert.equal(after.items[110],before.items[110]-1);
     const retry=await rpc(2300,request);assert.equal(retry.result,0);assert(retry.recovered);assert.deepEqual((await read()).items,after.items);
     result.checks.push('live independent CrossArena season','owned QA vs configured robot','Cross ticket/reward Mongo commit and no duplicate replay');
    }else{
     assert.equal(cross.result,-1);assert.equal(cross.code,'CROSS_ARENA_'+row.reason);assert.equal((await read()).items[110],before.items[110]);
     result.checks.push('native age/pool gate retained without debit');
    }
    const blocked=await rpc(2350,{type:1,enemyid:'1'});assert.equal(blocked.result,1);assert(blocked.code.startsWith('CROSS_EVENT_'));
    assert.equal((await read()).topArenaInfo,undefined);result.checks.push('closed TopArena backend denies mutation','all three server calendars read over authenticated WS');
   }else{
    const cross=await rpc(5000,{});assert.equal(cross.result,-1);assert.equal(cross.code,sid===1004?'CROSS_ARENA_SERVER_NOT_IN_POOL':'CROSS_ARENA_CLOSED');
    const blocked=await rpc(2300,{type:16,enemyid:'1',requestId:'qa_closed_'+suffix});assert.equal(blocked.result,-1);assert.equal(blocked.enemyid.length,24);
    result.checks.push('CrossArena live cycle/server gate and old-client safe refusal');
   }
   progress('owned-revenge-fight');const before=await read(),request={type:3,enemyid:String(lossUid),requestId:'qa_revenge_'+suffix};
   const first=await rpc(2300,request);assert.equal(first.result,0,'FIGHT:'+first.code);assert.equal(first.fightResult.entitys.length,2);assert.equal(first.fightResult.entitys[1].dbid,String(victim._id));
   if(powerMode){assert.equal(first.fightResult.entitys[0].showInfo.power,nativePower(first.fightResult.atkAttr));assert.equal(first.fightResult.entitys[1].showInfo.power,nativePower(first.fightResult.defAttr));result.checks.push('both battle cards native raw power');}
   const after=await read();assert.equal(after.items[10],before.items[10]-1);assert.equal(after.arenaDailyCount,before.arenaDailyCount+1);
   const same=await rpc(2300,request);assert.equal(same.result,0);assert(same.recovered);assert.equal(same.fightResult.entitys.length,2);assert(same.fightResult.events.length);
   if(powerMode){assert.equal(same.fightResult.entitys[1].showInfo.power,nativePower(same.fightResult.defAttr));result.checks.push('replayed battle retains full power');}
   assert.deepEqual((await read()).items,after.items);assert.deepEqual((await read()).currencies,after.currencies);
   result.checks.push('WS revenge resolves owned opponent outside list','one ticket/one count in Mongo','complete retry response without extra payout');
   await close();progress('relogin-replay');await login();const replay=await rpc(2300,request);assert(replay.recovered);assert.equal(replay.fightResult.entitys.length,2);assert.equal((await read()).items[10],after.items[10]);
   const logs=await rpc(2600,{});assert(logs.loglist.some(row=>String(row.dbid)===String(victim._id)));
   result.checks.push('SDK reconnect preserves committed outcome and log');
  }
  result.result='PASS';
 }finally{
  progress('cleanup');await close();for(const w of [...pending]){clearTimeout(w.t);pending.delete(w);w.reject(Error('QA_CLOSED'));}
  if(created){
   const rows=await players.find({accountId},{projection:{_id:1,userId:1,playerId:1,arenaReceiptLedger:1,qaOwner:1}}).toArray();
   assert(rows.every(p=>p.qaOwner===accountId||p.userId===owned?.userId||p.userId===auth?.userId),'QA_CLEANUP_OWNERSHIP');
   const pids=rows.map(p=>p.playerId),ids=rows.map(p=>String(p._id));
   if(parallelMode){
    const shared=db.db('lhs_s1001');
    await shared.collection('crossevententries').deleteMany({serverId:sid,playerId:{$in:pids},userId:{$in:rows.map(p=>p.userId)}});
    await shared.collection('crossarenaactions').deleteMany({serverId:sid,playerId:{$in:pids},userId:{$in:rows.map(p=>p.userId)}});
    assert.equal(await shared.collection('crossevententries').countDocuments({serverId:sid,playerId:{$in:pids}}),0);
    assert.equal(await shared.collection('crossarenaactions').countDocuments({serverId:sid,playerId:{$in:pids}}),0);
   }
   await db.db('lhs_s'+sid).collection('arenafightlogs').deleteMany({attackerId:{$in:pids}});
   for(const p of rows){
    for(const rank of ['arena','tower','crossArena','crossRival','topArena'])await scoped.zrem('rank:'+rank,p.playerId);
    for(const r of p.arenaReceiptLedger||[])if(r.id)await scoped.del('arena:receipt:'+r.id);
    await db.db('lhs_s'+sid).collection('mails').deleteMany({userId:p.userId});
    await players.deleteOne({_id:p._id,accountId,userId:p.userId});
   }
   for(const token of tokens)await redis.del('auth:session:'+token);await redis.del('auth:account:'+accountId);
   for(const key of receiptKeys)await scoped.del('arena:receipt:'+key);
   await accounts.deleteOne({accountId});assert.equal(await accounts.countDocuments({accountId}),0);assert.equal(await players.countDocuments({accountId}),0);
   assert.equal(await db.db('lhs_s'+sid).collection('arenafightlogs').countDocuments({attackerId:{$in:pids}}),0);result.qaResidue=0;
  }
  await scoped.quit();await redis.quit();await db.close();
 }
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
