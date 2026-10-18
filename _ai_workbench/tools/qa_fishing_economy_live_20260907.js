'use strict';
// Disposable QA player only, never spends user funds or invokes payment provider.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const APP='/linhhoasu/lhs/newServer',WS=require(APP+'/node_modules/ws'),{MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const sid=Number(process.argv[2]);assert([1001,1002].includes(sid));const base='qafeco_'+crypto.randomBytes(7).toString('hex'),userId=base+'_s'+sid,playerId=crypto.randomBytes(12).toString('hex'),name='EQ'+base.slice(-6);
const c=new MongoClient('mongodb://127.0.0.1:27017'),pending=new Set();let ws,seq=60000,revision=0,db,inserted=false;const delay=ms=>new Promise(r=>setTimeout(r,ms));
function recv(tag,uid){const p=new Promise((resolve,reject)=>{const w={tag,uid,resolve,reject,t:setTimeout(()=>{pending.delete(w);reject(Error('ECONOMY_TIMEOUT_'+tag));},15000)};pending.add(w);});p.catch(()=>{});return p;}
async function rpc(tag,data){const id=++seq,p=recv(tag,id);ws.send(Pack(tag,data,id));const r=await p;if(r.balanceRevision!=null)revision=r.balanceRevision;return r;}
function request(){return{requestId:'eco_'+crypto.randomBytes(10).toString('hex'),expectedRevision:revision};}
async function open(){ws=new WS('ws://127.0.0.1:'+(sid===1001?9200:9201),{headers:{Origin:'http://127.0.0.1'}});ws.on('message',raw=>{const b=Buffer.from(raw);let all;try{all=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const r of Array.isArray(all)?all:[all])for(const w of [...pending])if(r.tag===w.tag&&(w.uid==null||w.uid===r.msgUid)){clearTimeout(w.t);pending.delete(w);w.resolve(r.data);}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const init=recv(500),acts=recv(1700,0);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverid:sid,serverId:sid,firstName:name})).result,0);const p=await init,a=await acts;assert.equal(p.name,name);revision=p.fishInfo.balanceRevision||0;return{p,a};}
async function close(){if(ws&&ws.readyState!==WS.CLOSED){const done=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([done,delay(1500)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}await delay(900);}
(async()=>{await c.connect();db=c.db('lhs_s'+sid);let result;try{
 const tpl=await db.collection('players').findOne({isBot:true});assert(tpl);delete tpl._id;delete tpl.__v;delete tpl.inviteCode;delete tpl.botWorker;
 Object.assign(tpl,{userId,playerId,name,serverId:sid,isBot:false,level:116,exp:0,accountId:'',guildId:'',guildInfo:{},arenaScore:0,rechargeInfo:{area:1,monthCards:{},monthCardRecords:{},records:[],totalRecharge:0},shopInfo:{pack:[],chainPack:[],buyRecords:{}},items:{4:5000,65:200,68:0,69:0,119:0,94501:66,5543:100,1001:1000000},currencies:{diamond:0,silver:0,gold:0},systemUnlockInfo:{unlockedSystem:[215,221,223,329],rewardedSystem:[],settings:{}},activityInfo:{datas:[]},taskInfo:{},fishInfo:{level:28,scene:1,food:5543,foodBag:[5543],rodId:5901,rodRank:1,rodLevel:1,raftId:6201,raftRank:1,raftLevel:1,slots:{},pics:{},fishTypeQualityPic:{},fishUidSeq:9000,fishResult:{time:0,fishInfos:[],escapes:[],items:[]}}});
 await db.collection('players').insertOne(tpl);inserted=true;
 let initial=await open();assert.equal((await db.collection('players').findOne({userId})).items[94501],66);
 const opened=await rpc(1300,{index:94501,count:66});assert.equal(opened.result,0);assert(!opened.rewardInfo.items.some(r=>r.id===94501));assert.equal((await db.collection('players').findOne({userId})).items[94501],0);assert.notEqual((await rpc(1300,{index:94501,count:1})).result,0);
 const before=(await db.collection('players').findOne({userId})).currencies.diamond;assert.equal((await rpc(1230,{id:11001401,multi:1})).result,0);assert.equal((await db.collection('players').findOne({userId})).currencies.diamond-before,300000);
 const active=initial.a.datas.find(r=>r.id>=33000&&r.id<34000);assert(active);assert.equal((await rpc(4050,{id:101})).result,0);
 let sales=0,coins=0;
 for(let i=0;i<20&&!coins;i++){
  if(i)await delay(1300);const req={count:3,...request()},caught=await rpc(4000,req);assert.equal(caught.result,0);const ids=caught.fishResult.fishInfos.map(f=>f.uid);assert(ids.length>=3);
  const dealt=await rpc(4008,{dealMap:{2:ids}});assert.equal(dealt.result,0);sales+=ids.length;
  let saved=await db.collection('players').findOne({userId});coins=saved.items[119]||0;
  await rpc(4008,{dealMap:{2:ids}});assert.equal((await db.collection('players').findOne({userId})).items[119]||0,coins);
 }
 assert(coins>0,'NO_EVENT_DROP_IN_60_SALES');
 await close();let saved=await db.collection('players').findOne({userId});const eventKey=Object.keys(saved.fishInfo.eventStats).find(k=>k.startsWith('F'+active.id+'_'));assert(eventKey);
 // This is our disconnected QA row only: seed a ticket for real mini-game claim.
 await db.collection('players').updateOne({userId,playerId},{$set:{['fishInfo.eventStats.'+eventKey+'.games.1']:1}});initial=await open();
 const miniReq={id:active.id,module:1,index:1,...request()},mini=await rpc(1700,miniReq);if(mini.result!==0){const diag=await db.collection('players').findOne({userId});throw Error('MINIGAME_DIAGNOSTIC '+JSON.stringify({response:mini,requestedRevision:miniReq.expectedRevision,actualRevision:diag.fishInfo.balanceRevision,tickets:diag.fishInfo.eventStats[eventKey].games,loadedTickets:initial.a.datas.find(r=>r.id===active.id)?.records}));}assert(!mini.rewardInfo.items.some(r=>r.id===94501));assert.equal((await db.collection('players').findOne({userId})).items[94501],0);assert((await rpc(1700,miniReq)).replayed);
 await close();const loaded=await open();saved=await db.collection('players').findOne({userId});assert.equal(saved.items[119],coins);assert.equal(saved.items[94501],0);
 result={result:'PASS',serverId:sid,legacy66Opened:true,newCarpAutoOpened:true,miniReplay:true,packageYuanbao:300000,eventSales:sales,eventCoins:coins,saleReplayNoDuplicate:true,persistentRelog:true,realPlayerWrites:0};
}finally{await close();for(const w of pending){clearTimeout(w.t);w.reject(Error('QA_CLEANUP'));}pending.clear();if(inserted){await db.collection('players').deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});await db.collection('fishingbottles').deleteMany({owner:userId});await delay(500);assert.equal(await db.collection('players').countDocuments({userId}),0);}await c.close();}
fs.writeFileSync(path.join(__dirname,'../qa-economy-'+sid+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
