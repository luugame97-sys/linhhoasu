'use strict';
// Disposable QA role, exact self-owned records only. No real player mutation.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const APP='/linhhoasu/lhs/newServer',WS=require(APP+'/node_modules/ws'),{MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec'),{call}=require('./fashion_box_operator_20260907');
const sid=Number(process.argv[2]);assert([1001,1002].includes(sid));const base='qafbox_'+crypto.randomBytes(6).toString('hex'),userId=base+'_s'+sid,playerId=crypto.randomBytes(12).toString('hex'),name='FQ'+base.slice(-6),ids=[29041,29042,29043,29049];
const c=new MongoClient('mongodb://127.0.0.1:27017');let db,ws,seq=44000,inserted=false,packetLog=[];const pending=new Set(),delay=ms=>new Promise(r=>setTimeout(r,ms));
function recv(tag,uid){const p=new Promise((resolve,reject)=>{const w={tag,uid,resolve,reject,t:setTimeout(()=>{pending.delete(w);reject(Error('QA_TIMEOUT_'+tag));},12000)};pending.add(w);});p.catch(()=>{});return p;}
async function rpc(tag,data){const uid=++seq,p=recv(tag,uid);ws.send(Pack(tag,data,uid));return p;}
async function open(){ws=new WS('ws://127.0.0.1:'+(sid===1001?9200:9201),{headers:{Origin:'http://127.0.0.1'}});ws.on('message',raw=>{const b=Buffer.from(raw);let out;try{out=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(out)?out:[out]){packetLog.push(p);for(const w of [...pending])if(w.tag===p.tag&&(w.uid==null||w.uid===p.msgUid)){clearTimeout(w.t);pending.delete(w);w.resolve(p.data);}}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const initial=recv(500);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverid:sid,serverId:sid,firstName:name})).result,0);const p=await initial;assert.equal(p.name,name);return p;}
async function close(){if(ws&&ws.readyState!==WS.CLOSED){const end=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([end,delay(1000)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}await delay(800);}
(async()=>{await c.connect();db=c.db('lhs_s'+sid);let result;try{
const p=await db.collection('players').findOne({isBot:true});assert(p);delete p._id;delete p.__v;delete p.inviteCode;delete p.botWorker;
Object.assign(p,{userId,playerId,name,serverId:sid,isBot:false,accountId:'',guildId:'',guildInfo:{},arenaScore:0,level:116,exp:0,moderation:{},rechargeInfo:{area:1,monthCards:{},records:[],totalRecharge:0},shopInfo:{pack:[],chainPack:[],buyRecords:{}},fashionInfo:{fashion:{},curFashion:{},fashions:{},activateFashion:[],fashionData:[]},items:{4:100,65:100,119:2500,29040:2},currencies:{diamond:0,silver:0,gold:0},systemUnlockInfo:{unlockedSystem:[215,221,223],rewardedSystem:[],settings:{}},activityInfo:{datas:[]},taskInfo:{},fishInfo:{level:28,scene:101,rodId:5901,rodRank:1,rodLevel:1,raftId:6201,raftRank:1,raftLevel:1,slots:{},pics:{},fishUidSeq:9000,fishResult:{time:0,fishInfos:[],escapes:[],items:[]}}});
await db.collection('players').insertOne(p);inserted=true;await open();
const bad=await call(sid,{action:'preview',userId},{badSignature:true});assert.equal(bad.status,401);
const preview=await call(sid,{action:'preview',userId});assert.equal(preview.status,200);assert.equal(preview.data.state.boxCount,2);
const body={action:'apply',userId,confirm:true,incident:'fashion_box_29040_20260907',signature:preview.data.state.signature,expectedCount:2};
const beforePackets=packetLog.length,applied=await call(sid,body);assert.equal(applied.status,200);assert.equal(applied.data.receipt.duplicateYuanbao,2000);await delay(100);
assert(packetLog.slice(beforePackets).some(p=>p.tag===1800&&ids.every(id=>p.data.fashion.includes(id))));
const wear=await rpc(1802,{id:29040,color:0,set:0});assert.equal(wear.result,0);assert(ids.every(id=>wear.fashion.some(r=>r.id===id)));
let saved=await db.collection('players').findOne({userId});assert.equal(saved.items[29040],0);assert.equal(saved.currencies.diamond,2000);
const again=await call(sid,body);assert(again.data.replayed);assert.equal(await db.collection('mails').countDocuments({userId,eventKey:'fashion_box_29040_20260907'}),1);
// A real event-shop purchase after repair proves new grants never recreate the hidden box.
const buy=await rpc(1202,{require:{11012001:1}});assert.equal(buy.result,0);saved=await db.collection('players').findOne({userId});assert.equal(saved.items[119],1250);assert.equal(saved.items[29040],0);assert.equal(saved.currencies.diamond,4000);
const repeat=await rpc(1202,{require:{11012001:1}});assert.notEqual(repeat.result,0);
await close();const fresh=await open();assert(ids.every(id=>fresh.fashionInfo.activateFashion.includes(id)));assert.equal((await rpc(1802,{id:29040,color:0,set:0})).result,0);
result={result:'PASS',serverId:sid,liveRepair:true,duplicateYuanbao:2000,push1800:true,wear1802:true,eventShopNewGrant:true,shopRepeatRejected:true,relogOwned:true,repeatRepairNoDuplicate:true,hmacRejectedBadSignature:true,realPlayerWrites:0};
}finally{await close();for(const w of pending){clearTimeout(w.t);w.reject(Error('QA_CLOSED'));}if(inserted){await db.collection('players').deleteOne({userId,playerId});await db.collection('mails').deleteMany({userId});assert.equal(await db.collection('players').countDocuments({userId}),0);}await c.close();}
fs.writeFileSync(path.join(__dirname,'../qa-'+sid+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
