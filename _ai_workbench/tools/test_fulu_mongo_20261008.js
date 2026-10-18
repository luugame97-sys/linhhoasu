'use strict';
// Exact installed services, isolated DB only. No listener, real account or payment.
const assert=require('assert/strict'),fs=require('fs'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer',dbName='lhs_qa_fulu_20261008';
const mongoose=require(app+'/node_modules/mongoose');
const report={database:dbName,productionPlayerWrites:0,accountCreates:0,checks:[],hashes:{},cleanup:false};
const clone=x=>JSON.parse(JSON.stringify(x));
const ack=(x,tag)=>(Array.isArray(x)?x:[x]).find(p=>p.tag===tag&&p.msgUid===97)?.data;
let Player,ps,created=false,serial=0;
async function main(){
 await mongoose.connect('mongodb://127.0.0.1:27017/'+dbName,{dbName,autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:8000});
 assert.equal(mongoose.connection.db.databaseName,dbName);
 assert.equal((await mongoose.connection.db.listCollections().toArray()).length,0,'QA DB must be empty');
 Player=require(app+'/src/db/models/Player');ps=require(app+'/src/services/PlayerService');
 const cfg=require(app+'/src/services/ConfigService');cfg.loadAllTables();
 const gate=require(app+'/src/services/EventExposureGate');
 const tasks=require(app+'/src/services/Activity52TaskService');
 const activity=require(app+'/src/handlers/activity');
 for(const f of ['services/Activity52Service.js','services/Activity52TaskService.js','services/PlayerService.js','services/EventExposureGate.js','handlers/activity.js'])
  report.hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(app+'/src/'+f)).digest('hex');
 const originalReject=gate.rejectOperate;
 // Public gate remains installed and is verified before test-process-only bypass.
 // Synthetic QA users are never added to the production allowlist.
 gate.rejectOperate=(p,s,m)=>s.userId.startsWith('qa_fulu_mongo_')?null:originalReject(p,s,m);
 function params(p,extra={}){const row=p.activityInfo.datas[0];return {id:52001,module:1,index:1,selectedColor:1,
  requestId:Date.now()+'-isolated_fulu_'+(++serial),cycleKey:`52001:${row.startTime}:${row.endTime}`,...extra};}
 async function read(id){return ps.loadPlayer(id);}
 for(let sid=1001;sid<=1007;sid++){
  const uid='qa_fulu_mongo_'+sid,now=Date.now();
  const doc={userId:uid,playerId:uid,serverId:sid,name:'ISOLATED QA',level:135,items:{233:10,19:0},
   currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},taskInfo:{tasks:{},tasksMap:{}},
   activityInfo:{datas:[{id:52001,record:1,score:0,records:{},startTime:now-10000,endTime:now+172800000}]}};
  await Player.collection.insertOne(doc);created=true;
  const session={userId:uid,player:await read(uid)};
  assert(gate.isBlocked(52001,session),'public gate closed');
  const claim=params(session.player,{activityId:52001,type:52001|(1<<30),ids:[75001],dayKey:tasks.dayKey()});
  const claims=await Promise.all(Array.from({length:8},()=>tasks.claim(claim,session,97)));
  assert(claims.every(x=>ack(x,1000).result===0));assert.equal(claims.filter(x=>ack(x,1000).replayed).length,7);
  let saved=await read(uid);assert.equal(saved.items[233],11);assert.equal(saved.taskInfo.tasks[75001].status,30);
  const draw=params(saved);const draws=await Promise.all(Array.from({length:8},()=>activity.handleActivityOperate(draw,session,97)));
  assert(draws.every(x=>ack(x,1700).result===0));assert.equal(draws.filter(x=>ack(x,1700).replayed).length,7);
  saved=await read(uid);assert.equal(saved.items[233],10);assert.equal(saved.activityInfo.datas[0].records[1],1);
  assert.equal(tasks.taskRows(saved).find(x=>x.id===75001).status,30);
  const prior=clone(saved);const conflict=await activity.handleActivityOperate({...draw,index:2},session,97);
  assert.notEqual(ack(conflict,1700).result,0);assert.deepEqual(clone(await read(uid)),prior);
  const stale=params(saved,{cycleKey:'52001:1:2'});assert.notEqual(ack(await activity.handleActivityOperate(stale,session,97),1700).result,0);
  assert.deepEqual(clone(await read(uid)),prior);
  report.checks.push(`S${sid-1000} synthetic: concurrent claim/draw x8, durable reload, conflict/stale-cycle`);
 }
 const uid='qa_fulu_mongo_1001';let saved=await read(uid),session={userId:uid,player:clone(saved)};
 // Actual production save adapter: competing CAS snapshots must yield one winner.
 const fields=['items','activityInfo','currencies','other_attr_info','level'];
 const a=clone(saved),b=clone(saved);a.items[233]=20;b.items[233]=30;
 const cas=await Promise.allSettled([a,b].map(d=>ps.savePlayer(uid,d,{returnSaved:false,onlyFields:['items'],activity52CAS:{fields,expected:saved}})));
 assert.equal(cas.filter(x=>x.status==='fulfilled'&&x.value).length,1);
 assert([20,30].includes((await read(uid)).items[233]));report.checks.push('real Mongo CAS competing snapshots: exactly one save');
 // Commit succeeds but ACK is lost; retry must replay durable receipt.
 session.player=await read(uid);const request=params(session.player);const realSave=ps.savePlayer;
 ps.savePlayer=async(...args)=>{await realSave(...args);throw Error('QA_ACK_LOSS_AFTER_COMMIT');};
 await assert.rejects(activity.handleActivityOperate(request,session,97),/QA_ACK_LOSS/);assert.equal(session.player,null);
 ps.savePlayer=realSave;session.player=await read(uid);const committed=clone(session.player);
 assert.equal(ack(await activity.handleActivityOperate(request,session,97),1700).replayed,true);
 assert.deepEqual(clone(await read(uid)),committed);report.checks.push('post-commit ACK loss retry does not spend twice');
 // Midnight/cycle transitions run derived state with explicit clock; no host time change.
 saved=await read(uid);const tomorrow=Date.now()+86400000;
 assert.equal(tasks.taskRows(saved,tomorrow).find(x=>x.id===75001).status,20);
 assert.equal(tasks.taskRows(saved,tomorrow).find(x=>x.id===75002).progress,0);
 assert.equal(tasks.dayKey(Date.parse('2026-10-08T16:59:59Z')),20261008);
 assert.equal(tasks.dayKey(Date.parse('2026-10-08T17:00:00Z')),20261009);
 report.checks.push('GMT+7 exact midnight and next-day claim reset');
 report.result='PASS';report.scope='Exact installed handlers/services and real Mongo PlayerService; synthetic sessions only, no browser, no payment, process-local public-gate bypass';
}
main().catch(e=>{report.result='FAIL';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
 try{if(created&&mongoose.connection.db?.databaseName===dbName){
  // Delete only known QA identities created above, never a database-wide drop.
  const ids=Array.from({length:7},(_,i)=>'qa_fulu_mongo_'+(1001+i));
  const result=await Player.collection.deleteMany({userId:{$in:ids}});report.cleanedDocuments=result.deletedCount;
  report.remaining=await Player.collection.countDocuments({userId:{$in:ids}});report.cleanup=report.remaining===0;
 }}finally{await mongoose.disconnect();console.log(JSON.stringify(report,null,2));}
});
