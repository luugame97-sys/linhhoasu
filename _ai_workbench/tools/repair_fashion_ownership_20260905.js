'use strict';
// Default read-only. --commit requires exact stopped process state verified
// by the deployment runner plus a preimage directory, and uses compare-and-set.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const app=process.env.LHS_APP_ROOT||'/linhhoasu/lhs/newServer';
const loggerPath=require.resolve(path.join(app,'src/logger'));
require.cache[loggerPath]={id:loggerPath,filename:loggerPath,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
process.env.CONFIG_BIN_PATH=process.env.LHS_CONFIG_PATH||'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';
const repair=require(path.join(app,'src/services/FashionInventoryRepairService'));
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const {EJSON}=require('/linhhoasu/lhs/newServer/node_modules/bson');
const commit=process.argv.includes('--commit');
const backup=process.env.FASHION_REPAIR_BACKUP;
if(commit&&(!backup||!backup.startsWith('/linhhoasu/_ai_workbench/backups/')||process.env.FASHION_REPAIR_MAINTENANCE!=='stopped-s1001-s1002'))throw new Error('REPAIR_COMMIT_GUARD');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function durableFile(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,value);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
async function main(){const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1,serverSelectionTimeoutMS:8000});await c.connect();const out={repairId:repair.REPAIR_ID,commit,generatedAt:new Date().toISOString(),dbs:{}};
try{for(const dbName of ['lhs_s1001','lhs_s1002']){const col=c.db(dbName).collection('players'),rows=await col.find({isBot:{$ne:true},$or:[{'items.29001':{$gt:0}},{'items.11274':{$gt:0}}]}).toArray();const subjects=[];let activations=0,updated=0;const existingOwned=[];
for(const original of rows){const p=EJSON.parse(EJSON.stringify(original)),plan=repair.plan(p);if(!plan.items.length){existingOwned.push({subject:hash(dbName+'|'+p.userId).slice(0,14),items:[29001,11274].filter(id=>Number(p.items?.[id])>0).map(id=>({id,count:p.items[id]})),reason:plan.alreadyApplied?'already_applied':'owned_or_evidence_insufficient'});continue;}
const key=hash(dbName+'|'+p.userId).slice(0,20);activations+=plan.items.length;
if(commit){const dir=path.join(backup,dbName);fs.mkdirSync(dir,{recursive:true,mode:0o700});const pre=EJSON.stringify(original,{relaxed:false});durableFile(path.join(dir,key+'.before.ejson'),pre);
repair.apply(p,plan);const filter={_id:original._id,
// Mongo embedded-document equality is field-order sensitive; JavaScript sorts
// numeric bag keys on decode. Compare the complete set of bag key/value pairs
// instead, so protection is retained without rejecting equivalent inventory.
$expr:{$setEquals:[{$objectToArray:'$items'},{$literal:Object.entries(original.items).map(([k,v])=>({k,v}))}]},
[`fashionOwnershipRepairLedger.${repair.REPAIR_ID}`]:{$exists:false}};if(original.fashionInfo===undefined)filter.fashionInfo={$exists:false};else filter.fashionInfo=original.fashionInfo;
const res=await col.updateOne(filter,{$set:{items:p.items,fashionInfo:p.fashionInfo,fashionOwnershipRepairLedger:p.fashionOwnershipRepairLedger}},{writeConcern:{w:1,j:true}});if(res.modifiedCount!==1)throw new Error('REPAIR_CAS_CONFLICT');
const after=await col.findOne({_id:original._id});if(JSON.stringify(after.items)!==JSON.stringify(p.items)||JSON.stringify(after.fashionInfo)!==JSON.stringify(p.fashionInfo)||!after.fashionOwnershipRepairLedger?.[repair.REPAIR_ID])throw new Error('REPAIR_VERIFY_FAILED');
const strip=v=>{const x=EJSON.parse(EJSON.stringify(v));delete x.items;delete x.fashionInfo;delete x.fashionOwnershipRepairLedger;return EJSON.stringify(x,{relaxed:false});};if(strip(original)!==strip(after))throw new Error('UNRELATED_PLAYER_CHANGE');
durableFile(path.join(dir,key+'.after.ejson'),EJSON.stringify(after,{relaxed:false}));updated++;}
subjects.push({subject:key,items:plan.items});}
out.dbs[dbName]={scanned:rows.length,eligiblePlayers:subjects.length,activations,updated,subjects,withheld:existingOwned};}
}finally{await c.close();}console.log(JSON.stringify(out));}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
