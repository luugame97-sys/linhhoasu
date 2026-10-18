'use strict';
// Production WS only on a unique QA role; never reads or changes a real role.
const assert=require('assert/strict'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',WebSocket=require(APP+'/node_modules/ws');
const {MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const serverId=Number(process.argv[2]);assert([1001,1002].includes(serverId));const port=serverId===1001?9200:9201;
const c=new MongoClient('mongodb://127.0.0.1:27017'),base='qa_gear_'+crypto.randomBytes(8).toString('hex'),userId=base+'_s'+serverId,playerId=crypto.randomBytes(12).toString('hex');
let ws,seq=45000,inserted=false,revision=0;const messages=[];let state;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function receive(tag,msgUid){return new Promise((r,j)=>{const timer=setTimeout(()=>{off();j(new Error('GEAR_QA_TIMEOUT_'+tag));},15000);function on(p){if(p.tag===tag&&(msgUid==null||p.msgUid===msgUid)){off();r(p.data);}}function off(){clearTimeout(timer);ws.off('qa',on);}ws.on('qa',on);});}
async function rpc(tag,data){const id=++seq,next=receive(tag,id);ws.send(Pack(tag,data,id));const out=await next;if(out?.balanceRevision!=null)revision=out.balanceRevision;return out;}
async function close(){if(!ws)return;const socket=ws;socket.close();await Promise.race([new Promise(r=>socket.once('close',r)),wait(3000)]);if(socket.readyState!==WebSocket.CLOSED)socket.terminate();await wait(1200);}
async function open(){ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:30000});ws.on('message',raw=>{const b=Buffer.from(raw);let rows;try{rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(rows)?rows:[rows]){messages.push(p);ws.emit('qa',p);}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const init=receive(500);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverid:serverId,serverId,firstName:'QA Gear'})).result,0);const p=await init;state=p.fishInfo;revision=Number(state.balanceRevision||0);return p;}
function request(kind,action){return{requestId:'gear_live_'+crypto.randomBytes(7).toString('hex'),expectedRevision:revision,expectedState:{rank:state[kind+'Rank'],level:state[kind+'Level'],exp:state[kind+'Exp']},action,upgradeAll:action==='fast'};}
async function action(kind,mode){const req=request(kind,mode),r=await rpc(kind==='rod'?4010:4015,req);if(r.result===0){state[kind+'Rank']=r.rank;state[kind+'Level']=r.level;state[kind+'Exp']=r.exp;}return {req,r};}
(async()=>{await c.connect();const db=c.db('lhs_s'+serverId),players=db.collection('players');try{
 const p=await players.findOne({isBot:true});assert(p);delete p._id;delete p.__v;delete p.botWorker;delete p.inviteCode;
 Object.assign(p,{userId,playerId,name:'QA Gear',accountId:'',isBot:false,guildId:'',guildInfo:{},serverId,level:116,
  items:{68:500,69:45,65:20,5512:3,135:20,94821:1},currencies:{diamond:0,silver:0,gold:0},
  systemUnlockInfo:{unlockedSystem:[215,221,223],rewardedSystem:[],settings:{}},
  fishInfo:{level:6,scene:1,rodId:5901,rodRank:2,rodLevel:20,rodExp:0,raftId:6201,raftRank:1,raftLevel:10,raftExp:0,
    rodAttrs:[{type:101,level:7,value:500}],rodTempAttrs:[],fishUidSeq:7000,
    slots:{1:{id:5018,uid:6001,type:1,quality:9,multi:18000,attrs:[{type:1,level:1,value:9000}],skills:[],tempSkills:{},lock:0,dead:0}},
    fishResult:{time:0,fishInfos:[],escapes:[],items:[],fashion:[]},catchResult:{time:0,infos:[],escapes:[],items:[],sailItems:{}}}});
 await players.insertOne(p);inserted=true;await open();assert.equal(state.rodLevel,20);assert.equal(state.raftLevel,10);
 assert.equal((await rpc(4010,{upgradeAll:false})).result,1);assert.equal((await rpc(4015,{upgradeAll:false})).result,1);
 let data=await players.findOne({userId,playerId});assert.equal(data.items[68],500);assert.equal(data.items[69],45);
 const rod=await action('rod','fast');assert.equal(rod.r.result,0);assert.deepEqual(rod.r.cost,{id:68,count:200});assert.equal(rod.r.exp,200);assert.equal(rod.r.level,20);assert(rod.r.gradeReady);
 assert((await rpc(4010,rod.req)).replayed);data=await players.findOne({userId,playerId});assert.equal(data.items[68],300);assert.equal(data.items[69],45);
 const raft=await action('raft','fast');assert.equal(raft.r.result,0);assert.deepEqual(raft.r.cost,{id:68,count:100});assert.equal(raft.r.exp,100);
 assert.equal((await action('rod','level')).r.reason,'FISH_GEAR_GRADE_REQUIRED');assert.equal((await action('raft','fast')).r.reason,'FISH_GEAR_GRADE_REQUIRED');
 await close();await open();assert.equal(state.rodExp,200);assert.equal(state.raftExp,100);assert.equal(state.rodLevel,20);assert.equal(state.raftLevel,10);
 const rgrade=await action('rod','grade');assert.equal(rgrade.r.result,0);assert.deepEqual(rgrade.r.cost,{id:69,count:30});assert.equal(rgrade.r.rank,3);assert.equal(rgrade.r.level,1);assert.equal(rgrade.r.exp,0);
 const fgrade=await action('raft','grade');assert.equal(fgrade.r.result,0);assert.deepEqual(fgrade.r.cost,{id:69,count:15});assert.equal(fgrade.r.rank,2);assert.equal(fgrade.r.level,1);assert.equal(fgrade.r.exp,0);
 assert((await rpc(4010,rgrade.req)).replayed);assert((await rpc(4015,fgrade.req)).replayed);
 const stale={...request('rod','level'),expectedState:rgrade.req.expectedState};assert.equal((await rpc(4010,stale)).reason,'FISH_GEAR_STALE');
 data=await players.findOne({userId,playerId});assert.equal(data.items[68],200);assert.equal(data.items[69],0);assert.equal(data.fishInfo.slots[1].attrs[0].value,9000);
 const first=await action('rod','level');assert.equal(first.r.exp,1);assert.deepEqual(first.r.cost,{id:68,count:1});
 const second=await action('raft','level');assert.equal(second.r.exp,1);assert.deepEqual(second.r.cost,{id:68,count:1});
 // Shared revision/receipt still interoperates with wash and box actions.
 const wash=await rpc(4012,{requestId:'wash_gear_'+crypto.randomBytes(6).toString('hex'),expectedRevision:revision});assert.equal(wash.result,0);
 const box=await rpc(4063,{itemId:94821,count:1,requestId:'box_gear_'+crypto.randomBytes(6).toString('hex'),expectedRevision:revision});assert.equal(box.result,0);
 await close();await open();assert.equal(state.rodRank,3);assert.equal(state.rodLevel,1);assert.equal(state.rodExp,1);assert.equal(state.raftRank,2);assert.equal(state.raftLevel,1);assert.equal(state.raftExp,1);
 assert.equal(state.slots[1].attrs[0].value,9000);assert.equal(state.balanceReceipts,undefined);assert.equal(state.rodTempAttrs.length,3);
 assert((await rpc(4010,rgrade.req)).replayed);assert.equal(state.rodLevel,1);
 data=await players.findOne({userId,playerId});assert.equal(data.items[68],198);assert.equal(data.items[69],0);assert.equal(data.items[135],10);assert.equal(data.items[94821],0);
 console.log(JSON.stringify({result:'PASS',serverId,legacyRequestRejected:true,capCoins:300,gradeCrystals:45,newGradeLevel:1,normalSteps:2,readyRelog:true,gradeRelog:true,replayAfterRelog:true,fishUnchanged:true,washBoxInterop:true,nativeVisual:false}));
 }finally{await close();if(inserted){await players.deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});await wait(600);assert.equal(await players.countDocuments({userId,playerId}),0);}await c.close();console.error('GEAR_QA_CLEANUP '+serverId+' remaining=0');}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
