'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const goal=path.resolve(process.env.EVENT_GOAL_ROOT||path.join(__dirname,'../temp/event_goal_20261007'));
const app=path.resolve(process.env.EVENT_APP_ROOT||path.join(__dirname,'../../linhhoasu/lhs/newServer'));
const candidate=path.join(goal,'phase_ab/candidate');
const manifest=JSON.parse(fs.readFileSync(path.join(goal,'phase_ab/release.json'),'utf8'));
const aliases=new Map((process.env.EVENT_BASE_IS_PRODUCTION ? [] : manifest.files).filter(x=>x.relative.endsWith('.js')&&x.relative.startsWith('lhs/newServer/'))
  .map(x=>[path.resolve(app,x.relative.slice('lhs/newServer/'.length)),path.join(candidate,x.relative)]));
const patchRoot=process.env.EVENT_PATCH_ROOT&&path.resolve(process.env.EVENT_PATCH_ROOT);
if(patchRoot){const patchManifest=JSON.parse(fs.readFileSync(path.join(patchRoot,'release.json'),'utf8'));
  patchManifest.files.filter(x=>x.relative.endsWith('.js')&&x.relative.startsWith('lhs/newServer/')).forEach(x=>
    aliases.set(path.resolve(app,x.relative.slice('lhs/newServer/'.length)),path.join(patchRoot,'candidate',x.relative)));}
const resolve=Module._resolveFilename,extension=Module._extensions['.js'];
Module._resolveFilename=function(request,parent,...args){
  if(path.isAbsolute(request)){const f=path.resolve(request);if(aliases.has(f))return f;if(aliases.has(f+'.js'))return f+'.js';}
  if(request.startsWith('.')&&parent){const f=path.resolve(path.dirname(parent.filename),request);if(aliases.has(f))return f;if(aliases.has(f+'.js'))return f+'.js';}
  return resolve.call(this,request,parent,...args);
};
Module._extensions['.js']=function(mod,file){if(aliases.has(file))return mod._compile(fs.readFileSync(aliases.get(file),'utf8'),file);return extension(mod,file);};
let networkAttempts=0;
require('net').Socket.prototype.connect=function(){networkAttempts++;throw Error('NETWORK_FORBIDDEN_IN_FIXTURE');};
process.env.NODE_ENV='test';process.env.LOG_DIR='';process.env.EVENT_ROTATION_NATIVE_ENABLED='1';
const clone=x=>JSON.parse(JSON.stringify(x));
const baseline=JSON.parse(fs.readFileSync(path.join(goal,'baseline.json'),'utf8'));
const players=require(app+'/src/services/PlayerService');
const runtime=require(app+'/src/services/RuntimeBus');
const session={userId:baseline.qa.userId};
let db,saveCount=0,drains=0;
players.drainPendingSaves=async()=>{drains++;};
players.loadPlayer=async()=>clone(db);
players.savePlayer=async(id,draft,options)=>{
  assert.equal(id,session.userId);assert(options.activity52CAS,'CAS option mandatory');
  for(const field of options.activity52CAS.fields)assert.deepEqual(db[field],options.activity52CAS.expected[field],'CAS '+field);
  for(const field of options.onlyFields)db[field]=clone(draft[field]);saveCount++;return true;
};
runtime.getWsServer=()=>({getPlayerForMutation:()=>session.player,invalidatePlayerForMutation(){throw Error('UNEXPECTED_INVALIDATION');}});
const config=require(app+'/src/services/ConfigService');
const tables=config.loadAllTables();
const activity=require(app+'/src/handlers/activity');
const tasks=require(app+'/src/handlers/task');
const gate=require(app+'/src/services/EventExposureGate');
const registry=require(app+'/src/services/EventRotationRegistry');
const schedule=require(app+'/src/services/ActivityCycleSchedule');
const fuluTasks=require(app+'/src/services/Activity52TaskService');
const now=Date.now();
db={userId:session.userId,playerId:baseline.qa.playerId,serverId:1001,name:'RAM ONLY',level:135,
  currencies:{diamond:1000,gold:0,silver:0},items:{19:0},other_attr_info:{mainTaskProgress:{itemConsume:{4:0},arenaChallengeCount:0}},
  taskInfo:{tasks:{},tasksMap:{}},activityInfo:{datas:[{id:52001,module:0,index:0,param:0,record:2,score:0,status:0,records:{},recordList:[],buyRecords:{},extra:{},startTime:now-10000,endTime:now+86400000}]}};
