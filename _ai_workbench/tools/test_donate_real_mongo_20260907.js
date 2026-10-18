'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const app=process.argv[2],stage=path.dirname(app),mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const dbName='qa_donate_revision_'+Date.now();assert(/^qa_donate_revision_\d+$/.test(dbName));
process.env.IDENTITY_MONGO_DB=dbName;process.env.SERVER_ID='1002';process.env.LOG_DIR=stage+'/qa-logs';
const target={accountId:'qa_donate_only',userId:'qa_donate_role',playerId:'qa_donate_player',serverId:1002,skill:5000,chicken:500,baoziDelta:90000,claims:[{mailId:'000000000000000000000001'}]};
const plan={incident:'qa_donate_revision_test',evidenceSha256:'a'.repeat(64),rows:[target]};
const original=Module._load;Module._load=function(req,parent,isMain){if(parent?.filename.endsWith('DonateRevisionService.js')){
 if(req==='../config/donateRevision20260907.json')return plan;
 if(req==='fs')return{...fs,existsSync:()=>false,mkdirSync(){},writeFileSync(){}};
}return original.call(this,req,parent,isMain);};
(async()=>{await mongoose.connect('mongodb://127.0.0.1:27017/'+dbName);let success=false;try{
 const Player=require(app+'/src/db/models/Player'),Account=require(app+'/src/db/models/Account'),Mail=require(app+'/src/db/models/Mail'),svc=require(app+'/src/services/DonateRevisionService');
 await Promise.all([Player.init(),Account.init(),Mail.init()]);
 await Player.collection.insertOne({userId:target.userId,playerId:target.playerId,accountId:target.accountId,serverId:1002,level:1,items:{4:10,5:5123,65:7},mailClaimLedger:[target.claims[0].mailId]});
 await Account.collection.insertOne({accountId:target.accountId,roles:[{userId:target.userId,serverId:1002}]});
 const call=action=>svc.dispatch({action,userId:target.userId,confirm:true,incident:plan.incident,evidenceSha256:plan.evidenceSha256});
 await Promise.all([call('convert'),call('convert')]);let p=await Player.findOne({userId:target.userId}).lean();assert.equal(p.items[5],123);assert.equal(p.items[4],10);assert.equal(p.items[65],7);
 await Promise.all([call('send'),call('send')]);let m=await Mail.findOne({userId:target.userId}).lean();assert.equal(await Mail.countDocuments({}),1);assert.deepEqual(m.attachments,[{id:65,count:500},{id:4,count:90000}]);
 // Cold readback represents process-local state loss; durable markers suffice.
 p=await Player.findOne({userId:target.userId}).lean();assert.equal(p.moderation.donateRevision20260907.mailId,String(m._id));
 await call('convert');assert.equal((await Player.findOne({userId:target.userId}).lean()).items[5],123);
 await Player.collection.updateOne({userId:target.userId},{$push:{mailClaimLedger:String(m._id)}});
 await Mail.deleteOne({_id:m._id});const again=await call('send');assert(again.result.alreadyConsumed);assert.equal(await Mail.countDocuments({}),0);
 success=true;console.log(JSON.stringify({result:'PASS',checks:9,database:dbName,realMongo:true,productionRowsWritten:0}));
}finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();Module._load=original;if(!success)process.exitCode=1;}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
