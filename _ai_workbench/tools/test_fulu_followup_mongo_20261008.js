'use strict';
// Invoked by the scoped runner with candidate source injected as base64.
const assert=require('assert/strict'),fs=require('fs'),crypto=require('crypto'),Module=require('module');
const app='/linhhoasu/lhs/newServer',dbName='lhs_qa_fulu_followup_20261008';
const mongoose=require(app+'/node_modules/mongoose');
const report={database:dbName,productionPlayerWrites:0,accountCreates:0,checks:[],hashes:{},cleanup:false};
const clone=x=>JSON.parse(JSON.stringify(x));
const ack=(x,tag)=>(Array.isArray(x)?x:[x]).find(p=>p.tag===tag&&p.msgUid===97)?.data;
const owned=[];let Player,ps,serial=0;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 await mongoose.connect('mongodb://127.0.0.1:27017/'+dbName,{dbName,autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:8000});
 assert.equal(mongoose.connection.db.databaseName,dbName);
 assert.equal((await mongoose.connection.db.listCollections().toArray()).length,0,'QA database must be unused');
 Player=require(app+'/src/db/models/Player');ps=require(app+'/src/services/PlayerService');
 const cfg=require(app+'/src/services/ConfigService');cfg.loadAllTables();
 const filename=app+'/src/services/Activity52TaskService.js';
 const before=require(filename);
 const source=Buffer.from(FULU_CANDIDATE_BASE64,'base64').toString('utf8');
 const patched=new Module(filename,module);patched.filename=filename;patched.paths=Module._nodeModulePaths(app+'/src/services');patched._compile(source,filename);
 const candidate=patched.exports;
 report.hashes.before=hash(fs.readFileSync(filename));report.hashes.candidate=hash(source);
 const activity=require(app+'/src/handlers/activity'),gate=require(app+'/src/services/EventExposureGate');
 const reject=gate.rejectOperate;
 gate.rejectOperate=(p,s,m)=>owned.includes(s.userId)?null:reject(p,s,m);
 const now=Date.now();
 async function create(suffix,patch={}){
  const uid='qa_fulu_followup_'+suffix;
  const doc={userId:uid,playerId:uid,serverId:1001,name:'ISOLATED QA',level:135,items:{233:159,232:33,19:0},
   currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},taskInfo:{dailyTaskDayKey:before.dayKey(),tasks:{},tasksMap:{}},
   activityInfo:{datas:[{id:52001,record:4,score:13,records:{},startTime:now-86400000,endTime:now+172800000}]},...patch};
  assert.equal(await Player.collection.countDocuments({userId:uid}),0);
  await Player.collection.insertOne(doc);owned.push(uid);
  const session={userId:uid,player:await ps.loadPlayer(uid)};assert(gate.isBlocked(52001,session),'public gate must stay closed');return session;
 }
 function req(p,extra={}){const row=p.activityInfo.datas[0];return {id:52001,module:1,index:1,selectedColor:4,requestId:Date.now()+'-fulufollowup_'+(++serial),cycleKey:`52001:${row.startTime}:${row.endTime}`,...extra};}
 function taskReq(p,id=75001){return req(p,{activityId:52001,type:52001|(1<<30),ids:[id],dayKey:before.dayKey()});}
 async function defectCase(label,tasks,expectedSafe){
  let session=await create(label+'_legacy',{taskInfo:{dailyTaskDayKey:tasks.dayKey(),tasks:{75001:{id:75001,status:30}},tasksMap:{}}});
  tasks.sync(session.player,session.player.taskInfo);
  await ps.savePlayer(session.userId,session.player,{returnSaved:false,onlyFields:['taskInfo','other_attr_info']});
  const result=ack(await tasks.claim(taskReq(session.player),session,97),1000),saved=await ps.loadPlayer(session.userId);
  const safe=result.result!==0&&saved.items[233]===159&&saved.taskInfo.tasks[75001].status===30;
  assert.equal(safe,expectedSafe,'legacy migration '+label);
  report.checks.push({case:'legacy no double233',variant:label,regression:safe?'PASS':'FAIL_REPRODUCED',claimResult:result.result,item233:saved.items[233],taskStatus:saved.taskInfo.tasks[75001].status});
  session=await create(label+'_midnight',{items:{233:159,232:33,19:80},taskInfo:{dailyTaskDayKey:tasks.dayKey(now-86400000),tasks:{},tasksMap:{}}});
  const result2=ack(await tasks.claim(taskReq(session.player,75003),session,97),1000),saved2=await ps.loadPlayer(session.userId);
  const safe2=result2.result!==0&&saved2.items[232]===33;
  assert.equal(safe2,expectedSafe,'midnight stale points '+label);
  report.checks.push({case:'yesterday points no grant232',variant:label,regression:safe2?'PASS':'FAIL_REPRODUCED',claimResult:result2.result,item232:saved2.items[232]});
 }
 await defectCase('before',before,false);await defectCase('candidate',candidate,true);
 for(let multi=1;multi<=5;multi++){
  const session=await create('multi'+multi);const claim=taskReq(session.player);
  const claims=await Promise.all(Array.from({length:8},()=>candidate.claim(claim,session,97)));
  assert(claims.every(x=>ack(x,1000).result===0));assert.equal(claims.filter(x=>ack(x,1000).replayed).length,7);
  let saved=await ps.loadPlayer(session.userId);assert.equal(saved.items[233],160);assert.equal(saved.taskInfo.tasks[75001].status,30);
  const draw=req(saved,{index:multi});const draws=await Promise.all(Array.from({length:8},()=>activity.handleActivityOperate(draw,session,97)));
  assert(draws.every(x=>ack(x,1700).result===0));assert.equal(draws.filter(x=>ack(x,1700).replayed).length,7);
  saved=await ps.loadPlayer(session.userId);assert.equal(saved.items[233],160-multi);assert.equal(saved.activityInfo.datas[0].score,13+multi);assert.equal(saved.activityInfo.datas[0].records[1],multi);
  const first=ack(draws[0],1700);assert(first.rewardInfo.items.length>0);
  for(const reward of first.rewardInfo.items)assert.equal(saved.items[reward.id],(reward.id===232?33:0)+reward.count,'actual reward persisted '+reward.id);
  for(const output of draws.slice(1))assert.equal(output.find(p=>p.tag===1202).data.items.length,0);
  const previous=clone(saved);const conflict=await activity.handleActivityOperate({...draw,index:multi===5?4:multi+1},session,97);
  assert.notEqual(ack(conflict,1700).result,0);assert.deepEqual(clone(await ps.loadPlayer(session.userId)),previous);
  report.checks.push({case:'candidate claim8 + installed draw8 + durable reward/replay/conflict',multiplier:multi,result:'PASS',item233:saved.items[233],rewards:first.rewardInfo.items});
 }
 const uid=owned.find(x=>x.endsWith('multi1')),saved=await ps.loadPlayer(uid),fields=['items','activityInfo','currencies','other_attr_info','level'];
 const a=clone(saved),b=clone(saved);a.items[233]=20;b.items[233]=30;
 const cas=await Promise.allSettled([a,b].map(d=>ps.savePlayer(uid,d,{returnSaved:false,onlyFields:['items'],activity52CAS:{fields,expected:saved}})));
 assert.equal(cas.filter(x=>x.status==='fulfilled'&&x.value).length,1);assert([20,30].includes((await ps.loadPlayer(uid)).items[233]));
 report.checks.push({case:'real Mongo competing CAS one winner',result:'PASS'});
 report.result='PASS';report.mode='isolated Mongo; candidate Module compile only in QA process; installed real RewardGrant/PlayerService/FeatureReceipt';
}
main().catch(e=>{report.result='FAIL';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
 try{if(owned.length&&mongoose.connection.db?.databaseName===dbName){
  const result=await Player.collection.deleteMany({userId:{$in:owned}});report.cleanedDocuments=result.deletedCount;
  report.remaining=await Player.collection.countDocuments({userId:{$in:owned}});report.cleanup=report.remaining===0;
 }}finally{await mongoose.disconnect();console.log('FULU_FOLLOWUP_REPORT='+JSON.stringify(report));}
});
