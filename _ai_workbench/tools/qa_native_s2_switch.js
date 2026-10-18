'use strict';
const APP='/linhhoasu/lhs/newServer',assert=require('assert/strict'),crypto=require('crypto');
const {MongoClient}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt'),WebSocket=require(APP+'/node_modules/ws');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec'),{packRequest,unpackResponse}=require(APP+'/src/protocol/ReqCodec');
const client=new MongoClient('mongodb://127.0.0.1:27017'),id='qa_switch_'+crypto.randomBytes(5).toString('hex'),password=crypto.randomBytes(16).toString('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function sdk(sid){return new Promise((resolve,reject)=>{const b=packRequest(2820,{uid:id,token:password,...(sid?{serverId:sid}:{})});const req=require('http').request({host:'127.0.0.1',port:81,path:'/gameMsg.do',method:'POST',headers:{Host:'103.116.105.154:81','Content-Type':'application/octet-stream','Content-Length':b.length}},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>resolve(unpackResponse(Buffer.concat(chunks))));});req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('SDK_TIMEOUT')));req.end(b);});}
function login(auth,server){return new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:81/'+(server===1002?'ws-s2':'ws'));let ack=null,player=false;const timer=setTimeout(()=>{ws.terminate();reject(Error('WS_TIMEOUT'));},15000);function finish(value){clearTimeout(timer);ws.close();resolve(value);}
ws.on('error',e=>{clearTimeout(timer);reject(e)});ws.on('open',()=>ws.send(Pack(1,{userid:auth.userId,userToken:auth.userToken,platformuid:auth.uid,serverid:server,firstName:'gc_'},91001)));
ws.on('message',raw=>{const b=Buffer.from(raw);let rows;try{rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(rows)?rows:[rows]){if(p.tag===1){ack=p.data;if(ack.result!==0)return finish({result:ack.result,code:ack.code||ack.msg});}if(p.tag===500)player=true;}if(ack&&player)finish({result:0,player500:true});});});}
(async()=>{await client.connect();const accounts=client.db('lhs_s1001').collection('accounts');let created=false;
try{await accounts.insertOne({accountId:id,passwordHash:await bcrypt.hash(password,10),status:1,authVersion:1,roles:[],activeRoleByServer:{},createdAt:new Date()});created=true;
const first=await sdk();assert.equal(first.ret,0);const s1=await client.db('lhs_s1001').collection('players').findOne({userId:first.userId});assert(s1);
const initial=await login(first,1002);await wait(1300);
if(process.env.EXPECT_SWITCH_FIXED!=='1'){console.log('SWITCH_QA='+JSON.stringify({result:'REPRODUCED',nativeDefaultAuthServer:1001,selectedServer:1002,initial}));return;}
assert.equal(initial.result,0,'fresh target role');assert(initial.player500);
let a=await accounts.findOne({accountId:id});const r2=a.roles.filter(r=>r.serverId===1002);assert.equal(r2.length,1);
const c2=client.db('lhs_s1002').collection('players');let before=await c2.findOne({userId:r2[0].userId});assert(before);
await c2.updateOne({_id:before._id},{$set:{level:37,'items.55':1234,'systemUnlockInfo.settings.qaSwitchSentinel':true}});
const second=await login(first,1002);assert.equal(second.result,0);await wait(1300);
const after=await c2.findOne({_id:before._id});assert.equal(after.items[55],1234);assert.equal(after.systemUnlockInfo.settings.qaSwitchSentinel,true);assert(after.level>=37);
a=await accounts.findOne({accountId:id});assert.equal(a.roles.filter(r=>r.serverId===1002).length,1);
const s1After=await client.db('lhs_s1001').collection('players').findOne({_id:s1._id});assert.deepEqual(s1After,s1,'S1 changed during S2 login');
const direct=await sdk(1002);assert.equal(direct.ret,0);assert.equal((await login(direct,1002)).result,0);await wait(1300);
console.log('SWITCH_QA='+JSON.stringify({result:'PASS',freshRole:true,existingRolePreserved:true,s1ByteStateUnchanged:true,noDuplicateRole:true,nativeS1TokenToS2:true,directS2Token:true,player500:true}));
}finally{if(created){await wait(500);for(const db of ['lhs_s1001','lhs_s1002'])await client.db(db).collection('players').deleteMany({accountId:id});await accounts.deleteOne({accountId:id});for(const db of ['lhs_s1001','lhs_s1002'])assert.equal(await client.db(db).collection('players').countDocuments({accountId:id}),0);assert.equal(await accounts.countDocuments({accountId:id}),0);}await client.close();console.log('SWITCH_QA_CLEANUP=0');}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
