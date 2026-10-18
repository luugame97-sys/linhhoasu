'use strict';
const APP='/linhhoasu/lhs/newServer',assert=require('assert/strict'),crypto=require('crypto');
const {MongoClient,ObjectId}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt');
const {packRequest,unpackResponse}=require(APP+'/src/protocol/ReqCodec');
const client=new MongoClient('mongodb://127.0.0.1:27017');
const {Pack,Unpack}=require(APP+'/src/protocol/Codec');const WebSocket=require(APP+'/node_modules/ws');
async function wsLogin(auth){return new Promise((resolve,reject)=>{
 const ws=new WebSocket('ws://'+auth.defaultServerData.url,{headers:{Origin:'http://103.116.105.154:81'}});let ack=false,stage=false;
 const timer=setTimeout(()=>{ws.terminate();reject(Error('WS_LOGIN_TIMEOUT'));},15000);
 ws.on('error',e=>{clearTimeout(timer);reject(e)});
 ws.on('open',()=>ws.send(Pack(1,{platformuid:auth.userId,userid:auth.userId,userId:auth.userId,userToken:auth.userToken,serverid:1002,serverId:1002},50001)));
 ws.on('message',raw=>{const b=Buffer.from(raw);let rows;try{rows=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}for(const p of Array.isArray(rows)?rows:[rows]){if(p.tag===1){if(p.data.result!==0){clearTimeout(timer);ws.close();reject(Error('WS_AUTH_FAILED:'+p.data.result));return;}ack=true;}if(p.tag===500)stage=true;}if(ack&&stage){clearTimeout(timer);ws.close();resolve({ack:true,player500:true});}});
});}
const id='qa_s2auth_'+crypto.randomBytes(6).toString('hex'),password=crypto.randomBytes(16).toString('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function sdkHttp(port,body){return new Promise((resolve,reject)=>{const req=require('http').request({host:'127.0.0.1',port,path:'/gameMsg.do',method:'POST',headers:{Host:'103.116.105.154:81','Content-Type':'application/octet-stream','Content-Length':body.length}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,data:unpackResponse(Buffer.concat(chunks))}));});req.setTimeout(15000,()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end(body);});}
(async()=>{await client.connect();const accountDb=client.db('lhs_s1001');let inserted=false;
try{
 await accountDb.collection('accounts').insertOne({accountId:id,passwordHash:await bcrypt.hash(password,10),roles:[],activeRoleByServer:{},status:1,authVersion:1,createdAt:new Date()});inserted=true;
 const results=[];
 for(const port of [81,8083]){
  const t=Date.now();const r=await sdkHttp(port,packRequest(2820,{uid:id,token:password,serverId:1002}));
  const x=r.data;results.push({route:'SDK2820',port,status:r.status,ms:Date.now()-t,ret:x.ret,code:x.code,errInfo:x.errInfo,hasToken:!!x.userToken,endpoint:x.defaultServerData&&{url:x.defaultServerData.url,host:x.defaultServerData.host,port:x.defaultServerData.port,serverId:x.defaultServerData.serverId}});
  if(process.env.S2_EXPECT_FIXED==='1'&&port===81){assert.equal(x.defaultServerData.host,'103.116.105.154');results.push({route:'public-WS-S2',...(await wsLogin(x))});await sleep(1500);}
 }
 for(const port of [81,8083]){
  const t=Date.now();const r=await fetch('http://127.0.0.1:'+port+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:id,password,serverId:1002}),signal:AbortSignal.timeout(15000)});
  const x=await r.json();results.push({port,status:r.status,ms:Date.now()-t,success:x.success,code:x.code,message:x.message,roles:(x.data?.roles||[]).map(r=>({serverId:r.serverId})),hasToken:!!x.data?.userToken});
 }
 console.log('S2_AUTH_PROBE='+JSON.stringify({generatedAt:new Date().toISOString(),results}));
}finally{
 if(inserted){const a=await accountDb.collection('accounts').findOne({accountId:id});for(const r of a?.roles||[]){if(r.serverId!==1002)throw Error('unexpected QA role');for(const db of ['lhs_s1001','lhs_s1002'])await client.db(db).collection('players').deleteOne({userId:r.userId,accountId:id});}await accountDb.collection('accounts').deleteOne({accountId:id});}
 await client.close();console.log('QA_CLEANUP=done');
}})().catch(e=>{console.error(e.message);process.exitCode=1;});
