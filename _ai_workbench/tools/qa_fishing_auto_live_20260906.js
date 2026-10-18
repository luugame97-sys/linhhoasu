'use strict';
// Only this invocation's unique QA role is created/changed/deleted.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',WebSocket=require(APP+'/node_modules/ws');
const {MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const serverId=Number(process.argv[2]);assert([1001,1002].includes(serverId));const port=serverId===1001?9200:9201;
const c=new MongoClient('mongodb://127.0.0.1:27017'),base='qa_fish_auto_'+crypto.randomBytes(8).toString('hex'),userId=base+'_s'+serverId,playerId=crypto.randomBytes(12).toString('hex');
const setting=JSON.parse(fs.readFileSync(path.join(__dirname,'../qa-auto-settings.json'),'utf8')).enabledBase64;
let ws,seq=46000,revision=0,inserted=false,state;const messages=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function receive(tag,msgUid){return new Promise((r,j)=>{const timer=setTimeout(()=>{off();j(Error('AUTO_QA_TIMEOUT_'+tag));},15000);function on(p){if(p.tag===tag&&(msgUid==null||p.msgUid===msgUid)){off();r(p.data);}}function off(){clearTimeout(timer);ws.off('qa',on);}ws.on('qa',on);});}
async function rpc(tag,data){const id=++seq,next=receive(tag,id);ws.send(Pack(tag,data,id));const out=await next;if(out?.balanceRevision!=null)revision=out.balanceRevision;return out;}
async function close(){if(!ws)return;const socket=ws;socket.close();await Promise.race([new Promise(r=>socket.once('close',r)),wait(3000)]);if(socket.readyState!==WebSocket.CLOSED)socket.terminate();await wait(1200);}
async function open(){ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:30000});ws.on('message',raw=>{const b=Buffer.from(raw);let rows;try{rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(rows)?rows:[rows]){messages.push(p);ws.emit('qa',p);}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const init=receive(500);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverid:serverId,serverId,firstName:'QA Fishing Auto'})).result,0);const p=await init;state=p.fishInfo;revision=Number(state.balanceRevision||0);return p;}
const entity=(id,uid,type,quality,value,extra={})=>({id,uid,type,quality,multi:10000,attrs:[{type:1,level:1,value}],skills:[],tempSkills:{},lock:0,dead:0,...extra});
function req(){return{autoPower:true,autoPowerVersion:1,uids:state.fishResult.fishInfos.map(r=>r.uid),requestId:'auto_live_'+crypto.randomBytes(7).toString('hex'),expectedRevision:revision};}
(async()=>{await c.connect();const db=c.db('lhs_s'+serverId),players=db.collection('players');try{
 const p=await players.findOne({isBot:true});assert(p);delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;
 const best=entity(5014,2003,1,6,9000),old=entity(5011,1001,1,2,1000),locked=entity(5021,1002,2,2,1000,{lock:1}),held=entity(5022,2004,2,3,6000);
 Object.assign(p,{userId,playerId,name:'QA Fishing Auto',accountId:'',isBot:false,guildId:'',guildInfo:{},serverId,level:116,
  items:{68:100,69:10,65:20,135:20,94821:1},currencies:{diamond:0,silver:0,gold:0},
  systemUnlockInfo:{unlockedSystem:[215,221,223],rewardedSystem:[],settings:{}},
  fishInfo:{level:10,scene:1,rodId:5901,rodRank:1,rodLevel:1,rodExp:0,raftId:6201,raftRank:1,raftLevel:0,raftExp:0,rodAttrs:[],rodTempAttrs:[],fishUidSeq:7000,
   slots:{1:old,2:locked},pics:{},fishTypeQualityPic:{},fishResult:{time:0,fishInfos:[entity(5012,2001,1,3,5000),entity(5013,2002,1,4,3000),best,held],escapes:[],items:[],fashion:[]},
   catchResult:{time:0,infos:[],escapes:[],items:[],sailItems:{}}}});
 await players.insertOne(p);inserted=true;await open();
 const initialReq=req(),got=await rpc(4008,initialReq);assert.equal(got.result,0);assert.deepEqual(got.soldUids.sort(),[1001,2001,2002]);assert.equal(got.equipped[0].uid,2003);assert.equal(got.held[0].uid,2004);
 let saved=await players.findOne({userId,playerId});assert.deepEqual(saved.fishInfo.slots[1],best);assert.deepEqual(saved.fishInfo.slots[2],locked);assert.deepEqual(saved.fishInfo.fishResult.fishInfos,[held]);assert.equal(saved.items[68],109);
 assert.equal(saved.fishInfo.autoPowerHistory[0].sold.length,3);assert((await rpc(4008,initialReq)).replayed);assert.equal((await players.findOne({userId,playerId})).items[68],109);
 const settingAck=await rpc(10002,{id:2,value:setting});assert.equal(settingAck.result,0);assert.equal(settingAck.settings['2'],setting);
 await close();const relog=await open();assert.equal(relog.systemUnlockInfo.settings['2'],setting);assert.equal(state.slots[1].uid,2003);assert.equal(state.fishResult.fishInfos[0].uid,2004);assert.equal(state.autoPowerHistory,undefined);assert.equal(state.balanceReceipts,undefined);assert((await rpc(4008,initialReq)).replayed);
 // Explicit QA-only unlock and manual sale clears the protected fixture before a real cast.
 assert.equal((await rpc(4009,{type:2,lock:0})).result,0);assert.equal((await rpc(4008,{dealMap:{2:[2004]},integrityVersion:1})).result,0);
 const caught=await rpc(4000,{count:1});assert.equal(caught.result,0);state.fishResult=caught.fishResult;
 const realAuto=await rpc(4008,req());assert.equal(realAuto.result,0);
 // Interoperate with the existing shared balance revision, without touching paid users.
 assert.equal((await rpc(4012,{requestId:'wash_auto_'+crypto.randomBytes(6).toString('hex'),expectedRevision:revision})).result,0);
 assert.equal((await rpc(4063,{itemId:94821,count:1,requestId:'box_auto_'+crypto.randomBytes(6).toString('hex'),expectedRevision:revision})).result,0);
 await close();const again=await open();saved=await players.findOne({userId,playerId});assert.equal(again.systemUnlockInfo.settings['2'],setting);assert.equal(saved.items[65],19);assert.equal(saved.items[135],10);assert.equal(saved.items[94821],0);assert(saved.fishInfo.autoPowerHistory.length>=2);
 console.log(JSON.stringify({result:'PASS',serverId,serverSelectedBest:true,lowerSoldOnly:true,lockedProtected:true,settingBinaryRelog:true,salePreimageSaved:true,replayAfterRelog:true,realCatchAuto:true,washBoxInterop:true,dailyClaimActions:0,nativeVisual:false}));
 }finally{await close();if(inserted){await players.deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});await wait(600);assert.equal(await players.countDocuments({userId,playerId}),0);}await c.close();console.error('AUTO_QA_CLEANUP '+serverId+' remaining=0');}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
