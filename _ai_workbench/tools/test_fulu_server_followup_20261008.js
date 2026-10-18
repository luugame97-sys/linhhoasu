'use strict';
// Exact snapshot modules in a VM, synthetic RAM only. No app bootstrap/network/DB.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, '_ai_workbench/temp/fulu_qa_20261008');
const variant = process.argv[2] || 'candidate';
const source = path.join(base, variant, 'lhs/newServer/src/services');
const before = path.join(base, 'before/lhs/newServer/src');
const clone = x => JSON.parse(JSON.stringify(x));
const baseline = JSON.parse(fs.readFileSync(path.join(base,'baseline.json'),'utf8'));
const tables = {TaskConfig:clone(baseline.config.TaskConfig),ActivityConfig:{52001:clone(baseline.config.ActivityConfig)}};
tables.Activity52Config={52001:clone(baseline.config.Activity52Config)};
tables.Activity52ArrangeConfig={52001:clone(baseline.config.Activity52ArrangeConfig)};
const receipts = require(path.join(before, 'services/FeatureReceiptService.js'));
const lockFile = path.join(before, 'services/PlayerMutationService.js');
const locks = require(lockFile);
let db, session, saves, failSave, serial = 0;
const players = {drainPendingSaves:async()=>{}, loadPlayer:async()=>clone(db), savePlayer:async(_id,draft,opt)=>{
  for(const key of opt.activity52CAS.fields) assert.equal(JSON.stringify(db[key]),JSON.stringify(opt.activity52CAS.expected[key]),'CAS '+key);
  if(failSave === 'before') return null;
  for(const key of opt.onlyFields) db[key]=clone(draft[key]);
  saves++;
  if(failSave === 'after') throw Error('ACK_LOSS');
  return true;
}};
function load(file,deps){const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,console,Date,Math,Set,Map,process,require:n=>deps[n]||{},setTimeout,clearTimeout},{filename:file});return module.exports;}
const deps={'./ConfigService':{get:n=>tables[n]},'./PlayerService':players,'./PlayerMutationService':locks,'./FeatureReceiptService':receipts,
  './RuntimeBus':{getWsServer:()=>({getPlayerForMutation:()=>session.player,invalidatePlayerForMutation(){}})},
  './TaskDirtyService':{markTaskDirty(){}},'./RewardGrantService':{assertRewardRowsSupported(){}},
  './RewardSync':{buildRewardItemSync:(p,rows)=>({items:rows,changed:[232,233].map(id=>({id,count:p.items[id]||0}))})}};
const tasks=load(path.join(source,'Activity52TaskService.js'),deps);
const service=load(path.join(source,'Activity52Service.js'),deps);
const activity=load(path.join(before,'handlers/activity.js'),{'../services/ConfigService':deps['./ConfigService'],
 '../services/PlayerService':players,'../services/Activity52Service':service,'../services/EventExposureGate':{rejectOperate:()=>null},
 '../services/RewardGrantService':{assertRewardRowsSupported(){},grantRewardRow:()=>({kind:'item'}),buildNativeSyncPackets:()=>[]},
 '../services/RewardSync':{buildRewardItemSync:(p,rows)=>({items:clone(rows),changed:rows.map(r=>({id:r.id,count:p.items[r.id]||0}))})},
 './raid':{addRewardToPlayer:(p,id,count)=>{p.items[id]=(p.items[id]||0)+count;}}});
const payload=load(path.join(before,'handlers/playerPayload.js'),{'../services/ConfigService':deps['./ConfigService'],
 '../services/TaskPerfService':{nowNs:()=>0,recordTaskNormalizeNs(){}},'../services/ActivationPassService':{ensureActivationPassState(){}},
 '../services/FishingEventSchedule':{taskRows:()=>[]},'../services/Activity52TaskService':tasks});
const mainTasks=load(path.join(before,'services/MainTaskProgressService.js'),{...deps,'./Activity52TaskService':tasks,'../handlers/playerPayload':payload,
 './EquipService':{ensureEquipInfo:()=>({})},'./SpiritProgressService':{getHistoricalSpiritUpgradeCount:()=>0}});
