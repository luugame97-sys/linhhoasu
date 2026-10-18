'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
// Isolated fixtures against this checkout. No network, production DB or player writes.
const C = path.resolve(__dirname, '..');
const WEB = path.resolve(C, '../../webgame/game');
const configs = require('../src/services/ConfigService').loadAllTables();
const config = { get: name => configs[name] || {} };
const clone = x => JSON.parse(JSON.stringify(x));
const quiet = { info(){}, warn(){}, error(){} };
function load(rel, mocks = {}, extras = {}) {
  const m = { exports: {} };
  const context = { module: m, exports: m.exports, console, Buffer, process, setTimeout, clearTimeout, __dirname: path.dirname(path.join(C, rel)),
    require: name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('node:') || ['crypto','fs','path','util'].includes(name)) return require(name);
      throw Error('UNMOCKED:' + name);
    }, ...extras };
  vm.runInNewContext(fs.readFileSync(path.join(C, rel), 'utf8'), context, { filename: rel });
  return m.exports;
}
const day = load('src/services/GameDayService.js');
const reset = load('src/services/TowerDailyResetService.js', { './GameDayService': day });
const receipts = load('src/services/FeatureReceiptService.js');
const mutation = load('src/services/PlayerMutationService.js');
let db, saves, invalidations, mode, ranks, lastOptions, original;
const reward = (p, rows) => {
  p.items ||= {}; p.currencies ||= {};
  for (const row of rows) { p.items[row.id] = (p.items[row.id] || 0) + row.count; if (row.id === 2) p.currencies.silver = p.items[2]; if (row.id === 6) p.currencies.gold = p.items[6]; }
  return { rewardInfo: { items: clone(rows), equips: [], gems: [] }, syncRewards: clone(rows) };
};
const progress = load('src/services/TowerProgressService.js', {
  '../handlers/raid': { grantRewardInfo: reward }, './RewardSync': { buildRewardItemSync: (p, rows) => ({ result: 0, items: rows, changed: rows.map(r => ({ id: r.id, count: p.items[r.id] })) }) },
});
const players = {
  drainPendingSaves: async () => {}, loadTowerPlayer: async () => clone(db),
  savePlayer: async (_id, p, options) => {
    saves++; lastOptions = options;
    for (const field of options.towerCAS.fields) assert.equal(JSON.stringify(options.towerCAS.expected[field]), JSON.stringify(db[field]), 'CAS preimage ' + field);
    if (mode === 'null') return null;
    if (mode === 'throw') throw Error('fixture write failed');
    db = clone(p);
    if (mode === 'unknown') throw Error('fixture ACK lost after commit');
    return p;
  },
};
const svc = progress.create({ config, players, mutation, reset, receipts, rank: { updateScore: async (...args) => { if (mode === 'rank-fail') throw Error('redis offline'); ranks.push(args); } }, invalidate: () => invalidations++, logger: quiet });
const tower = load('src/handlers/tower.js', {
  '../services/ConfigService': config, '../services/BattleService': {}, '../services/PlayerService': { savePlayer: () => { throw Error('UNCONFIRMED_SAVE'); } },
  '../services/RankService': {}, '../services/ArenaReadModelService': {}, './raid': {},
  '../services/TowerProgressService': { ...progress, get: () => svc }, '../services/TowerDailyResetService': reset,
});
let serial = 0;
const params = () => ({ requestId: Date.now() + '-tower_fixture_' + (++serial) });
function init(layer = 0, max = 800) {
  db = { userId: 'fixture', playerId: 'fixture', level: 1, swordInfo: { curlayer: layer, maxlayer: max, towerDay: day.key(), skills: [], skillCount: 0, slotlist: [], data: [{ uid: 77 }], equippedUid: 77, swordBond: [3] }, items: { 60: 5, 2: 7 }, currencies: { silver: 7 }, other_attr_info: {}, taskInfo: {} };
  saves = 0; invalidations = 0; ranks = []; mode = ''; original = clone(db); return { userId: 'fixture', player: clone(db) };
}
const reply = x => (Array.isArray(x) ? x : [x]).find(p => p.msgUid === 1)?.data;
const checks = [];
async function test(name, fn) { await fn(); checks.push(name); }
(async () => {
  await test('native sweep cap 800=>770, 799=>770, 500=>480', () => {
    assert.equal(progress.sweepTarget(800, config), 770); assert.equal(progress.sweepTarget(799, config), 770); assert.equal(progress.sweepTarget(500, config), 480);
    assert.equal(progress.sweepTarget(9999, config), 770); assert.equal(progress.sweepTarget(5, config), 0);
  });
  await test('reset keeps sword data, high-water and resets only daily state', () => {
    const s = init(799); s.player.swordInfo.towerDay = 1; reset.prepare(s.player);
    assert.equal(s.player.swordInfo.curlayer, 0); assert.equal(s.player.swordInfo.maxlayer, 800);
    for (const k of ['data','equippedUid','swordBond']) assert.equal(JSON.stringify(s.player.swordInfo[k]), JSON.stringify(original.swordInfo[k]));
  });
  await test('770-floor batch exact rewards, no first rewards, one confirmed save', async () => {
    const s = init(), p = params(); const data = reply(await svc.sweep(p, s, 1));
    assert.equal(data.result, 0); assert.equal(data.sweepCount, 770); assert.equal(saves, 1);
    const expected = clone(original.items);
    for (let f = 1; f <= 770; f++) for (const r of [...configs.TowerConfig[f].rewards, ...(configs.TowerRewardConfig[f]?.rewards || [])]) expected[r.id] = (expected[r.id] || 0) + r.count;
    assert.deepEqual(db.items, expected); assert.equal(db.swordInfo.maxlayer, 800); assert.deepEqual(db.swordInfo.data, original.swordInfo.data);
    assert.equal(ranks.at(-1)[2], 800); assert.equal(db.swordInfo.score, 770 * 771 * 5);
    const before = clone(db); assert.equal(reply(await svc.sweep(p, s, 1)).replay, true); assert.deepEqual(db, before); assert.equal(saves, 1);
    assert.equal(reply(await svc.sweep(params(), s, 1)).sweepCount, 0); assert.deepEqual(db.items, before.items);
  });
  await test('concurrent duplicate request commits once', async () => {
    const s = init(), p = params(); const out = await Promise.all([svc.sweep(p,s,1),svc.sweep(p,s,1)]);
    assert.equal(saves,1); assert.equal(reply(out[1]).replay,true);
  });
  await test('pending skills block batch without consuming rewards', async () => {
    const s = init(); db.swordInfo.skills = [1]; db.swordInfo.skillCount = 1;
    assert.equal(reply(await svc.sweep(params(), s, 1)).result, -1); assert.equal(saves, 0);
  });
  for (const failure of ['null','throw','unknown']) await test('save failure ' + failure + ' never ACKs success or mutates session', async () => {
    const s = init(), p = params(), retained = s.player; mode = failure;
    assert.equal(reply(await svc.sweep(p,s,1)).result,-1); assert.equal(s.player,null); assert.equal(invalidations,1); assert.deepEqual(retained,original);
    if (failure === 'unknown') { mode=''; const after=clone(db); const retry={userId:'fixture',player:clone(db)}; assert.equal(reply(await svc.sweep(p,retry,1)).replay,true); assert.deepEqual(db,after); }
  });
  await test('rank outage cannot replay committed rewards', async () => {
    const s=init(),p=params();mode='rank-fail';assert.equal(reply(await svc.sweep(p,s,1)).result,0);assert.equal(reply(await svc.sweep(p,s,1)).replay,true);assert.equal(saves,1);
  });
  await test('slot 4 rejected below31, accepted at31; malformed and duplicate rejected', async () => {
    let s=init(1); db.swordInfo.slotlist=[1,5,9].map(id=>({id,lv:1}));db.swordInfo.skills=[13];db.swordInfo.skillCount=1;
    assert.equal(reply(await tower.handleTowerSelectSkill({select:0,replace:3},s,1)).result,-1);assert.equal(saves,0);
    db.swordInfo.curlayer=30;assert.equal(reply(await tower.handleTowerSelectSkill({select:0,replace:3},s,1)).result,0);assert.equal(db.swordInfo.slotlist.length,4);
    db.swordInfo.skills=[1];db.swordInfo.skillCount=1;assert.equal(reply(await tower.handleTowerSelectSkill({select:0,replace:1},s,1)).result,-1);
    assert.equal(reply(await tower.handleTowerSelectSkill({select:0,replace:99},s,1)).result,-1);
  });
  await test('same skill upgrade is reachable and preserves other sword fields', async () => {
    const s=init(1);db.swordInfo.slotlist=[{id:1,lv:2}];db.swordInfo.skills=[1];db.swordInfo.skillCount=1;
    assert.equal(reply(await tower.handleTowerSelectSkill({select:0,replace:0},s,1)).result,0);assert.equal(db.swordInfo.slotlist[0].lv,3);
    assert.deepEqual(db.swordInfo.data,original.swordInfo.data);assert.equal(tower.normalizeTowerOptionalSkills([1],[{id:1,lv:1}]).length,1);
  });
  await test('choice count stays8; server offers configured skills only', () => {
    const rows=tower.buildTowerSkillChoices(1);assert.equal(rows.length,8);assert.equal(new Set(rows).size,8);rows.forEach(id=>assert(configs.TowerAttrConfig[id]));
  });
  await test('rollover receipt replay does not regrant yesterday reward', async () => {
    const s=init(),p=params();await svc.sweep(p,s,1);db.swordInfo.towerDay=1;const before=clone(db.items);const d=reply(await svc.sweep(p,s,1));assert.equal(d.replay,true);assert.equal(d.updateInfo.curlayer,0);assert.deepEqual(db.items,before);
  });
  await test('tower attributes affect battle, scale with skill level, exclude locked slots and other modes', () => {
    const battle = load('src/services/BattleService.js', { './ConfigService': config, '../config/infiniteMainline': {}, './CustomCombatService': {}, './TowerProgressService': progress, './HomelandSkinUnlockService': { bonusBps: () => 0 } });
    const p=init(1).player;
    const base=clone(battle.calcPlayerPower(p));
    p.swordInfo.slotlist=[{id:1,lv:2}]; // 51=HP percentage:100*2 basis points
    const towerAttrs=battle.calcPlayerPower(p,{tower:true});
    assert.equal(towerAttrs[1],base[1]+Math.floor(base[1]*200/10000));
    assert.deepEqual(clone(battle.calcPlayerPower(p)),base);
    p.swordInfo.slotlist=[{id:1,lv:2},{id:5,lv:1},{id:9,lv:1},{id:13,lv:100}];
    const locked=battle.calcPlayerPower(p,{tower:true});assert.equal(locked[4],base[4]);
    p.swordInfo.curlayer=30;assert(battle.calcPlayerPower(p,{tower:true})[4]>base[4]);
  });
  await test('active fight handler grants milestone only on win and rejects stale floor', async () => {
    const source=fs.readFileSync(path.join(C,'src/handlers/raid.js'),'utf8');
    const fn=source.slice(source.indexOf('async function handleTowerStartFightUnlocked'),source.indexOf('// ========== reward helpers'));
    let win=true, attrsOptions;
    const handler=vm.runInNewContext('('+fn.trim()+')',{require:n=>n==='./tower'?tower:n==='../services/TowerProgressService'?progress:(()=>{throw Error(n)})(),config,
      toSafeInt:(x,f=0)=>Number.isFinite(Number(x))?Math.floor(Number(x)):f,
      battle:{calcPlayerPower:(p,o)=>{attrsOptions=o;return{};},getMonsterAttrs:()=>({}),simulateBattle:()=>({win})},
      buildPveProgressFightResult:(_a,_b,r)=>r,buildChapterFightResult:(_p,_l,_a,_b,r)=>r,grantRewardInfo:reward,
      addTempleChallengeCount:()=>false,buildRewardItemSync:()=>({}),buildTaskSyncPackets:()=>[],playerService:{savePlayer:()=>{throw Error('direct save');}} });
    let s=init(9,9);let r=reply(await svc.run(2300,{levelId:10},s,1,handler));assert.equal(r.result,0);assert.equal(db.swordInfo.maxlayer,10);assert.equal(attrsOptions.tower,true);
    const gold=configs.TowerRewardConfig[10].rewards.find(x=>x.id===6).count;assert.equal(db.items[6],gold);assert.equal(ranks.at(-1)[2],10);
    const before=clone(db.items);assert.equal(reply(await svc.run(2300,{levelId:10},s,1,handler)).result,-1);assert.deepEqual(db.items,before);
    {
      const beforePlayer=clone(db),beforeSaves=saves,beforeRanks=ranks.length;
      const blocked=reply(await svc.run(2300,{levelId:11},s,1,handler));
      assert.equal(blocked.code,'TOWER_SKILL_PENDING');assert.equal(saves,beforeSaves);assert.equal(ranks.length,beforeRanks);
      assert.deepEqual(db,beforePlayer);assert.deepEqual(clone(blocked.updateInfo.skills),db.swordInfo.skills);
    }
    s=init(9,9);win=false;await svc.run(2300,{levelId:10},s,1,handler);assert.equal(db.swordInfo.curlayer,9);assert.deepEqual(db.items,original.items);
  });
  await test('client double-click, retry ID, delayed response, role-switch and error callback', () => {
    const sent=[],timers=[],tips=[],applied=[];
    const model={onFighting:()=>{throw Error('single fight used for sweep');},Rpc:(tag,data,ok,error)=>sent.push({tag,data,ok,error})};
    const root={W:{ClimbingTowerModel:model,ActorModel:{actorID:'A'}},UserInfo:{ServerID:1,UserID:1},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},UserTips:{ins:()=>({showTips:t=>tips.push(t)})},LhsTowerDaily:{apply:r=>applied.push(r),refresh(){}}};
    vm.runInNewContext(fs.readFileSync(path.join(WEB,'js/lhs-tower-fix-v2.js'),'utf8'),{window:root});
    model.onFighting(3);model.onFighting(3);assert.equal(sent.length,1);assert.equal(sent[0].tag,3705);
    sent[0].error();model.onFighting(3);assert.equal(sent[1].data.requestId,sent[0].data.requestId);
    sent[1].ok({result:0,sweepCount:770,updateInfo:{curlayer:770}});assert.equal(applied.length,1);
    sent[0].ok({result:0,sweepCount:770,updateInfo:{curlayer:770}});assert.equal(applied.length,1);
    model.onFighting(3);root.W.ActorModel.actorID='B';sent[2].ok({result:0,updateInfo:{curlayer:770}});assert.equal(applied.length,1);
    let success=false;model.Rpc(3700,{},()=>{success=true;});sent[3].ok({result:-1,msg:'locked'});assert.equal(success,false);
  });
  console.log(JSON.stringify({status:'PASS',checks:checks.length,productionWrites:0,kind:'isolated source fixtures, mock persistence'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
