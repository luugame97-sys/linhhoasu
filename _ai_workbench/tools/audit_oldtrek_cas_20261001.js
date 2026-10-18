'use strict';
// Query exact stored preimages only; no writes or authenticated gameplay calls.
const fs=require('fs'),cp=require('child_process'),{MongoClient}=require('mongodb');
const proc=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:5e6})).find(p=>p.name==='lhs-s1001');
const env={...require('dotenv').parse(fs.readFileSync('.env')),...proc.pm2_env};
const c=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,socketTimeoutMS:10000,maxPoolSize:1});
(async()=>{try{
await c.connect(); const col=c.db().collection('players'),uid='u_Wk_1001_d7b1ec_1787996263464';
const p=await col.findOne({userId:uid},{projection:{_id:0,userId:1,level:1,exp:1,roleInfo:1,items:1,currencies:1,'other_attr_info.oldTrekInfo':1},maxTimeMS:5000});if(!p)throw Error('ROLE_MISSING');
const rows=[];for(const [key,field]of [['oldTrekInfo','other_attr_info.oldTrekInfo'],['items','items'],['currencies','currencies']]){
const raw=key==='oldTrekInfo'?p.other_attr_info.oldTrekInfo:p[key];const json=JSON.parse(JSON.stringify(raw));
const rawMatch=!!await col.findOne({userId:uid,[field]:{$eq:raw}},{projection:{_id:1},maxTimeMS:5000});
const jsonMatch=!!await col.findOne({userId:uid,[field]:{$eq:json}},{projection:{_id:1},maxTimeMS:5000});rows.push({key,rawMatch,jsonMatch});}
console.log(JSON.stringify({at:new Date().toISOString(),db:c.db().databaseName,rows,level:p.level,exp:p.exp,expItem:p.items[3],roleStage:p.roleInfo?.stage,eventId:p.other_attr_info.oldTrekInfo.sailInfo.currentEvent?.id,revision:p.other_attr_info.oldTrekInfo.stateRevision,readOnly:true}));
}finally{await c.close();}})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1});
