'use strict';
// Only this test's random QA profile/mail are inserted and cleaned up.
const crypto=require('crypto'),assert=require('assert/strict'),APP='/linhhoasu/lhs/newServer';
const WS=require(APP+'/node_modules/ws'),{MongoClient}=require(APP+'/node_modules/mongodb'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const sid=Number(process.argv[2]);assert([1001,1002].includes(sid));
const base='qafbox_'+crypto.randomBytes(6).toString('hex'),userId=base+'_s'+sid,playerId=crypto.randomBytes(12).toString('hex');
const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000});let db,ws,inserted=false,mailId,result,uid=78000;const pending=new Set(),packets=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function recv(tag,msgUid){const p=new Promise((resolve,reject)=>{const w={tag,msgUid,resolve,reject,t:setTimeout(()=>{pending.delete(w);reject(Error('QA_TIMEOUT_'+tag));},12000)};pending.add(w);});p.catch(()=>{});return p;}
async function rpc(tag,data){const seq=++uid,p=recv(tag,seq);ws.send(Pack(tag,data,seq));return p;}
async function connect(){ws=new WS('ws://127.0.0.1:'+(sid===1001?9200:9201),{headers:{Origin:'http://127.0.0.1'}});ws.on('message',raw=>{const b=Buffer.from(raw);let rows;try{rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}catch{return;}for(const p of Array.isArray(rows)?rows:[rows]){packets.push(p);for(const w of [...pending])if(w.tag===p.tag&&(w.msgUid==null||w.msgUid===p.msgUid)){clearTimeout(w.t);pending.delete(w);w.resolve(p.data);}}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const login=recv(500);assert.equal((await rpc(1,{platformuid:base,userId:base,userid:base,serverid:sid,serverId:sid,firstName:'BQ'+base.slice(-6)})).result,0);return login;}
async function close(){if(ws&&ws.readyState!==WS.CLOSED){const done=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([done,wait(800)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}await wait(600);}
const read=()=>db.collection('players').findOne({userId,playerId});
(async()=>{await client.connect();db=client.db('lhs_s'+sid);try{
 const p=await db.collection('players').findOne({isBot:true});assert(p);delete p._id;delete p.__v;delete p.inviteCode;delete p.botWorker;
 Object.assign(p,{userId,playerId,name:'BQ'+base.slice(-6),serverId:sid,isBot:false,accountId:'',guildId:'',guildInfo:{},arenaScore:0,level:120,exp:0,moderation:{},
  rechargeInfo:{area:1,records:[],monthCards:{},totalRecharge:0},shopInfo:{buyRecords:{}},activityInfo:{datas:[]},taskInfo:{},other_attr_info:{},mailClaimLedger:[],
  fashionInfo:{fashion:{},curFashion:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,dress:[],suits:{}},items:{4:0,28370:1,28380:1,28410:1},currencies:{diamond:0,silver:0,gold:0}});
 await db.collection('players').insertOne(p);inserted=true;
 const mail=await db.collection('mails').insertOne({userId,title:'QA box open',content:'QA only',sender:'QA',attachments:[{id:28350,count:2},{id:29010,count:1},{id:28340,count:1},{id:29800,count:1},{id:28320,count:1}],claimed:false,read:false,expireAt:new Date(Date.now()+3600000)});mailId=mail.insertedId;
 await connect();assert.equal((await rpc(1103,{ids:[String(mailId)]})).result,0);let row=await read();assert.equal(row.items[28350],2);assert(!row.fashionInfo.activateFashion.includes(28351));
 assert.equal((await rpc(1103,{ids:[String(mailId)]})).result,0);assert.equal((await read()).items[28350],2);
 const epoch=await rpc(2499,{});let seq=epoch.sequence;const request=()=> 'v3_'+epoch.epoch+'_'+(++seq);
 const first={index:28350,count:1,requestId:request()};assert.equal((await rpc(1300,first)).result,0);row=await read();assert.equal(row.items[28350],1);assert([28351,28352,28353,28359].every(id=>row.fashionInfo.activateFashion.includes(id)));
 assert.equal((await rpc(1300,first)).replayed,true);assert.equal((await read()).items[28350],1);
 assert.equal((await rpc(1300,{index:28350,count:1,requestId:request()})).result,0);assert.equal((await read()).currencies.diamond,1500);
 for(const id of [28370,28380,28410]){assert.equal((await rpc(1300,{index:id,count:1,requestId:request()})).code,'FASHION_BOX_CONFIG_INVALID');assert.equal((await read()).items[id],1);}
 for(const id of [29010,28340,29800,28320]){assert.equal((await rpc(1300,{index:id,count:1,requestId:request()})).result,0);assert.equal((await rpc(1802,{id,color:0,set:0,requestId:request()})).result,0);}
 assert.equal((await rpc(1802,{id:28350,color:0,set:0,requestId:request()})).result,0);
 assert(packets.some(p=>p.tag===1800&&(p.data.fashion||[]).includes(28351)));
 await close();const login=await connect();assert.equal(login.fashionInfo.fashion[301],28351);assert(login.fashionInfo.activateFashion.includes(28359));assert.equal((await rpc(1300,first)).replayed,true);row=await read();assert.equal(row.items[28350],0);assert.equal(row.currencies.diamond,1500);
 result={result:'PASS',serverId:sid,mail:true,mailReplay:true,opened:[28350,29010,28340,29800,28320],unsupportedKept:[28370,28380,28410],duplicateDiamond:1500,epochReplay:true,wear:true,relog:true,realPlayerWrites:0};
}finally{await close();for(const w of pending){clearTimeout(w.t);w.reject(Error('QA_CLOSED'));}if(inserted){assert(userId.startsWith('qafbox_'));await db.collection('mails').deleteMany({userId});await db.collection('players').deleteOne({userId,playerId});assert.equal(await db.collection('players').countDocuments({userId}),0);assert.equal(await db.collection('mails').countDocuments({userId}),0);}await client.close();}
 console.log(JSON.stringify({...result,qaProfileRemoved:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
