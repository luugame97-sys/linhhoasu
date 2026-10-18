'use strict';
const APP='/linhhoasu/lhs/newServer',assert=require('assert/strict'),crypto=require('crypto');
const {MongoClient}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt');
const {packRequest,unpackResponse}=require(APP+'/src/protocol/ReqCodec');
const id='qa_latest_'+crypto.randomBytes(5).toString('hex'),password=crypto.randomBytes(16).toString('hex'),c=new MongoClient('mongodb://127.0.0.1:27017');
function http(cmd,params){return new Promise((resolve,reject)=>{const b=packRequest(cmd,params);const req=require('http').request({host:'127.0.0.1',port:81,path:'/gameMsg.do',method:'POST',headers:{Host:'103.116.105.154:81','Content-Type':'application/octet-stream','Content-Length':b.length}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve(unpackResponse(Buffer.concat(chunks))));});req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('TIMEOUT')));req.end(b);});}
(async()=>{await c.connect();const accounts=c.db('lhs_s1001').collection('accounts');let created=false;try{
 const latest=await http(3075,{});assert.equal(latest.newServerName,'S2');assert.equal(latest.newServerData.serverId,1002);assert.equal(latest.newServerData.url,'103.116.105.154:81/ws-s2');
 await accounts.insertOne({accountId:id,passwordHash:await bcrypt.hash(password,10),roles:[],activeRoleByServer:{},status:1,authVersion:1});created=true;
 const login=await http(2820,{uid:id,token:password});assert.equal(login.ret,0);assert.equal(login.defaultServerData.serverId,1001);assert.equal(login.newServerData.serverId,1002);assert.equal(login.newServerName,'S2');assert(login.recentLoginServers.some(x=>x.serverId===1001));
 console.log('LATEST_SERVER_QA='+JSON.stringify({result:'PASS',latestName:login.newServerName,latestId:login.newServerData.serverId,defaultId:login.defaultServerData.serverId,protocol3075:true,recentListPreserved:true}));
}finally{if(created){for(const db of ['lhs_s1001','lhs_s1002']){await c.db(db).collection('players').deleteMany({accountId:id});assert.equal(await c.db(db).collection('players').countDocuments({accountId:id}),0);}await accounts.deleteOne({accountId:id});assert.equal(await accounts.countDocuments({accountId:id}),0);}await c.close();console.log('LATEST_QA_CLEANUP=0');}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
