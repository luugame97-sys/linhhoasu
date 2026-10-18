'use strict';
// Real Mongo CAS tests in a disposable owned database; never connects gameplay to a real role.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),cp=require('child_process');
const APP='/linhhoasu/lhs/newServer',TASK='/linhhoasu/_ai_workbench/temp/mount_star_fix_20261017';
const {MongoClient}=require(APP+'/node_modules/mongodb');
const env=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).find(n=>n.name==='lhs-s1001').pm2_env;
for(const[k,v]of Object.entries(env))if(typeof v==='string')process.env[k]=v;
const log=require.resolve(APP+'/src/logger');require.cache[log]={id:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(APP+'/src/services/ConfigService');config.loadAllTables();
const serviceModule={exports:{}};vm.runInNewContext(fs.readFileSync(TASK+'/candidate/src/services/MountStarProgressService.js','utf8'),{module:serviceModule,require:n=>n==='./ConfigService'?config:require(n),Date,JSON,Number,Math,Object,Error});
const service=serviceModule.exports,clone=x=>JSON.parse(JSON.stringify(x));
const DB='qa_mount_star_20261017_owned',OWNER='mount_star_20261017';
(async()=>{const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:4});let created=false;
 try{await client.connect();const exists=await client.db('admin').admin().listDatabases({nameOnly:true});assert(!exists.databases.some(d=>d.name===DB),'QA_DB_ALREADY_EXISTS');const db=client.db(DB);created=true;
  await db.collection('owner').insertOne({_id:OWNER});const collection=db.collection('players');
  const fixture={_id:'QA_ONLY',userId:'QA_ONLY',level:200,swordInfo:{equippedUid:1,data:[{id:22506,uid:1,quality:7,star:5,level:92,skills:[{id:106,quality:6,level:1},{id:152,quality:3,level:1},{id:154,quality:3,level:1},{id:104,quality:6,level:1}]}]},items:{20:100},currencies:{diamond:1000},other_attr_info:{}};
  await collection.insertOne(clone(fixture));const inputs=[clone(fixture),clone(fixture)];
  const race=await Promise.allSettled(inputs.map(p=>service.recoverLoaded(p,collection)));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1);
  const repaired=await collection.findOne({_id:'QA_ONLY'});assert.equal(repaired.swordInfo.data[0].skills.reduce((n,s)=>n+s.level,0),8);assert.equal(repaired.swordInfo.data[0].passiveRecoveryV1.added,4);
  await service.recoverLoaded(clone(repaired),collection);assert.equal((await collection.findOne({_id:'QA_ONLY'})).swordInfo.data[0].passiveRecoveryV1.added,4);
  // Execute the exact candidate PlayerService.savePlayer function against Mongo.
  const src=fs.readFileSync(TASK+'/candidate/src/services/PlayerService.js','utf8'),a=src.indexOf('async function savePlayer('),b=src.indexOf('\nasync function ',a+20),fnText=src.slice(a,b).slice(0,src.slice(a,b).lastIndexOf('\n}')+2);
  const noop=()=>{},scope={Player:{collection},sanitizeArenaReceiptLedger:noop,reconcileFortuneConsumableSpend:noop,getTaskSyncMeta:noop,cloneSaveData:clone,markSaveScheduled:()=>1,enqueueSave:(_id,work)=>work(),syncCurrencyItems:noop,withRetry:work=>work(),DB_OPERATION_TIMEOUT_MS:10000,logger:{warn:noop},markSaved:noop,oldTrekSnapshots:{rememberConfirmed:noop},rememberFortuneBalances:noop,clearSaveScheduled:noop,Date,Set,Object,Number,Array,Error,console};
  const save=vm.runInNewContext('('+fnText+')',scope),fields=['swordInfo','items','currencies','other_attr_info'],expected=Object.fromEntries(fields.map(k=>[k,clone(repaired[k])])),left=clone(repaired),right=clone(repaired);
  left.items[20]=2500;left.swordInfo.data[0].star=7;right.items[20]=2500;right.swordInfo.data[0].star=7;
  const writes=await Promise.all([save('QA_ONLY',left,{returnSaved:false,onlyFields:fields,mountCAS:{fields,expected}}),save('QA_ONLY',right,{returnSaved:false,onlyFields:fields,mountCAS:{fields,expected}})]);assert.equal(writes.filter(Boolean).length,1);
  const final=await collection.findOne({_id:'QA_ONLY'});assert.equal(final.items[20],2500);assert.equal(final.currencies.diamond,1000);assert.equal(final.swordInfo.data[0].star,7);
  console.log(JSON.stringify({status:'PASS',realMongo:true,repairWriters:1,saveWriters:1,fixtureDatabase:DB,productionWrites:0}));
 }finally{if(created){const owner=await client.db(DB).collection('owner').findOne({_id:OWNER});assert(owner,'QA_OWNER');await client.db(DB).dropDatabase();}await client.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
