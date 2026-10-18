'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const task=path.resolve(__dirname,'../temp/cross_rival_20261015'),integration=process.argv.includes('--integration'),candidate=path.join(task,integration?'next':'candidate');
const sourcePath=relative=>fs.existsSync(path.join(candidate,relative))?path.join(candidate,relative):path.join(task,'candidate',relative);
const live=JSON.parse(fs.readFileSync(path.join(task,'live-audit.json'),'utf8'));
const supplement=JSON.parse(fs.readFileSync(path.join(task,'config-supplement.json'),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x)), checks=[];
let writes=0,now=Date.parse('2026-10-15T12:00:00+07:00');
class Clock extends Date { static now(){return now;} }
function load(relative,deps={}){
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(sourcePath(relative),'utf8'),{module,exports:module.exports,Date:Clock,
    require(name){if(name==='../config/crossRivalRelease.json')return JSON.parse(fs.readFileSync(sourcePath('src/config/crossRivalRelease.json'),'utf8'));if(Object.hasOwn(deps,name))return deps[name];throw Error('IMPORT_DENIED:'+name);}}, {filename:relative});
  return module.exports;
}
function freeze(o){if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;}
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
const rules=load('src/services/CrossRivalRules.js');
const cycle={key:'C4_1791738000000',index:4,event:'crossRival',startTime:1791738000000,endTime:1792342800000};
let rows=[{playerId:'p2',name:'S8',userId:'u2',serverId:1008,level:100,score:10,payload:{camp:2,defKill:7}},
  {playerId:'p1',name:'S1',userId:'u1',serverId:1001,level:100,score:20,payload:{camp:1,defKill:2}},
  {playerId:'p3',name:'S4',userId:'u3',serverId:1004,level:100,score:10,payload:{camp:2,defKill:3}}];
const cross={cycleFor:()=>cycle,isServerAllowed:s=>Number(s)>=1001&&Number(s)<=1008,top:async()=>clone(rows)};
const config={get:name=>live.config[name]||{}};
const schedule=load('src/services/CrossEventScheduleService.js',{'./CrossServerEventService':cross,'./ConfigService':config,'./CrossRivalRules':rules});
const read=load('src/services/CrossRivalReadService.js',{'./CrossServerEventService':cross,'./CrossRivalRules':rules});
const modern=integration?load('src/services/CrossRivalHandlerService.js',{'./CrossRivalRules':rules,'./CrossRivalReadService':read}):null;
const h=load('src/handlers/cross-rival.js',{
  '../services/PlayerService':{savePlayer(){writes++;throw Error('UNEXPECTED_WRITE');}},
  '../services/BattleService':{},'../services/ArenaReadModelService':{},'../services/ConfigService':config,
  './raid':{},'./playerPayload':{},'../services/RoleAppearanceService':{},'../services/CurrencySync':{},
  '../services/MainTaskProgressService':{},'../services/CrossServerEventService':cross,
  '../services/CrossEventScheduleService':schedule,'../services/CrossRivalRules':rules,'../services/CrossRivalReadService':read,
  '../services/CrossRivalHandlerService':modern,
});
const session=freeze({userId:'u1',player:{playerId:'p1',userId:'u1',serverId:1001,name:'S1',level:100,
  currencies:{diamond:1000},items:{310:4,311:55},crossRivalInfo:{cycleKey:cycle.key,score:20,taskRecord:[1],camp:1}}});
const names=Object.keys(h).filter(n=>/^handle/.test(n));
const blocked={handleCrossRivalMapGetInfo:6550,handleCrossRivalMapEnter:6551,handleCrossRivalMove:6553,
  handleCrossRivalFly:6554,handleCrossRivalBoxOpen:6556,handleCrossRivalRobBox:6557,handleCrossRivalChat:6562,
  handleCrossRivalTaskReward:6566,handleCrossRivalDefenderDetail:6568,handleCrossRivalWandersDetail:6569,
  handleCrossRivalStartFight:6570,handleCrossRivalFinishFight:6571,handleCrossRivalMapRevive:6572,
  handleCrossRivalUseItem:6573,handleCrossRivalPlayerDetail:6575,handleCrossRivalCoreAttack:6580,handleCrossRivalEssenceOpen:6582};
