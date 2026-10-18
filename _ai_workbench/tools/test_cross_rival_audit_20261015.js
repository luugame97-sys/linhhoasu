'use strict';
// Regression characterization of the exact live snapshot. No network or DB imports.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert/strict');
const task = path.resolve(__dirname, '../temp/cross_rival_20261015');
const baseline = path.join(task, 'baseline');
const audit = JSON.parse(fs.readFileSync(path.join(task, 'live-audit.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
let now = Date.parse(audit.checkedAt), saves = [], scoreWrites = [], failScore = false, nullSave = false;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function load(relative, imports) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(baseline, relative), 'utf8'), {
    module, exports: module.exports, Date: Clock, process: { env: { SERVER_ID: '1001' } },
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw Error('IMPORT_DENIED:' + name); }
  }, { filename: relative });
  return module.exports;
}
const config = { get: name => audit.config[name] || (name === 'SystemConfig' ? { 324: audit.config.System324 } : {}) };
const cross = load('src/services/CrossServerEventService.js', {
  crypto, '../config/crossServerEventSchedule.json': audit.schedule, '../db/models/CrossEventEntry': {}
});
cross.upsertScore = async row => { if (failScore) throw Error('FIXTURE_SHARED_DB_UNAVAILABLE'); scoreWrites.push(clone(row)); return { accepted: true }; };
cross.top = async () => [];
const schedule = load('src/services/CrossEventScheduleService.js', { './CrossServerEventService': cross, './ConfigService': config });
const h = load('src/handlers/cross-rival.js', {
  '../services/PlayerService': { savePlayer: async (id, player, options) => { saves.push({ id, options, player: clone(player) }); return nullSave ? null : player; } },
  '../services/BattleService': { calcPlayerPower: () => ({ 1: 1000, 2: 100 }) },
  '../services/ArenaReadModelService': { displayPowerFromPlayer: () => 1000 },
  '../services/ConfigService': config,
  './raid': { addRewardToPlayer: (player, id, count) => { player.items[id] = (player.items[id] || 0) + count; } },
  './playerPayload': { buildPlayer500Data: p => ({ name: p.name, level: p.level, playerId: p.playerId, power: p.power }) },
  '../services/RoleAppearanceService': { getPrimaryBattlePetId: () => 0, applyPrimaryBattlePetParts: entity => entity },
  '../services/CurrencySync': { buildClientItemList: p => Object.entries(p.items).map(([id, count]) => ({ id: Number(id), count })) },
  '../services/MainTaskProgressService': { addCrossRivalChallengeCount: () => false },
  '../services/CrossServerEventService': cross,
  '../services/CrossEventScheduleService': schedule,
  './task': { buildActiveTaskUpdatePackets: () => [] }
});
function session(serverId = 1001) { return { userId: 'RAM_ONLY_' + serverId, serverId,
  player: { userId: 'RAM_ONLY_' + serverId, playerId: 'RAM_ONLY_' + serverId, serverId,
    name: 'RAM_ONLY', level: 100, power: 1000, roleInfo: {}, items: {}, currencies: { diamond: 1000, gold: 0, silver: 0 } } }; }
