'use strict';
// Mutates only one newly-created QA character and its exact code/mail IDs.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const APP='/linhhoasu/lhs/newServer';
const {MongoClient,ObjectId}=require(APP+'/node_modules/mongodb');
const WebSocket=require(APP+'/node_modules/ws');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec');
const cfg=require(APP+'/src/services/ConfigService');
const server=Number(process.env.QA_SERVER_ID||1001),port=server===1001?9200:9201;
const uid='qa_reward_'+crypto.randomBytes(8).toString('hex'),dbUid=uid+'_s'+server,role=crypto.randomBytes(12).toString('hex');
const code='QAR'+crypto.randomBytes(8).toString('hex').toUpperCase(),codeId=new ObjectId(),mailId=new ObjectId();
const client=new MongoClient('mongodb://127.0.0.1:27017');
let ws,seq=17000,inserted=false;const observed=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function receive(match){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('QA_PACKET_TIMEOUT'));},20000);const on=p=>{if(match(p)){off();resolve(p);}};function off(){clearTimeout(timer);ws.off('qa',on);}ws.on('qa',on);});}
async function rpc(tag,data,msgUid=++seq){const got=receive(p=>p.tag===tag&&p.msgUid===msgUid);ws.send(Pack(tag,data,msgUid));return got;}
async function open(){ws=new WebSocket('ws://127.0.0.1:'+port,{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:10000});
 ws.on('message',raw=>{const b=Buffer.from(raw);let values;try{values=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}
  for(const p of Array.isArray(values)?values:[values]){observed.push(p);ws.emit('qa',p);}});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const init=receive(p=>p.tag===500&&p.data);assert.equal((await rpc(1,{platformuid:uid,userid:uid,userId:uid,serverid:server,serverId:server,firstName:'QA Reward'})).data.result,0);return(await init).data;}
function owns(p,id,kind){if(kind==='elf')return p.other_attr_info.elfInfo?.elfData.some(r=>r.id===id);
 if(kind==='curios')return p.other_attr_info.curiosInfo?.curiosData.some(r=>r.id===id);
 if(kind==='orb')return p.artifactInfo.orbInfo?.orbData.some(r=>r.id===id);
 return p.other_attr_info.valhallaFormationInfo?.connect.some(r=>r.id===id&&r.count>0);}
