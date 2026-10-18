'use strict';
// RAM-only fault injection, fixed clock; no database or socket modules loaded.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const now = Date.parse('2026-09-21T00:00:00+07:00');
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
const loadTable = name => JSON.parse(fs.readFileSync(path.join(app, 'scripts/_tables_dump', name + '.json'))).data;
const tables = Object.fromEntries(['OldTrekBaseConfig', 'OldTrekDestinationConfig', 'OldTrekPassShowConfig', 'OldTrekStableConfig', 'OldTrekSailorConfig'].map(n => [n, loadTable(n)]));
let saved = null, saves = 0, fail = false;
const schedule = { seasonNumber: 1, stage: 2, isDepartAllowed: true, seasonEnd: now + 6 * 86400000, matchId: 2, totalSeason: 2 };
const lock = require(path.join(app, 'src/services/PlayerMutationService'));
const ledger = require(path.join(app, 'src/services/OldTrekLedgerService'));
const deps = {
  '../services/ConfigService': { get: name => tables[name] || {} },
  '../services/OldTrekScheduleService': { getSchedule: () => schedule },
  '../services/PlayerMutationService': lock,
  '../services/OldTrekLedgerService': ledger,
  '../services/OldTrekEventService': {}, // feature flag absent in this legacy contract suite
  '../services/OldTrekArenaService': {},
  '../services/CurrencySync': require(path.join(app, 'src/services/CurrencySync')),
  '../services/OldTrekProgressService': require(path.join(app, 'src/services/OldTrekProgressService')),
  'node:crypto': require('node:crypto'),
  '../services/PlayerService': { savePlayer: async (_id, p) => { saves++; saved = JSON.parse(JSON.stringify(p)); if (fail) throw Error('ambiguous commit'); return p; } },
  './raid': { addRewardToPlayer: (p, id, count) => { p.items[id] = (p.items[id] || 0) + count; } },
};
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(app, 'src/handlers/old-trek.js'), 'utf8'), { Date: Clock, process: { env: {} }, module: mod, exports: mod.exports,
  require: name => { if (!(name in deps)) throw Error('Unexpected dependency ' + name); return deps[name]; } });
