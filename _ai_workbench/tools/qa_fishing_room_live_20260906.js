'use strict';
throw new Error('WITHDRAWN_ROOM_QA: identity suffix mismatch and unsafe waiter lifecycle; do not rerun.');
// Disposable QA users only. Verifies presence/seat packets; no real player or gameplay state is touched.
const assert=require('assert/strict'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',WebSocket=require(APP+'/node_modules/ws');
const {MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const serverId=Number(process.argv[2]);assert([1001,1002].includes(serverId));const port=serverId===1001?9200:9201;
const c=new MongoClient('mongodb://127.0.0.1:27017'),prefix='qa_room_'+crypto.randomBytes(8).toString('hex');
const roles=Array.from({length:5},(_,i)=>({userId:prefix+'_u'+i,playerId:prefix+'_p'+i,name:'QA Room '+i}));
const sockets=[];let seq=52000,inserted=false;const wait=ms=>new Promise(r=>setTimeout(r,ms));
function clone(x){return JSON.parse(JSON.stringify(x));}
function listen(ws){ws.on('message',raw=>{let d;try{const b=Buffer.from(raw);d=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(d)?d:[d]){ws.packets.push(p);const pending=ws.waiters.slice();ws.waiters=[];for(const f of pending){if(f(p))f.resolve(p);else ws.waiters.push(f);}}});}
function next(ws,pred,timeout=12000){return new Promise((resolve,reject)=>{const found=ws.packets.find(pred);if(found)return resolve(found);const timer=setTimeout(()=>{ws.waiters=ws.waiters.filter(x=>x!==w);reject(Error('ROOM_QA_TIMEOUT tags='+ws.packets.map(p=>p.tag+':'+p.msgUid).join(',')));},timeout);const w=p=>{if(pred(p)){clearTimeout(timer);return true;}return false;};w.resolve=resolve;ws.waiters.push(w);});}
async function open(role){const ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:30000});ws.packets=[];ws.waiters=[];listen(ws);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const uid=++seq;const init=next(ws,p=>p.tag===500);ws.send(Pack(1,{platformuid:role.userId,userId:role.userId,userid:role.userId,serverId,serverid:serverId,firstName:role.name},uid));const login=await next(ws,p=>p.tag===1&&p.msgUid===uid);assert.equal(login.data.result,0);const initial=await init;ws.login=initial.data;return ws;}
async function enter(ws,id=1){const uid=++seq;ws.send(Pack(4002,{id},uid));const ack=await next(ws,p=>p.tag===4002&&p.msgUid===uid);assert.equal(ack.data.result,0,'ENTER_'+id+' reason='+ack.data.reason+' id='+ack.data.id+' fishLevel='+ws.login?.fishInfo?.level+' playerLevel='+ws.login?.level);const scene=await next(ws,p=>p.tag===4050&&p.msgUid===0&&p.data.mapId===id);return scene.data;}
async function close(ws){if(!ws)return;ws.close();await Promise.race([new Promise(r=>ws.once('close',r)),wait(2000)]);if(ws.readyState!==WebSocket.CLOSED)ws.terminate();}
(async()=>{await c.connect();const db=c.db('lhs_s'+serverId),players=db.collection('players');try{
  const bot=await players.findOne({isBot:true});assert(bot);const docs=roles.map(role=>{const p=clone(bot);delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;Object.assign(p,role,{name:role.name+' '+prefix,accountId:'',isBot:false,guildId:'',guildInfo:{},serverId,level:116,items:{65:100,68:100,69:31,5534:100},currencies:{diamond:0,silver:0,gold:0},systemUnlockInfo:{unlockedSystem:[215,221]},rechargeInfo:{monthCards:{},monthCardRecords:{}},fishInfo:{level:28,scene:1,food:5534,foodBag:[5534],rodId:5901,rodRank:1,rodLevel:1,rodExp:0,raftId:6201,raftRank:1,raftLevel:0,raftExp:0,rodAttrs:[],rodTempAttrs:[],fishUidSeq:8000,slots:{},pics:{},fishTypeQualityPic:{},fishResult:{time:0,fishInfos:[],escapes:[],items:[],fashion:[]},catchResult:{time:0,infos:[],escapes:[],items:[],sailItems:{}}}});return p;});
  await players.insertMany(docs);inserted=true;
  for(const role of roles){const ws=await open(role);sockets.push(ws);const scene=await enter(ws,1);assert.equal(scene.players.length,0);}
  const visible=sockets.map(ws=>ws.packets.filter(p=>p.tag===4051&&p.msgUid===0&&p.data.mapId===1).map(p=>({id:p.data.mapPlayer.dbid,pos:p.data.mapPlayer.pos})));
  assert(visible[0].length>=4&&visible[0].every(x=>x.pos===1));assert.equal(visible[4].length,0);
  assert(new Set(visible[0].map(x=>x.pos)).size===1);
  const sameAnchor=sockets[0].packets.filter(p=>p.tag===4051&&p.msgUid===0&&p.data.mapId===1).length;
  // Cross-map packets are broadcast but native receivers filter by current map.
  const beforeCross=sockets[0].packets.length;await enter(sockets[0],2);const cross=sockets[1].packets.slice(beforeCross).filter(p=>p.tag===4051&&p.data.mapId===2);
  assert(cross.length>=1);
  const output={result:'PASS',serverId,clients:roles.length,allEntryRostersEmpty:true,firstClientPeerCount:visible[0].length,lastClientPeerCount:visible[4].length,
    allAssignedPositions:[...new Set(visible.flat().map(x=>x.pos))],sameAnchor:true,anchorPosition:1,
    newArrivalDoesNotReceiveExisting:true,crossMapBroadcastObserved:true,realPlayerWrites:0,nativeVisual:false};
  console.log(JSON.stringify(output));
 }finally{for(const ws of sockets)await close(ws);if(inserted){await players.deleteMany({userId:{$regex:'^'+prefix}});await db.collection('mails').deleteMany({userId:{$regex:'^'+prefix}});await wait(800);assert.equal(await players.countDocuments({userId:{$regex:'^'+prefix}}),0);}await c.close();console.error('ROOM_QA_CLEANUP '+serverId+' remaining=0');}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
