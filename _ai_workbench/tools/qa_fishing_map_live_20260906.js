'use strict';
// Own unique disposable QA role. Never modifies a real player's map, fish or items.
const assert=require('assert/strict'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',WebSocket=require(APP+'/node_modules/ws');
const {MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const serverId=Number(process.argv[2]);assert([1001,1002].includes(serverId));
const port=serverId===1001?9200:9201,client=new MongoClient('mongodb://127.0.0.1:27017');
const base='qa_fish_map_'+crypto.randomBytes(9).toString('hex'),userId=base+'_s'+serverId,playerId=crypto.randomBytes(12).toString('hex');
let ws,seq=49000,inserted=false,connections=0;const packets=[];const clone=x=>JSON.parse(JSON.stringify(x));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function recv(tag,uid,predicate=()=>true){const socket=ws;return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{off();reject(Error('MAP_QA_TIMEOUT_'+tag));},15000);
  function off(){clearTimeout(timer);socket.off('qa',on);}
  function on(p){if(p.tag===tag&&(uid==null||p.msgUid===uid)&&predicate(p.data)){off();resolve(p.data);}}
  socket.on('qa',on);
});}
function rpc(tag,data){const uid=++seq,next=recv(tag,uid);ws.send(Pack(tag,data,uid));return next;}
async function open(){ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:30000});
  ws.on('message',raw=>{const b=Buffer.from(raw);let decoded;try{decoded=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}
    for(const p of Array.isArray(decoded)?decoded:[decoded]){packets.push(p);ws.emit('qa',p);}});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});connections++;
  const login=recv(500);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverId,serverid:serverId,firstName:'QA Fish Map'})).result,0);return login;
}
async function close(){if(!ws)return;const socket=ws;socket.close();await Promise.race([new Promise(r=>socket.once('close',r)),wait(3000)]);if(socket.readyState!==WebSocket.CLOSED)socket.terminate();await wait(1200);}
async function change(id){const since=packets.length,entered=recv(4050,null,d=>d.mapId===id),r=await rpc(4002,{id});assert.equal(r.result,0);assert.equal(r.id,id);const data=await entered;
  assert.equal(data.pos,1);assert(data.time>0);assert(Array.isArray(data.players));
  const recent=packets.slice(since),ackAt=recent.findIndex(p=>p.tag===4002&&p.msgUid),entryAt=recent.findIndex(p=>p.tag===4050&&p.data.mapId===id);
  assert(ackAt>=0&&entryAt>ackAt);return data;
}
function inventory(p){return Object.fromEntries([65,68,69,70,5534].map(id=>[id,Number(p.items[id]||0)]));}
(async()=>{await client.connect();const db=client.db('lhs_s'+serverId),players=db.collection('players');let result;
  try{
    const p=await players.findOne({isBot:true});assert(p);delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;
    Object.assign(p,{userId,playerId,name:'QA Fish Map',accountId:'',isBot:false,guildId:'',guildInfo:{},serverId,level:116,
      items:{65:100,68:100,69:31,70:6,5534:100},currencies:{diamond:123,silver:456,gold:789},
      rechargeInfo:{monthCards:{},monthCardRecords:{},records:[],totalRecharge:0},
      // Isolate map/cost checks: this QA role has no raft-mastery unlock (223),
      // which can legitimately save bait. Production unlocks/RNG remain untouched.
      systemUnlockInfo:{unlockedSystem:[215,221],rewardedSystem:[],settings:{}},
      fishInfo:{level:99,scene:1,food:5534,foodBag:[5534],rodId:5901,rodRank:1,rodLevel:1,rodExp:0,raftId:6201,raftRank:1,raftLevel:0,raftExp:0,
        rodAttrs:[],rodTempAttrs:[],fishUidSeq:7000,slots:{},pics:{},fishTypeQualityPic:{},fishResult:{time:0,fishInfos:[],escapes:[],items:[],fashion:[]},catchResult:{time:0,infos:[],escapes:[],items:[],sailItems:{}}}});
    await players.insertOne(p);inserted=true;await open();
    await change(1);const start=await players.findOne({userId,playerId});
    for(const id of [2,3,1,2]){await change(id);const saved=await players.findOne({userId,playerId});assert.equal(saved.fishInfo.scene,id);assert.deepEqual(inventory(saved),inventory(start));}
    assert.equal(connections,1);
    const beforeInvalid=packets.length;assert.equal((await rpc(4002,{id:999999})).result,1);
    assert(!packets.slice(beforeInvalid).some(p=>p.tag===4050&&p.data.mapId));
    // Pipeline real catch -> change on the same connection; server queue must retain the result.
    const nextScene=recv(4050,null,d=>d.mapId===3),catching=rpc(4000,{count:3}),changing=rpc(4002,{id:3});
    const [caught,moved]=await Promise.all([catching,changing]);assert.equal(caught.result,0);assert.equal(caught.fishResult.fishInfos.length,3);assert.equal(moved.result,0);await nextScene;
    const withCatch=await players.findOne({userId,playerId});assert.equal(withCatch.fishInfo.scene,3);
    assert.deepEqual(withCatch.fishInfo.fishResult.fishInfos.map(f=>f.uid),caught.fishResult.fishInfos.map(f=>f.uid));
    assert.equal(withCatch.items[65],start.items[65]-3);assert.equal(withCatch.items[5534],start.items[5534]-3);
    const protectedFish=clone(withCatch.fishInfo.fishResult),counts=inventory(withCatch);
    await change(2);assert.equal((await rpc(4000,{count:3})).reason,'FISH_PENDING');
    const held=await players.findOne({userId,playerId});assert.deepEqual(held.fishInfo.fishResult,protectedFish);assert.deepEqual(inventory(held),counts);
    const burstStart=packets.length,ids=[3,1,2,3],responses=await Promise.all(ids.map(id=>rpc(4002,{id})));
    responses.forEach((r,i)=>{assert.equal(r.result,0);assert.equal(r.id,ids[i]);});
    const until=Date.now()+3000;while(packets.slice(burstStart).filter(p=>p.tag===4050&&p.data.mapId).length<ids.length&&Date.now()<until)await wait(20);
    assert.deepEqual(packets.slice(burstStart).filter(p=>p.tag===4050&&p.data.mapId).map(p=>p.data.mapId),ids);
    assert.equal(connections,1);
    await close();const login=await open();assert.equal(login.fishInfo.scene,3);assert.equal(login.fishInfo.fishResult.fishInfos.length,3);
    const entered=recv(4050,null,d=>d.mapId===3);await rpc(4050,{});await entered;
    const relog=await players.findOne({userId,playerId});assert.deepEqual(relog.fishInfo.fishResult,protectedFish);assert.deepEqual(inventory(relog),counts);
    assert.equal((await rpc(4051,{})).result,0);const reenter=recv(4050,null,d=>d.mapId===1);await rpc(4050,{});await reenter;
    const final=await players.findOne({userId,playerId});assert.deepEqual(final.fishInfo.fishResult,protectedFish);assert.deepEqual(inventory(final),counts);
    result={result:'PASS',serverId,mapChangesWithoutReconnect:packets.filter(p=>p.tag===4002&&p.msgUid&&p.data.result===0).length,ackBeforeEntry:true,invalidMapNoEntry:true,catchThenMapPipelined:true,
      pendingFishPreserved:3,noExtraConsumption:true,rapidMapOrder:ids,relog:true,legacyLeaveDefaultMap:1,nativeVisual:false,realPlayerWrites:0};
  }finally{await close();if(inserted){await players.deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});await wait(600);assert.equal(await players.countDocuments({userId,playerId}),0);}await client.close();}
  result.qaCleanupRemaining=0;console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
