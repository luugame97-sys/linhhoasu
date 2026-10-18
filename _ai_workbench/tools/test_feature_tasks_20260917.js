'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const installed=process.env.FEATURE_APP||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
const candidate=process.env.FEATURE_CANDIDATE_ROOT||path.resolve(__dirname,'../temp/feature_unlock_release_20260917/candidate/server');
const source=rel=>fs.readFileSync(fs.existsSync(path.join(candidate,rel))?path.join(candidate,rel):path.join(installed,rel),'utf8');
const logger=require.resolve(path.join(installed,'src/logger'));
require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(path.join(installed,'src/services/ConfigService'));
const tables=config.loadAllTables(),copy=x=>JSON.parse(JSON.stringify(x));
let count=0,persisted,saves=0,saveMode='ok';
const check=(value,label)=>{assert.ok(value,label);count++;};
const cache=new Map();
const services={
 ConfigService:config,TaskPerfService:{nowNs:()=>0n,recordTaskNormalizeNs(){},recordTaskPushNs(){}},
 TaskDirtyService:{markTaskDirty(){}},ActivationPassService:{ensureActivationPassState(){},buildActivationPassUpdatePacket:()=>null},
 FishingEventSchedule:{taskRows:()=>[]},FishingEventService:{claimTasks:async()=>null},
 SpiritProgressService:{getHistoricalSpiritUpgradeCount:()=>0},
 RuntimeBus:{getWsServer:()=>null},PlayerService:{drainPendingSaves:async()=>{},savePlayer:async(_id,p)=>{
   saves++;if(saveMode==='null')return null;if(saveMode==='throw')throw Error('QA_SAVE_UNKNOWN');persisted=copy(p);return p;
 }},MainTaskProgressService:{refreshMainTaskProgress:()=>false,getMainTaskCurrentProgress:()=>0},
 RewardSync:{buildRewardItemSync:(p,items)=>({items,changed:items.map(r=>({id:r.id,count:p.items[r.id]||0}))})},
 RewardGrantService:{getRewardKind:()=> 'item'},PlayerNameService:{},
};
const raidMock={addRewardToPlayer(p,id,qty){p.items ||= {};p.items[id]=(p.items[id]||0)+qty;},checkLevelUp(){}};
function load(rel){
 if(cache.has(rel))return cache.get(rel).exports;
 const mod={exports:{}};cache.set(rel,mod);
 function localRequire(name){
  if(name.startsWith('node:'))return require(name);
  const key=path.basename(name);
  if(services[key])return services[key];
  if(key==='raid')return raidMock;
  if(key==='upgrade')return {refreshSystemUnlockInfo:async()=>false};
  if(['playerPayload','RealmTaskProgressService','SideTaskProgressService','FeatureMutationService','PlayerMutationService','task'].includes(key))
    return load(path.relative(installed,path.resolve(installed,path.dirname(rel),name+'.js')).replace(/\\/g,'/'));
  if(key==='logger')return {info(){},warn(){},error(){},debug(){}};
  return {};
 }
 vm.runInThisContext('(function(require,module,exports){'+source(rel)+'\n})',{filename:rel})(localRequire,mod,mod.exports);
 return mod.exports;
}
const payload=load('src/handlers/playerPayload.js'),realm=load('src/services/RealmTaskProgressService.js'),side=load('src/services/SideTaskProgressService.js');
const dayKey=()=>{const d=new Date(Date.now()+8*3600000);return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();};
function player(){return {userId:'feature_qa',playerId:'feature_qa',level:225,exp:8030,items:{4:5,55:3},currencies:{silver:20},
 roleInfo:{stage:18,stageId:18},raidInfo:{level:113},other_attr_info:{realmTaskProgress:{bagelConsume:650}},
 systemUnlockInfo:{unlockedSystem:[311,313,209,216]},taskInfo:{dailyTaskDayKey:dayKey(),tasks:{10302:{id:10302,type:1,status:10,progress:18,target:19}},tasksMap:{}}};}
function insert(p,id,status=10){const row=tables.TaskConfig[id],state={id,type:row.type,status,progress:status>=20?row.taskValue1:0,target:row.taskValue1};
 p.taskInfo.tasks[id]=state;p.taskInfo.tasksMap['9']=Object.values(p.taskInfo.tasks).filter(t=>t.type===9);}
