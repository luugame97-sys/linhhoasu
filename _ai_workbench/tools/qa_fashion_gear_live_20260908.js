'use strict';
// Disposable protocol QA profile. Never loads/writes a real player's profile.
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const APP='/linhhoasu/lhs/newServer',WS=require(APP+'/node_modules/ws'),{MongoClient}=require(APP+'/node_modules/mongodb');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec');
const sid=Number(process.argv[2]);assert([1001,1002].includes(sid));
const base='qafgear_'+crypto.randomBytes(6).toString('hex'),userId=base+'_s'+sid,playerId=crypto.randomBytes(12).toString('hex');
const dbClient=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:10000});
const pending=new Set(),packets=[],requestIds=[];let ws,db,inserted=false,seq=77000;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function recv(tag,msgUid){const p=new Promise((resolve,reject)=>{const w={tag,msgUid,resolve,reject,t:setTimeout(()=>{pending.delete(w);reject(Error('QA_TIMEOUT_'+tag));},12000)};pending.add(w);});p.catch(()=>{});return p;}
async function rpc(tag,data){const uid=++seq,p=recv(tag,uid);ws.send(Pack(tag,data,uid));return p;}
async function connect(){
  ws=new WS('ws://127.0.0.1:'+(sid===1001?9200:9201),{headers:{Origin:'http://127.0.0.1'}});
  ws.on('message',raw=>{const b=Buffer.from(raw);let rows;try{rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}catch{return;}
    for(const row of Array.isArray(rows)?rows:[rows]){packets.push(row);for(const w of [...pending])if(w.tag===row.tag&&(w.msgUid==null||w.msgUid===row.msgUid)){clearTimeout(w.t);pending.delete(w);w.resolve(row.data);}}});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const info=recv(500);
  const auth=await rpc(1,{platformuid:base,userId:base,userid:base,serverid:sid,serverId:sid,firstName:'FQ'+base.slice(-6)});
  assert.equal(auth.result,0);return await info;
}
async function close(){if(ws&&ws.readyState!==WS.CLOSED){const end=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([end,delay(1000)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}await delay(800);}
const read=()=>db.collection('players').findOne({userId,playerId});
(async()=>{await dbClient.connect();db=dbClient.db('lhs_s'+sid);let result;
try{
 const template=await db.collection('players').findOne({isBot:true});assert(template,'NO_QA_TEMPLATE');
 delete template._id;delete template.__v;delete template.inviteCode;delete template.botWorker;
 Object.assign(template,{userId,playerId,name:'FQ'+base.slice(-6),serverId:sid,isBot:false,accountId:'',guildId:'',guildInfo:{},arenaScore:0,
   level:120,exp:0,moderation:{},rechargeInfo:{area:1,records:[],monthCards:{11000009:Date.now()+86400000},totalRecharge:0},shopInfo:{buyRecords:{}},
   fashionInfo:{fashion:{},curFashion:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0},
   items:{4:100,65:0,29040:2,28040:1,28010:1,5901:1,5904:1,5905:1,5906:1,5907:1,5908:1,6201:1,6202:1,6203:1,6204:1,6205:1,6206:1,6207:1,6208:1,6209:1,6210:1},
   currencies:{diamond:2000,silver:0,gold:0},systemUnlockInfo:{unlockedSystem:[215,221,223],rewardedSystem:[],settings:{}},activityInfo:{datas:[]},taskInfo:{},other_attr_info:{},
   fishInfo:{level:28,scene:101,rodId:5901,rodRank:1,rodLevel:1,raftId:6201,raftRank:1,raftLevel:1,slots:{},pics:{},fishUidSeq:9000,fishResult:{time:0,fishInfos:[],escapes:[],items:[]}}});
 await db.collection('players').insertOne(template);inserted=true;await connect();
 const epoch=await rpc(2499,{});assert.equal(epoch.result,0);let sequence=epoch.sequence;
 const request=()=>{const id='v3_'+epoch.epoch+'_'+(++sequence);requestIds.push(id);return id;};
 const beforePackets=packets.length;
 const buy=await rpc(1202,{require:{5902:1}});assert.equal(buy.result,0);assert.equal((await read()).items[5902],1);
 for(let id=5901;id<=5908;id++)assert.equal((await rpc(4011,{id})).result,0,'ROD_'+id);
 for(let id=6201;id<=6210;id++)assert.equal((await rpc(4016,{id})).result,0,'RAFT_'+id);
 assert.notEqual((await rpc(4011,{id:5999})).result,0);
 const openReq={index:29040,count:1,requestId:request()};assert.equal((await rpc(1300,openReq)).result,0);
 const afterOpen=await read();assert.equal(afterOpen.items[29040],1);assert([29041,29042,29043,29049].every(id=>afterOpen.fashionInfo.activateFashion.includes(id)));
 assert.equal((await rpc(1300,openReq)).replayed,true);assert.equal((await read()).items[29040],1);
 assert.equal((await rpc(1300,{index:29040,count:1,requestId:request()})).result,0);
 assert.equal((await read()).currencies.diamond,3520); // 2000 - 480 bamboo + 2000 duplicate suit
 for(const id of [28040,28010])assert.equal((await rpc(1300,{index:id,count:1,requestId:request()})).result,0);
 assert.equal((await rpc(1802,{id:29040,color:0,set:0,requestId:request()})).result,0);
 assert.equal((await rpc(1801,{id:-1,type:301,set:0,requestId:request()})).result,0);
 assert.equal((await rpc(1802,{id:28040,color:0,set:1,requestId:request()})).result,0);
 assert.equal((await rpc(1805,{setId:0,requestId:request()})).result,0);
 const saved=await read();assert.equal(saved.fashionInfo.curFashion[301],-1);assert.equal(saved.fashionInfo.curFashion[303],29043);
 assert(packets.slice(beforePackets).some(p=>p.tag===1800&&p.data.selection&&p.data.selection[301]===-1));
 const sentEmpty=await rpc(1801,{id:28043,type:303,set:0,requestId:request()});assert.notEqual(sentEmpty.result,0);
 await close();const login=await connect();assert.equal(login.fishInfo.rodId,5908);assert.equal(login.fishInfo.raftId,6210);
 assert.equal(login.fashionInfo.fashion[301],-1);assert.equal(login.fashionInfo.fashion[303],29043);
 assert.equal((await rpc(1300,openReq)).replayed,true);assert.equal((await read()).items[29040],0);
 result={result:'PASS',serverId:sid,rods:8,rafts:10,shopBamboo:true,boxes:[29040,28040,28010],duplicateDiamond:2000,
   epochReplay:true,selectionPush:true,presetRestore:true,relog:true,realPlayerWrites:0};
}finally{
 await close();for(const w of pending){clearTimeout(w.t);w.reject(Error('QA_CLOSED'));}
 if(inserted){assert(userId.startsWith('qafgear_'));await db.collection('players').deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});
   assert.equal(await db.collection('players').countDocuments({userId}),0);}
 await dbClient.close();
}
console.log(JSON.stringify({...result,qaProfileRemoved:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
