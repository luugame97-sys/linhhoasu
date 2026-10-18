'use strict';
// Only this run's unique QA rows are written or removed. Never repair player fish.
const assert=require('assert/strict'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',WebSocket=require(APP+'/node_modules/ws');
const {MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const dbClient=new MongoClient('mongodb://127.0.0.1:27017');
const wait=ms=>new Promise(r=>setTimeout(r,ms));let ws,seq=22000;const checks=[];
const opens={};
function receive(tag,msgUid){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('FISH_QA_TIMEOUT_'+tag));},15000);function on(p){if(p.tag===tag&&(msgUid==null||p.msgUid===msgUid)){off();resolve(p);}}function off(){clearTimeout(timer);ws.off('qa',on);}ws.on('qa',on);});}
async function rpc(tag,data){const msgUid=++seq,p=receive(tag,msgUid);ws.send(Pack(tag,data,msgUid));return (await p).data;}
async function open(base,serverId,port){opens[serverId]=(opens[serverId]||0)+1;console.error('QA_OPEN '+serverId+' attempt '+opens[serverId]);ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:30000});ws.on('message',raw=>{const b=Buffer.from(raw);let decoded;try{decoded=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(decoded)?decoded:[decoded])ws.emit('qa',p);});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',e=>j(new Error('QA_OPEN_'+serverId+'_'+opens[serverId]+': '+e.message)));});const init=receive(500);assert.equal((await rpc(1,{platformuid:base,userid:base,userId:base,serverid:serverId,serverId,firstName:'QA Fish Integrity'})).result,0);return (await init).data;}
async function close(){if(!ws)return;const socket=ws;socket.close();await Promise.race([new Promise(r=>socket.once('close',r)),wait(5000)]);if(socket.readyState!==WebSocket.CLOSED)socket.terminate();await wait(1200);}
function entity(id,uid,value,multi){return{id,uid,type:1,quality:id===5018?9:2,multi,attrs:[{type:1,level:1,value}],skills:[0,702001],tempSkills:{0:700001},lock:0,dead:0};}
async function verify(serverId,port){
 const base='qa_fish_complete_'+crypto.randomBytes(9).toString('hex'),userId=base+'_s'+serverId,playerId=crypto.randomBytes(12).toString('hex');
 const db=dbClient.db('lhs_s'+serverId),players=db.collection('players');let inserted=false;
 const old=entity(5011,1001,1000,10000),fresh=entity(5018,2001,9000,19000);
 try{
  const p=await players.findOne({isBot:true});assert(p,'QA_TEMPLATE_MISSING');delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;
  const soulOld={id:7011,uid:4001,type:1,slotIndex:0,quality:2,multi:12500,minAddRate:[400,400,400,400,400],lock:0,dead:0};
  const soulNew={id:7012,uid:4002,type:1,slotIndex:0,quality:3,multi:14000,minAddRate:[500,500,500,500,500],lock:0,dead:0};
  const soulWeak={...soulOld,uid:4003,multi:11000};
  Object.assign(p,{userId,playerId,name:'QA Fish Complete',accountId:'',isBot:false,guildId:'',guildInfo:{},serverId,level:116,items:{65:100,68:100,69:100,70:2,338:2,6013:5,5512:2,5514:90,135:10,94821:1},currencies:{diamond:0,silver:0,gold:0},fishInfo:{level:3,scene:1,food:5512,foodBag:[5512,5514],slots:{1:old},fishResult:{time:0,fishInfos:[fresh],escapes:[],items:[],fashion:[]},fishUidSeq:5000,pics:{},fishTypeQualityPic:{},fishSoulSlots:{1:[soulOld]},catchResult:{time:0,infos:[soulNew,soulWeak],escapes:[],items:[],sailItems:{}}}});
  await players.insertOne(p);inserted=true;const login=await open(base,serverId,port);assert.equal(login.fishInfo.fishResult.fishInfos[0].uid,2001);
  const blocked=await rpc(4000,{count:1});assert.equal(blocked.result,1);
  const kept=await rpc(4008,{dealMap:{0:[2001]},integrityVersion:1});assert.equal(kept.result,0);assert.equal(kept.fishInfos[0].uid,1001);
  let stored=await players.findOne({userId,playerId});assert.deepEqual(stored.fishInfo.slots[1],fresh);assert.equal(stored.items[65],100);assert.equal(stored.fishInfo.pics[5018].multi,19000);
  await close();const relog=await open(base,serverId,port);assert.deepEqual(relog.fishInfo.slots[1],fresh);assert.equal(relog.fishInfo.fishResult.fishInfos[0].uid,1001);
  assert.equal((await rpc(4008,{dealMap:{2:[1001]},integrityVersion:1})).result,0);
  const caught=await rpc(4000,{count:3});assert.equal(caught.result,0);const next=caught.fishResult.fishInfos[0];assert(next.uid>2001);
  assert.deepEqual(caught.fishResult.baitUses,[5512,5512,5514]);assert.equal(caught.food,5514);assert.deepEqual(caught.foodBag,[5514]);
  assert.equal((await rpc(4008,{dealMap:{0:[next.uid]},integrityVersion:1})).result,0);
  stored=await players.findOne({userId,playerId});assert.equal(stored.items[65],97);assert.equal(stored.items[5512],0);assert.equal(stored.items[5514],89);assert.deepEqual(stored.fishInfo.slots[next.type],next);
  const emptyBag=await rpc(4007,{foodBag:[]});assert.equal(emptyBag.result,0);assert.equal(emptyBag.food,5501);assert.deepEqual(emptyBag.foodBag,[]);
  const orderId=stored.fishInfo.orders[0].id;
  const refreshed=await rpc(4020,{index:0,expectedId:orderId});assert.equal(refreshed.result,0);assert.notEqual(refreshed.id,orderId);
  assert.equal((await players.findOne({userId,playerId})).items[70],1);
  assert.equal((await rpc(4020,{index:0,expectedId:orderId})).reason,'FISH_ORDER_STALE');
  assert.equal((await players.findOne({userId,playerId})).items[70],1);
  const soulReply=await rpc(4061,{integrityVersion:2});assert.equal(soulReply.result,0);assert.equal(soulReply.reserveCount,2);
  stored=await players.findOne({userId,playerId});assert.deepEqual(stored.fishInfo.fishSoulSlots[1],[soulNew]);assert.deepEqual(stored.fishInfo.fishSoulReserve.map(x=>x.fish),[soulOld,soulWeak]);
  assert.equal((await rpc(4061,{integrityVersion:2})).reserveCount,2);
  assert.equal((await rpc(4005,{id:101,count:5})).result,0);assert.equal((await rpc(4006,{id:101})).result,0);
  const beforeReward=(await players.findOne({userId,playerId})).items[65];assert.equal((await rpc(4006,{id:101})).result,1);assert.equal((await players.findOne({userId,playerId})).items[65],beforeReward);
  assert.equal((await rpc(4022,{})).result,1);assert.equal((await rpc(4012,{})).result,1);assert.equal((await rpc(4063,{itemId:94821,count:1})).result,1);
  await close();const relog2=await open(base,serverId,port);assert.deepEqual(relog2.fishInfo.slots[next.type],next);assert.equal(relog2.fishInfo.shipLogs[101].record[0],5);
  assert.equal(relog2.fishInfo.food,5501);assert.deepEqual(relog2.fishInfo.foodBag,[]);assert.equal(relog2.fishInfo.fishSoulSlots[1][0].uid,4002);assert.equal(relog2.fishInfo.fishSoulReserveCount,2);assert.equal(relog2.fishInfo.fishSoulReserve,undefined);assert.equal(relog2.fishInfo.orders[0].id,refreshed.id);
  stored=await players.findOne({userId,playerId});assert.equal(stored.items[135],10);assert.equal(stored.items[94821],1);
  checks.push({serverId,result:'PASS',syntheticFullEntitySwap:true,realCatchPersisted:true,baitFifo2Plus1:true,emptyBagPersists:true,paidRefreshNoReplay:true,soulUpgradeAndReservePersists:true,closeRelogTwice:true,rewardReplayRejected:true,pendingProtected:true,heldItemsPreserved:true,nativeUI:false});
 }finally{
  await close();if(inserted){await players.deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});await wait(800);assert.equal(await players.countDocuments({userId,playerId}),0);}
 }
}
(async()=>{try{await dbClient.connect();await verify(1001,9200);await verify(1002,9201);console.log(JSON.stringify({result:'PASS',checks,cleanupRemaining:0,realPlayerChanges:0,compensation:false}));}finally{await dbClient.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