(async()=>{
  await check('all 28 handler contracts present',()=>assert.equal(names.length,28));
  const before=JSON.stringify(session);
  for(const [name,tag] of Object.entries(blocked)) await check(name+' fail-closed without player/score writes',async()=>{
    for(const p of [null,{}, {reEnter:1,campId:999,line:999,core:999,collectId:101,targetId:'fake',count:Number.MAX_SAFE_INTEGER}]){
      const r=await h[name](p,session,17);assert.equal(r.tag,tag);assert.equal(r.msgUid,17);
      if(tag===6551)assert.equal(r.data,null);else assert.equal(r.data.code,'CROSS_RIVAL_MAINTENANCE');
    }
    assert.equal(JSON.stringify(session),before);
  });
  await check('1700 replay/concurrent refusals preserve inventory/history',async()=>{
    await Promise.all(Array.from({length:100},(_,i)=>Promise.all(Object.keys(blocked).map(n=>h[n]({core:999},session,i+1)))));
    assert.equal(JSON.stringify(session),before);assert.equal(writes,0);
  });
  await check('push-only enter stays push-only; callback enter receives matching ACK',async()=>{
    const p=await h.handleCrossRivalEnter({},session,0);assert.equal(p.tag,6500);assert.equal(p.msgUid,0);
    const both=await h.handleCrossRivalEnter({},session,75);assert.equal(both[0].tag,6560);assert.equal(both[0].msgUid,75);
    assert.equal(both[1].data.maintenance,true);assert.equal(JSON.stringify(session),before);
  });
  await check('shared rank contains only real rows with real server IDs',async()=>{
    const r=await h.handleCrossRivalPlayerRankInfo({},session,3);assert.equal(r.data.list.length,3);
    assert.deepEqual(clone(r.data.list.map(x=>x.dbid)),['p1','p2','p3']);assert.equal(r.data.list[1].serverId,1008);
  });
  await check('defence rank uses defKill, not score minus 900',async()=>{
    const r=await h.handleCrossRivalPlayerDefRankInfo({},session,3);assert.equal(r.data.list[0].dbid,'p2');assert.equal(r.data.list[0].defend,7);
  });
  await check('camp scores aggregate shared records with stable ascending tie',async()=>{
    const r=await h.handleCrossRivalCampRankInfo({},session,3);assert.equal(r.data.list[0].score,20);
    assert.deepEqual(clone(r.data.list.map(x=>x.camp)),[1,2,3,4]);
  });
  await check('read endpoints do not mutate session or persist',async()=>{
    for(const name of ['handleCrossRivalEnter','handleCrossRivalLeave','handleCrossRivalCampInfo','handleCrossRivalCampRankInfo','handleCrossRivalMapPlayerCount'])await h[name]({},session,4);
    assert.equal(JSON.stringify(session),before);assert.equal(writes,0);
  });
  await check('leave/cancel remain available and preserve scores/items',async()=>{
    const s=clone(session);s.player.crossRivalInfo.mapId=2;s.player.crossRivalInfo.stayTime=now+10000;
    const leave=await h.handleCrossRivalMapLeave({},s,8);assert.equal(leave[0].tag,6552);assert.equal(s.player.crossRivalInfo.mapId,-1);
    assert.equal(s.player.crossRivalInfo.score,20);assert.equal(s.player.items[310],4);
    for(const name of ['handleCrossRivalBoxCancel','handleCrossRivalCoreCancel','handleCrossRivalEssenceCancel'])assert.equal((await h[name]({},s,1)).data.result,0);
  });
  for(const [time,stage] of [['09:59:59',1],['10:00:00',2],['19:54:59',2],['19:55:00',3],['19:59:59',3],['20:00:00',4],['20:29:59',4],['20:30:00',5]]){
    await check('GMT+7 phase boundary '+time,()=>assert.equal(rules.phase(cycle,Date.parse('2026-10-15T'+time+'+07:00')).stage,stage));
  }
  await check('cycle cutoff closed; invalid phase config rejected',()=>{
    assert.equal(rules.phase(cycle,cycle.endTime).stage,0);assert.throws(()=>rules.phase(cycle,now,{firstStageEnd:1}),/PHASE_CONFIG_INVALID/);
  });
  const tables=clone(live.config),old=clone(tables);
  rules.applyConfig(tables);
  await check('rank499/500/501 and every rank 1..9999 resolve exactly once',()=>{
    for(const name of ['CrossRivalScoreRankRewardConfig','CrossRivalDefenseRankRewardConfig']){
      const table=Object.values(tables[name]);
      for(let rank=1;rank<=9999;rank++)assert.equal(table.filter(r=>rank>=r.rankMin&&rank<=r.rankMax).length,1);
      for(const [id,row] of Object.entries(tables[name]))assert.deepEqual(row.rewards,old[name][id].rewards);
    }
    const once=JSON.stringify(tables);rules.applyConfig(tables);assert.equal(JSON.stringify(tables),once);
  });
  await check('native CN task reward reference is the correct CrossRival function',()=>{
    const ref=JSON.parse(fs.readFileSync(path.join(task,'reference-comparison.json'),'utf8'));assert(ref.cn.methods.sendTaskReward.includes('6566'));
  });
  const shopText=fs.readFileSync(sourcePath('src/handlers/item.js'),'utf8');
  const start=shopText.indexOf('function crossRivalShopGuard('),end=shopText.indexOf('\n}\n',start)+2;
  const guard=vm.runInNewContext('('+shopText.slice(start,end)+')',{require:()=>rules,config:{get:()=>Object.fromEntries(supplement.shops.map(r=>[r.id,r]))}});
  await check('both shop tabs and mixed baskets rejected before routing/debit',()=>{
    for(const row of supplement.shops)assert.equal(guard({require:{[row.id]:1,999999:1}},6).data.code,'CROSS_RIVAL_MAINTENANCE');
    assert.equal(guard({require:{999999:1}},6),null);
    const wrapper=shopText.slice(shopText.indexOf('async function handleMultiBuyItem(params'),shopText.indexOf('// 使用物品'));
    assert(wrapper.indexOf('crossRivalShopGuard')<wrapper.indexOf('farmShop.scoped'));
  });
  if(integration)await check('QA shop grants only scoped actors before expiry; schedule shares QA phase',()=>{
    const release=rules.release;if(!release.qaActors.length)return;
    const previous=now;now=release.qaStartAt+1;
    try{
      const actor=release.qaActors[0],basket={require:{[supplement.shops[0].id]:1}};
      assert.equal(guard(basket,8,actor),null);
      assert.equal(guard(basket,8,{...actor,userId:'other'}).data.code,'CROSS_RIVAL_MAINTENANCE');
      const calendar=load('src/services/CrossEventScheduleService.js',{
        './CrossServerEventService':{...cross,nextCycle:()=>null},'./CrossRivalRules':rules,
        './ConfigService':{get:name=>name==='SystemConfig'?{324:{conditions:[{cond:4,type:3,value:100}]}}:config.get(name)}});
      const state=calendar.describe('crossRival',{...actor,level:100},{openTime:now-86400000},now,actor.serverId);
      assert.equal(state.maintenance,false);assert(state.cycle.key.startsWith('QA_'));assert.equal(state.phase.stage,2);
      now=release.qaUntil;
      assert.equal(guard(basket,8,actor).data.code,'CROSS_RIVAL_MAINTENANCE');
    }finally{now=previous;}
  });
  const shopConfig=Object.fromEntries(supplement.shops.map(r=>[r.id,r]));shopConfig[888]={id:888,tab:99,limitType:6};
  const farm=load('src/services/FarmShopService.js',{'./ConfigService':{get:()=>shopConfig},'./PlayerMutationService':{},'./FeatureReceiptService':{},
    './PlayerService':{},'./RuntimeBus':{},'./CrossServerEventService':cross,'./GameDayService':{key:()=> 'day'}});
  await check('cycle quota resets only CrossRival limitType6; preserves unrelated shop',()=>{
    const p={shopInfo:{crossRivalShopCycle:'OLD',shopDayKey:farm.getShopDayKey(now),shopWeekKey:farm.getShopWeekKey(now),farmShopDay:'day',
      buyRecords:{21000001:1,22000001:4,888:1}},rechargeInfo:{records:[{id:21000001,count:1},{id:888,count:1}]}};
    assert(farm.needsReset(p,now));farm.resetDay(p,now);assert.equal(p.shopInfo.buyRecords[21000001],undefined);
    assert.equal(p.shopInfo.buyRecords[22000001],4);assert.equal(p.shopInfo.buyRecords[888],1);assert.equal(p.rechargeInfo.records[1].count,1);
    assert.equal(p.shopInfo.crossRivalShopCycle,cycle.key);
  });
  await check('unknown old quota is adopted without gifting a fresh quota',()=>{
    const p={shopInfo:{shopDayKey:farm.getShopDayKey(now),shopWeekKey:farm.getShopWeekKey(now),farmShopDay:'day',buyRecords:{21000001:1}}};
    farm.resetDay(p,now);assert.equal(p.shopInfo.buyRecords[21000001],1);
  });
  const calls=[],tips=[];let nativeEnter=0,nativeReward=0;
  function Rival(){this._crossRivalInfo={stage:2,taskRecord:[],campInfoMap:{1:{camp:1,score:0},2:{camp:2,score:0}}};}
  Rival.prototype.Rpc=function(...args){calls.push(args);return 'handle';};Rival.prototype.checkActivityIsOpen=()=>true;
  Rival.prototype.doCrossRivalInfo=function(x){this._crossRivalInfo=x;};Rival.prototype.crossRivalCampScoreSort=()=>{};
  function Room(){}Room.prototype.Rpc=Rival.prototype.Rpc;
  function Top(){}Top.prototype.IsTopArenaOpen=()=>false;Top.prototype.onInfoUpdate=()=>{};Top.prototype.Rpc=Rival.prototype.Rpc;
  const rival=new Rival(),room=new Room();
  const browser={GlobalManager:{CrossRivalModel:rival,CrossRivalRoomModel:room,TopArenaModel:new Top(),ActorModel:{actorID:'RAM'},Config:clone(live.config)},
    crypto:require('crypto').webcrypto,UserInfo:{ServerID:1001,UserID:'RAM'},setTimeout(){},clearTimeout(){},UserTips:{ins:()=>({showTips:t=>tips.push(t)})}};
  for(const file of ['lhs-cross-events-v2.js','lhs-cross-rival-safety-v1.js'])vm.runInNewContext(fs.readFileSync(sourcePath('web/js/'+file),'utf8'),{window:browser,Date:Clock});
  await check('both client models patched idempotently',()=>{
    assert.equal(browser.LhsCrossRivalSafety.installed,true);const rpc=rival.Rpc;browser.LhsCrossRivalSafety.install();assert.equal(rival.Rpc,rpc);
  });
  await check(integration?'v2 formerly push-only commands have request identity and matching ACK callback':'native fire-and-forget RPC has no manufactured callback',()=>{
    rival.Rpc(6560,null);const first=calls.pop();room.Rpc(6571,{});const second=calls.pop();
    if(integration){assert.equal(typeof first[2],'function');assert.equal(typeof second[2],'function');assert.match(first[1].requestId,/^r2_\d{13}_[a-f0-9]{32}$/);assert.notEqual(first[1].requestId,second[1].requestId);}
    else{assert.equal(first[2],undefined);assert.equal(second[2],undefined);}
  });
  await check('unrelated RPC preserves callback identity',()=>{
    const callback=()=>{};room.Rpc(1234,{},callback);assert.equal(calls.pop()[2],callback);
  });
  const ref=JSON.parse(fs.readFileSync(path.join(task,'reference-comparison.json'),'utf8')).live.methods;
  function native(name,env){const text=ref[name];return vm.runInNewContext('('+text.slice(text.indexOf('=')+1)+')',env);}
  const mapEnter=native('sendMapEnter',{Y:{CrossRivalRoomModel:{sc_cross_rival_map_enter(){nativeEnter++;}}},Mw:{},P:{ins:()=>({open:()=>({}),showCloud:cb=>cb(),hideCloud(){}})},pw:{}});
  const taskReward=native('sendTaskReward',{Er:{Open(){nativeReward++;}},A:{ins:()=>({dispatch(){}})},E:{}});
  await check('actual native callbacks cannot enter map/open reward on refusal',()=>{
    mapEnter.call(rival,2,0,0,100,100);calls.pop()[2]({result:-1,code:'REQUEST_BACKPRESSURE'});
    taskReward.call(rival,1);calls.pop()[2]({result:-1,code:'CROSS_RIVAL_MAINTENANCE'});
    assert.equal(nativeEnter,0);assert.equal(nativeReward,0);
  });
  await check('old unpatched map callback also safely handles maintenance null',()=>{
    mapEnter.call({_crossRivalInfo:{},Rpc(_t,_d,cb){cb(rules.error(6551,1).data);}},2,0,0,100,100);assert.equal(nativeEnter,0);
  });
  await check('successful native map/task callbacks still work',()=>{
    mapEnter.call(rival,2,0,0,100,100);calls.pop()[2]({result:0,selfInfo:{id:'RAM'},players:[],stayTime:now+1000});assert.equal(nativeEnter,1);
    taskReward.call(rival,1);calls.pop()[2]({result:0,taskIds:[7],rewardInfo:{items:[]}});assert.equal(nativeReward,1);
  });
  await check('stale identity callback is ignored',()=>{
    let called=false;room.Rpc(6580,{},()=>{called=true;});const cb=calls.pop()[2];browser.UserInfo.UserID='NEW';cb({result:0});assert.equal(called,false);
  });
  await check('client tie rank and config agree with server',()=>{
    rival.crossRivalCampScoreSort();assert.equal(rival._crossRivalInfo.campInfoMap[1].rank,1);
    const cfg=browser.GlobalManager.Config;for(const name of ['CrossRivalScoreRankRewardConfig','CrossRivalDefenseRankRewardConfig']){
      assert.equal(Object.values(cfg[name]).filter(r=>500>=r.rankMin&&500<=r.rankMax).length,1);
    }
  });
  if(integration)await check('native rank countdown matches settlement cutoff after the last combat window',()=>{
    const source=fs.readFileSync(path.join(task,'baseline/web/js/main.min_drop200.js'),'utf8');
    const marker='c.updateEndTime=function(){var t=this,e=Y.Config.CrossRivalOpenConfig',start=source.indexOf(marker);
    assert(start>=0);const end=source.indexOf('},c.onLeftBtn',start);
    function Rank(){}const cfg={endTime:cycle.endTime,secondtStageEnd:73800};
    Rank.prototype.updateEndTime=vm.runInNewContext('('+source.slice(start+'c.updateEndTime='.length,end+1)+')',{
      Y:{Config:{CrossRivalOpenConfig:{1:cfg}},CrossRivalModel:{getCrossRivalId:()=>1}},
      So:{MS_PER_DAY:86400000},T:{get serverTimeMilli(){return now;}},y:{ins:()=>({doTimer(){}})},$c:{TIMETEXT_TYPE_DDHH_HHMMSS:5}});
    browser.CrossRivalRankMainWin=Rank;browser.LhsCrossRivalSafety.install();
    const previous=now;now=cycle.endTime-3600000;
    browser.LhsCrossEvents.snapshot={serverTime:now,events:{crossRival:{cycle}}};browser.LhsCrossEvents.receivedAt=now;
    const view=new Rank();view.timeGroup={visible:false};view.timeLabel={SetEndTime(t){this.end=t;},SetCallbackFunc(cb){this.callback=cb;}};
    view.updateEndTime();assert.equal(view.timeGroup.visible,true);assert.equal(view.timeLabel.end,cycle.endTime/1000);
    now=cycle.endTime;view.updateEndTime();assert.equal(view.timeGroup.visible,false);now=previous;
  });
  const output={result:'PASS',checks:checks.length,names:checks,refusedConcurrentCalls:1700,productionWrites:0,networkAttempts:0,nativeBrowserExecuted:false};
  fs.writeFileSync(path.join(task,integration?'integration-safety-tests.json':'safety-tests.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
})().catch(e=>{console.error(e);process.exitCode=1;});
