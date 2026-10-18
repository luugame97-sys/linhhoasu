'use strict';
// Native SDK/WS QA using an account owned by this invocation. No real player writes.
const APP='/linhhoasu/lhs/newServer';
const assert=require('assert/strict'),crypto=require('crypto'),http=require('http');
const {MongoClient}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt'),WS=require(APP+'/node_modules/ws'),Redis=require(APP+'/node_modules/ioredis');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec'),{packRequest,unpackResponse}=require(APP+'/src/protocol/ReqCodec');
const sid=Number(process.argv[2]);assert([1001,1002,1003,1004].includes(sid));
const cfg=require(APP+'/ecosystem.config.js').apps.find(p=>p.name==='lhs-s1001').env;
const redis=new Redis(cfg.REDIS_URL,{keyPrefix:cfg.AUTH_REDIS_PREFIX,maxRetriesPerRequest:1});
const db=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000});
const accountId='qa_kaka_'+crypto.randomBytes(6).toString('hex'),password='Qa7_'+crypto.randomBytes(12).toString('hex');
assert(/^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(accountId));assert(password.length<=32);
const baselineMode=process.argv.includes('--baseline');
const tokens=new Set(),pending=new Set(),packets=[];let ws,uid=84000,auth,created=false,ownedPlayer,sdkReadyRetries=0,phase='init',heartbeat;
function progress(value){phase=value;console.log('QA_PROGRESS='+JSON.stringify({serverId:sid,phase}));}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function sdk(){return new Promise((resolve,reject)=>{const body=packRequest(2820,{uid:accountId,token:password,serverId:sid});const req=http.request({host:'127.0.0.1',port:81,path:'/gameMsg.do',method:'POST',headers:{Host:'103.116.105.154:81','Content-Type':'application/octet-stream','Content-Length':body.length}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{try{const r=unpackResponse(Buffer.concat(chunks));if(r.userToken)tokens.add(r.userToken);resolve(r);}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(12000,()=>req.destroy(Error('SDK_TIMEOUT')));req.end(body);});}
function receive(tag,msgUid){const promise=new Promise((resolve,reject)=>{const w={tag,msgUid,resolve,reject,t:setTimeout(()=>{pending.delete(w);reject(Error('RPC_TIMEOUT_'+tag+' phase='+phase+' recentTags='+packets.slice(-15).map(p=>p.tag).join(',')));},45000)};pending.add(w);});promise.catch(()=>{});return promise;}
async function rpc(tag,data){const seq=++uid,p=receive(tag,seq);ws.send(Pack(tag,data,seq));return p;}
async function login(){
 const deadline=Date.now()+40000;
 do{auth=await sdk();if(auth.ret===0||auth.code!=='SERVER_NODE_UNAVAILABLE'||Date.now()>=deadline)break;sdkReadyRetries++;await wait(1000);}while(true);
 assert.equal(auth.ret,0,'SDK_AUTH:'+(auth.code||'NO_CODE'));const snapshot=receive(500);ws=new WS('ws://127.0.0.1:81/'+(sid===1001?'ws':'ws-s'+(sid-1000)),{headers:{Origin:'http://127.0.0.1'}});
 ws.on('message',raw=>{try{const b=Buffer.from(raw),rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));for(const p of Array.isArray(rows)?rows:[rows]){packets.push(p);for(const w of [...pending])if(p.tag===w.tag&&(w.msgUid==null||w.msgUid===p.msgUid)){clearTimeout(w.t);pending.delete(w);w.resolve(p.data);}}}catch(e){for(const w of [...pending]){clearTimeout(w.t);pending.delete(w);w.reject(e);}}});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const a=await rpc(1,{userid:auth.userId,userToken:auth.userToken,platformuid:auth.uid,serverid:sid});assert.equal(a.result,0);heartbeat=setInterval(()=>{if(ws?.readyState===WS.OPEN)ws.send(Pack(11,{},++uid));},5000);heartbeat.unref();return snapshot;
}
async function close(){clearInterval(heartbeat);if(ws&&ws.readyState!==WS.CLOSED){const closed=new Promise(r=>ws.once('close',r));ws.close();await Promise.race([closed,wait(800)]);if(ws.readyState!==WS.CLOSED)ws.terminate();}await wait(600);}
async function main(){
 await db.connect();const accounts=db.db('lhs_s1001').collection('accounts'),players=db.db('lhs_s'+sid).collection('players');
 const result={result:'FAIL',serverId:sid,realPlayerWrites:0,checks:[]};
 try{
  assert.equal(await accounts.countDocuments({accountId}),0);
  await accounts.insertOne({accountId,passwordHash:await bcrypt.hash(password,10),status:1,authVersion:1,roles:[],activeRoleByServer:{},createdAt:new Date()});created=true;
  progress('initial-login');await login();await close();ownedPlayer=await players.findOne({accountId});assert(ownedPlayer&&Number(ownedPlayer.serverId)===sid,'QA_ROLE_IDENTITY');
  const ids=[28321,28322,28323,28329,28324,28331,28332,28333,28339,28334,28416];
  const fashionInfo={fashion:{304:-1},curFashion:{304:-1},fashionMap:{304:-1},equipped:{304:-1},fashions:Object.fromEntries(ids.map(id=>[id,1])),activateFashion:ids,fashionData:[],sets:[],setId:0,suits:{},dress:[]};
  const cas=await players.updateOne({_id:ownedPlayer._id,accountId,userId:ownedPlayer.userId,updatedAt:ownedPlayer.updatedAt},{$set:{fashionInfo,level:120}});assert.equal(cas.modifiedCount,1,'QA_SEED_CAS');
  progress('seeded-login');const loginState=await login();assert(loginState.fashionInfo.activateFashion.includes(28324));
  const epoch=await rpc(2499,{});assert.equal(epoch.result,0);let sequence=epoch.sequence;
  const req=()=>({requestId:'v3_'+epoch.epoch+'_'+(++sequence)});
  const read=()=>players.findOne({_id:ownedPlayer._id,accountId,userId:ownedPlayer.userId},{projection:{fashionInfo:1,items:1,currencies:1,roleInfo:1}});
  const before=await read();
  if(baselineMode){
   for(const [dress,effect]of [[28320,28324],[28330,28334]]){
    assert.equal((await rpc(1802,{id:dress,color:0,set:0,...req()})).result,0);
    const r=await rpc(1801,{id:effect,type:304,set:0,...req()});assert.equal(r.result,-1);assert.equal(r.code,'FASHION_WHOLE_SUIT_REQUIRED');
    result.checks.push({dress,effect,baselineFailure:r.code});
   }
   await close();progress('baseline-relog');const restored=await login();assert(restored.fashionInfo.activateFashion.includes(28324));
   result.result='PASS';result.authPreflight=true;result.relog=true;
  }else{
  progress('effect-and-preset-tests');
  for(const [dress,effect]of [[28320,28324],[28330,28334]]){
   assert.equal((await rpc(1802,{id:dress,color:0,set:0,...req()})).result,0,'WEAR_'+dress);
   for(const id of [effect,-1,effect]){const request={id,type:304,set:0,...req()},r=await rpc(1801,request);assert.equal(r.result,0,'EFFECT_'+id);assert.equal((await read()).fashionInfo.fashion[304],id,'READ_BACK');const replay=await rpc(1801,request);assert(replay.replayed);assert.equal(replay.selection[304],id);}
   result.checks.push({dress,effect,wear:true,toggle:true,replay:true,dbReadBack:true});
  }
  assert.equal((await rpc(1801,{id:28324,type:304,set:0,...req()})).result,0);
  assert.equal((await rpc(1801,{id:28334,type:304,set:1,...req()})).result,0);
  assert.equal((await rpc(1805,{setId:0,...req()})).result,0);assert.equal((await read()).fashionInfo.fashion[304],28324);
  assert.equal((await rpc(1805,{setId:1,...req()})).result,0);assert.equal((await read()).fashionInfo.fashion[304],28334);
  for(const data of [{id:28321,type:304,set:1},{id:99999999,type:304,set:1},{id:28323,type:303,set:1},{id:28324,type:304,set:8}])assert.notEqual((await rpc(1801,{...data,...req()})).result,0,'INVALID_ACCEPTED');
  assert.equal((await rpc(1801,{id:28416,type:306,set:1,...req()})).result,0);
  const after=await read();assert.deepEqual(after.currencies,before.currencies);assert.deepEqual(after.items,before.items);
  await close();progress('final-relog');const restored=await login();assert.equal(restored.fashionInfo.fashion[304],28334);assert.equal(restored.fashionInfo.setId,1);assert.equal((await read()).fashionInfo.fashion[304],28334);
  assert(packets.some(p=>p.tag===1800&&p.data.selection?.[304]===28324));
  result.result='PASS';Object.assign(result,{presetRestore:true,relog:true,negativeChecks:4,opening306:true,selectionPush:true,economyUnchanged:true});
  }
 }finally{
  progress('cleanup');
  await close();for(const w of [...pending]){clearTimeout(w.t);pending.delete(w);w.reject(Error('QA_CLOSED'));}
  if(created){
   const owned=await players.find({accountId},{projection:{_id:1,userId:1,playerId:1}}).toArray();
   const scoped=new Redis(cfg.REDIS_URL,{keyPrefix:'s'+sid+':',maxRetriesPerRequest:1});
   try{for(const p of owned){for(const rank of ['arena','tower','crossArena','crossRival','topArena'])await scoped.zrem('rank:'+rank,p.playerId);await players.deleteOne({_id:p._id,accountId,userId:p.userId});await db.db('lhs_s'+sid).collection('mails').deleteMany({userId:p.userId});}}finally{await scoped.quit();}
   for(const token of tokens)await redis.del('auth:session:'+token);await redis.del('auth:account:'+accountId);
   await accounts.deleteOne({accountId});assert.equal(await accounts.countDocuments({accountId}),0);assert.equal(await players.countDocuments({accountId}),0);result.qaResidue=0;
  }
  await redis.quit();await db.close();
 }
 result.sdkReadyRetries=sdkReadyRetries;console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
