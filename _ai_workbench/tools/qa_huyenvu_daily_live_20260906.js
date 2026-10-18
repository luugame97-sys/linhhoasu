'use strict';
// Exact unique QA row only; no user's claim markers, rewards, or currencies touched.
const assert=require('assert/strict'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',WebSocket=require(APP+'/node_modules/ws');
const {MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const serverId=Number(process.argv[2]);assert([1001,1002].includes(serverId));const port=serverId===1001?9200:9201;
const c=new MongoClient('mongodb://127.0.0.1:27017'),base='qa_huyenvu_'+crypto.randomBytes(9).toString('hex'),userId=base+'_s'+serverId,playerId=crypto.randomBytes(12).toString('hex');
let ws,seq=48000,inserted=false;const packets=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function recv(tag,msgUid){return new Promise((r,j)=>{const timer=setTimeout(()=>{off();j(Error('DAILY_QA_TIMEOUT_'+tag));},15000);function on(p){if(p.tag===tag&&(msgUid==null||p.msgUid===msgUid)){off();r(p.data);}}function off(){clearTimeout(timer);ws.off('qa',on);}ws.on('qa',on);});}
async function rpc(tag,data){const msgUid=++seq,next=recv(tag,msgUid);ws.send(Pack(tag,data,msgUid));return next;}
async function close(){if(!ws)return;const socket=ws;socket.close();await Promise.race([new Promise(r=>socket.once('close',r)),wait(3000)]);if(socket.readyState!==WebSocket.CLOSED)socket.terminate();await wait(1200);}
async function open(){ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:30000});ws.on('message',raw=>{const b=Buffer.from(raw);let decoded;try{decoded=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(decoded)?decoded:[decoded]){packets.push(p);ws.emit('qa',p);}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const init=recv(500);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverId,serverid:serverId,firstName:'QA Huyen Vu'})).result,0);return await init;}
(async()=>{await c.connect();const db=c.db('lhs_s'+serverId),players=db.collection('players');try{
 const p=await players.findOne({isBot:true});assert(p);delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;
 Object.assign(p,{userId,playerId,name:'QA Huyen Vu',accountId:'',isBot:false,guildId:'',guildInfo:{},serverId,level:116,
  items:{65:100,70:7,68:111},currencies:{diamond:1000,silver:2000,gold:3000},
  rechargeInfo:{monthCards:{11000009:Date.now()+86400000,11000002:Date.now()-1000},monthCardRecords:{},records:[],totalRecharge:0},
  systemUnlockInfo:{unlockedSystem:[215,221,223],rewardedSystem:[],settings:{}},
  fishInfo:{level:10,scene:1,rodId:5901,rodRank:1,rodLevel:1,rodExp:0,raftId:6201,raftRank:1,raftLevel:0,raftExp:0,rodAttrs:[],rodTempAttrs:[],fishUidSeq:7000,slots:{},pics:{},fishTypeQualityPic:{},
   fishResult:{time:0,fishInfos:[],escapes:[],items:[],fashion:[]},catchResult:{time:0,infos:[],escapes:[],items:[],sailItems:{}}}});
 await players.insertOne(p);inserted=true;await open();
 const start=await players.findOne({userId,playerId});
 assert.equal((await rpc(1211,{id:999999})).reason,'MONTH_CARD_INVALID');
 assert.equal((await rpc(1211,{id:11000002})).reason,'MONTH_CARD_EXPIRED');
 const since=packets.length,claimed=await rpc(1211,{id:11000009});assert.equal(claimed.result,0);assert(claimed.claimTime>0);
 assert.deepEqual(claimed.rewardInfo.items,[{id:65,count:50},{id:70,count:2}]);
 const inv=packets.slice(since).find(p=>p.tag===1202&&p.data.changed?.some(r=>r.id===65));
 assert(inv);assert.deepEqual(inv.data.items,[{id:65,count:50},{id:70,count:2}]);
 assert(inv.data.changed.some(r=>r.id===65&&r.count===Number(start.items[65]||0)+50));
 assert(inv.data.changed.some(r=>r.id===70&&r.count===Number(start.items[70]||0)+2));
 const saved=await players.findOne({userId,playerId});assert.equal(saved.items[65],Number(start.items[65]||0)+50);assert.equal(saved.items[70],Number(start.items[70]||0)+2);
 assert.equal(saved.currencies.diamond,start.currencies.diamond);assert.equal(saved.rechargeInfo.monthCardRecords[11000009],claimed.claimTime);
 const repeatSince=packets.length,repeat=await rpc(1211,{id:11000009});assert.equal(repeat.result,1);assert.equal(repeat.reason,'MONTH_CARD_ALREADY_CLAIMED');assert.equal(repeat.claimTime,claimed.claimTime);
 const resync=packets.slice(repeatSince).find(p=>p.tag===1202);assert(resync);assert.deepEqual(resync.data.items,[]);assert.deepEqual(repeat.rewardInfo.items,[]);
 await close();const login=await open();assert.equal(login.rechargeInfo.monthCardRecords[11000009],claimed.claimTime);
 const after=await rpc(1211,{id:11000009});assert.equal(after.reason,'MONTH_CARD_ALREADY_CLAIMED');const final=await players.findOne({userId,playerId});
 assert.equal(final.items[65],saved.items[65]);assert.equal(final.items[70],saved.items[70]);assert.equal(final.currencies.diamond,saved.currencies.diamond);
 console.log(JSON.stringify({result:'PASS',serverId,dailyLegs:50,dailyTickets:2,inventoryPacket1202:true,serverClaimTime:true,duplicateNoGrant:true,expiredAndInvalidRejected:true,relog:true,compensation:false,nativeVisual:false}));
 }finally{await close();if(inserted){await players.deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});await wait(600);assert.equal(await players.countDocuments({userId,playerId}),0);}await c.close();console.error('HUYENVU_QA_CLEANUP '+serverId+' remaining=0');}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