function reset(){const now=Date.now();db={userId:'qa_ram_fulu',level:135,items:{233:10,19:0},currencies:{},other_attr_info:{},taskInfo:{dailyTaskDayKey:tasks.dayKey(),tasks:{},tasksMap:{}},activityInfo:{datas:[{id:52001,record:1,score:0,records:{},startTime:now-86400000,endTime:now+172800000}]}};session={userId:db.userId,player:clone(db)};saves=0;failSave=null;}
function request(ids=[75001]){const r=db.activityInfo.datas[0];return {ids,type:52001|(1<<30),activityId:52001,dayKey:tasks.dayKey(),cycleKey:`52001:${r.startTime}:${r.endTime}`,requestId:Date.now()+'-followup_'+(++serial)};}
const ack=r=>(Array.isArray(r)?r:[r]).find(p=>p.tag===1000&&p.msgUid===71).data;
let failed=0,passed=0;
async function test(name,fn){reset();try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.log('FAIL '+name+' :: '+e.message);}}
async function main(){
 await test('same-day legacy claimed migration survives in-place sync',()=>{db.taskInfo.tasks[75001]={id:75001,status:30};tasks.sync(db,db.taskInfo);assert.equal(db.taskInfo.tasks[75001].status,30);assert(db.other_attr_info.fuluTaskLedger[52001].claimed.includes(75001));});
 await test('same-day legacy claimed migration cannot grant login twice',async()=>{db.taskInfo.tasks[75001]={id:75001,status:30};tasks.sync(db,db.taskInfo);session.player=clone(db);assert.notEqual(ack(await tasks.claim(request(),session,71)).result,0);assert.equal(saves,0);assert.equal(db.items[233],10);});
 await test('previous-day activity points never complete new-day Fulu task',async()=>{db.taskInfo.dailyTaskDayKey=tasks.dayKey(Date.now()-86400000);db.items[19]=80;session.player=clone(db);assert.equal(tasks.taskRows(clone(db)).find(x=>x.id===75003).progress,0);assert.notEqual(ack(await tasks.claim(request([75003]),session,71)).result,0);assert.equal(saves,0);});
 await test('first midnight claim cannot grant task75003 using yesterday points',async()=>{db.taskInfo.dailyTaskDayKey=tasks.dayKey(Date.now()-86400000);db.items[19]=80;session.player=clone(db);const prior=clone(db);assert.notEqual(ack(await tasks.claim(request([75003]),session,71)).result,0);assert.deepEqual(db,prior);assert.equal(saves,0);});
 await test('today activity points still complete and grant task75003',async()=>{db.items[19]=80;session.player=clone(db);assert.equal(ack(await tasks.claim(request([75003]),session,71)).result,0);assert.equal(db.items[232],2);});
 await test('concurrent distinct login requests grant once',async()=>{const out=await Promise.all(Array.from({length:8},()=>tasks.claim(request(),session,71)));assert.equal(out.filter(x=>ack(x).result===0).length,1);assert.equal(saves,1);assert.equal(db.items[233],11);});
 await test('concurrent duplicate claim pushes current task but no reward delta',async()=>{const req=request();const out=await Promise.all(Array.from({length:8},()=>tasks.claim(req,session,71)));assert.equal(out.filter(x=>ack(x).replayed).length,7);assert.equal(saves,1);for(const x of out.slice(1)){assert.equal(x.find(p=>p.tag===1202).data.items.length,0);assert.equal(x.find(p=>p.data.task?.id===75001).data.task.status,30);}});
 await test('conflicting receipt cannot claim a different task',async()=>{const req=request();await tasks.claim(req,session,71);const prior=clone(db);assert.notEqual(ack(await tasks.claim({...req,ids:[75003]},session,71)).result,0);assert.deepEqual(db,prior);});
 await test('old-cycle replay cannot mark new-cycle tasks claimed',async()=>{const req=request();await tasks.claim(req,session,71);db.activityInfo.datas[0].startTime++;assert.equal(ack(await tasks.claim(req,session,71)).reason,'FULU_TASK_CYCLE_CHANGED');assert.equal(saves,1);});
 await test('confirmed commit then lost ACK replays without duplicate reward',async()=>{const req=request();failSave='after';await assert.rejects(tasks.claim(req,session,71),/ACK_LOSS/);assert.equal(session.player,null);failSave=null;session.player=clone(db);assert.equal(ack(await tasks.claim(req,session,71)).replayed,true);assert.equal(db.items[233],11);assert.equal(saves,1);});
 await test('save refusal grants nothing and invalidates stale session',async()=>{const prior=clone(db);failSave='before';await assert.rejects(tasks.claim(request(),session,71),/SAVE_NOT_CONFIRMED/);assert.deepEqual(db,prior);assert.equal(session.player,null);});
 await test('verified battle UID counts once; no UID and unrelated activeId ignored',()=>{assert.equal(tasks.recordProgress(db,54,1,{}),false);assert.equal(tasks.recordProgress(db,13,1,{battleUid:'x'}),false);assert.equal(tasks.recordProgress(db,54,1,{battleUid:'x'}),true);assert.equal(tasks.recordProgress(db,54,1,{battleUid:'x'}),false);assert.equal(tasks.taskRows(db).find(x=>x.id===75002).status,20);});
 await test('counter baselines exclude lifetime totals and use valid daily increments',()=>{db.other_attr_info.mainTaskProgress={itemConsume:{4:1000},arenaChallengeCount:500};tasks.sync(db,db.taskInfo);db.other_attr_info.mainTaskProgress.itemConsume[4]+=100;db.other_attr_info.mainTaskProgress.arenaChallengeCount+=3;const rows=tasks.taskRows(db);assert.equal(rows.find(x=>x.id===75004).status,20);assert.equal(rows.find(x=>x.id===75005).status,20);const tomorrow=tasks.taskRows(db,Date.now()+86400000);assert.equal(tomorrow.find(x=>x.id===75004).progress,0);assert.equal(tomorrow.find(x=>x.id===75005).progress,0);});
 await test('real MainTask first increment seeds Fulu baseline before mutation',()=>{db.other_attr_info.mainTaskProgress={itemConsume:{4:1000},arenaChallengeCount:500};mainTasks.addItemConsume(db,4,100);mainTasks.addArenaChallengeCount(db,3);assert.equal(db.taskInfo.tasks[75004].status,20);assert.equal(db.taskInfo.tasks[75005].status,20);});
 await test('real MainTask midnight first increment preserves all valid progress',()=>{const yesterday=Date.now()-86400000;db.taskInfo.dailyTaskDayKey=tasks.dayKey(yesterday);db.other_attr_info.mainTaskProgress={itemConsume:{4:1000},arenaChallengeCount:500};tasks.sync(db,db.taskInfo,yesterday);mainTasks.addItemConsume(db,4,100);mainTasks.addArenaChallengeCount(db,3);assert.equal(db.taskInfo.tasks[75004].progress,100);assert.equal(db.taskInfo.tasks[75005].progress,3);});
 await test('legacy normalizer without activity context preserves rows; closed event removes them',()=>{tasks.sync(db,db.taskInfo);tasks.sync({},db.taskInfo);assert.equal(db.taskInfo.tasks[75001].status,20);db.activityInfo.datas=[];tasks.sync(db,db.taskInfo);assert.equal(db.taskInfo.tasks[75001],undefined);});
 for(let multi=1;multi<=5;multi++) await test('exact-live operate selectedColor4 multiplier'+multi+' cost/reward/ACK/push',async()=>{
  db.items[233]=159;db.items[232]=33;db.activityInfo.datas[0].record=4;db.activityInfo.datas[0].score=13;session.player=clone(db);
  const req={...request(),id:52001,module:1,index:multi,param:0,selectedColor:4};delete req.ids;delete req.type;delete req.activityId;delete req.dayKey;
  const result=await activity.handleActivityOperate(req,session,71);
  const response=result.find(p=>p.tag===1700&&p.msgUid===71),draw=result.find(p=>p.tag===1775),sync=result.find(p=>p.tag===1202);
  assert.equal(response.data.result,0);assert.equal(draw.data.requestId,req.requestId);assert.equal(draw.data.cycleKey,req.cycleKey);
  assert.equal(db.items[233],159-multi);assert.equal(db.activityInfo.datas[0].score,13+multi);assert.equal(db.activityInfo.datas[0].records[1],multi);
  assert.equal(sync.data.items.find(r=>r.id===233).count,-multi);assert.equal(sync.data.changed.find(r=>r.id===233).count,159-multi);
  assert.equal(Object.values(draw.data.colorCount).reduce((a,b)=>a+b,0),5);assert(Object.values(draw.data.colorCount).every(n=>Number.isSafeInteger(n)&&n>0));
  assert(draw.data.rewards.every(r=>Number.isSafeInteger(r.count)&&r.count>0&&r.count%multi===0));
  assert.equal(JSON.stringify(draw.data.rewards),JSON.stringify(response.data.rewardInfo.items));assert.equal(JSON.stringify(draw.data),JSON.stringify(response.data.draw));
  for(const reward of draw.data.rewards) assert.equal(db.items[reward.id],(reward.id===232?33:0)+reward.count);
  const prior=clone(db);const replay=await activity.handleActivityOperate(req,session,71);assert.equal(replay.find(p=>p.tag===1700).data.replayed,true);assert.deepEqual(db,prior);assert.equal(saves,1);
 });
 console.log(JSON.stringify({variant,passed,failed,mode:'RAM_ONLY',productionWrites:0}));if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