const h = mod.exports;
const fresh = () => { const player = { userId: 'ram-only', playerId: '1', name: 'ram', level: 100, items: { 321: 1000 }, currencies: { diamond: 1000 }, other_attr_info: {} }; h.ensureOldTrekInfo(player); return { userId: player.userId, player }; };
const info = s => s.player.other_attr_info.oldTrekInfo;
const response = v => (Array.isArray(v) ? v[0] : v).data;
const start = s => h.handleOldTrekInfo({ id: 1, diff: 1 }, s, 1);
const action = (s, tag, p = {}) => h.handleOldTrekAction(tag, p, s, 2);
const results = [];
async function test(name, run) { fail = false; schedule.isDepartAllowed = true; saves = 0; await run(); results.push(name); }
(async () => {
  await test('native score key exact, no cross-difficulty fallback', async () => {
    const s = fresh(); info(s).taskRecord[4] = 999999; info(s).taskRecord[10105] = 999999;
    assert.equal(response(await h.handleOldTrekInfo({ id: 1, diff: 2 }, s, 1)).result, 1);
    info(s).taskRecord[10104] = 50000;
    assert.equal(response(await h.handleOldTrekInfo({ id: 1, diff: 2 }, s, 1)).result, 0);
    assert.equal(s.player.currencies.diamond, 950);
  });
  await test('paid pass adds native speed 20', async () => {
    const s = fresh(); info(s).passRecords = [{ id: 1, buyRecord: 5, claimRecord: {} }]; await start(s);
    info(s).sailInfo.trekData.lastUpdateTime = now - 3 * 3600000;
    assert.equal(response(await action(s, 7001, { multi: 1 })).updateData.dist, 860);
  });
  await test('clock rollback does not recredit elapsed', async () => {
    const s = fresh(); await start(s); info(s).sailInfo.trekData.lastUpdateTime = now + 10000;
    // Reject mutation while pending, preserving future checkpoint exactly.
    info(s).sailInfo.currentEvent = { uid: 9, id: 101 };
    const before = JSON.stringify(s.player); await action(s, 7001, { multi: 1 }); assert.equal(JSON.stringify(s.player), before);
  });
  await test('stable debuff affects boost not passive speed', async () => {
    const s = fresh(); await start(s); info(s).sailInfo.trekData.stable = 60;
    assert.equal(response(await action(s, 7001, { multi: 1 })).updateData.dist, 160);
  });
  await test('repair preserves elapsed distance', async () => {
    const s = fresh(); await start(s); info(s).sailInfo.trekData.lastUpdateTime = now - 3600000;
    info(s).sailInfo.trekData.stable = 50;
    assert.equal(response(await action(s, 7004)).updateData.dist, 200);
    assert.equal(s.player.currencies.diamond, 980);
  });
  await test('multi beyond entitlement rejects unchanged', async () => {
    const s = fresh(); await start(s); const before = JSON.stringify(s.player); const n = saves;
    assert.equal(response(await action(s, 7001, { multi: 100 })).code, 'OLD_TREK_MULTI_INVALID');
    assert.equal(JSON.stringify(s.player), before); assert.equal(saves, n);
  });
  await test('pending event blocks finish and keeps reward', async () => {
    const s = fresh(); await start(s); const t = info(s).sailInfo.trekData; t.dist = 2400;
    info(s).sailInfo.currentEvent = { uid: 8, id: 101 };
    assert.equal(response(await action(s, 7005, { uid: t.uid })).code, 'OLD_TREK_EVENT_PENDING'); assert.equal(s.player.items[339], undefined);
  });
  await test('missing UID cannot settle', async () => {
    const s = fresh(); await start(s); info(s).sailInfo.trekData.dist = 2400;
    assert.equal(response(await action(s, 7005)).code, 'OLD_TREK_TREK_UID_INVALID');
  });
  await test('settlement retry survives relog and does not grant twice', async () => {
    const s = fresh(); await start(s); const t = info(s).sailInfo.trekData; t.dist = 2400;
    assert.equal(response(await action(s, 7005, { uid: t.uid })).result, 0);
    const balance = s.player.items[339]; s.player = JSON.parse(JSON.stringify(saved));
    const retry = await action(s, 7005, { uid: t.uid }); assert.equal(response(retry).replayed, true);
    assert.equal(s.player.items[339], balance); assert.equal(retry[1].tag, 7010);
    assert.equal(info(s).rewardLedger.some(row => row.status === 'done'), true);
  });
  await test('concurrent finish serialized and rewards once', async () => {
    const s = fresh(); await start(s); const t = info(s).sailInfo.trekData; t.dist = 2400;
    const replies = await Promise.all([action(s, 7005, { uid: t.uid }), action(s, 7005, { uid: t.uid })]);
    assert.equal(s.player.items[339], 50000); assert.equal(response(replies[1]).replayed, true);
  });
  await test('ambiguous save detaches session then receipt recovers', async () => {
    const s = fresh(); await start(s); const t = info(s).sailInfo.trekData; t.dist = 2400; fail = true;
    assert.equal(response(await action(s, 7005, { uid: t.uid })).code, 'OLD_TREK_SAVE_UNKNOWN'); assert.equal(s.player, null);
    fail = false; s.player = JSON.parse(JSON.stringify(saved)); assert.equal(response(await action(s, 7005, { uid: t.uid })).replayed, true);
    assert.equal(s.player.items[339], 50000);
  });
  await test('sweep closed and incomplete first clears rejected without cost', async () => {
    const s = fresh(); schedule.isDepartAllowed = false;
    assert.equal(response(await action(s, 7009, { id: 1, diff: 1 })).code, 'OLD_TREK_DEPART_CLOSED');
    schedule.isDepartAllowed = true;
    assert.equal(response(await action(s, 7009, { id: 1, diff: 1 })).code, 'OLD_TREK_SWEEP_FIRST_CLEAR_REQUIRED'); assert.equal(s.player.items[321], 1000);
  });
  await test('event policy missing preserves all state and reward-shaped data', async () => {
    const s = fresh(); await start(s); info(s).sailInfo.currentEvent = { uid: 42, id: 101, rewards: [{ id: 1, count: 999 }] };
    const before = JSON.stringify(s.player), n = saves;
    assert.equal(response(await action(s, 7002, { eventUid: 41 })).code, 'OLD_TREK_EVENT_UID_INVALID');
    assert.equal(response(await action(s, 7002, { eventUid: 42 })).code, 'OLD_TREK_EVENT_POLICY_REQUIRED');
    assert.equal(JSON.stringify(s.player), before); assert.equal(saves, n);
  });
  console.log(JSON.stringify({ status: 'PASS', checks: results.length, results, realPlayerWrites: 0, networkAttempts: 0 }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
