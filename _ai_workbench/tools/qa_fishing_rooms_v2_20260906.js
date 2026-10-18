'use strict';
// NEW reviewed QA: exact login identity, bounded RPC waiters, cleanup even partial login.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const APP='/linhhoasu/lhs/newServer',WS=require(APP+'/node_modules/ws'),{MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const sid=Number(process.argv[2]);assert([1001,1002].includes(sid));const port=sid===1001?9200:9201;
const base='qafroomv2_'+crypto.randomBytes(8).toString('hex'),dbName='lhs_s'+sid,client=new MongoClient('mongodb://127.0.0.1:27017');
const roles=Array.from({length:8},(_,i)=>{const platform=base+'_'+i;return {platform,userId:platform+'_s'+sid,playerId:crypto.randomBytes(12).toString('hex'),name:'QAR'+base.slice(-6)+i};});
const sockets=new Set();const wait=ms=>new Promise(r=>setTimeout(r,ms));let seq=57000;const owned=new Set();
const evidence={serverId:sid,qaPrefix:base,steps:[]};
class Peer {
 constructor(role){this.role=role;this.ws=null;this.packets=[];this.waiters=new Set();this.visible=new Map();this.roomId=0;this.mapId=0;}
 recv(tag,uid,predicate=()=>true){let settle;const promise=new Promise((resolve,reject)=>{const row={tag,uid,predicate,resolve,reject,timer:setTimeout(()=>{this.waiters.delete(row);reject(Error('RPC_TIMEOUT_'+tag));},12000)};this.waiters.add(row);settle=row;});promise.catch(()=>{});return promise;}
 on(p){this.packets.push(p);if(!p.msgUid){if(p.tag===4050&&p.data.mapId){this.roomId=p.data.roomId;this.mapId=p.data.mapId;this.visible=new Map(p.data.players.map(r=>[r.dbid,r.pos]));this.visible.set(this.role.playerId,p.data.pos);}
  if(p.tag===4051&&p.data.roomId===this.roomId&&p.data.mapId===this.mapId)this.visible.set(p.data.mapPlayer.dbid,p.data.mapPlayer.pos);
  if(p.tag===4052&&p.data.roomId===this.roomId&&p.data.mapId===this.mapId)this.visible.delete(p.data.id);}
  for(const row of [...this.waiters])if(p.tag===row.tag&&(row.uid==null||row.uid===p.msgUid)&&row.predicate(p.data)){clearTimeout(row.timer);this.waiters.delete(row);row.resolve(p.data);}}
 async rpc(tag,data){const uid=++seq,next=this.recv(tag,uid);this.ws.send(Pack(tag,data,uid));return next;}
 async open(){const ws=this.ws=new WS('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:15000});sockets.add(ws);
  ws.on('message',raw=>{try{const b=Buffer.from(raw),decoded=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));for(const p of Array.isArray(decoded)?decoded:[decoded])this.on(p);}catch(e){for(const w of this.waiters){clearTimeout(w.timer);w.reject(e);}this.waiters.clear();}});
  ws.on('close',()=>{for(const w of this.waiters){clearTimeout(w.timer);w.reject(Error('QA_SOCKET_CLOSED'));}this.waiters.clear();});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const initial=this.recv(500);const login=await this.rpc(1,{platformuid:this.role.platform,userId:this.role.platform,userid:this.role.platform,serverId:sid,serverid:sid,firstName:this.role.name});assert.equal(login.result,0);
  const data=await initial;assert.equal(data.level,116,'QA_IDENTITY_LEVEL');assert.equal(data.fishInfo.level,28,'QA_IDENTITY_FISH_LEVEL');
  return data;
 }
 async join(map,room){const entry=this.recv(4050,null,d=>d.mapId===map&&(room==null||d.roomId===room));const r=await this.rpc(4002,{id:map,...(room!=null?{roomId:room}:{})});assert.equal(r.result,0,JSON.stringify(r));await entry;return r;}
 async close(){if(!this.ws||this.ws.readyState===WS.CLOSED)return;const ws=this.ws;const closed=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([closed,wait(2000)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}
}
async function eventually(fn){let error;for(let i=0;i<50;i++){try{fn();return;}catch(e){error=e;await wait(40);}}throw error;}
(async()=>{await client.connect();const db=client.db(dbName),players=db.collection('players'),peers=roles.map(r=>new Peer(r));let success=false;
 try{
  const template=await players.findOne({isBot:true});assert(template);
  for(const role of roles){const p={...template};delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;
   Object.assign(p,{userId:role.userId,playerId:role.playerId,name:role.name,serverId:sid,accountId:'',guildId:'',guildInfo:{},isBot:false,level:116,exp:0,
    arenaScore:0,swordInfo:{...template.swordInfo,maxlayer:0},items:{65:100,68:100,69:31,70:6,5534:100},currencies:{diamond:0,gold:0,silver:0},
    rechargeInfo:{monthCards:{},monthCardRecords:{},records:[],totalRecharge:0},systemUnlockInfo:{unlockedSystem:[215,221],rewardedSystem:[],settings:{}},
    fishInfo:{level:28,scene:7,food:5534,foodBag:[5534],rodId:5901,rodRank:1,rodLevel:1,rodExp:0,raftId:6201,raftRank:1,raftLevel:0,raftExp:0,rodAttrs:[],rodTempAttrs:[],fishUidSeq:8000,slots:{},pics:{},fishTypeQualityPic:{},fishResult:{time:0,fishInfos:[],escapes:[],items:[],fashion:[]},catchResult:{time:0,infos:[],escapes:[],items:[],sailItems:{}}}});
   await players.insertOne(p);owned.add(role.userId);}
  for(const peer of peers){await peer.open();const row=await players.findOne({userId:peer.role.userId});assert.equal(row.playerId,peer.role.playerId,'QA_EXACT_IDENTITY');}
  evidence.steps.push('8-login-identities-confirmed');
  // Choose currently unused rooms from the server list, not an arbitrary player room.
  async function spare(peer){let listing=await peer.rpc(4050,{action:'list',id:7,page:0});assert.equal(listing.roomProtocol,1);for(let page=0;page<listing.totalPages;page++){if(page)listing=await peer.rpc(4050,{action:'list',id:7,page});const empty=listing.rooms.find(r=>r.count===0);if(empty)return empty.id;}throw Error('NEED_EMPTY_QA_ROOM');}
  const room1=await spare(peers[0]);
  await Promise.all(peers.slice(0,4).map(p=>p.join(7,room1)));
  const room2=await spare(peers[4]);assert(room2!==room1);
  await Promise.all(peers.slice(4).map(p=>p.join(7,room2)));
  await eventually(()=>{for(let i=0;i<8;i++){const group=peers.slice(i<4?0:4,i<4?4:8),seen=peers[i].visible;assert.deepEqual([...seen.keys()].sort(),group.map(p=>p.role.playerId).sort());assert.deepEqual([...seen.values()].sort(),[0,1,2,3]);}});
  evidence.steps.push('two-rooms-four-unique-seats-symmetric');
  const before=await players.findOne({userId:roles[4].userId});assert.equal((await peers[4].rpc(4002,{id:7,roomId:room1})).reason,'FISH_ROOM_FULL');assert.equal(peers[4].roomId,room2);
  const after=await players.findOne({userId:roles[4].userId});assert.deepEqual(after.items,before.items);evidence.steps.push('full-room-no-item-change');
  const releasedSeat=peers[1].visible.get(roles[1].playerId);await peers[1].rpc(4051,{});const oldLeaveUid=seq;await peers[4].join(7,room1);
  await eventually(()=>{assert.equal(peers[4].visible.get(roles[4].playerId),releasedSeat);assert(!peers[0].visible.has(roles[1].playerId));assert(peers[0].visible.has(roles[4].playerId));});
  const otherStart=peers[5].packets.length,peerCast=peers[2].recv(4060,null,d=>d.id===roles[0].playerId);
  const caught=await peers[0].rpc(4000,{count:1});assert.equal(caught.result,0);await peerCast;assert(!peers[5].packets.slice(otherStart).some(p=>p.tag===4060));
  const pending=JSON.stringify(caught.fishResult.fishInfos);await peers[0].join(7,room2);assert.equal((await peers[0].rpc(4000,{count:1})).reason,'FISH_PENDING');
  await peers[0].close();await wait(800);const login=await peers[0].open();assert.equal(JSON.stringify(login.fishInfo.fishResult.fishInfos),pending);await peers[0].join(7,room2);
  await eventually(()=>assert(peers[5].visible.has(roles[0].playerId)));evidence.steps.push('peer-cast-filtered-pending-relog-preserved');
  // Disconnect frees only that exact member; no stale entries remain.
  await peers[6].close();await eventually(()=>assert(!peers[5].visible.has(roles[6].playerId)));evidence.steps.push('disconnect-frees-seat');
  await peers[1].join(7,room2);const duplicate=peers[1].recv(4051,oldLeaveUid);peers[1].ws.send(Pack(4051,{},oldLeaveUid));assert.equal((await duplicate).result,0);
  const stay=await peers[1].rpc(4050,{action:'list',id:7,page:0});assert.equal(stay.currentRoomId,room2);evidence.steps.push('stale-leave-RPC-replayed-without-evicting-new-room');
  success=true;
 }finally{
  await Promise.allSettled(peers.map(p=>p.close()));for(const ws of sockets)if(ws.readyState!==WS.CLOSED)ws.terminate();await wait(1800);
  const identities=roles.map(r=>({userId:r.userId,playerId:r.playerId}));
  const existing=await players.find({$or:identities},{projection:{_id:1,userId:1,playerId:1}}).toArray();assert(existing.length<=8);
  for(const row of existing)await players.deleteOne({_id:row._id,userId:row.userId,playerId:row.playerId});
  await db.collection('mails').deleteMany({userId:{$in:roles.map(r=>r.userId)}});
  assert.equal(await players.countDocuments({userId:{$in:roles.flatMap(r=>[r.userId,r.platform])}}),0);await client.close();evidence.cleanupRemaining=0;
  fs.writeFileSync(path.join(__dirname,'../qa-rooms-'+sid+'.json'),JSON.stringify({...evidence,result:success?'PASS':'FAIL'},null,2)+'\n');
 }
 console.log(JSON.stringify({...evidence,result:'PASS',nativeVisual:false,realPlayerWrites:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