(async()=>{
 await client.connect();const db=client.db('lhs_s'+server),players=db.collection('players');
 try{
  const p=await players.findOne({isBot:true});assert(p);delete p._id;delete p.__v;
  Object.assign(p,{userId:dbUid,playerId:role,name:'QA Reward Contract',accountId:'',isBot:false,guildId:'',guildInfo:{},serverId:server,level:99,exp:0,
    items:{1001:10000000,1002:10000000,1003:10000000,110122:30,110123:30,110142:30,90151:2,100139:1},
    currencies:{diamond:1000000,silver:1000000,gold:1000000},rechargeInfo:{area:1,records:[],monthCards:{},periodRecords:{}},shopInfo:{buyRecords:{},pack:[]},
    activityInfo:{datas:[],giftCodeRecords:{}},itemUseRecords:{},artifactInfo:{},other_attr_info:{},mailClaimLedger:[]});delete p.botWorker;
  await players.insertOne(p);inserted=true;
  await db.collection('redemptioncodes').insertOne({_id:codeId,code,status:'active',rewards:{items:{154102:1,131302:1,9101:1,200414:1}},maxUses:1,perUserLimit:1,usedCount:0,usedBy:[],note:uid,createdAt:new Date()});
  await db.collection('mails').insertOne({_id:mailId,userId:dbUid,title:'QA Reward',attachments:[{id:154103,count:1},{id:131303,count:1},{id:9111,count:1},{id:200101,count:1}].filter(r=>cfg.get('AssetsConfig')[r.id]),claimed:false,read:false,eventKey:uid,expireAt:new Date(Date.now()+3600000)});
  await open();let purchases=0;const snapshots=[];
  for(const id of [11000015,11000016,11000017,11000020]){const r=await rpc(1230,{id,multi:1});assert.equal(r.data.result,0,'payId '+id);purchases++;}
  for(const id of [90027,90202,90214]){const r=await rpc(1300,{index:id,count:1,selects:{0:1}});assert.equal(r.data.result,0,'box '+id);const out=cfg.get('AssetsUseConfig')[id].rewards[0].id;snapshots.push({id:out,kind:id===90027?'elf':id===90202?'orb':'connect'});}
  const codes=await rpc(1750,{giftCode:code});assert.equal(codes.data.result,0);
  const codeAgain=await rpc(1750,{giftCode:code});assert.notEqual(codeAgain.data.result,0);
  const claim=await rpc(1103,{ids:[String(mailId)]});assert.equal(claim.data.result,0);
  const claimAgain=await rpc(1103,{ids:[String(mailId)]});assert.equal((claimAgain.data.rewardInfo?.items||[]).length,0);
  const firstPill=await rpc(1300,{index:110122,count:10});assert.equal(firstPill.data.result,0);
  assert.equal((await rpc(1300,{index:110123,count:1})).data.code,'ITEM_PILL_DAILY_LIMIT');
  assert.equal((await rpc(1300,{index:110142,count:2})).data.result,0);
  assert.equal((await rpc(1300,{index:90151,count:1,selects:{1:1}})).data.code,'ITEM_REWARD_POOL_UNVERIFIED');
  assert.equal((await rpc(1300,{index:100139,count:1})).data.code,'ITEM_REWARD_POOL_UNVERIFIED');
  let saved=await players.findOne({userId:dbUid,playerId:role});
  for(const x of [...snapshots,{id:130601,kind:'curios'},{id:154102,kind:'elf'},{id:131302,kind:'curios'},{id:9101,kind:'orb'},{id:200414,kind:'connect'}]){assert(owns(saved,x.id,x.kind),'missing '+x.id);assert.equal(saved.items[x.id]||0,0,'bag '+x.id);}
  assert.equal(saved.itemUseRecords[-802],10);assert.equal(saved.itemUseRecords[-804],2);assert.equal(saved.items[90151],2);assert.equal(saved.items[100139],1);
  const requiredTags=[6001,5200,6401,6801];for(const tag of requiredTags)assert(observed.some(p=>p.tag===tag&&p.msgUid===0),'sync '+tag);
  ws.close();await wait(1000);await open();saved=await players.findOne({userId:dbUid,playerId:role});assert(owns(saved,130601,'curios'));assert.equal(saved.itemUseRecords[-802],10);
  assert.equal((await rpc(1300,{index:110123,count:1})).data.code,'ITEM_PILL_DAILY_LIMIT');
  console.log('REWARD_LIVE='+JSON.stringify({result:'PASS',serverId:server,purchases,openedNativeBoxes:3,codeClaimAndRetry:true,mailClaimAndRetry:true,pillGlobalCap:true,nativeState:true,syncTags:requiredTags,relog:true,heldItemsPreserved:true,nativeVisualTest:false}));
 }finally{
  if(ws){ws.close();await wait(1500);if(ws.readyState!==WebSocket.CLOSED)ws.terminate();}
  if(inserted){await players.deleteOne({userId:dbUid,playerId:role});await wait(1000);assert.equal(await players.countDocuments({userId:dbUid,playerId:role}),0);}
  await db.collection('redemptioncodes').deleteOne({_id:codeId,code,note:uid});await db.collection('mails').deleteOne({_id:mailId,userId:dbUid});
  assert.equal(await db.collection('redemptioncodes').countDocuments({_id:codeId}),0);assert.equal(await db.collection('mails').countDocuments({_id:mailId}),0);
  await client.close();console.log('REWARD_CLEANUP='+JSON.stringify({result:'PASS',remaining:0}));
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
