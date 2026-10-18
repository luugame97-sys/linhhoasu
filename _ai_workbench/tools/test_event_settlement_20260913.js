'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = process.env.EVENT_TEST_APP || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const { createService, collectRank, dueEvents, rewardFor, settlementId } = require(root + '/src/services/EventRewardSettlementService');
const schedule = require(root + '/src/services/NewYearEventSchedule');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const e = { kind: 'fishing', id: 6006, key: 'F6006_1000', startTime: 1000, endTime: 2000 };
const p = (id, score, extra = {}) => ({ playerId: id, userId: 'u' + id, name: id, serverId: 1001,
  fishInfo: { eventStats: { [e.key]: { id: 6006, start: 1000, end: 2000, score } } }, ...extra });
const table = { 1: { rankMin: 1, rankMax: 1, rewards: [{ id: 1, count: 300 }] },
  2: { rankMin: 2, rankMax: 2, rewards: [{ id: 1, count: 200 }] },
  3: { rankMin: 3, rankMax: 999999, rewards: [{ id: 1, count: 100 }] } };
const chain = value => ({ lean: async () => clone(value), select() { return this; }, maxTimeMS() { return this; } });
function fixture(players = [p('a', 30), p('b', 20), p('c', 10)]) {
  const db = { mail: new Map(), frozen: new Map(), claimed: new Set(), scans: 0, clock: 62001, failReceipt: false, compensated: [] };
  const duplicate = () => Object.assign(new Error('duplicate'), { code: 11000 });
  const Settlement = {
    findById: id => chain(db.frozen.get(id)),
    create: async doc => { if (db.frozen.has(doc._id)) throw duplicate(); db.frozen.set(doc._id, clone(doc)); return clone(doc); },
    updateOne: async (filter, update) => {
      if (db.failReceipt && update.$addToSet) { db.failReceipt = false; throw new Error('receipt-timeout'); }
      const row = db.frozen.get(filter._id); assert.ok(row);
      if (update.$set) Object.assign(row, clone(update.$set));
      for (const [k, v] of Object.entries(update.$addToSet || {})) if (!row[k].includes(v)) row[k].push(v);
      return { matchedCount: 1 };
    },
  };
  const Mail = {
    findById: id => chain(db.mail.get(id)), find: () => chain(db.compensated),
    create: async doc => { if (db.mail.has(doc._id)) throw duplicate(); db.mail.set(doc._id, clone(doc)); return clone(doc); },
  };
  const opts = { Player: { findOne: f => chain(db.claimed.has(f.mailClaimLedger) ? { _id: 'claimed' } : null) },
    Mail, Settlement, serverId: 1001, enabled: true, activationAt: 1,
    policy: { graceMs: 60000, newYearWindows: {}, legacyCompensationBatch: 'comp' },
    config: { get: k => ['Activity6RankConfig', 'Activity44RankConfig'].includes(k) ? { 6006: table, 44001: table, 44002: table } : {} },
    clock: () => db.clock, readPlayers: async () => { db.scans++; return clone(players); },
    logger: { warn() {}, error() {} }, validateRewards: () => {} };
  return { db, opts, service: createService(opts), players };
}
test('scope: zero, bots and foreign servers excluded', () => {
  const rows = collectRank([p('a', 1), p('z', 0), p('bot', 999, { isBot: true }), p('managed', 999, { managedBot: true }), p('other', 999, { serverId: 1002 })], e, 1001);
  assert.deepEqual(rows.map(r => r.playerId), ['a']);
});
test('tie ordering stable and more than 100 ranks supported', () => {
  const rows = collectRank(Array.from({ length: 550 }, (_, i) => p(String(i).padStart(4, '0'), 1)).reverse(), e, 1001);
  assert.equal(rows[0].playerId, '0000'); assert.equal(rows[549].rank, 550);
});
test('settled competitor retains rank position', () => {
  const a = p('a', 30); a.fishInfo.eventStats[e.key].settled = true;
  const rows = collectRank([a, p('b', 20)], e, 1001); assert.equal(rows[1].rank, 2); assert.ok(rows[0].legacyPaid);
});
test('identity duplicates fail closed', () => assert.throws(() => collectRank([p('a', 1), p('a', 2)], e, 1001), /IDENTITY/));
test('negative score fails closed', () => assert.throws(() => collectRank([p('a', -1)], e, 1001), /SCORE/));
test('tampered fishing period fails closed', () => {
  const a = p('a', 1); a.fishInfo.eventStats[e.key].end++;
  assert.throws(() => collectRank([a], e, 1001), /WINDOW/);
});
test('legacy Kim Ma different expiry retains all at common cutoff', () => {
  const event = { kind: 'kimma', id: 44001, key: 'cycle', startTime: 1, endTime: 100, includeLegacyWindows: true };
  const rows = collectRank([p('a', 0, { activityInfo: { datas: [{ id: 44001, startTime: 2, endTime: 10, record: 5 }] } }), p('b', 0, { activityInfo: { datas: [{ id: 44001, startTime: 3, endTime: 90, record: 20 }] } })], event, 1001);
  assert.deepEqual(rows.map(r => r.playerId), ['b', 'a']);
});
test('new cycle same activity gets distinct durable identity', () => {
  assert.notEqual(settlementId(1001, e), settlementId(1001, { ...e, endTime: 3000 }));
  assert.notEqual(settlementId(1001, e), settlementId(1002, e));
});
test('seed window fixed per server, unknown server closed', () => {
  assert.deepEqual(schedule.seedWindow(44001, 1001), schedule.seedWindow(44001, 1001));
  assert.deepEqual(schedule.seedWindow(44001, 9999), { startTime: 0, endTime: 0 });
  assert.equal(schedule.seedWindow(6006, 1001), null);
  const src = fs.readFileSync(root + '/src/handlers/activity.js', 'utf8');
  assert.ok(src.includes('const window = newYearEventSchedule.seedWindow(id) || getDefaultActivityTimeWindow()'));
});
test('rank brackets exact including 501+', () => {
  assert.equal(rewardFor(table, 1)[0].count, 300); assert.equal(rewardFor(table, 550)[0].count, 100);
});
test('missing/overlap/invalid rewards fail closed', () => {
  assert.throws(() => rewardFor(null, 1), /MISSING/);
  assert.throws(() => rewardFor({ ...table, x: table[1] }, 1), /OVERLAP/);
  assert.throws(() => rewardFor({ 1: { rankMin: 1, rankMax: 1, rewards: [{ id: 1, count: -1 }] } }, 1), /INVALID/);
});
test('cutoff grace period and disabled service', async () => {
  const f = fixture(); f.db.clock = 62000 - 1;
  await assert.rejects(f.service.settle(e), /NOT_DUE/); assert.equal(f.db.mail.size, 0);
  assert.equal((await createService({ ...f.opts, enabled: false }).settle(e)).skipped, 'disabled');
});
test('full roster snapshot, one mail each, retry no-op', async () => {
  const f = fixture(); await f.service.settle(e); assert.equal(f.db.mail.size, 3);
  await createService(f.opts).settle(e); assert.equal(f.db.mail.size, 3); assert.equal(f.db.scans, 1);
  assert.equal([...f.db.mail.values()].reduce((n, m) => n + m.attachments[0].count, 0), 600);
});
test('online prior-paid skipped but lower rank not promoted', async () => {
  const a = p('a', 30); a.fishInfo.eventStats[e.key].settled = true;
  const f = fixture([a, p('b', 20)]); await f.service.settle(e);
  assert.equal(f.db.mail.size, 1); assert.equal([...f.db.mail.values()][0].attachments[0].count, 200);
});
test('crash after insert before receipt resumes same mail', async () => {
  const f = fixture(); f.db.failReceipt = true;
  await assert.rejects(f.service.settle(e), /receipt-timeout/); assert.equal(f.db.mail.size, 1);
  await createService(f.opts).settle(e); assert.equal(f.db.mail.size, 3);
});
test('snapshot fixed despite later source score change', async () => {
  const f = fixture(); f.db.failReceipt = true; await assert.rejects(f.service.settle(e));
  f.players[2].fishInfo.eventStats[e.key].score = 99999;
  await createService(f.opts).settle(e);
  assert.equal([...f.db.mail.values()].find(m => m.userId === 'uc').attachments[0].count, 100);
  assert.equal(f.db.scans, 1);
});
test('parallel workers create single roster and mails', async () => {
  const f = fixture(); await Promise.all([f.service.settle(e), createService(f.opts).settle(e)]);
  assert.equal(f.db.mail.size, 3); assert.equal(f.db.frozen.size, 1);
});
test('deleted mails not resurrected after completed receipt', async () => {
  const f = fixture(); await f.service.settle(e); f.db.mail.clear(); await f.service.settle(e);
  assert.equal(f.db.mail.size, 0);
});
test('claimed then deleted mail during ambiguous receipt not doubled', async () => {
  const f = fixture([p('a', 30)]); f.db.failReceipt = true; await assert.rejects(f.service.settle(e));
  f.db.claimed.add([...f.db.mail.keys()][0]); f.db.mail.clear(); await f.service.settle(e); assert.equal(f.db.mail.size, 0);
});
test('expiry after 30 days creates receipt only', async () => {
  const f = fixture(); f.db.clock = e.endTime + 31 * 86400000; await f.service.settle(e);
  assert.equal(f.db.mail.size, 0); assert.equal([...f.db.frozen.values()][0].expired.length, 3);
});
test('unknown reward kind never freezes or mails', async () => {
  const f = fixture(); const s = createService({ ...f.opts, validateRewards: () => { throw Error('unsupported'); } });
  await assert.rejects(s.settle(e), /unsupported/); assert.equal(f.db.frozen.size, 0); assert.equal(f.db.mail.size, 0);
});
test('compensation receipt skips old Kim Ma recipient, preserves rank', async () => {
  const event = { ...e, kind: 'kimma', id: 44001, includeLegacyWindows: true };
  const ps = [p('a', 0), p('b', 0)]; ps.forEach((x, i) => x.activityInfo = { datas: [{ id: 44001, startTime: 1000, endTime: 2000, record: 2 - i }] });
  const f = fixture(ps); f.db.frozen.set('kimma_compensation_receipt_1001_20260913', { delivered: ['ua'] });
  await f.service.settle(event); assert.equal(f.db.mail.size, 1); assert.equal([...f.db.mail.values()][0].attachments[0].count, 200);
});
test('fishing heartbeat cannot directly grant ranking reward', () => {
  const src = fs.readFileSync(root + '/src/services/FishingEventService.js', 'utf8');
  const body = src.slice(src.indexOf('async function settle(player)'), src.indexOf('async function heartbeat'));
  assert.ok(body.includes('return []')); assert.ok(!body.includes('rewards.push')); assert.ok(!body.includes('s.settled=true'));
});
test('first fishing cutoff live schedule + grace + restart catchup', () => {
  const policy = require(root + '/src/config/eventRewardSettlement.json');
  const end = 1789300800000;
  assert.ok(!dueEvents(1001, end + 59999, policy.activationAt).some(x => x.id === 6006));
  assert.equal(dueEvents(1001, end + 60000, policy.activationAt).filter(x => x.id === 6006).length, 1);
  assert.equal(dueEvents(1001, end + 8 * 86400000, policy.activationAt).filter(x => x.id === 6006).length, 2);
});
(async () => {
  for (const [name, fn] of tests) { try { await fn(); } catch (error) { console.error('FAIL ' + name); throw error; } }
  console.log(JSON.stringify({ result: 'PASS', count: tests.length, tests: tests.map(x => x[0]) }));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
