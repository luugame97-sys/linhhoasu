'use strict';
// Dedicated QA profiles and guild only. No existing player's inventory is changed.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const APP='/linhhoasu/lhs/newServer',WS=require(APP+'/node_modules/ws'),{MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const sid=Number(process.argv[2]);assert([1001,1002].includes(sid));
const token='qafarm_'+crypto.randomBytes(6).toString('hex'),gid=800000000+crypto.randomInt(99999999);
const clients=[],ids=[],playerIds=[];let db,insertedGuild=false;const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function link(i){let ws,seq=50000,pending=new Map(),pushes=[];return {
 async open(){ws=new WS('ws://127.0.0.1:'+(sid===1001?9200:9201),{headers:{Origin:'http://127.0.0.1'}});ws.on('message',raw=>{
  const b=Buffer.from(raw);let arr;try{arr=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}catch{return;}
  for(const p of Array.isArray(arr)?arr:[arr]){const job=pending.get(p.msgUid);if(job&&job.tag===p.tag){clearTimeout(job.timer);pending.delete(p.msgUid);job.resolve(p.data);}else pushes.push(p);}
 });await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return this.rpc(1,{platformuid:token+'_'+i,serverid:sid,firstName:'FQ'+i+token.slice(-4)});},
 rpc(tag,data){return new Promise((resolve,reject)=>{const uid=++seq;pending.set(uid,{tag,resolve,reject,timer:setTimeout(()=>{pending.delete(uid);reject(Error('QA_TIMEOUT_'+tag));},15000)});ws.send(Pack(tag,data,uid));});},
 async close(){if(ws){ws.close();await Promise.race([new Promise(r=>ws.once('close',r)),pause(1000)]);if(ws.readyState!==3)ws.terminate();}for(const j of pending.values()){clearTimeout(j.timer);j.reject(Error('QA_CLOSED'));}pending.clear();await pause(800);},get pushes(){return pushes;}
};}
(async()=>{await mongo.connect();db=mongo.db('lhs_s'+sid);let result;
 try{
  const template=await db.collection('players').findOne({isBot:true});assert(template);const now=Date.now();
  for(let i=0;i<3;i++){
   const base=token+'_'+i,userId=base+'_s'+sid,playerId=crypto.randomBytes(12).toString('hex');ids.push(userId);playerIds.push(playerId);
   const p=structuredClone(template);for(const f of ['_id','__v','inviteCode','botWorker'])delete p[f];
   Object.assign(p,{userId,playerId,accountId:'',name:'FQ'+i+token.slice(-4),serverId:sid,isBot:false,level:i===1?200:60,
    roleInfo:{kungfuId:4,subJob:1},guildInfo:{guildId:gid,identity:2},guildId:gid,
    items:{29:10,32:10,33:100,34:0,4:0,104:3,102:2},currencies:{diamond:0,silver:0,gold:0},other_attr_info:{},taskInfo:{},
    farmInfo:{lv:25,exp:0,blockInfo:[0,1].map(index=>({index,seedId:29,rewardId:38,curCount:40,finishTime:now-600000,robber:null})),buildLv:{1:2,2:2,3:2},cookInfo:{0:{index:0,finishTime:now-1000,reward:5,time:30},1:{index:1,finishTime:now-1000,reward:5,time:30}}},
    rechargeInfo:{records:[],monthCards:{11000012:now+86400000}},shopInfo:{buyRecords:{}}});
   await db.collection('players').insertOne(p);clients.push(link(i));
  }
  await db.collection('guilds').insertOne({guildId:gid,name:token,leaderId:ids[0],members:ids.map((userId,i)=>({userId,playerId:playerIds[i],name:'QA',identity:i?2:0})),assistRecords:[],level:1,createTime:now});insertedGuild=true;
  for(const c of clients)await c.open();const [owner,helper,robber]=clients;
  assert.equal((await owner.rpc(2410,{index:1})).result,0);
  const before=await db.collection('players').findOne({userId:ids[0]});const req=await owner.rpc(2414,{index:1});assert.equal(req.result,0,JSON.stringify(req));
  const p={playerId:playerIds[0],type:2,index:1,uid:req.record.uid};assert.equal((await helper.rpc(1519,p)).result,1);
  assert.equal((await helper.rpc(1519,p)).result,1);const after=await db.collection('players').findOne({userId:ids[0]});assert.equal(before.farmInfo.buildUpgrade[1]-after.farmInfo.buildUpgrade[1],15000);
  assert.equal((await robber.rpc(2402,{dbid:playerIds[0],index:0,count:1})).result,0);
  const fight=await owner.rpc(2415,{index:0,dbid:playerIds[2]});assert.equal(fight.result,0);
  assert.equal((await helper.rpc(1519,{playerId:playerIds[0],type:3,index:0,uid:fight.record.uid})).result,1);
  const fightPush=helper.pushes.filter(p=>p.tag===1517).at(-1);assert(fightPush?.data?.fightResult);const win=!!fightPush.data.fightResult.win;
  const fought=await db.collection('players').findOne({userId:ids[0]});assert.equal(!!fought.farmInfo.blockInfo.find(b=>b.index===0).robber,!win);
  assert.equal((await owner.rpc(2429,{enabled:true,harvest:true,cook:true,seed:29})).result,0);await owner.close();await pause(2000);await owner.open();
  const offline=await db.collection('players').findOne({userId:ids[0]});assert(offline.farmInfo.offlineManager.lastSettlement.harvests>=1);assert(offline.farmInfo.cacheOffline.some(r=>r.id===34));
  assert.equal((await owner.rpc(2424,{})).result,0);const claimed=await db.collection('players').findOne({userId:ids[0]});assert(claimed.items[34]>=40);
  await owner.close();await owner.open();const reloaded=await db.collection('players').findOne({userId:ids[0]});assert.equal(reloaded.items[34],claimed.items[34]);
  result={result:'PASS',sid,buildHelp:true,replay:true,actualFight:true,win,offlineSettlement:true,cacheClaim:true,relog:true,realPlayerWrites:0};
 }finally{
  for(const c of clients)await c.close();await pause(1000);
  for(let i=0;i<ids.length;i++){await db.collection('players').deleteOne({userId:ids[i],playerId:playerIds[i]});await db.collection('mails').deleteMany({userId:ids[i]});}
  if(insertedGuild)await db.collection('guilds').deleteOne({guildId:gid,name:token});
  assert.equal(await db.collection('players').countDocuments({userId:{$in:ids}}),0);await mongo.close();
 }
 console.log(JSON.stringify({...result,qaCleaned:true}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
