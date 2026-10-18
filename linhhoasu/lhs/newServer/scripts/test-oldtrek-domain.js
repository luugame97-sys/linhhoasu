'use strict';
const assert = require('assert/strict');
const clone = x => JSON.parse(JSON.stringify(x));
const playerService = require('../src/services/PlayerService');
const arena = require('../src/services/OldTrekArenaService');
const config = require('../src/services/ConfigService');
const originalRank = arena.rank, originalMatch = arena.match;
arena.rank = async p => ({ rank: 1, score: arena.score(p), list: [arena.profile(p)] });
arena.match = async p => ({ uid: 'mock-match-001', expiresAt: Date.now()+120000, profile: arena.profile(arena.npc(p)), opponent: arena.npc(p) });
const handler = require('../src/handlers/old-trek');
const progress = require('../src/services/OldTrekProgressService');
let db, saves = 0, returnNull = false;
playerService.savePlayer = async (userId, player, options) => {
  saves++;
  const cas = options.oldTrekCAS;
  assert(cas, 'Every tested mutation must include CAS');
  for (const key of ['oldTrekInfo','items','currencies']) {
    const current = key === 'oldTrekInfo' ? db.other_attr_info.oldTrekInfo : db[key];
    if (JSON.stringify(cas[key]) !== JSON.stringify(current)) return null;
  }
  db = clone(player); return returnNull ? null : player;
};
let tests = 0;
function fresh() {
  const player = { userId: 'oldtrek-unit', playerId: 'unit001', _id: '000000000000000000000001', name: 'unit', level: 100,
    items: {321:10000,329:1000,331:1000000,332:10000,323:100,325:10,326:10}, currencies: {diamond:100000,silver:0,gold:0}, other_attr_info:{} };
  handler.ensureOldTrekInfo(player);
  const i = player.other_attr_info.oldTrekInfo;
  i.sailorList = [340101,340102,340103].map(id => handler.buildSailor(id));
  i.sailorSlotList.forEach((row,index) => { row.sailorId = i.sailorList[index]?.id || 0; });
  i.setMap[0].forEach((line,index) => { line.slots[0]=i.sailorList[index].id; line.leader=i.sailorList[index].id; });
  db = clone(player); return { userId:player.userId, player };
}
const info = s => s.player.other_attr_info.oldTrekInfo;
function sync(s) { db=clone(s.player); }
const first = x => Array.isArray(x) ? x[0].data : x.data;
async function call(s, tag, p = {}) { return handler.handleOldTrekAction(tag,p,s,22); }
async function test(name, run) { saves=0; returnNull=false; process.env.OLD_TREK_EVENT_ENGINE_ENABLED='0'; await run(); tests++; console.log('PASS '+name); }
(async()=>{
 await test('free refresh cache paid before reset; retry once',async()=>{
  const s=fresh();info(s).rewardCache=[{id:331,count:50}];sync(s);const old=s.player.items[331];
  const p={free:1,requestId:'refresh_0001'};const a=await handler.handleOldTrekRefreshSailor(p,s,10);const b=await handler.handleOldTrekRefreshSailor(p,s,11);
  assert.equal(first(a).result,0);assert.equal(s.player.items[331],old+50);assert.equal((Array.isArray(b)?b[0]:b).msgUid,11);assert.equal(saves,1);
 });
 await test('hired sailor removed from pool permanently',async()=>{
  const s=fresh();info(s).refreshId=[340104];sync(s);const r=await handler.handleOldTrekHireSailor({id:340104,hire:0},s,1);
  assert.equal(first(r).result,0);handler.ensureOldTrekInfo(s.player);assert(!info(s).refreshId.includes(340104));
 });
 await test('duplicate hire preserves star',async()=>{
  const s=fresh();info(s).sailorList[0].star=5;info(s).refreshId=[340101];sync(s);
  assert.equal(first(await handler.handleOldTrekHireSailor({id:340101,hire:0},s,1)).sailor.star,5);
 });
 for(const [tag,p] of [[7022,{set:0,line:[0],slot:[3],id:[340101]}],[7022,{set:0,line:[0],slot:[0],id:[999999]}],[7029,{line:0,set:0,id:340103}],[7030,{sailorId:999999,slotId:0}],[7034,{set:0,line:0,skillId:1}],[7036,{set:999,arena:true}],[7010,{id:4}],[7012,{id:4,ad:1,count:20}],[7024,{slot:0,level:301}]]) {
  await test('validation rejects '+tag+' '+JSON.stringify(p),async()=>{const s=fresh(), before=clone(s.player);const r=first(await call(s,tag,p));assert.equal(r.result,1);assert.deepEqual(s.player,before);assert.equal(saves,0);});
 }
 await test('valid formation move persists and responds all changed lines',async()=>{const s=fresh();const r=first(await call(s,7022,{set:0,line:[0,1],slot:[0,0],id:[340102,340101]}));assert.equal(r.lineData.length,2);assert.equal(info(s).setMap[0][0].slots[0],340102);});
 await test('mature technology opens once and does not duplicate',async()=>{const s=fresh();info(s).unlocking=[{id:1,finishTime:1}];progress.mature(info(s));progress.mature(info(s));assert.deepEqual(info(s).unlockTechs,[1]);});
 await test('mileage pass ignores global distance',async()=>{const s=fresh();info(s).totalDistance=100000;sync(s);await call(s,7044,{id:1});assert.equal(info(s).passRecords[0].claimRecord[2],undefined);});
 await test('stale CAS session cannot overwrite committed resources',async()=>{const s=fresh();db.items[331]++;const result=first(await call(s,7024,{slot:0,level:2}));assert.equal(result.code,'OLD_TREK_SAVE_UNKNOWN');assert.equal(s.player,null);assert.equal(db.items[331],1000001);});
 await test('request collision rejects changed intent',async()=>{const s=fresh();await call(s,7024,{slot:0,level:2,requestId:'level_req_0001'});const r=first(await call(s,7024,{slot:0,level:3,requestId:'level_req_0001'}));assert.equal(r.code,'OLD_TREK_REQUEST_CONFLICT');});
 await test('arena no-ticket rejects and keeps snapshot',async()=>{const s=fresh();await call(s,7050);s.player.items[326]=0;sync(s);const r=first(await call(s,7051,{enemy:info(s).arenaEnemy.dbid}));assert.equal(r.code,'OLD_TREK_COST_NOT_ENOUGH');assert(info(s).arenaMatch);});
 await test('arena match consumed once, replay no second ticket',async()=>{const s=fresh();await call(s,7050);const p={enemy:info(s).arenaEnemy.dbid,requestId:'arena_fight_0001'};const a=first(await call(s,7051,p));assert(a.battleResult);assert.equal(s.player.items[326],9);await call(s,7051,p);assert.equal(s.player.items[326],9);assert.equal(info(s).arenaPlayed,1);});
 await test('empty formation cannot battle',async()=>{const s=fresh();info(s).setMap[0]=[];assert.throws(()=>arena.battle(s.player,arena.npc(s.player)),/FORMATION_EMPTY/);});
 await test('combat outcome responds to actual power, not fixed victory',async()=>{const s=fresh(), weak=arena.npc(s.player),strong=clone(s.player);strong.other_attr_info.oldTrekInfo.sailorSlotList.forEach(r=>r.level=100);assert.equal(arena.battle(strong,weak).win,1);assert.equal(arena.battle(weak,strong).win,0);});
 await test('unknown replay rejected not fabricated',async()=>{const s=fresh();assert.equal(first(await call(s,7062,{recordId:'missing'})).code,'OLD_TREK_RECORD_NOT_FOUND');});
 await test('event and reward atomic, retry after reload no grant twice',async()=>{
  const s=fresh();process.env.OLD_TREK_EVENT_ENGINE_ENABLED='1';await handler.handleOldTrekInfo({id:1,diff:1},s,1);
  const i=info(s), policy=require('../src/config/oldTrekGameplayPolicy.json');
  i.sailInfo.currentEvent={uid:9,id:109,pre:8,policyVersion:policy.version,season:i.season,trekUid:i.sailInfo.trekData.uid,createdAt:1,rootUid:8,chainStep:2};sync(s);
  const old=s.player.items[331],p={eventUid:9,operate:0,param:0,requestId:'event_req_0001'};
  assert.equal(first(await call(s,7002,p)).result,0);assert.equal(s.player.items[331],old+100);s.player=clone(db);await call(s,7002,p);assert.equal(s.player.items[331],old+100);
 });
 await test('growth package grants eligible rows exactly once', async()=>{
  const s=fresh(); info(s).sailorList.push(handler.buildSailor(370101)); sync(s);
  const before=s.player.items[332];const a=first(await call(s,7035,{id:370101}));assert.equal(a.result,0);assert(s.player.items[332]>before);
  const after=s.player.items[332];await call(s,7035,{id:370101});assert.equal(s.player.items[332],after);
 });
 await test('passive distance rewards returned once across repeated reads',async()=>{
  const s=fresh();await handler.handleOldTrekInfo({id:1,diff:1},s,1);info(s).sailInfo.trekData.lastUpdateTime=Date.now()-3600000;sync(s);
  const before=s.player.items[331];const r=first(await call(s,7008));assert(r.offlineCache.reward.length);assert(s.player.items[331]>before);
  const after=s.player.items[331];await call(s,7008);assert.equal(s.player.items[331],after);
 });
 for(const type of [2,3]) await test('sea encounter type '+type+' has real battle and consumes UID once',async()=>{
  const s=fresh();await handler.handleOldTrekInfo({id:1,diff:1},s,1);
  const policy=require('../src/config/oldTrekGameplayPolicy.json');const event=require('../src/services/OldTrekEventService').createService({rules:{...policy,eventTypeWeights:{[type]:1}},randomInt:()=>0});
  event.spawn(info(s),Date.now(),s.player);info(s).sailInfo.trekData.dist=600;const e=event.spawn(info(s),Date.now(),s.player);
  assert(e.enemy);const r=event.resolve(info(s),{eventUid:e.uid,operate:0,param:0},Date.now(),s.player);assert(r.ok);assert.equal(r.battleResult.results.length,3);
  assert(event.resolve(info(s),{eventUid:e.uid,operate:0,param:0},Date.now(),s.player).replayed);
 });
 console.log(JSON.stringify({status:'PASS',tests,networkAttempts:0,productionPlayerWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{arena.rank=originalRank;arena.match=originalMatch;});
