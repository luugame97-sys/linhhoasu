'use strict';
// Read-only source/config, VM-isolated domain code, RAM saves only.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict'), crypto = require('crypto');
const root = path.resolve(__dirname, '../..'), app = path.join(root, 'linhhoasu/lhs/newServer');
const lp = require.resolve(path.join(app, 'src/logger'));
require.cache[lp] = { id: lp, filename: lp, loaded: true, exports: { info() {}, warn() {}, error() {}, debug() {} } };
const config = require(path.join(app, 'src/services/ConfigService'));
let now = Date.parse('2026-09-25T12:00:00+07:00'), saved, saves = 0;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const clone = x => JSON.parse(JSON.stringify(x));
function load(rel, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(app, rel), 'utf8'), { module, exports: module.exports, Date: Clock,
    process: { env: { OLD_TREK_EVENT_ENGINE_ENABLED: '1' } }, require: name => {
      if (!(name in deps)) throw Error('BLOCKED_DEPENDENCY:' + name); return deps[name];
    } }, { filename: rel });
  return module.exports;
}
const schedule = load('src/services/OldTrekScheduleService.js', {});
const progress = load('src/services/OldTrekProgressService.js', {'./ConfigService':config});
const ledger = load('src/services/OldTrekLedgerService.js', {});
const arena = load('src/services/OldTrekArenaService.js', {'node:crypto':crypto,'./ConfigService':config});
const rules = require(path.join(app, 'src/config/oldTrekGameplayPolicy.json'));
const event = load('src/services/OldTrekEventService.js', {'node:crypto':crypto,'./ConfigService':config,'../config/oldTrekGameplayPolicy.json':rules,
  './OldTrekPuzzleService':require(path.join(app,'src/services/OldTrekPuzzleService')), './OldTrekArenaService':arena});
