'use strict';
const assert=require('assert/strict'),path=require('path');
const {memoryModel,clone}=require('./test-competitions-v3');
const app=process.env.COMPETITION_APP||path.resolve(__dirname,'..');
const cross=require(app+'/src/services/CrossServerEventService'),calendar=require(app+'/src/services/CrossEventScheduleService');
const settlement=require(app+'/src/services/CrossEventSettlementService'),config=require(app+'/src/services/ConfigService');
const DAY=86400000,HOUR=3600000,anchor=Date.parse(cross.schedule.anchor),activation=Date.parse(cross.schedule.independent.crossArena.activationAt),grace=cross.schedule.settlementGraceMs;
const checks=[];function check(name,fn){fn();checks.push(name);}
async function main(){
 check('C0 key preserved for existing scores and settlement',()=>assert.equal(cross.cycleFor('crossRival',anchor).key,'C0_1789318800000'));
 check('no CrossArena season or daily rewards before activation',()=>{assert.equal(cross.cycleFor('crossArena',activation-1),null);assert(!settlement.dueWindows(anchor,activation).some(w=>w.cycle.event==='crossArena'));});
 const first=cross.cycleFor('crossArena',activation);
 check('first short season ends Monday GMT+7',()=>{assert.equal(first.startTime,activation);assert.equal(first.endTime,anchor+7*DAY);assert(first.key.startsWith('W_crossArena_0_'));});
 check('weekly season opens with no gap for 300 weeks',()=>{for(let i=1;i<301;i++){const at=anchor+i*7*DAY,a=cross.cycleFor('crossArena',at-1),b=cross.cycleFor('crossArena',at);assert.equal(a.endTime,b.startTime);assert.notEqual(a.key,b.key);assert.equal(b.endTime-b.startTime,7*DAY);assert.equal(cross.cycleAt(at).event,i%2?'topArena':'crossRival');}});
 check('parallel tracks never share score keys',()=>{for(let i=1;i<20;i++){const at=anchor+i*7*DAY;assert.notEqual(cross.cycleAt(at).key,cross.cycleFor('crossArena',at).key);}});
 check('next rotating event and independent activation',()=>{assert.equal(cross.nextCycle('topArena',anchor).startTime,anchor+7*DAY);assert.equal(cross.nextCycle('crossRival',anchor+7*DAY).startTime,anchor+14*DAY);assert.equal(cross.nextCycle('crossArena',anchor).startTime,activation);});
 check('daily windows GMT+7 at 23h and never before activation',()=>{for(const w of settlement.dueWindows(anchor,first.endTime+grace).filter(w=>w.cycle.event==='crossArena'&&w.period==='day')){assert(w.cutoffAt>activation);assert.equal(new Date(w.cutoffAt+7*HOUR).getUTCHours(),23);}});
 const rules=clone(cross.schedule);rules.independent.crossArena.activationAt='2026-09-17T23:30:00+07:00';
 check('activation resolver handles post-cutoff first evening',()=>assert.equal(cross.cycleFor('crossArena',Date.parse(rules.independent.crossArena.activationAt),rules).startTime,Date.parse(rules.independent.crossArena.activationAt)));
 const at=anchor+7*DAY;
 check('page limit cannot split shared cutoff',()=>{const windows=settlement.dueWindows(at,at+grace,1);assert.equal(windows.length,2);assert(windows.every(w=>w.cutoffAt===at));assert.deepEqual(windows.map(w=>w.cycle.event),['crossArena','crossRival']);});
 check('late catchup bounded and strictly ordered',()=>{const windows=settlement.dueWindows(activation,anchor+10000*DAY,32);assert(windows.length>=32&&windows.length<=33);assert(windows.every((w,i)=>!i||w.cutoffAt>=windows[i-1].cutoffAt));});
 const server={serverId:1001,openTime:anchor-30*DAY,running:true},player={serverId:1001,level:120};
 check('parallel eligible open + closed rotating event',()=>{assert(calendar.describe('crossArena',player,server,activation).open);assert(calendar.describe('crossRival',player,server,activation).open);assert.equal(calendar.describe('topArena',player,server,activation).reason,'CLOSED');});
 check('S4 pool and actual level/day/server gates retained',()=>{assert.equal(calendar.describe('crossArena',{...player,serverId:1004},server,activation).reason,'SERVER_NOT_IN_POOL');assert.equal(calendar.describe('crossArena',{...player,level:99},server,activation).reason,'LOCKED');assert.equal(calendar.describe('crossArena',player,{...server,openTime:activation},activation).reason,'LOCKED');assert.equal(calendar.describe('crossArena',player,{...server,running:false},activation).reason,'LOCKED');});
 check('native metadata translated to current cycle',()=>{const cycle=cross.cycleFor('topArena',at),row=calendar.metadata('topArena',cycle),base=Object.values(config.get('TopArenaOpenConfig'))[0];assert.equal(row.id,10001);assert.equal(row.startTime,at);assert.equal(row.endTime,at+7*DAY);assert.equal(row.promotionStartTime-at,base.promotionStartTime-base.startTime);assert.equal(calendar.topInfo(cycle,at).stage,1);assert.equal(calendar.topInfo(cycle,row.promotionStartTime).stage,2);});
 const p={crossRivalInfo:{score:456,taskRecord:[11],taskProgress:{2:456},camp:3}};
 calendar.seasonState(p,'crossRival',activation);
 check('adopt C0 without losing score or reward receipts',()=>{assert.equal(p.crossRivalInfo.score,456);assert.deepEqual(p.crossRivalInfo.taskRecord,[11]);assert.equal(p.crossRivalInfo.camp,3);});
 const old=clone(p.crossRivalInfo);calendar.seasonState(p,'crossRival',at);
 check('closed period preserves completed season',()=>assert.deepEqual(p.crossRivalInfo,old));
 calendar.seasonState(p,'crossRival',anchor+14*DAY);
 check('new rotating season resets local progression and archives old',()=>{assert.equal(p.crossRivalInfo.score,undefined);assert.equal(p.crossRivalInfo.seasons[old.cycleKey].score,456);assert.deepEqual(p.crossRivalInfo.seasons[old.cycleKey].taskRecord,[11]);});
 const node=require(app+'/src/services/ServerConfigService'),original=node.findServerConfig;node.findServerConfig=async()=>server;
 let calls=0;const handler=()=>{calls++;return'ok';},session={serverId:1001,player};const originalNow=Date.now;Date.now=()=>activation;
 try{
  for(const tag of [2350,6200,6201,6202,6203,6210,6211,6212,6213,6214,6215,6216,6217,6218,6220,6221]){const r=await calendar.dispatch(tag,{},session,1,handler);assert.equal(r.data.code,'CROSS_EVENT_CLOSED');}assert.equal(calls,0);checks.push('all TopArena routes blocked outside period with zero handler writes');
  session.serverId=1004;for(const tag of [6550,6551,6553,6554,6555,6556,6557,6560,6562,6563,6564,6565,6566,6567,6568,6569,6570,6571,6572,6573,6575,6580,6582]){assert.equal((await calendar.dispatch(tag,{},session,1,handler)).data.code,'CROSS_EVENT_SERVER_NOT_IN_POOL');}assert.equal(calls,0);checks.push('all CrossRival entry/economy routes blocked outside pool');
  check('closed-map cleanup remains allowed',()=>{for(const tag of [6552,6558,6561,6581,6583])assert.equal(calendar.eventForTag(tag),null);});
  session.serverId=1001;assert.equal(await calendar.dispatch(6560,{},session,1,handler),'ok');assert.equal(calls,1);checks.push('eligible current event dispatches normally');
  const r=await calendar.dispatch(6199,{},session,1);assert.equal(r.data.version,cross.schedule.version);assert(r.data.events.crossArena.open);checks.push('read-only schedule packet carries independent cycles');
 }finally{node.findServerConfig=original;Date.now=originalNow;}
 const Settlement=memoryModel(),Mail=memoryModel(),Player=memoryModel();let crash=true;
 const id='cross_scheduler_1001';Settlement.rows.set(id,{_id:id,cursorAt:at-1});
 const svc=settlement.createService({Settlement,Mail,Player,config,serverId:1001,clock:()=>at+grace,loadRoster:async cycle=>{
  if(cycle.event==='crossRival'&&crash){crash=false;throw Error('SECOND_CUTOFF_FAILURE');}
  return[{playerId:'qa_a',userId:'qa_u',serverId:1001,score:100,rank:1}];}});
 await assert.rejects(svc.tick(),/SECOND_CUTOFF_FAILURE/);
 check('crash in second event never advances shared cursor',()=>{assert.equal(Settlement.rows.get(id).cursorAt,at-1);assert.equal(Mail.rows.size,1);});
 await svc.tick();check('retry completes both events with exactly two rewards',()=>{assert.equal(Settlement.rows.get(id).cursorAt,at);assert.equal(Mail.rows.size,2);});
 await svc.tick();check('completed parallel cutoff not paid again',()=>assert.equal(Mail.rows.size,2));
 console.log(JSON.stringify({result:'PASS',checks:checks.length,tests:checks,productionWrites:0,networkAttempts:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