function packet(response, tag) { return (Array.isArray(response) ? response : [response]).find(row => row && row.tag === tag); }
const findings = [], controls = [];
async function check(id, fn, kind = 'confirmed_defect') {
  const details = await fn(); (kind === 'control' ? controls : findings).push({ id, details });
}
(async () => {
  await check('ALL_SERVERS_DEFAULT_TO_CAMP_1', () => {
    const rows = Array.from({ length: 8 }, (_, i) => h.ensureCrossRivalInfo(session(1001 + i).player));
    assert(rows.every(row => row.camp === 1)); return { camps: rows.map(row => row.camp) };
  });
  await check('SIX_CORES_ADVERTISED_BUT_THREE_CREATED', () => {
    const i = h.ensureCrossRivalInfo(session().player); assert.equal(i.coreInfo.length, 3); assert.equal(i.campInfoMap[1].core, 6);
    return { advertised: i.campInfoMap[1].core, actual: i.coreInfo.length };
  });
  await check('NO_DAILY_PHASE_TRANSITION', () => {
    const times = ['2026-10-15T09:00:00+07:00', '2026-10-15T12:00:00+07:00', '2026-10-15T19:58:00+07:00', '2026-10-15T20:10:00+07:00', '2026-10-15T21:00:00+07:00'];
    const rows = times.map(time => { now = Date.parse(time); return { time, stage: h.ensureCrossRivalInfo(session().player).stage }; });
    now = Date.parse(audit.checkedAt); assert(rows.every(row => row.stage === 2)); return rows;
  });
  await check('FORGED_REENTER_SKIPS_TICKET', async () => {
    const s = session(), r = packet(await h.handleCrossRivalMapEnter({ campId: 2, line: 0, reEnter: 1 }, s, 1), 6551);
    assert.equal(r.data.result, 0); assert.equal(s.player.items[310], undefined); return { result: r.data.result, ticket: 0, previousMap: -1 };
  });
  await check('INVALID_CAMP_LINE_POSITION_ACCEPTED', async () => {
    const s = session(), r = packet(await h.handleCrossRivalMapEnter({ campId: 999, line: 999, reEnter: 1, x: 1e10, y: 1e10 }, s, 2), 6551);
    assert.equal(r.data.result, 0); return { map: r.data.mapId, line: r.data.line, x: r.data.selfInfo.x };
  });
  await check('READ_MAP_MUTATES_MEMBERSHIP_WITHOUT_TICKET', async () => {
    const s = session(); await h.handleCrossRivalMapGetInfo({ campId: 2, line: 0 }, s, 3);
    assert.equal(s.player.crossRivalInfo.mapId, 2); return { map: 2, stayTime: s.player.crossRivalInfo.stayTime };
  });
  await check('INVALID_CORE_SCORES_OUTSIDE_MAP_REPEATEDLY', async () => {
    const s = session(); for (let i = 0; i < 25; i++) await h.handleCrossRivalCoreAttack({ core: 999 }, s, 100 + i);
    assert.equal(s.player.crossRivalInfo.score, 3000); assert.equal(s.player.crossRivalInfo.mapId, -1);
    return { requests: 25, score: 3000, elapsedGameTimeMs: 0, coreExists: false };
  });
  await check('DEAD_CORE_CONTINUES_AWARDING_SCORE', async () => {
    const s = session(), i = h.ensureCrossRivalInfo(s.player); i.coreInfo[0].hp = 0;
    await h.handleCrossRivalCoreAttack({ core: 1 }, s, 5); assert.equal(i.score, 120); return { hp: i.coreInfo[0].hp, score: i.score };
  });
  await check('BOX_ROB_NO_OPEN_OR_TIMER_AND_NOT_IN_SHARED_RANK', async () => {
    const s = session(), before = scoreWrites.length;
    for (let i = 0; i < 3; i++) await h.handleCrossRivalRobBox({ collectId: 101 }, s, 200 + i);
    assert.equal(s.player.crossRivalInfo.score, 150); assert.equal(scoreWrites.length, before);
    return { requests: 3, score: 150, elapsedGameTimeMs: 0, sharedScoreWrites: 0 };
  });
  await check('FAKE_TARGET_ALWAYS_WINS_OUTSIDE_MAP', async () => {
    const s = session(), r = await h.handleCrossRivalStartFight({ raidType: 63, targetId: 'NO_SUCH_TARGET' }, s, 9);
    const fight = r.find(row => row.data.fightInfo).data.fightInfo.fightResult;
    const finish = packet(await h.handleCrossRivalFinishFight({}, s, 10), 6571);
    assert.equal(fight.win, 1); assert.equal(finish.data.isWin, 1); assert.equal(s.player.crossRivalInfo.score, 120);
    return { win: 1, score: 120, map: -1, targetExists: false };
  });
  await check('RANK_CONTAINS_19_SYNTHETIC_PLAYERS', async () => {
    const r = await h.handleCrossRivalPlayerRankInfo({}, session(1008), 11);
    assert.equal(r.data.list.filter(row => row.dbid.startsWith('cr_rank_')).length, 19);
    assert(r.data.list.every(row => row.serverId === 1)); return { synthetic: 19, allServerId: 1 };
  });
  await check('DEFENCE_RANK_USES_FAKE_SCORE_MINUS_900', async () => {
    const s = session(), i = h.ensureCrossRivalInfo(s.player); i.defKill = 777;
    const r = await h.handleCrossRivalPlayerDefRankInfo({}, s, 12), me = r.data.list.find(row => row.dbid === s.player.playerId);
    assert.equal(me.defend, 0); return { actualDefKill: 777, shownDefend: 0 };
  });
  await check('SHARED_SCORE_FAILURE_IS_SWALLOWED', async () => {
    const s = session(); failScore = true;
    try { const r = packet(await h.handleCrossRivalCoreAttack({ core: 1 }, s, 13), 6580); assert.equal(r.data.result, 0); return { response: 0, score: s.player.crossRivalInfo.score }; }
    finally { failScore = false; }
  });
  await check('SAVE_NULL_STILL_REPORTS_SUCCESS', async () => {
    const s = session(); nullSave = true;
    try { const r = packet(await h.handleCrossRivalCoreAttack({ core: 1 }, s, 14), 6580); assert.equal(r.data.result, 0); return { response: 0, persistenceConfirmed: false }; }
    finally { nullSave = false; }
  });
  await check('SCORE_DOES_NOT_UPDATE_SHARED_CAMP_OR_TASK_1_4', async () => {
    const s = session(); for (let n = 0; n < 25; n++) await h.handleCrossRivalCoreAttack({ core: 1 }, s, 300 + n);
    await h.handleCrossRivalMapLeave({}, s, 400); const i = s.player.crossRivalInfo;
    assert.equal(i.score, 3000); assert.equal(i.campInfoMap[1].score, 0); assert.equal(i.taskProgress[1], undefined); assert.equal(i.taskProgress[4], undefined);
    return { score: i.score, campScore: 0, maxRunTask: 0, campTask: 0 };
  });
  await check('CAMP_TASK_NOT_CLAIMABLE_AT_REQUIRED_CAMP_SCORE', async () => {
    const s = session(), i = h.ensureCrossRivalInfo(s.player); i.campInfoMap[1].score = 5e6;
    const r = packet(await h.handleCrossRivalTaskReward({ type: 2 }, s, 401), 6566);
    assert.equal(r.data.taskIds.length, 0); return { campScore: 5e6, expectedConfiguredMilestones: 10, claimed: 0 };
  });
  await check('DEFENDER_VICTORY_NEVER_UPDATES_DEF_KILL', async () => {
    const s = session(), i = h.ensureCrossRivalInfo(s.player); i.mapId = i.camp;
    await h.handleCrossRivalStartFight({ raidType: 62, targetId: 'NO_TARGET' }, s, 402);
    await h.handleCrossRivalFinishFight({}, s, 403); assert.equal(i.defKill, 0); return { defenceVictories: 1, persistedDefKill: i.defKill };
  });
  await check('ESSENCE_START_HAS_NO_AUTOMATIC_COMPLETION', async () => {
    const s = session(); await h.handleCrossRivalEssenceOpen({}, s, 404); const i = s.player.crossRivalInfo, hp = i.flagInfo.hp;
    now += 60000; h.ensureCrossRivalInfo(s.player); assert.equal(i.flagInfo.hp, hp); assert.equal(i.essenceState.attacking, true);
    now = Date.parse(audit.checkedAt); return { waitedMs: 60000, hpBefore: hp, hpAfter: i.flagInfo.hp, stillAttacking: true };
  });
  await check('REPEATED_FLY_IGNORES_COOLDOWN', async () => {
    const s = session(); await h.handleCrossRivalFly({ x: 1, y: 1 }, s, 405);
    const r = packet(await h.handleCrossRivalFly({ x: 2, y: 2 }, s, 406), 6554); assert.equal(r.data.result, 0); return { secondResult: 0, elapsedGameTimeMs: 0 };
  });
  await check('READ_ENDPOINTS_ALWAYS_SAVE_FULL_PLAYER', async () => {
    const s = session(), before = saves.length;
    await h.handleCrossRivalEnter({}, s, 407); await h.handleCrossRivalCampInfo({}, s, 408); await h.handleCrossRivalPlayerRankInfo({}, s, 409);
    const writes = saves.slice(before); assert.equal(writes.length, 3); assert(writes.every(w => !w.options.onlyFields));
    return { readRequests: 3, fullPlayerSaveCalls: 3 };
  });
  await check('PUSH_ONLY_6560_DOES_NOT_ACK_MSG_UID', async () => {
    const r = await h.handleCrossRivalEnter({}, session(), 410); assert.equal(r.tag, 6500); assert.equal(r.msgUid, 0);
    return { requested: [6560, 410], returned: [r.tag, r.msgUid] };
  });
  await check('NORMAL_ENTRY_REQUIRES_TICKET', async () => {
    const r = await h.handleCrossRivalMapEnter({ campId: 2, reEnter: 0 }, session(), 501); assert.equal(r.data, null); return { denied: true };
  }, 'control');
  await check('TASK_SEQUENTIAL_REPLAY_DOES_NOT_DUPLICATE', async () => {
    const s = session(), i = h.ensureCrossRivalInfo(s.player); i.taskProgress[2] = 100000;
    await h.handleCrossRivalTaskReward({ type: 1 }, s, 502); const amount = s.player.items[311];
    await h.handleCrossRivalTaskReward({ type: 1 }, s, 503); assert.equal(s.player.items[311], amount); return { amount, duplicate: false };
  }, 'control');
  await check('FINISH_WITHOUT_FIGHT_DENIED', async () => {
    const r = await h.handleCrossRivalFinishFight({}, session(), 504); assert.equal(r.data.code, 'CROSS_RIVAL_FIGHT_EXPIRED'); return { code: r.data.code };
  }, 'control');
  await check('ALL_LIVE_SERVERS_LEVEL100_ELIGIBLE', () => {
    assert(audit.servers.every(s => s.allowed && s.gates.find(g => g.level === 100).open)); return { count: 8 };
  }, 'control');
  await check('SHOP_LIMITTYPE6_SURVIVES_NEW_CYCLE', () => {
    const supplement = JSON.parse(fs.readFileSync(path.join(task, 'config-supplement.json'), 'utf8'));
    const shop = Object.fromEntries(supplement.shops.map(row => [row.id, row]));
    const farm = load('src/services/FarmShopService.js', {
      './ConfigService': { get: name => name === 'ShopConfig' ? shop : {} },
      './PlayerMutationService': {}, './FeatureReceiptService': {}, './PlayerService': {}, './RuntimeBus': {},
      './GameDayService': { key: stamp => String(Math.floor((stamp + 25200000) / 86400000)) }
    });
    const before = Date.parse('2026-10-18T12:00:00+07:00'), after = Date.parse('2026-10-19T12:00:00+07:00');
    const s = session(), i = h.ensureCrossRivalInfo(s.player);
    s.player.shopInfo = { buyRecords: { 21000001: 1, 22000001: 4 },
      shopDayKey: farm.getShopDayKey(before), shopWeekKey: farm.getShopWeekKey(before) };
    s.player.rechargeInfo = { records: [{ id: 21000001, count: 1 }, { id: 22000001, count: 4 }] };
    now = after; h.ensureCrossRivalInfo(s.player); farm.resetDay(s.player, after); now = Date.parse(audit.checkedAt);
    assert.equal(s.player.shopInfo.buyRecords[21000001], 1); assert.equal(s.player.shopInfo.buyRecords[22000001], undefined);
    return { crossedCycle: i.cycleKey !== s.player.crossRivalInfo.cycleKey, seasonLimitedItemStillExhausted: true, dailyTicketReset: true };
  });
  const output = { generatedAt: new Date().toISOString(), sourceHash: audit.files['src/handlers/cross-rival.js'].sha256,
    result: 'CHARACTERIZATION_COMPLETE_NOT_FIXED', confirmedDefects: findings.length, findings, controls,
    stubSaveCalls: saves.length, stubScoreWrites: scoreWrites.length, networkAttempts: 0, productionWrites: 0, realPlayerAccounts: 0 };
  fs.writeFileSync(path.join(task, 'ram-characterization.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