session.player=clone(db);
let n=0,checks=0;const check=(v,message)=>{assert(v,message);checks++;};
function params(extra={}){return {requestId:Date.now()+'-ram_integrated_'+(++n),cycleKey:`52001:${db.activityInfo.datas[0].startTime}:${db.activityInfo.datas[0].endTime}`,...extra};}
function ack(output,tag){return(Array.isArray(output)?output:[output]).find(p=>p.tag===tag&&p.msgUid===99);}
async function main(){
  check(tables.Activity52Config[52001].consume===233,'actual live-style config');
  const before=clone(db);for(const id of [21001,27001,30001]){
    const result=await activity.handleActivityOperate({id,module:0,index:1},session,99);
    check(ack(result,1700).data.code==='EVENT_MAINTENANCE');check(saveCount===0);assert.deepEqual(db,before);checks++;
  }
  const stranger={userId:'other',player:{...clone(db),playerId:'other'}};
  check(gate.isBlocked(52001,stranger));check(!gate.isBlocked(52001,session));
  for(const type of [37,43,44,49])check(registry.isEnabled(registry.getFamilies().find(f=>f.activityType===type)));
  const fresh={};schedule.syncPlayer(fresh,now);check(!fresh.activityInfo.datas.some(r=>[21001,27001,30001,52001].includes(r.id)));
  const mapped=fuluTasks.sync(session.player,session.player.taskInfo,now);check(mapped.length===5);check(mapped.find(t=>t.id===75001).status===20);
  // Normalization in the simulated persisted preimage, not a production write.
  db=clone(session.player);
  const request=params({id:52001,type:52001|(1<<30),ids:[75001],dayKey:fuluTasks.dayKey(now)});
  const claimed=await tasks.handleClaimTaskRewardCompat(request,session,99);
  check(ack(claimed,1000).data.result===0);check(db.items[233]===1);check(db.taskInfo.tasks[75001].status===30);
  const afterClaim=clone(db);const replay=await tasks.handleClaimTaskRewardCompat(request,session,99);
  check(ack(replay,1000).data.replayed===true);assert.deepEqual(db,afterClaim);checks++;
  const drawReq=params({id:52001,module:1,index:1,param:0,selectedColor:2});
  const oldRandom=Math.random;Math.random=()=>0;
  let drawn;try{drawn=await activity.handleActivityOperate(drawReq,session,99);}finally{Math.random=oldRandom;}
  check(ack(drawn,1700).data.result===0,'draw ACK '+JSON.stringify(ack(drawn,1700).data));
  check(Number(db.items[233]||0)===0,'cost after actual reward '+JSON.stringify(db.items));
  check(db.activityInfo.datas[0].records[1]===1,'draw counter');
  const sync=drawn.find(p=>p.tag===1202).data;
  check(sync.items.find(i=>i.id===233).count===-1);check(sync.changed.find(i=>i.id===233).count===0);
  check(drawn.some(p=>p.tag===1775&&p.data.requestId===drawReq.requestId));
  const rewards=ack(drawn,1700).data.rewardInfo.items;
  check(rewards.length>0);for(const r of rewards)check(Number(db.items[r.id])>=r.count,'real RewardGrantService '+r.id);
  const afterDraw=clone(db);const repeated=await activity.handleActivityOperate(drawReq,session,99);
  check(ack(repeated,1700).data.replayed===true);assert.deepEqual(db,afterDraw);checks++;
  check(repeated.find(p=>p.tag===1202).data.items.length===0,'no replay reward delta');
  const failed=await activity.handleActivityOperate(params({id:52001,module:1,index:5,param:0,selectedColor:2}),session,99);
  check(ack(failed,1700).data.result!==0);assert.deepEqual(db,afterDraw);checks++;
  check(networkAttempts===0);check(drains>=3);
  const report={result:'PASS',checks,mode:'RAM_ONLY',actualConfig:true,realRewardGrantService:true,realRewardSync:true,
    realHandlerDispatch:true,claimToDraw:true,playerWrites:0,networkAttempts,savesMocked:saveCount};
  fs.writeFileSync(path.join(patchRoot||path.join(goal,'phase_ab'),'integrated-test.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