const handler = load('src/handlers/old-trek.js', {
  '../services/ConfigService':config,'../services/OldTrekScheduleService':schedule,'../services/OldTrekProgressService':progress,
  '../services/OldTrekLedgerService':ledger,'../services/OldTrekEventService':event,'../services/OldTrekArenaService':arena,
  '../services/PlayerMutationService':{run:async(_,fn)=>fn()},'node:crypto':crypto,
  '../services/CurrencySync':require(path.join(app,'src/services/CurrencySync')),
  '../services/PlayerService':{savePlayer:async(_,p)=>{saved=clone(p);saves++;return p;}},
  './raid':{addRewardToPlayer(p,id,count){const key={1:'diamond',2:'silver',6:'gold'}[id];if(key)p.currencies[key]=(p.currencies[key]||0)+count;else p.items[id]=(p.items[id]||0)+count;}}
});
const info=s=>s.player.other_attr_info.oldTrekInfo;
const data=r=>(Array.isArray(r)?r[0]:r).data;
const call=(s,tag,p={})=>handler.handleOldTrekAction(tag,p,s,12);
function fresh() {
  const player={userId:'ram-only',playerId:'ram-only',name:'RAM',level:100,currencies:{diamond:100000,gold:0,silver:0},items:{321:10000,331:10000,329:100,325:100,326:100}};
  handler.ensureOldTrekInfo(player);const s={userId:player.userId,player};
  info(s).sailorList=[340101,340102,340103].map(id=>handler.buildSailor(id));
  info(s).sailorSlotList.forEach((v,j)=>{v.sailorId=info(s).sailorList[j]?.id||0;});
  info(s).setMap[0].forEach((l,j)=>{l.slots[0]=info(s).sailorList[j].id;l.leader=l.slots[0];});
  return s;
}
async function sail(s) { assert.equal(data(await handler.handleOldTrekInfo({id:1,diff:1},s,1)).result,0); }
function setEvent(s,id,uid=9001){const i=info(s);i.sailInfo.currentEvent={id,uid,pre:-1,createdAt:now,policyVersion:rules.version,trekUid:i.sailInfo.trekData.uid,season:i.season,rootUid:uid,chainStep:0};return i.sailInfo.currentEvent;}
const results=[];
async function check(id,fn){now=Date.parse('2026-09-25T12:00:00+07:00');saves=0;try{const evidence=await fn();results.push({id,status:evidence.applicable===false?'NOT_APPLICABLE':'REPRODUCED',evidence});}catch(e){results.push({id,status:'HARNESS_FAILED_OR_NOT_REPRODUCED',error:e.stack});}}
(async()=>{
 await check('rollover_archives_unpaid_journey_without_claim_path',async()=>{
  const s=fresh();await sail(s);info(s).sailInfo.trekData.dist=2400;info(s).sailInfo.cabin=[{uid:8,id:301401,state:1,count:1}];setEvent(s,109);
  const before=clone(s.player.items);now=schedule.getSchedule().seasonEnd+1000;
  const response=data(await handler.handleOldTrekInfo({},s,1));
  assert.equal(response.season,2);assert.equal(info(s).sailing,false);assert.equal(info(s).sailInfo.trekData,null);
  assert.equal(info(s).seasonArchives[1].sailInfo.trekData.dist,2400);assert.deepEqual(clone(s.player.items),before);
  return {archivedDistance:2400,archivedCargo:1,itemsUnchanged:true,endCache:info(s).endCache};
 });
 await check('empty_line_departure_accepted_then_sea_battle_nulls_session',async()=>{
  const s=fresh();info(s).setMap[0][2].slots=[0,0,0,0];info(s).setMap[0][2].leader=-1;await sail(s);
  const e=setEvent(s,2);e.enemySnapshot=arena.npc(s.player);e.enemy=arena.profile(e.enemySnapshot);
  const r=data(await call(s,7002,{eventUid:e.uid,operate:0,param:0}));assert.equal(r.code,'OLD_TREK_SAVE_UNKNOWN');assert.equal(s.player,null);
  return {departureAccepted:true,battleCode:r.code,sessionPlayerNull:true};
 });
 await check('sailor_progress_not_persisted_on_settlement',async()=>{
  const s=fresh();await sail(s);info(s).sailInfo.trekData.dist=2400;setEvent(s,109);const r=await call(s,7002,{eventUid:9001,operate:0,param:0});
  assert(Array.isArray(r)&&r.some(p=>p.tag===7010));assert.equal(info(s).totalDistance,2400);
  assert(info(s).sailorList.every(x=>x.task[2]===0&&x.task[3]===0));
  return {totalDistance:2400,sailorTasks:info(s).sailorList.map(x=>x.task)};
 });
 await check('big_event_completion_does_not_increment_type3_task',async()=>{
  const s=fresh();await sail(s);let e=setEvent(s,101),steps=0;const svc=event.createService({randomInt:()=>0});
  do {const r=svc.resolve(info(s),{eventUid:e.uid,operate:0,param:0},now,s.player);assert(r.ok,r.code);e=r.event;steps++;assert(steps<33);}while(e);
  const keys=Object.keys(info(s).taskRecord);assert(keys.length);assert(!keys.some(k=>Number(k)%100===3));
  return {steps,taskKeys:keys,type3:0,configuredBigEventTasks:Object.values(config.get('OldTrekTaskConfig')).filter(t=>t.type===3).length};
 });
 await check('arena_zero_score_falls_back_to_unrelated_arenaScore',async()=>{
  const s=fresh();s.player.oldTrekArenaScore=0;s.player.arenaScore=2000;assert.equal(arena.score(s.player),0);
  const r=data(await call(s,7053));assert.equal(r.record,63);
  return {oldTrekScore:0,unrelatedArenaScore:2000,claimedGradeBits:r.record,expectedGradeBits:1};
 });
 await check('task_score_fallback_claims_unmet_difficulty_task',async()=>{
  const s=fresh();info(s).taskRecord[104]=432000;
  const row=Object.values(config.get('OldTrekTaskConfig')).find(x=>x.destination===1&&x.type===4&&x.taskValue2>0&&x.taskValue1<=432000);
  if(!row)return {applicable:false,note:'No current task rows use this fallback shape'};
  await call(s,7040,{id:1});assert(info(s).dest[0].taskClaimed.includes(row.id));return {row,unmetExactKey:10000*row.taskValue2+104};
 });
 await check('max_sailor_level_bypass_by_stale_requested_level',async()=>{
  const s=fresh();const levels=config.get('OldTrekSailorLevelUpConfig'), max=Math.max(...Object.keys(levels).map(Number));info(s).sailorSlotList[0].level=max;
  const r=data(await call(s,7024,{slot:0,level:1}));assert.equal(r.result,0);assert.equal(info(s).sailorSlotList[0].level,max+1);
  return {before:max,requested:1,after:info(s).sailorSlotList[0].level};
 });
 await check('recall_bypasses_recruit_capacity',async()=>{
  const s=fresh(),rows=Object.values(config.get('OldTrekSailorConfig')).filter(x=>x.type===1),cap=Number(config.get('OldTrekBaseConfig').initialSailorNum);
  info(s).sailorList=rows.slice(0,cap).map(x=>handler.buildSailor(x.id));const row=rows[cap];info(s).sailorAtlas[row.id]=0;
  for(const cost of config.get('OldTrekBaseConfig').recallCost[row.quality]){const k={1:'diamond',2:'silver',6:'gold'}[cost.id];if(k)s.player.currencies[k]=1e6;else s.player.items[cost.id]=1e6;}
  const r=data(await call(s,7037,{id:row.id}));assert.equal(r.result,0);assert.equal(info(s).sailorList.length,cap+1);return {cap,after:info(s).sailorList.length};
 });
 await check('lost_settlement_packet_has_no_relog_endCache',async()=>{
  const s=fresh();await sail(s);info(s).sailInfo.trekData.dist=2400;setEvent(s,109);await call(s,7002,{eventUid:9001,operate:0,param:0});
  s.player=clone(saved);await handler.handleOldTrekInfo({},s,1);assert.equal(info(s).endCache,false);assert(info(s).lastEndCache);return {endCache:false,lastEndCachePresent:true,reward339:s.player.items[339]};
 });
 await check('oldtrek_patch_install_stops_when_only_chat_class_is_ready',async()=>{
  let timers=0;function ChatData(){}ChatData.prototype.parseOldTrekMsg=function(){};
  const w={ChatData,setTimeout(){timers++;}};vm.runInNewContext(fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'),'utf8'),{window:w});
  assert(w.LhsOldTrekErrors.chatInstalled);assert.equal(timers,0);assert(!w.LhsOldTrekErrors.installed);
  return {chatInstalled:true,oldTrekInstalled:false,retryTimers:timers};
 });
 // Current production config parity is a precondition, not an inferred fact.
 const live=JSON.parse(fs.readFileSync(path.join(root,'_ai_workbench/temp/oldtrek_deep_audit_20260927/live.json')));
 const parity=Object.entries(live.runtime.tableHashes).map(([name,hash])=>({name,equal:hash===crypto.createHash('sha256').update(JSON.stringify(config.get(name))).digest('hex')}));
 const report={at:new Date().toISOString(),productionWrites:0,networkAttempts:0,configParity:parity,results};
 fs.writeFileSync(path.join(root,'_ai_workbench/temp/oldtrek_deep_audit_20260927/repro.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
