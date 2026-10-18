'use strict';
// Dedicated synthetic Mongo integration. Never imports production database model.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root='/linhhoasu/lhs/newServer', req=require('module').createRequire(root+'/package.json');
const mongoose=req('mongoose'), dbName='lhs_qa_oldtrek_20261008', collectionName='scoped_cas_owned_20261008';
const clone=x=>structuredClone(x), results=[];
async function main(){
 const conn=await mongoose.createConnection('mongodb://127.0.0.1:27017/'+dbName,{serverSelectionTimeoutMS:5000}).asPromise();
 assert.equal(conn.name,dbName);const col=conn.db.collection(collectionName);
 if(await col.countDocuments({}))throw Error('QA_COLLECTION_NOT_EMPTY');
 let hook=null,throwAfter=false;const cache={};
 const Player={findOne:f=>({maxTimeMS(){return this},lean:()=>col.findOne(f)}),
  findOneAndUpdate:async(f,u)=>{if(hook){const h=hook;hook=null;await h();}const r=await col.findOneAndUpdate(f,u,{returnDocument:'after'});const doc=r&&Object.prototype.hasOwnProperty.call(r,'value')?r.value:r;if(throwAfter&&doc){throwAfter=false;throw Error('QA_COMMITTED_TIMEOUT');}return doc;},collection:{updateOne:(f,u)=>col.updateOne(f,u)}};
 function load(name){if(cache[name])return cache[name];const m={exports:{}};vm.runInNewContext(fs.readFileSync(root+'/src/services/'+name+'.js','utf8'),{module:m,exports:m.exports,process:{env:{OLD_TREK_SCOPED_CAS:'1'}},Buffer,Date,console,setTimeout,clearTimeout,structuredClone,require:id=>{
 if(id==='../db/models/Player')return Player;
 if(id==='../logger')return {info(){},warn(){},error(){}};
 if(id==='./TaskDirtyService')return {attachTaskSyncMeta:p=>p,getTaskSyncMeta:()=>({})};
 if(id==='./OldTrekSnapshotService')return load('OldTrekSnapshotService');
 if(id==='./CurrencySync')return req(root+'/src/services/CurrencySync.js');
 return req(id);
 }},{filename:name,displayErrors:true});return cache[name]=m.exports;}
 const ps=load('PlayerService'),snap=load('OldTrekSnapshotService');let seq=0;
 async function fresh(){const userId='QA_OLDTREK_'+(++seq);await col.insertOne({userId,level:544,exp:40,items:{2:100,321:20},currencies:{silver:100,diamond:0,gold:0},taskInfo:{id:1,count:2},other_attr_info:{oldTrekInfo:{stateRevision:3,cargo:[],trekReceipts:[]},fashion:{star:9}}});const p=await ps.loadPlayer(userId);ps.prepareOldTrekSnapshot(p);return p;}
 async function check(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e.message)});}}
 try{
 await check('first_entry_equal_real_bson',async()=>{const p=await fresh(),db=await ps.loadPlayer(p.userId);assert.equal(snap.rebase(p,db).conflicts.length,0);});
 await check('late_remote_level_task_preserved',async()=>{const p=await fresh(),d=clone(p);d.other_attr_info.oldTrekInfo.stateRevision++;hook=()=>col.updateOne({userId:p.userId},{$set:{level:545,'taskInfo.count':7}});const saved=await ps.saveOldTrekScoped(p.userId,p,d);assert.equal(saved.level,545);assert.equal(saved.taskInfo.count,7);});
 await check('economy_conflict_rejected_without_reward',async()=>{const p=await fresh(),d=clone(p);d.items[321]--;d.other_attr_info.oldTrekInfo.cargo.push({id:325,count:7});hook=()=>col.updateOne({userId:p.userId},{$set:{'items.321':19}});assert.equal(await ps.saveOldTrekScoped(p.userId,p,d),null);assert.equal((await col.findOne({userId:p.userId})).other_attr_info.oldTrekInfo.cargo.length,0);});
 await check('deferred_local_task_remote_level_rebase',async()=>{const p=await fresh();p.taskInfo.count=6;const pending=ps.savePlayerDeferred(p.userId,p);await ps.drainPendingSaves(p.userId);await pending;p.taskInfo.count=7;await col.updateOne({userId:p.userId},{$set:{level:545}});const db=await ps.loadPlayer(p.userId);ps.prepareOldTrekSnapshot(db);const r=snap.rebase(p,db);assert.equal(r.conflicts.length,0);assert.equal(r.player.taskInfo.count,7);assert.equal(r.player.level,545);});
 await check('commit_timeout_durable_receipt_and_retry_no_second_commit',async()=>{const p=await fresh(),d=clone(p);d.items[321]--;d.other_attr_info.oldTrekInfo.trekReceipts.push({uid:101,requestId:'QA_once'});throwAfter=true;try{await ps.saveOldTrekScoped(p.userId,p,d);}catch(e){assert.match(e.message,/QA_COMMITTED_TIMEOUT/);}const saved=await col.findOne({userId:p.userId});assert.equal(saved.items[321],19);assert.equal(saved.other_attr_info.oldTrekInfo.trekReceipts.length,1);assert.equal(await ps.saveOldTrekScoped(p.userId,p,d),null);});
 await check('bson_reordered_embedded_document_safe_cas_rejection',async()=>{const p=await fresh(),d=clone(p);d.other_attr_info.oldTrekInfo.stateRevision++;await col.updateOne({userId:p.userId},{$set:{currencies:{gold:0,diamond:0,silver:100}}});assert.equal(await ps.saveOldTrekScoped(p.userId,p,d),null);});
 await check('bson_numeric_string_type_conflict_rejected',async()=>{const p=await fresh(),d=clone(p);d.items[321]--;await col.updateOne({userId:p.userId},{$set:{'items.321':'20'}});assert.equal(await ps.saveOldTrekScoped(p.userId,p,d),null);});
 }finally{await col.deleteMany({userId:/^QA_OLDTREK_\d+$/});assert.equal(await col.countDocuments({}),0);await conn.close();}
 console.log(JSON.stringify({pass:results.every(r=>r.pass),database:dbName,collection:collectionName,cleanup:'verified_empty',productionWrites:0,realMongo:true,results,gates:['Native reward helper and full handler receipt replay not covered by this persistence-only integration']},null,2));
}
main().catch(e=>{console.error(String(e.message));process.exitCode=1;});
