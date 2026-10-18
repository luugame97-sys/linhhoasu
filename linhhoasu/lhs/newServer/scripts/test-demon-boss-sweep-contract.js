'use strict';
// Real handler/config/task/privilege code, with storage/network denied.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),Module=require('module');
const app=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
process.env.ROLE_LEVEL_2000_ENABLED='1';process.env.SERVER_ID='1002';
let networkAttempts=0,saves=0,persisted=null;
const deny=()=>{networkAttempts++;throw Error('TEST_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;
for(const id of ['http','https']){require(id).request=deny;require(id).get=deny;}global.fetch=deny;
function stub(rel,value){const p=path.join(app,'src',rel);require.cache[p]={id:p,filename:p,loaded:true,exports:value};}
stub('logger.js',{info(){},warn(){},error(){},debug(){}});
stub('services/PlayerService.js',{async savePlayer(_id,player){saves++;persisted=clone(player);return true;}});
stub('services/ServerConfigService.js',{findServerConfig:async()=>({openTime:Date.now()-864000000})});
const originalLoad=Module._load;
class Schema{constructor(){this.statics={};this.methods={};}index(){}pre(){}}
Schema.Types={Mixed:class{}};
Module._load=function(id,parent,main){
 if(id==='mongoose'){const connection={models:{},model:()=>({}),useDb(){return this;}};return {Schema,connection,model:connection.model};}
 if(id==='ioredis')return class{};
 return originalLoad.call(this,id,parent,main);
};
const tables=require('../src/services/ConfigService').loadAllTables();
const raid=require('../src/handlers/raid'),dungeon=require('../src/handlers/dungeon');
const payload=require('../src/handlers/playerPayload');
const compat=require('../src/handlers/compat');
const tasks=require('../src/services/MainTaskProgressService'),day=require('../src/services/GameDayService');
const packets=v=>Array.isArray(v)?v:[v],ack=v=>packets(v).find(p=>p.tag===2304).data;
const taskById=(player,id)=>player.taskInfo?.tasks?.[id]||Object.values(player.taskInfo?.tasksMap||{}).flat().find(t=>Number(t?.id)===id);
let groups=0;
async function test(name,work){try{await work();groups++;}catch(e){e.message=name+': '+e.message;throw e;}}
function fresh(used=0,card=false){
 const p={userId:'sweep_fixture',playerId:'sweep_fixture',name:'fixture',level:800,exp:0,
  roleInfo:{stage:36,stageId:36,kungfuId:4},items:{1:100000,4:100},currencies:{diamond:100000,gold:0,silver:0},
  rechargeInfo:{monthCards:card?{11000002:Date.now()+86400000}:{}},
  other_attr_info:{mainTaskProgress:{dungeonBossChallengeCount:12,dungeonBossMaxMapId:35}},
  raidInfo:{chapter:1,level:1,demonBossInfo:{stage:35,cleanOutTime:used,cleanOutDayKey:day.key()}},
  equipInfo:{curIndex:0,equipSetMap:{0:{}}},petInfo:{pets:[]},boxInfo:{tier:1,level:1},taskInfo:{tasks:{},tasksMap:{}}};
 for(const c of Object.values(tables.TaskConfig))if((c.type===1&&c.id<=10061)||c.id===20011)p.taskInfo.tasks[c.id]={id:c.id,type:c.type,status:c.id===10061?10:10,progress:0,target:c.taskValue1};
 tasks.refreshMainTaskProgress(p);saves=0;persisted=clone(p);return {userId:p.userId,player:p};
}
const sweep=(s,stage,uid=1)=>raid.handleSkipBattle({stage},s,uid);
(async()=>{
 await test('preserve cleared Yêu Vương stage across login and complete activeId39 task',()=>{
  const p={level:180,roleInfo:{stage:16,stageId:16},
   raidInfo:{chapter:1,level:1,demonBossInfo:{stage:17,cleanOutTime:0}},
   other_attr_info:{mainTaskProgress:{dungeonBossChallengeCount:0,dungeonBossMaxMapId:0}},
   taskInfo:{tasks:{70203:{id:70203,type:7,status:10,progress:0,target:17}},tasksMap:{}}};
  dungeon.ensureDungeonRaidInfo(p);
  assert.equal(p.raidInfo.demonBossInfo.stage,17,'login must not lower cleared stage');
  const normalized=payload.normalizeTaskInfo(p.taskInfo,p.roleInfo,p);
  const state=normalized.tasks['70203']
    || Object.values(normalized.tasksMap||{}).flat().find(row=>Number(row&&row.id)===70203);
  assert(state,'drop-tier boss task must remain in payload');
  assert.equal(state.progress,17);assert.equal(state.status,20);
 });
 await test('recover one historical completed boss task without inventing the next boss',()=>{
  const p={level:809,roleInfo:{stage:36,stageId:36},
   raidInfo:{demonBossInfo:{stage:35,cleanOutTime:0}},
   other_attr_info:{mainTaskProgress:{dungeonBossMaxMapId:0}},
   taskInfo:{tasks:{70210:{id:70210,type:7,status:20,progress:36,target:36},972011:{id:972011,type:7,status:10,progress:36,target:37}},tasksMap:{}}};
  dungeon.ensureDungeonRaidInfo(p);
  assert.equal(p.raidInfo.demonBossInfo.stage,36);
  assert.equal(p.other_attr_info.mainTaskProgress.dungeonBossMaxMapId,36);
  const normalized=payload.normalizeTaskInfo(p.taskInfo,p.roleInfo,p);
  const next=normalized.tasks['972011']||Object.values(normalized.tasksMap||{}).flat().find(row=>Number(row&&row.id)===972011);
  assert.equal(next.progress,36);assert.equal(next.status,10);
 });
 await test('sweep writes durable boss frontier for tier3 boss17 prerequisite',async()=>{
  const s=fresh();
  s.player.level=180;s.player.roleInfo.stage=s.player.roleInfo.stageId=16;
  s.player.raidInfo.demonBossInfo.stage=17;
  s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=0;
  s.player.taskInfo={tasks:{},tasksMap:{}};
  const result=await sweep(s,17,90);
  assert.equal(ack(result).result,0);
  assert.equal(s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId,17);
  assert.equal(s.player.raidInfo.demonBossInfo.stage,17);
  dungeon.ensureDungeonRaidInfo(s.player);
  assert.equal(s.player.raidInfo.demonBossInfo.stage,17);
 });
 await test('tier10->11 already beyond boss36: sweep older stage, sync type7 and pay exactly once',async()=>{
  const s=fresh();s.player.boxInfo={tier:10,level:27,tierExp:0};
  s.player.level=850;s.player.roleInfo.stage=s.player.roleInfo.stageId=38;
  s.player.raidInfo.demonBossInfo.stage=37;s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=0;
  s.player.taskInfo={tasks:{},tasksMap:{}};
  const before=clone(s.player),result=await sweep(s,36,100);
  assert.equal(ack(result).result,0);
  assert.equal(s.player.raidInfo.demonBossInfo.stage,37);
  assert.equal(persisted.other_attr_info.mainTaskProgress.dungeonBossMaxMapId,37);
  const type7=packets(result).filter(p=>p.tag===1000&&p.data.task?.type===7);
  for(const id of [70010,70110,70210]){
   const state=type7.find(p=>p.data.task.id===id)?.data.task;
   assert(state,'missing current tier10 packet '+id);assert.equal(state.status,20);
  }
  assert(type7.some(p=>p.data.task.id===972011&&p.data.task.status===20),'future tier prerequisite already cleared is synced');
  assert(!type7.some(p=>p.data.task.id===972012&&p.data.task.status===20),'boss38 remains incomplete');
  assert.equal(s.player.items[30],before.items[30],'no first-clear rewards');
  // Client cache is intentionally stale, exactly the failed UI situation.
  const source=fs.readFileSync(path.resolve(app,'../../webgame/game/js/main.min_drop100.js'),'utf8');
  const ctx={m:{},a:{},Y:{Config:tables},E:{Game_Task_Update:'task'},A:{ins:()=>({dispatch(){}})}};
  for(const [begin,end]of [
   ['m.onTaskUpdate=function','m.firstRealmGuide=function'],
   ['m.getTaskDataByType=function','m.getCompletedTaskInfos=function'],
   ['m.checkTaskWinById=function','m.checkGuideConfig=function']]){
   const start=source.indexOf(begin),stop=source.indexOf(','+end,start);
   assert(start>0&&stop>start);vm.runInNewContext(source.slice(start,stop)+';',ctx);
  }
  const cache={tasksMap:{7:[70010,70110,70210].map(id=>({id,type:7,status:10,progress:0}))}};
  ctx.m._taskInfo=cache;ctx.m.checkShowTaskcompleteTip=()=>{};
  ctx.Y.TaskModel=ctx.m;
  assert.equal(ctx.m.checkTaskWinById(70210),false);
  for(const p of type7)ctx.m.onTaskUpdate(clone(p.data));
  for(const id of [70010,70110,70210])assert.equal(ctx.m.checkTaskWinById(id),true);
  let tierUpSent=0;ctx.Y.BoxLayerModel={getBoxInfo:()=>s.player.boxInfo,sendBoxTierUp:()=>{tierUpSent++;}};
  ctx.Y.ItemModel={checkItemEnough:()=>true};ctx.B={strformatByLangId:String};ctx.S={ins:()=>({showTips(){}})};
  const panelStart=source.indexOf('i(FIt,IIt=n)'),start=source.indexOf('a.onClickBuyExp=function',panelStart),stop=source.indexOf(',a.onClickSkip=function',start);
  assert(start>0&&stop>start);vm.runInNewContext(source.slice(start,stop)+';',ctx);ctx.a.onClickBuyExp();
  assert.equal(tierUpSent,1,'native UI permits upgrade after task packets');
  const funds=s.player.currencies.diamond;
  const upgraded=packets(await compat.handleBoxTierUp2150({},s,101)).find(p=>p.tag===2150).data;
  assert.equal(upgraded.result,0);assert.equal(upgraded.tierExp,1);
  assert.equal(funds-s.player.currencies.diamond,450);assert.equal(upgraded.tier,10);
  const relog=clone(persisted);dungeon.ensureDungeonRaidInfo(relog);
  assert.equal(relog.raidInfo.demonBossInfo.stage,37);
  const login=payload.buildPlayer500Data(relog);
  assert.equal(taskById(login,70210).status,20);
  assert.equal(taskById(login,70210).target,36);
 });
 await test('first-clear boss36 -> task70210 ACK -> relog, replay grants nothing twice',async()=>{
  const s=fresh();s.player.boxInfo={tier:10,level:27,tierExp:0};
  const row=tables.DemonBossConfig[36];
  s.lastBattle={type:4,levelId:36,result:{win:true},level:{demonBossStage:36,reward:clone(row.rewards)}};
  const result=await raid.handleClaimFightReward({type:4},s,110);
  assert.equal(packets(result).find(p=>p.tag===2301).data.result,0);
  assert.equal(s.player.raidInfo.demonBossInfo.stage,36);
  assert.equal(s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId,36);
  const state=packets(result).find(p=>p.tag===1000&&p.data.task?.id===70210)?.data.task;
  assert(state,'win must return type7 milestone');assert.equal(state.status,20);
  await Promise.resolve();
  const durable=clone(persisted),before=clone(s.player);dungeon.ensureDungeonRaidInfo(durable);
  assert.equal(durable.raidInfo.demonBossInfo.stage,36);
  assert.equal(taskById(payload.buildPlayer500Data(durable),70210).status,20);
  assert.equal(packets(await raid.handleClaimFightReward({type:4},s,111)).find(p=>p.tag===2301).data.result,-1);
  assert.deepEqual(s.player,before);
 });
 await test('tier gating remains strict for insufficient level, box level and boss frontier',async()=>{
  for(const kind of ['level','drop','boss']){
   const s=fresh();s.player.boxInfo={tier:10,level:kind==='drop'?26:27,tierExp:0};
   s.player.level=kind==='level'?799:800;s.player.raidInfo.demonBossInfo.stage=kind==='boss'?35:36;
   s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=kind==='boss'?35:36;
   s.player.taskInfo={tasks:{},tasksMap:{}};
   const money=s.player.currencies.diamond,r=packets(await compat.handleBoxTierUp2150({},s,120)).find(p=>p.tag===2150).data;
   assert.equal(r.result,-2);assert.equal(r.taskId,{level:70110,drop:70010,boss:70210}[kind]);
   assert.equal(s.player.currencies.diamond,money);assert.equal(s.player.boxInfo.tierExp,0);assert.equal(saves,0);
  }
  const s=fresh();s.player.level=180;s.player.roleInfo.stage=s.player.roleInfo.stageId=16;
  s.player.boxInfo={tier:3,level:50,tierExp:0};s.player.raidInfo.demonBossInfo.stage=17;
  s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=17;s.player.taskInfo={tasks:{},tasksMap:{}};
  const r=packets(await compat.handleBoxTierUp2150({},s,121)).find(p=>p.tag===2150).data;
  assert.equal(r.result,-2);assert.equal(r.taskId,70103,'180/190 still blocks independently');
 });
 await test('Votinh135-shaped tier11 state rejects only missing boss37 task',async()=>{
  const s=fresh();s.player.level=809;s.player.roleInfo.stage=s.player.roleInfo.stageId=36;
  s.player.boxInfo={tier:11,level:75,tierExp:0,tierUpTime:0,tierUpStartTime:0};
  s.player.raidInfo.demonBossInfo.stage=35;
  s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=0;
  s.player.taskInfo={tasks:{
   70210:{id:70210,type:7,status:20,progress:36,target:36},
   970011:{id:970011,type:7,status:20,progress:75,target:28},
   971011:{id:971011,type:7,status:20,progress:809,target:803},
   972011:{id:972011,type:7,status:10,progress:36,target:37},
  },tasksMap:{}};
  const diamond=s.player.currencies.diamond;
  const data=packets(await compat.handleBoxTierUp2150({},s,130)).find(p=>p.tag===2150).data;
  assert.equal(data.result,-2);assert.equal(data.taskId,972011);assert.equal(s.player.currencies.diamond,diamond);assert.equal(s.player.boxInfo.tierExp,0);
 });
 await test('online tier10 migration accepts completed boss36 without relog',async()=>{
  const s=fresh();s.player.boxInfo={tier:10,level:75,tierExp:0,tierUpTime:0};
  s.player.level=809;s.player.roleInfo.stage=s.player.roleInfo.stageId=36;
  s.player.raidInfo.demonBossInfo.stage=35;s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=0;
  s.player.taskInfo={tasks:{70210:{id:70210,type:7,status:20,progress:36,target:36}},tasksMap:{}};
  const money=s.player.currencies.diamond;
  const data=packets(await compat.handleBoxTierUp2150({},s,131)).find(p=>p.tag===2150).data;
  assert.equal(data.result,0);assert.equal(data.tierExp,1);assert.equal(s.player.currencies.diamond,money-450);
  assert.equal(s.player.raidInfo.demonBossInfo.stage,36);assert.equal(s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId,36);
 });
 await test('old/current share counter and cost, preserve frontier/first-clear items, real task sync',async()=>{
  const s=fresh();
  for(const [i,stage]of [34,33,35].entries()){
   const before=clone(s.player),row=tables.DemonBossConfig[stage],r=await sweep(s,stage,i+1);
   assert.equal(ack(r).result,0);assert.equal(ack(r).stage,stage);
   assert.equal(s.player.raidInfo.demonBossInfo.stage,35);assert.equal(s.player.raidInfo.demonBossInfo.cleanOutTime,i+1);
   assert.equal(s.player.currencies.diamond,before.currencies.diamond-row.cleanoutCost[i]);
   assert.equal(s.player.items[4]-before.items[4],row.cleanoutRewards.find(r=>r.id===4).count);
   assert.equal(s.player.items[30],before.items[30]);
   assert.equal(s.player.other_attr_info.mainTaskProgress.dungeonBossChallengeCount,13+i);
   assert.equal(s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId,35);
   assert.equal(persisted.raidInfo.demonBossInfo.cleanOutTime,i+1);
   if(i===0){assert(packets(r).some(p=>p.tag===1000),'task sync packet');assert.equal(taskById(s.player,20011).status,20,'daily task state');}
  }
  assert.equal(taskById(s.player,20011).status,20);
 });
 await test('base6/card8/expired-card enforce shared cap',async()=>{
  for(const [card,cap]of [[false,6],[true,8]]){
   const s=fresh(cap-1,card);assert.equal(ack(await sweep(s,34)).result,0);const before=clone(s.player);
   const r=ack(await sweep(s,33,2));assert.equal(r.result,-1);assert.equal(r.maxCleanOutNum,cap);assert.deepEqual(s.player,before);assert.equal(saves,1);
  }
  const s=fresh(6,true);s.player.rechargeInfo.monthCards[11000002]=Date.now()-1;
  assert.equal(ack(await sweep(s,34)).result,-1);assert.equal(saves,0);
 });
 await test('future/nonexistent/no-money reject without economic or task changes',async()=>{
  for(const kind of ['future','missing','funds']){
   const s=fresh(1);if(kind==='funds'){s.player.currencies.diamond=0;s.player.items[1]=0;}
   const before=clone(s.player);assert.equal(ack(await sweep(s,kind==='future'?36:kind==='missing'?999:34)).result,-1);
   assert.deepEqual(s.player,before);assert.equal(saves,0);
  }
 });
 await test('migration preserves count, day rollover once, relog, GMT+7 boundaries',async()=>{
  const legacy=fresh(3);delete legacy.player.raidInfo.demonBossInfo.cleanOutDayKey;assert.equal(ack(await sweep(legacy,34)).cleanOutTime,4);
  const s=fresh(6);s.player.raidInfo.demonBossInfo.cleanOutDayKey=day.key(Date.now()-86400000);
  assert.equal(ack(await sweep(s,34)).cleanOutTime,1);assert.equal(ack(await sweep(s,33,2)).cleanOutTime,2);
  const p=clone(s.player);dungeon.ensureDungeonRaidInfo(p);assert.equal(p.raidInfo.demonBossInfo.cleanOutTime,2);
  p.raidInfo.demonBossInfo.cleanOutDayKey=day.key(Date.now()-86400000);dungeon.ensureDungeonRaidInfo(p);assert.equal(p.raidInfo.demonBossInfo.cleanOutTime,0);
  assert.equal(day.key(Date.parse('2026-09-22T16:59:59Z')),20260922);assert.equal(day.key(Date.parse('2026-09-22T17:00:00Z')),20260923);
 });
 await test('native renderer old/current vs next/locked, shared quota and selected stage',()=>{
  const source=fs.readFileSync(path.resolve(app,'../../webgame/game/js/main.min_drop100.js'),'utf8');
  const start=source.indexOf('Ane.dataChanged=function(){var t,e=this.data.stageData.roleStageId'),end=source.indexOf(',t(pL=Cne,"BoxTowerItem")',start);
  assert(start>0&&end>start);const selected=[],costs=[];
  const Y={RoleModel:{roleInfo:{stage:36},getNameByStage:String},Config:tables,
   RaidInfoModel:{sendCleanOutDemonBoss:s=>selected.push(s)},ItemModel:{checkItemEnough:(id,v)=>{costs.push([id,v]);return true;}},SystemTipsModel:{isClickSystem:()=>false}};
  const ctx={Ane:{},Y,U:{ArrayCollection:class{constructor(v){this.source=v;}}},
   B:{strformatByLangId:String,ConvertLanguageToText:String,setGaryEnabled:(b,d)=>{b.enabled=!d;}},
   lu:{GetAppearancePictureById:String},qo:{Prop:1},_5:{getPrivilegeAddMaxNum:(_id,n)=>n+2},
   D:{setLeftTimesLabel:(l,n,m)=>{l.text=n+'/'+m;},ShowRedPoint(){}},S:{ins:()=>({showTipsByLangId(){}})}};
  vm.runInNewContext(source.slice(start,end)+';',ctx);
  for(const [stage,state]of [[34,'auto'],[35,'auto'],[36,'normal'],[37,'lock']]){
   const row=Object.assign(Object.create(ctx.Ane),{data:{nowStage:35,cleanOutTime:6,stageData:tables.DemonBossConfig[stage],backOldMutl:-1,rewardFindBackMutl:-1},
    titleLabel:{},headIcon:{},backOldMutlCell:{setData(){}},rewardFindBackMutlCell:{setData(){}},lockLabel:{},list:{},costItem:{},autoBtn:{},challengeBtn:{},countLabel:{}});
   row.dataChanged();assert.equal(row.currentState,state);
   if(state==='auto'){
    assert.equal(row.countLabel.text,'2/8');assert.equal(row.autoBtn.enabled,true);row.onClickAutoBtn();assert.equal(selected.at(-1),stage);
    assert.equal(costs.at(-1)[1],tables.DemonBossConfig[stage].cleanoutCost.at(-1));
    row.data.cleanOutTime=8;row.dataChanged();assert.equal(row.autoBtn.enabled,false);
    const calls=selected.length;row.onClickAutoBtn();assert.equal(selected.length,calls);
   }
  }
  assert.deepEqual(selected,[34,35]);
 });
 assert.equal(networkAttempts,0);
 console.log(JSON.stringify({result:'PASS',groups,realConfig:true,realTasks:true,realPrivileges:true,nativeRenderLogic:true,networkAttempts,productionWrites:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