function functionSource(text,name){const m=text.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^\\}','m'));assert(m,name);return m[0];}
const farmContext={configService:config,require:()=>payload,exports:{}};
vm.runInNewContext(['toSafeInt','normalizeTaskInfoSafe','incrementFarmSideTaskProgress'].map(n=>functionSource(source('src/handlers/farm.js'),n)).join('\n')+'\nexports.run=incrementFarmSideTaskProgress;',farmContext);
const upContext={config,normalizeTaskInfoSafe:payload.normalizeTaskInfo,exports:{}};
vm.runInNewContext(['toSafeInt','getCurrentMainTaskId','getTaskConditionProgress','compareConditionProgress'].map(n=>functionSource(source('src/handlers/upgrade.js'),n)).join('\n')+'\nexports.api={getTaskConditionProgress,compareConditionProgress};',upContext);
const main=fs.readFileSync(process.env.FEATURE_MAIN||path.resolve(__dirname,'../temp/feature_unlock_release_20260917/candidate/client/js/main.min_drop100.js'),'utf8');
const first=main.indexOf('calcSingleConditionType=function')+'calcSingleConditionType='.length,last=main.indexOf('},pOt.getSystemUnlockTip=',first)+1;
let current;
const native=vm.runInNewContext('('+main.slice(first,last)+')',{Y:{Config:tables,TaskModel:{getMainTask:()=>current.taskInfo.tasks[10302],getTaskDataById:id=>current.taskInfo.tasks[id]}}});
(async()=>{
 for(const status of [10,20,30]){
  const p=player();insert(p,90003,status);const economic=JSON.stringify({items:p.items,currencies:p.currencies});
  p.taskInfo=payload.normalizeTaskInfo(p.taskInfo,p.roleInfo);check(p.taskInfo.tasks[90003]?.status===status,'partial normalize retains side state '+status);
  realm.refreshRealmStageTasks(p);check(p.taskInfo.tasks[90003]?.status===status,'realm refresh retains side state '+status);
  farmContext.exports.run(p,18,1);check(p.taskInfo.tasks[90003]?.status===status,'farm update retains side state '+status);
  const relog=copy(p);relog.taskInfo=payload.normalizeTaskInfo(relog.taskInfo,relog.roleInfo,relog);
  check(relog.taskInfo.tasks[90003]?.status===status,'relog preserves side state '+status);
  check(JSON.stringify({items:p.items,currencies:p.currencies})===economic,'normalizers preserve economy '+status);
 }
 for(const id of [90003,90021])for(const status of [null,10,20,30])for(const cond of [0,1,2,4]){
  current=player();if(status!==null)insert(current,id,status);
  const server=upContext.exports.api.compareConditionProgress(upContext.exports.api.getTaskConditionProgress(current,id),id,cond);
  check(server===native(2,id,cond,0),'native task predicate '+id+'/'+status+'/'+cond);
 }
 check(upContext.exports.api.getTaskConditionProgress(player(),999999)===null,'unknown condition task fails closed');
 const oldEnabled=process.env.FEATURE_SIDE_TASKS_ENABLED,oldRoots=process.env.FEATURE_SIDE_TASK_ROOTS;
 try{
  process.env.FEATURE_SIDE_TASKS_ENABLED='1';process.env.FEATURE_SIDE_TASK_ROOTS='90020';
  const p=player();p.other_attr_info.mainTaskProgress={itemConsume:{55:56}};
  check(side.reconcile(p)&&p.taskInfo.tasks[90020].status===10,'seed correct SpecialTask prerequisite without retroactive completion');
  check(!side.reconcile(p),'second reconcile is no-op');
  check(side.graph().roots.get(90021)===90020,'root resolved through nextId, not guide114');
  check(side.recordProgress(p,13,1,{itemId:55})&&p.taskInfo.tasks[90020].status===20,'verified item55 consumption finishes side task');
  const economic=JSON.stringify(p.items);side.recordProgress(p,13,1,{itemId:55});check(JSON.stringify(p.items)===economic,'counter never grants reward');
  const task=load('src/handlers/task.js'),s={userId:p.userId,player:p};
  const missing=await task.handleClaimTaskRewardCompat({ids:[90021]},s,1);check((Array.isArray(missing)?missing.at(-1):missing).data.result===-1,'cannot claim missing side task');
  const before=copy(s.player.items);const first=await task.handleClaimTaskRewardCompat({ids:[90020,90020]},s,2);
  check(first.at(-1).data.ids.length===1&&s.player.taskInfo.tasks[90020].status===30,'duplicate claim id handled once');
  check(s.player.items[4]===before[4]+10&&s.player.taskInfo.tasks[90021],'one reward plus next task committed');
  const saved=copy(persisted);s.player=saved;await task.handleClaimTaskRewardCompat({ids:[90020]},s,3);
  check(JSON.stringify(s.player.items)===JSON.stringify(saved.items),'relog replay no reward');
  for(const mode of ['null','throw']){
   const p2=player();insert(p2,90020,20);const original=copy(p2),session={userId:p2.userId,player:p2};saveMode=mode;
   await assert.rejects(task.handleClaimTaskRewardCompat({ids:[90020]},session,4));count++;
   check(JSON.stringify(p2)===JSON.stringify(original)&&session.player===null,'uncertain side claim does not leak draft '+mode);
  }
  saveMode='ok';
 }finally{if(oldEnabled===undefined)delete process.env.FEATURE_SIDE_TASKS_ENABLED;else process.env.FEATURE_SIDE_TASKS_ENABLED=oldEnabled;
  if(oldRoots===undefined)delete process.env.FEATURE_SIDE_TASK_ROOTS;else process.env.FEATURE_SIDE_TASK_ROOTS=oldRoots;}
 console.log(JSON.stringify({result:'PASS',checks:count,saves,productionWrites:0,scope:'actual task/normalizer code and native condition function; RAM persistence'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
