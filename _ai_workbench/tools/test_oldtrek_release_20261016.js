'use strict';
// Exact candidate services/handler in RAM; no production model or network.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const base = path.resolve(__dirname, '../temp/oldtrek_fix_20261016');
const candidate = path.join(base, 'candidate2'), baseline = path.join(base, 'baseline2');
const clone = x => JSON.parse(JSON.stringify(x));
const rules = JSON.parse(fs.readFileSync(path.join(baseline, 'src/config/oldTrekGameplayPolicy.json')));
const results = [];
const eventRows = {
  101: { id: 101, eventType: 99, nextId: [[102]], choiceNext: [] },
  102: { id: 102, eventType: 99, nextId: [], choiceNext: [] },
  103: { id: 103, eventType: 99, nextId: [[102], [104]], choiceNext: [] },
  104: { id: 104, eventType: 99, nextId: [], choiceNext: [] },
  106: { id: 106, eventType: 1, nextId: [], choiceNext: [] },
  105: { id: 105, eventType: 2, nextId: [], choiceNext: [] },
};
const tables = { OldTrekCommonEventConfig: eventRows,
  OldTrekDestinationConfig: { 1: { 1: { id: 1, difficulty: 1, distance: 2400, baseSettleScore: 100, rewards: [] } } },
  OldTrekBaseConfig: { baseStable: 100, baseSpeed: 0, fixSettleDis: 100, fixSettleRewards: [{ id: 331, count: 10 }] },
};
const config = { get: name => tables[name] || {} };
let stored, online = false, saveCount = 0, casFail = false, lateTaskChange = false, reads = 0, rosterRows = [], dbRows = [], queryLimit = 0;
const warnings = [];
const modules = new Map();
let snapshots;
const atPath = (p, key) => key.split('.').reduce((a,k) => a?.[k], p);
const setPath = (p, key, value) => { const keys=key.split('.'),last=keys.pop();let q=p;for(const k of keys)q=q[k]||(q[k]={});q[last]=clone(value); };
const playerService = {
  drainPendingSaves: async () => {},
  loadPlayer: async () => { reads++; return clone(stored); },
  savePlayer: async () => { throw Error('WHOLE_PLAYER_SAVE_FORBIDDEN'); },
  saveOldTrekScoped: async (uid, before, draft) => {
    assert.equal(uid, before.userId);
    if (lateTaskChange) stored.taskInfo.count++;
    const patch = snapshots.patch(before, draft);
    if (casFail || patch.conditions.some(c => Object.entries(c).some(([k,v]) => ('$eq' in v) ? JSON.stringify(atPath(stored,k)) !== JSON.stringify(v.$eq) : atPath(stored,k)!==undefined))) return null;
    for (const [k,v] of Object.entries(patch.set)) setPath(stored,k,v);
    for (const k of Object.keys(patch.unset)) { const keys=k.split('.'),last=keys.pop();let p=stored;for(const n of keys)p=p[n];delete p[last]; }
    saveCount++; return clone(stored);
  },
};
const playerModel = {
  collection: { find: () => ({ toArray: async () => clone(rosterRows) }) },
  find(filter) { let limit = 0; return { select() { return this; }, sort() { return this; }, maxTimeMS() { return this; }, limit(n) { queryLimit = limit = n; return this; },
    async lean() { assert(limit>0); return clone(dbRows.filter(p=>!filter._id||p._id>filter._id.$gt).slice(0,limit)); } }; },
};
function load(rel) {
  if (modules.has(rel)) return modules.get(rel);
  const file = fs.existsSync(path.join(candidate,rel)) ? path.join(candidate,rel) : path.join(baseline,rel);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file,'utf8'), { module, exports:module.exports, Date, Buffer, console, setTimeout, clearTimeout, setInterval, clearInterval,
    process: { env: { OLD_TREK_SCOPED_CAS:'1', OLD_TREK_EVENT_ENGINE_ENABLED:'1' } },
    require(name) {
      if (name==='node:crypto'||name==='node:async_hooks') return require(name);
      const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(rel),name));
      if (dependency==='src/services/ConfigService') return config;
      if (dependency==='src/services/PlayerService') return playerService;
      if (dependency==='src/db/models/Player') return playerModel;
      if (dependency==='src/services/RuntimeBus') return {getWsServer:()=>({getPlayerForMutation:()=>online?{}:null})};
      if (dependency==='src/services/OldTrekPuzzleService') return {validate:()=>true,board:()=>[]};
      if (dependency==='src/services/RewardGrantService') return {isOldTrekShipSkinId:()=>false};
      if (dependency==='src/handlers/raid') return {addRewardToPlayer(p,id,count){p.items[id]=Number(p.items[id]||0)+count;}};
      if (dependency==='src/logger') return {info(){},warn(s){warnings.push(s);},error(s){warnings.push(s);}};
      if (dependency.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(baseline,dependency),'utf8'));
      if (name.startsWith('.')) return load(dependency+'.js');
      throw Error('BLOCKED_DEPENDENCY:'+name);
    } }, {filename:file});
  modules.set(rel,module.exports); return module.exports;
}
const eventService=load('src/services/OldTrekEventService.js'), handler=load('src/handlers/old-trek.js');
const schedule=load('src/services/OldTrekScheduleService.js');
const worker=load('src/services/OldTrekMaintenanceService.js');
snapshots=load('src/services/OldTrekSnapshotService.js');
function event(id, uid=10001, extra={}) { return {uid,id,pre:-1,rootUid:uid,chainStep:0,createdAt:Date.now()-1800000,season:schedule.getSchedule().seasonNumber,trekUid:9001,policyVersion:rules.version,...extra}; }
function info(id, extra={}) { return {season:schedule.getSchedule().seasonNumber,stateRevision:10,sailing:true,eventLedger:[],taskRecord:{},sailorList:[],sailSetId:0,setMap:{0:[]},sailInfo:{trekData:{uid:9001,id:1,diff:1,dist:100,stable:100,stableMax:100,lastUpdateTime:Date.now()},currentEvent:event(id),cabin:[],effects:[],eventLogs:[],offlineCache:{reward:[{id:331,count:7}],event:{},lose:[],robCount:0,stable:0}},...extra}; }
function player(id=101) { return {userId:'fixture',playerId:'player-fixture',serverId:1001,level:100,items:{331:0},currencies:{diamond:0,silver:0,gold:0},taskInfo:{count:9},other_attr_info:{fashion:{id:7},oldTrekInfo:info(id)}}; }
async function check(name, fn) { online=false;saveCount=0;casFail=false;lateTaskChange=false;reads=0;try { await fn();results.push({name,pass:true}); } catch(e) {results.push({name,pass:false,error:e.stack});} }
(async()=>{
  await check('timeout_single_branch_terminates_as_failure_once',()=>{const i=info(101),r=eventService.resolveExpired(i,10001);assert.equal(r.ok,true);assert.equal(r.terminal,true);assert.equal(r.lastLog.result,1);assert.deepEqual(clone(r.rewardRows),rules.terminalFailureReward);assert(eventService.resolveExpired(i,10001).replayed);assert.equal(i.eventLedger.length,1);});
  await check('timeout_valid_failure_branch_is_preserved',()=>{const i=info(103),r=eventService.resolveExpired(i,10001);assert.equal(r.ok,true);assert.equal(r.event.id,104);assert.equal(r.terminal,false);assert.equal(r.rewardRows.length,0);});
  await check('public_success_and_action_validation_unchanged',()=>{const i=info(101);assert.equal(eventService.resolve(i,{eventUid:10001,operate:0,param:0}).event.id,102);assert.equal(eventService.resolve(info(105),{eventUid:10001,operate:1,param:0}).code,'OLD_TREK_EVENT_ACTION_INVALID');});
  await check('spawn_skips_battle_without_sailing_formation',()=>{const i=info(105);i.sailInfo.currentEvent=null;i.sailInfo.trekData.eventPolicyVersion=rules.version;i.sailInfo.trekData.nextEventDistance=0;i.sailInfo.trekData.encounterCount=0;const spawned=eventService.spawn(i,Date.now(),null);assert(spawned);assert.notEqual(eventRows[spawned.id].eventType,2);});
  await check('spawn_skips_battle_without_authoritative_actor',()=>{const i=info(105);i.sailInfo.currentEvent=null;i.sailInfo.trekData.eventPolicyVersion=rules.version;i.sailInfo.trekData.nextEventDistance=0;i.sailInfo.trekData.encounterCount=0;i.setMap={0:[{id:0,slots:[999,0,0,0]},{id:1,slots:[999,0,0,0]},{id:2,slots:[999,0,0,0]}]};const spawned=eventService.spawn(i,Date.now(),null);assert(spawned);assert.notEqual(eventRows[spawned.id].eventType,2);});
  await check('malformed_battle_event_resolves_as_failure_without_success_reward',()=>{const i=info(105);i.sailInfo.currentEvent.enemySnapshot={dbid:'npc'};const r=eventService.resolveExpired(i,10001);assert.equal(r.ok,true);assert.equal(r.terminal,true);assert.equal(r.lastLog.result,1);assert.deepEqual(clone(r.rewardRows),rules.terminalFailureReward);assert.equal(i.sailInfo.currentEvent,null);});
  await check('timeout_chain_limit_ends_but_public_limit_rejects',()=>{const i=info(103);i.sailInfo.currentEvent.chainStep=rules.maxChainSteps;assert.equal(eventService.resolve(clone(i),{eventUid:10001,operate:0,param:0}).code,'OLD_TREK_EVENT_CHAIN_LIMIT');assert.equal(eventService.resolveExpired(i,10001).terminal,true);});
  await check('unknown_policy_never_mutates',()=>{const i=info(101);i.sailInfo.currentEvent.policyVersion='unknown';const before=clone(i);assert.equal(eventService.resolveExpired(i,10001).ok,false);assert.deepEqual(clone(i),before);});
  await check('active_event_at_destination_is_not_a_candidate',()=>{const p=player();p.other_attr_info.oldTrekInfo.sailInfo.trekData.dist=2400;p.other_attr_info.oldTrekInfo.sailInfo.currentEvent.createdAt=Date.now();assert.equal(worker.classify(p).action,null);});
  await check('offline_recovery_preserves_notifications_and_unrelated_state',async()=>{stored=player();const before=clone(stored);lateTaskChange=true;const r=await handler.handleOldTrekMaintenance('fixture');assert.equal(r.status,'fixed');assert.equal(saveCount,1);assert.equal(stored.taskInfo.count,10);assert.deepEqual(stored.other_attr_info.fashion,before.other_attr_info.fashion);assert.deepEqual(stored.other_attr_info.oldTrekInfo.sailInfo.offlineCache,before.other_attr_info.oldTrekInfo.sailInfo.offlineCache);assert.equal(stored.other_attr_info.oldTrekInfo.sailInfo.currentEvent,null);assert.equal(stored.items[331],25);assert.equal((await handler.handleOldTrekMaintenance('fixture')).status,'skipped');assert.equal(saveCount,1);});
  await check('active_session_skipped_before_db_load',async()=>{stored=player();online=true;assert.equal((await handler.handleOldTrekMaintenance('fixture')).code,'ONLINE_SESSION');assert.equal(reads,0);assert.equal(saveCount,0);});
  await check('cas_conflict_keeps_event_and_wallet_unchanged',async()=>{stored=player();const before=clone(stored);casFail=true;assert.equal((await handler.handleOldTrekMaintenance('fixture')).code,'OLD_TREK_CAS_CONFLICT');assert.deepEqual(stored,before);assert.equal(saveCount,0);});
  await check('scoped_patch_ignores_unchanged_map_order',()=>{const before=player();const after=clone(before);after.other_attr_info.oldTrekInfo.stateRevision++;const patch=snapshots.patch(before,after);const guarded=patch.conditions.map(c=>Object.keys(c)[0]);assert(!guarded.includes('items'));assert(!guarded.includes('currencies'));});
  await check('arrived_without_event_settles_once',async()=>{stored=player();const i=stored.other_attr_info.oldTrekInfo;i.sailInfo.currentEvent=null;i.sailInfo.trekData.dist=2400;assert.equal((await handler.handleOldTrekMaintenance('fixture')).status,'fixed');const after=clone(stored);assert.equal(after.other_attr_info.oldTrekInfo.sailInfo.trekData,null);assert.equal(after.other_attr_info.oldTrekInfo.totalDistance,2400);assert(after.other_attr_info.oldTrekInfo.lastEndCache);assert.equal((await handler.handleOldTrekMaintenance('fixture')).status,'skipped');assert.deepEqual(stored,after);});
  await check('season_rollover_archives_and_preserves_entitlements',async()=>{stored=player();const i=stored.other_attr_info.oldTrekInfo;i.season--;i.passRecords=[{id:1,buyRecord:1,claimRecord:{1:1}}];const oldSeason=i.season;assert.equal((await handler.handleOldTrekMaintenance('fixture')).status,'fixed');const after=stored.other_attr_info.oldTrekInfo;assert.equal(after.season,schedule.getSchedule().seasonNumber);assert.equal(after.seasonArchives[oldSeason].sailInfo.currentEvent.id,101);assert.equal(after.passRecords[0].buyRecord,1);assert.equal(stored.items[331],0);});
  await check('future_season_and_orphan_require_review',async()=>{stored=player();stored.other_attr_info.oldTrekInfo.season++;assert.equal((await handler.handleOldTrekMaintenance('fixture')).code,'OLD_TREK_FUTURE_SEASON');stored=player();stored.other_attr_info.oldTrekInfo.sailInfo.trekData=null;assert.equal((await handler.handleOldTrekMaintenance('fixture')).code,'OLD_TREK_ORPHAN_REQUIRES_REVIEW');assert.equal(saveCount,0);});
  await check('bounded_worker_pages_do_not_starve_later_players',async()=>{dbRows=Array.from({length:3},(_,n)=>({_id:n+1,userId:'row-'+n,other_attr_info:{oldTrekInfo:{season:schedule.getSchedule().seasonNumber}}}));const s=worker.createService({enabled:true,serverId:1001,batchSize:2,logger:{info(){},warn(){},error(){}}});assert.equal((await s.tick()).scanned,2);assert.equal((await s.tick()).scanned,1);assert.equal((await s.tick()).scanned,2);assert.equal(queryLimit,2);});
  await check('live_rank_matches_settlement_and_ignores_db_order',async()=>{const arena=load('src/services/OldTrekArenaService.js'),settle=load('src/services/OldTrekSettlementService.js'),season=schedule.getSchedule().seasonNumber;rosterRows=Array.from({length:120},(_,n)=>({userId:'rank-'+n,playerId:'p'+String(n).padStart(3,'0'),_id:'oid'+(120-n),oldTrekArenaScore:1500,other_attr_info:{oldTrekInfo:{season,arenaPlayed:1}}}));const actor=rosterRows[110];rosterRows.push({userId:'untouched',playerId:'p0000',oldTrekArenaScore:1000,other_attr_info:{oldTrekInfo:{season}}});const first=clone(await arena.rank(actor,true)),expected=settle.rowsFor(rosterRows,season,true);assert.equal(first.rank,111);assert.equal(first.list.length,100);assert.deepEqual(first.list.map(r=>r.playerId),Array.from(expected.slice(0,100),r=>r.playerId));rosterRows.reverse();assert.deepEqual(clone(await arena.rank(actor,true)),first);});
  const report={at:new Date().toISOString(),pass:results.every(x=>x.pass),productionWrites:0,networkCalls:0,results};
  fs.writeFileSync(path.join(base,'release_tests.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
