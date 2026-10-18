'use strict';
// Diagnostic only: source executed in VM with allowlisted read-only config,
// in-memory save/reward doubles. No network, Mongo, Redis, or live sessions.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true,
  exports: { info() {}, warn() {}, error() {}, debug() {} } };
const config = require(path.join(app, 'src/services/ConfigService'));
const get = name => config.get(name);
let now = Date.parse('2026-09-20T12:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
let mockSaves = 0;
const dependencies = {
  '../services/ConfigService': config,
  '../services/PlayerService': { savePlayer: async () => { mockSaves++; return null; } },
  './raid': { addRewardToPlayer(player, id, count) {
    const key = { 1: 'diamond', 2: 'silver', 6: 'gold' }[id];
    if (key) player.currencies[key] = (player.currencies[key] || 0) + count;
    else player.items[id] = (player.items[id] || 0) + count;
  } },
};
function load(rel) {
  const file = path.join(app, rel), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, Date: Clock,
    require: name => { if (!(name in dependencies)) throw Error('BLOCKED_DEPENDENCY:' + name); return dependencies[name]; }
  }, { filename: file });
  return module.exports;
}
const schedule = load('src/services/OldTrekScheduleService.js');
dependencies['../services/OldTrekScheduleService'] = schedule;
const old = load('src/handlers/old-trek.js'), bid = load('src/handlers/bid-king.js');
const client = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js'), 'utf8');
function native(name, globals = {}) {
  const start = client.indexOf('f.' + name + '=function');
  assert(start >= 0, 'missing native function ' + name);
  const end = client.indexOf('},f.', start);
  return vm.runInNewContext('(' + client.slice(start, end + 1).split('=').slice(1).join('=') + ')', globals);
}
function fresh() {
  const player = { userId: 'audit_ram', playerId: '123456', name: 'RAM ONLY', level: 100,
    currencies: { gold: 0, silver: 0, diamond: 0 }, items: {}, other_attr_info: {} };
  old.ensureOldTrekInfo(player);
  return { player, userId: player.userId };
}
const info = s => s.player.other_attr_info.oldTrekInfo;
const action = (s, tag, params = {}) => old.handleOldTrekAction(tag, params, s, 77);
const main = result => Array.isArray(result) ? result[0].data : result.data;
const results = [];
async function check(id, run) {
  now = Date.parse('2026-09-20T12:00:00Z');
  try { results.push({ id, status: 'REPRODUCED', evidence: await run() }); }
  catch (e) { results.push({ id, status: 'HARNESS_FAILED', error: e.message }); }
}
(async () => {
  await check('start_locked_destination_without_cost_or_formation', async () => {
    const s = fresh(); const r = await old.handleOldTrekInfo({ id: 2, diff: 2 }, s, 1);
    assert.equal(r.data.result, 0); assert.equal(s.player.currencies.diamond, 0);
    return { result: r.data.result, requiredCost: get('OldTrekDestinationConfig')[2][2].costs, unlockedDestinations: info(s).dest.map(x => x.id) };
  });
  await check('finish_zero_distance_grants_reward', async () => {
    const s = fresh(); await old.handleOldTrekInfo({ id: 1, diff: 1 }, s, 1);
    const before = info(s).sailInfo.trekData.dist; const r = await action(s, 7005, { uid: info(s).sailInfo.trekData.uid });
    assert.equal(main(r).result, 0); assert(s.player.items[339] > 0);
    return { distanceBeforeFinish: before, reward339: s.player.items[339], creditedDistance: info(s).totalDistance };
  });
  await check('accelerate_loses_elapsed_distance', async () => {
    const s = fresh(); s.player.items[321] = 1000; await old.handleOldTrekInfo({ id: 1, diff: 1 }, s, 1);
    now += 3 * 3600000;
    const model = { getTrekData: () => info(s).sailInfo.trekData, getSailSpeed: () => get('OldTrekBaseConfig').baseSpeed };
    const cur = native('getCurDistance', { Y: { OldTrekModel: model, Config: { OldTrekDestinationConfig: get('OldTrekDestinationConfig') } }, T: { serverTimeMilli: now }, O: Math, Eu: { SAIL_DIST_MILI: 3600000 } });
    const before = cur.call(model, true); await action(s, 7001, { multi: 1 }); const after = cur.call(model, true);
    assert(after < before); return { nativeBefore: before, nativeAfter: after, expectedBaseDistance: before + 200 };
  });
  await check('sweep_bypasses_first_clear_and_destination_gate', async () => {
    const s = fresh(); s.player.items[321] = 1000; const r = await action(s, 7009, { id: 2, diff: 1 });
    assert.equal(main(r).result, 0); assert.equal(info(s).dest.some(x => x.id === 2), false);
    return { result: main(r).result, totalDistance: info(s).totalDistance, taskRecord: info(s).taskRecord };
  });
  await check('settlement_does_not_update_native_progress', async () => {
    const s = fresh(); await old.handleOldTrekInfo({ id: 1, diff: 1 }, s, 1); now += 13 * 3600000;
    await action(s, 7005, { uid: info(s).sailInfo.trekData.uid });
    assert.equal(Object.keys(info(s).taskRecord).length, 0); assert.equal(info(s).lv, 1); assert.equal(info(s).exp, 0);
    return { totalDistance: info(s).totalDistance, nativeTaskRecord: info(s).taskRecord, lv: info(s).lv, exp: info(s).exp, firstRewardRecords: info(s).firstRewardRecords };
  });
  await check('wrong_event_uid_consumes_current_event', async () => {
    const s = fresh(); info(s).sailInfo.currentEvent = { uid: 111, id: 1, rewards: [{ id: 331, count: 50 }] };
    await action(s, 7002, { eventUid: 999, operate: 999 });
    assert.equal(s.player.items[331], 50); assert.equal(info(s).sailInfo.currentEvent, null);
    return { submittedUid: 999, currentUid: 111, granted331: 50 };
  });
  await check('event_item_update_not_persisted_to_cabin', async () => {
    const s = fresh(); info(s).sailInfo.currentEvent = { uid: 1, id: 1, itemUpdate: [{ uid: 4, id: 301401, count: 1, state: 1 }] };
    const r = await action(s, 7002, { eventUid: 1, operate: 1 });
    assert.equal(main(r).itemUpdate.length, 1); assert.equal(info(s).sailInfo.cabin.length, 0);
    return { clientItems: main(r).itemUpdate.length, savedCabinItems: info(s).sailInfo.cabin.length };
  });
  await check('tech_matured_not_committed', async () => {
    const s = fresh(); s.player.items[323] = 10; await action(s, 7010, { id: 1 }); now += 60000;
    old.ensureOldTrekInfo(s.player); assert.equal(info(s).unlockTechs.length, 0); assert.equal(info(s).unlocking.length, 1);
    return { unlockTechs: info(s).unlockTechs, expiredUnlocking: info(s).unlocking };
  });
  await check('tech_bypasses_level_and_prerequisites', async () => {
    const s = fresh(); s.player.items[323] = 10; const r = await action(s, 7010, { id: 4 });
    assert.equal(main(r).result, 0); return { playerShipLv: info(s).lv, config: get('OldTrekTechSkillConfig')[4], result: main(r).result };
  });
  await check('ad_speedup_without_proof', async () => {
    const s = fresh(); info(s).unlocking = [{ id: 4, finishTime: now + 1200000 }];
    await action(s, 7012, { id: 4, ad: 1, count: 20 });
    assert.equal(info(s).unlocking[0].finishTime, now); return { diamond: s.player.currencies.diamond, finishTime: info(s).unlocking[0].finishTime, now };
  });
  await check('consumed_recruit_restored_on_read', async () => {
    const s = fresh(); await old.handleOldTrekHireSailor({ id: 340101, hire: 0 }, s, 1);
    assert(!info(s).refreshId.includes(340101)); old.ensureOldTrekInfo(s.player); assert(info(s).refreshId.includes(340101));
    return { refreshIdAfterRead: info(s).refreshId };
  });
  await check('repeated_hire_returns_star_zero_over_existing_star', async () => {
    const s = fresh(); info(s).sailorList = [{ id: 340101, star: 5 }];
    const r = await old.handleOldTrekHireSailor({ id: 340101, hire: 0 }, s, 1);
    assert.equal(r.data.sailor.star, 0); assert.equal(info(s).sailorList[0].star, 5);
    return { persistedStar: 5, clientResponseStar: 0 };
  });
  await check('daily_free_refresh_never_reset', async () => {
    const s = fresh(); await old.handleOldTrekRefreshSailor({ free: 1 }, s, 1); now += 86400000;
    const r = await old.handleOldTrekRefreshSailor({ free: 1 }, s, 2); assert.equal(r.data.result, 1);
    return { day2Result: r.data.result, dailyFree: info(s).dailyFreeRefresh };
  });
  await check('refresh_discards_pending_reward_cache', async () => {
    const s = fresh(); info(s).rewardCache = [{ id: 331, count: 50 }]; info(s).cacheCount = 1;
    await old.handleOldTrekRefreshSailor({ free: 1 }, s, 1);
    assert.equal(info(s).rewardCache.length, 0); assert.equal(s.player.items[331] || 0, 0);
    return { remainingCache: info(s).rewardCache, granted331: s.player.items[331] || 0 };
  });
  await check('unowned_sailor_and_locked_slot_accepted', async () => {
    const s = fresh(); const r = await action(s, 7022, { set: 0, line: [0], slot: [3], id: [999999] });
    assert.equal(main(r).lineData[0].slots[3], 999999); return { owned: info(s).sailorList.length, lineData: main(r).lineData };
  });
  await check('level_301_beyond_config', async () => {
    const s = fresh(); info(s).sailorSlotList[0].level = 300; s.player.items[331] = 1e12; s.player.items[332] = 1e12;
    const r = await action(s, 7024, { slot: 0, level: 301 }); assert.equal(main(r).result, 0);
    return { slotLevel: main(r).slot.level, hasNativeLevelConfig: !!get('OldTrekSailorLevelUpConfig')[301] };
  });
  await check('growth_package_claim_marks_without_reward', async () => {
    const s = fresh(); const r = await action(s, 7035, { id: 370101 });
    assert.equal(main(r).rewardInfo.items.length, 0); assert.equal(main(r).sailorPackage.freeClaim, 1);
    return main(r);
  });
  await check('pass_uses_global_not_destination_mileage', async () => {
    const s = fresh(); info(s).totalDistance = 1000; const r = await action(s, 7044, { id: 2 });
    assert.equal(main(r).passRecord.claimRecord[2], 1);
    return { nativeDestinationMileage: info(s).taskRecord[205] || 0, globalDistance: info(s).totalDistance, claims: main(r).passRecord.claimRecord };
  });
  await check('arena_win_without_ticket_and_repeat_awards', async () => {
    const s = fresh(); await action(s, 7051, { enemy: 'nonexistent' }); await action(s, 7051, { enemy: 'nonexistent' });
    assert.equal(s.player.items[331], 200); assert.equal(s.player.oldTrekArenaScore, 1020);
    return { ticket326: s.player.items[326] || 0, score: s.player.oldTrekArenaScore, reward331: s.player.items[331] };
  });
  await check('both_rank_endpoints_self_rank_one', async () => {
    const s = fresh(); const a = main(await action(s, 7046)), b = main(await action(s, 7052));
    assert.equal(a.list.length, 1); assert.equal(b.list.length, 1); assert.equal(a.rank, 1); assert.equal(b.rank, 1);
    return { sail: a, arena: b };
  });
  await check('sail_profile_type2_uses_arena_score', async () => {
    const s = fresh(); info(s).totalDistance = 2400; s.player.oldTrekArenaScore = 1110;
    const r = main(await action(s, 7049, { dbid: 'another-player', arena: 2 })); assert.equal(r.score, 1110);
    return { nativeSailType: 2, returnedScore: r.score, returnedProfile: r };
  });
  await check('unknown_replay_fabricates_victory', async () => {
    const r = main(await action(fresh(), 7062, { recordId: 'absent' })); assert.equal(r.result, 0); assert.equal(r.battleResult.win, 1);
    return { result: r.result, win: r.battleResult.win };
  });
  await check('pray_resets_utc_not_gmt7', async () => {
    now = Date.parse('2026-09-20T16:59:00Z'); const s = fresh(); await action(s, 7064);
    now = Date.parse('2026-09-20T17:01:00Z'); const r = main(await action(s, 7064)); assert.equal(r.result, 1);
    return { resultAfterVietnamMidnight: r.result, serverPrayDate: info(s).prayDate };
  });
  await check('rollover_erases_entitlement_and_cabin_without_settlement', async () => {
    const s = fresh(); info(s).passRecords = [{ id: 1, buyRecord: 7, claimRecord: {} }];
    info(s).sailInfo.cabin = [{ uid: 1, id: 301401, count: 1 }]; info(s).firstRewardRecords = { '1:1': 1 };
    schedule.rolloverPlayerSeason(s.player, schedule.getSchedule(now + 7 * 86400000));
    assert.equal(info(s).passRecords.length, 0); assert.equal(info(s).sailInfo.cabin.length, 0); assert.equal(info(s).firstRewardRecords['1:1'], 1);
    return { passRecords: info(s).passRecords, cabin: info(s).sailInfo.cabin, staleFirstRewards: info(s).firstRewardRecords };
  });
  await check('bidking_finish_without_room_repeated', async () => {
    const s = fresh(); await bid.handleFinish({}, s, 1); await bid.handleFinish({}, s, 2);
    const b = s.player.other_attr_info.bidKingInfo; assert.equal(b.treasureInfos.length, 6);
    return { roomsStarted: 0, grantedTreasures: b.treasureInfos.length };
  });
  await check('bidking_temp_claim_duplicates_won_uids', async () => {
    const s = fresh(); await bid.handleFinish({}, s, 1); await bid.handleTreasureClaimTemp({}, s, 2);
    const rows = s.player.other_attr_info.bidKingInfo.treasureInfos;
    assert.equal(rows.length, 6); assert.equal(new Set(rows.map(x => x.uid)).size, 3);
    return { rows: rows.length, uniqueUids: new Set(rows.map(x => x.uid)).size };
  });
  await check('bidking_sell_unowned_uids_rewards', async () => {
    const s = fresh(); await bid.handleSaleTreasure({ uid: [987654321, 987654321] }, s, 1); assert.equal(s.player.items[339], 20);
    return { ownedTreasures: 0, rewarded339: s.player.items[339] };
  });
  await check('bidking_offsale_converts_asking_price_to_money', async () => {
    const s = fresh(); await bid.handleFinish({}, s, 1); const b = s.player.other_attr_info.bidKingInfo;
    await bid.handleOnSale({ uid: b.treasureInfos[0].uid, price: 123456 }, s, 2);
    await bid.handleOffSale({ eUid: b.selfOnSaleList[0].eUid }, s, 3); assert.equal(s.player.items[339], 123456);
    return { noBuyer: true, rewarded339: s.player.items[339], remainingTreasures: b.treasureInfos.length };
  });
  const files = ['src/handlers/old-trek.js', 'src/services/OldTrekScheduleService.js', 'src/handlers/bid-king.js'];
  const report = { at: new Date().toISOString(), mode: 'isolated RAM diagnostic; not production gameplay',
    productionPlayerWrites: 0, networkAttempts: 0, mockSaves, configSource: 'local ConfigService binary loader',
    hashes: Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(app, f))).digest('hex')])),
    reproduced: results.filter(x => x.status === 'REPRODUCED').length, harnessFailed: results.filter(x => x.status !== 'REPRODUCED').length, results };
  const output = path.join(root, '_ai_workbench/temp/oldtrek_contract_audit_20260920.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.harnessFailed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
