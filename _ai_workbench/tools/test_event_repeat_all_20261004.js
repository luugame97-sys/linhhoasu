'use strict';

// RAM-only regression fixture for ActivityCycleSchedule.
// Usage: node test_event_repeat_all_20261004.js <path-to-ActivityCycleSchedule.js> [path-to-NewYearEventSchedule.js]
// No database, network, or player persistence is touched.

const assert = require('assert');
const Module = require('module');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('usage: node test_event_repeat_all_20261004.js <ActivityCycleSchedule.js>');
  process.exitCode = 2;
  process.exit(2);
}

const now = Date.parse('2026-10-04T12:00:00+07:00');
const newYearTarget = process.argv[3];
const serverIds = [1001, 1002, 1003, 1004, 1005, 1006, 1007];
const families = [
  { key: 'fortune', kind: 'activity', activityType: 43, enabled: true,
    repeatForever: true, anchor: '2026-09-26T17:00:00+07:00', periodDays: 7, ids: [43001, 43002] },
  { key: 'new_year_monster', kind: 'activity', activityType: 44, enabled: true,
    repeatForever: true, anchor: '2026-09-26T17:00:00+07:00', periodDays: 7, ids: [44001, 44002] },
];
const registry = {
  getFamilies: () => families,
  getFamily: key => families.find(f => f.key === key) || null,
  isEnabled: f => !!f && f.enabled === true,
  isRepeating: key => families.some(f => f.key === key && f.repeatForever && f.enabled),
};
const config = {
  get: key => key === 'ActivityConfig' ? {
    43001: { id: 43001, activityType: 43 }, 43002: { id: 43002, activityType: 43 },
    44001: { id: 44001, activityType: 44 }, 44002: { id: 44002, activityType: 44 },
  } : {},
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './EventRotationRegistry') return registry;
  if (request === './ConfigService') return config;
  if (request === './EventRewardSettlementService') {
    return { settlementId: (serverId, event) => `mock:${serverId}:${event.id}:${event.key || ''}` };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let schedule;
let newYear;
try { schedule = require(path.resolve(target)); }
catch (error) { throw error; }
try { if (newYearTarget) newYear = require(path.resolve(newYearTarget)); }
finally { Module._load = originalLoad; }

function familyRow(activityType) {
  return schedule.syncPlayer({ activityInfo: { datas: [] } }, now,
    { kimmaSettlementReady: activityType === 44 });
}

const fortune = familyRow(43);
assert(fortune.added.some(row => row.id === 43002 || row.id === 43001),
  'Fortune must rotate without requiring KimMa settlement receipt');

const kimmaBlocked = schedule.syncPlayer({ activityInfo: { datas: [] } }, now,
  { kimmaSettlementReady: false });
assert(!kimmaBlocked.added.some(row => row.id === 44001 || row.id === 44002),
  'KimMa must remain gated until settlement is durable');

const kimma = familyRow(44);
assert(kimma.added.some(row => row.id === 44001 || row.id === 44002),
  'KimMa must open after durable settlement');

const cycle = schedule.cycleForFamily(families[0], now);
assert(cycle && cycle.index >= 1 && cycle.id === 43002,
  'repeatForever must select the modulo cycle after the first period');

const row = schedule.createCycleRow(cycle);
assert.strictEqual(row.startTime, cycle.startTime);
assert.strictEqual(row.endTime, cycle.endTime);
const kimmaCycle = schedule.cycleForFamily(families[1], now);
const kimmaRow = schedule.createCycleRow(kimmaCycle);
assert.strictEqual(kimmaRow.score, 1,
  'activityType 44 fresh row must start at native level/score 1');

// Every server must receive a dynamic window, while the activation cutoff
// excludes pre-opening recurring receipts for newly-added servers.
if (newYear) {
  for (const serverId of serverIds) {
    const dynamic = newYear.windowFor(serverId, { newYearWindows: {} }, now);
    assert(dynamic && dynamic.startTime < dynamic.endTime,
      `NewYear windowFor must provide a recurring window for S${serverId - 1000}`);
  }
}

// A current protected row retains score, claims, and inventory. Repeating the
// same sync is idempotent and cannot duplicate the cycle row.
const protectedPlayer = { activityInfo: { datas: [{ id: 43002, startTime: now - 1000,
  endTime: now + 3600000, score: 17, record: 3, records: { 10: 9 }, buyRecords: { 2: 4 } }] } };
const protectedState = schedule.syncPlayer(protectedPlayer, now, { kimmaSettlementReady: false });
assert(protectedState.preserved.some(x => x.id === 43002), 'active Fortune row must be preserved');
assert.strictEqual(protectedPlayer.activityInfo.datas.find(x => x.id === 43002).score, 17);
const beforeRepeat = JSON.stringify(protectedPlayer.activityInfo.datas);
schedule.syncPlayer(protectedPlayer, now, { kimmaSettlementReady: false });
assert.strictEqual(JSON.stringify(protectedPlayer.activityInfo.datas), beforeRepeat,
  'repeated sync must not duplicate or reset protected data');

// Settlement-gated sync: pending/missing receipts block Kim-Ma rollover; a
// completed receipt opens it. The callback is RAM-only and records requested
// ids so we can assert that activationAt filters pre-opening cycles.
;(async () => {
const oldActivation = process.env.EVENT_SETTLEMENT_ACTIVATION_AT;
const settlementNow = Date.parse('2026-10-20T12:00:00+07:00');
process.env.EVENT_SETTLEMENT_ACTIVATION_AT = String(Date.parse('2026-10-04T00:00:00+07:00'));
const receiptRequests = [];
const pendingPlayer = { serverId: 1007, activityInfo: { datas: [] } };
const pending = await schedule.syncPlayerAfterSettlement(pendingPlayer, settlementNow, {
  readReceipts: async ids => { receiptRequests.push(ids.slice()); return []; },
});
assert(!pending.added.some(x => x.family === 'new_year_monster'),
  'missing/pending Kim-Ma settlement must not roll over');
assert(receiptRequests.length === 1 && receiptRequests[0].length > 0,
  'Kim-Ma gate must request durable receipt ids');
const later = { serverId: 1007, activityInfo: { datas: [] } };
const opened = await schedule.syncPlayerAfterSettlement(later, settlementNow, {
  readReceipts: async ids => ids.map(_id => ({ _id, state: 'done' })),
});
assert(opened.added.some(x => x.family === 'new_year_monster'),
  'all required completed receipts must open Kim-Ma rollover');
assert(receiptRequests[0].every(id => !String(id).includes('new_year_monster:0:')),
  'S7 must not request nonexistent pre-activation Kim-Ma receipt');
assert(receiptRequests[0].length === 2,
  'later recurring periods must remain settlement-gated while pre-activation period is excluded');

// Fortune remains independent from the Kim-Ma gate under the same pending
// callback and must still be present in the resulting payload.
assert(opened.added.some(x => x.family === 'fortune'),
  'Fortune must remain open while Kim-Ma settlement is pending');

// Stress modulo rotation across many periods without creating duplicate ids.
const seenCycles = new Set();
for (let i = 0; i < 64; i += 1) {
  const t = Date.parse(families[0].anchor) + i * families[0].periodDays * schedule.DAY + 1234;
  const c = schedule.cycleForFamily(families[0], t);
  assert(c && c.id === families[0].ids[i % families[0].ids.length]);
  assert(!seenCycles.has(c.key), 'each recurring period must have a unique cycle key');
  seenCycles.add(c.key);
}

if (oldActivation === undefined) delete process.env.EVENT_SETTLEMENT_ACTIVATION_AT;
else process.env.EVENT_SETTLEMENT_ACTIVATION_AT = oldActivation;
if (newYear) {
  const dynamic = newYear.windowFor(1004, { newYearWindows: {} }, now);
  assert(dynamic && dynamic.startTime < dynamic.endTime,
    'NewYear windowFor must provide a recurring window for S4-S7 without legacy row');
}
console.log(JSON.stringify({ ok: true, fortune: fortune.added, kimma: kimma.added,
  cycle: { id: cycle.id, index: cycle.index }, row, kimmaRow,
  servers: serverIds, receiptRequests: receiptRequests.map(x => x.length),
  newYear: newYearTarget ? 'checked' : 'not-supplied' }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
