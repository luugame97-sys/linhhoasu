'use strict';
const APP='/linhhoasu/lhs/newServer',assert=require('assert/strict'),crypto=require('crypto');
const {MongoClient}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt'),WS=require(APP+'/node_modules/ws');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec'),{packRequest,unpackResponse}=require(APP+'/src/protocol/ReqCodec');
const db=new MongoClient('mongodb://127.0.0.1:27017'),id='qa_recent_'+crypto.randomBytes(8).toString('hex'),password=crypto.randomBytes(20).toString('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function sdk(sid){return new Promise((resolve,reject)=>{const b=packRequest(2820,{uid:id,token:password,...(sid?{serverId:sid}:{})});const r=require('http').request({host:'127.0.0.1',port:8080,path:'/gameMsg.do',method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Length':b.length}},res=>{const a=[];res.on('data',d=>a.push(d));res.on('end',()=>resolve(unpackResponse(Buffer.concat(a))));});r.on('error',reject);r.setTimeout(12000,()=>r.destroy(Error('SDK_TIMEOUT')));r.end(b);});}
function login(auth,sid){return new Promise((resolve,reject)=>{const ws=new WS('ws://127.0.0.1:'+(sid===1002?'9201':'9200')+'/');let ack=false,player=false,done=false;
const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);ws.close();err?reject(err):resolve();};
const timer=setTimeout(()=>{ws.terminate();finish(Error('WS_TIMEOUT'));},20000);
ws.on('error',finish);ws.on('open',()=>ws.send(Pack(1,{userid:auth.userId,userToken:auth.userToken,platformuid:auth.uid,serverid:sid},91001)));
ws.on('message',raw=>{try{const b=Buffer.from(raw),v=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));for(const p of Array.isArray(v)?v:[v]){if(p.tag===1){if(p.data.result!==0)return finish(Error('LOGIN_REJECTED'));ack=true;}if(p.tag===500)player=true;}if(ack&&player)finish();}catch(e){finish(e);}});});}
(async()=>{await db.connect();const accounts=db.db('lhs_s1001').collection('accounts');let created=false;
try{
await accounts.insertOne({accountId:id,passwordHash:await bcrypt.hash(password,10),status:1,authVersion:1,roles:[],activeRoleByServer:{},createdAt:new Date()});created=true;
let auth=await sdk();assert.equal(auth.ret,0);
await login(auth,1001);await wait(700);
auth=await sdk();assert.equal(Number(auth.defaultServerData.serverId),1001);
await login(auth,1002);await wait(700);
let a=await accounts.findOne({accountId:id});assert.equal(a.lastSelectedServerId,1002);
const t=a.roles.find(r=>r.serverId===1002).lastLoginTime;assert(t>0);
auth=await sdk(1002);assert.equal(auth.ret,0);assert.equal(Number(auth.defaultServerData.serverId),1002);assert.equal(Number(auth.recentLoginServers[0].serverId),1002);
a=await accounts.findOne({accountId:id});assert.equal(a.lastSelectedServerId,1002);assert.equal(a.roles.find(r=>r.serverId===1002).lastLoginTime,t);
await login(auth,1002);await wait(700);auth=await sdk(1002);assert.equal(Number(auth.defaultServerData.serverId),1002);
await login(auth,1001);await wait(700);auth=await sdk();assert.equal(Number(auth.defaultServerData.serverId),1001);assert.equal(Number(auth.recentLoginServers[0].serverId),1001);
console.log(JSON.stringify({result:'PASS',s1ToS2:true,reopenPreservesS2:true,relogS2:true,s2ToS1:true,nativeProtocol:true,realPlayerWrites:0}));
}finally{
if(created){await wait(1800);for(const name of ['lhs_s1001','lhs_s1002'])await db.db(name).collection('players').deleteMany({accountId:id});await accounts.deleteOne({accountId:id});for(const name of ['lhs_s1001','lhs_s1002'])assert.equal(await db.db(name).collection('players').countDocuments({accountId:id}),0);assert.equal(await accounts.countDocuments({accountId:id}),0);console.log('QA_ACCOUNT_PLAYER_CLEANUP=0');}
await db.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
