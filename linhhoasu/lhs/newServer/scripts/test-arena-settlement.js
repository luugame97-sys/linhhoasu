'use strict';
const assert = require('assert/strict');
const { createService, dayKey, dueCutoffs } = require('../src/services/ArenaSettlementService');
const copy = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
function memoryModel() {
  const records = new Map();
  let failReceipt = false;
  const match = (r, q) => Object.entries(q).every(([k, v]) => typeof v === 'object' ?
    ('$ne' in v ? r[k] !== v.$ne : '$lte' in v ? r[k] <= v.$lte : r[k] >= v.$gte) : r[k] === v);
  const update = (r, u) => {
    Object.assign(r, u.$set || {});
    for (const [k, v] of Object.entries(u.$inc || {})) r[k] = (r[k] || 0) + v;
    for (const [k, v] of Object.entries(u.$max || {})) r[k] = Math.max(r[k] || 0, v);
    for (const [k, v] of Object.entries(u.$addToSet || {})) if (!r[k].includes(v)) r[k].push(v);
  };
  const query = (items) => {
    let result = items;
    return { select() { return this; }, sort(s) { const [k, dir] = Object.entries(s)[0]; result.sort((a, b) => (a[k] - b[k]) * dir); return this; },
      limit(n) { result = result.slice(0, n); return this; }, async lean() { return copy(result); } };
  };
  return { records, injectReceiptCrash() { failReceipt = true; },
    findById(id) { return { async lean() { return copy(records.get(id)); } }; },
    find(q) { return query([...records.values()].filter((r) => match(r, q))); },
    async create(r) { if (records.has(r._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); records.set(r._id, copy(r)); },
    findOneAndUpdate(q, u) { const r = [...records.values()].find((x) => match(x, q)); if (r) update(r, u); return { async lean() { return copy(r); } }; },
    async updateOne(q, u) {
      if (u.$addToSet && failReceipt) { failReceipt = false; throw new Error('CRASH_AFTER_MAIL_BEFORE_RECEIPT'); }
      const r = [...records.values()].find((x) => match(x, q)); if (r) update(r, u); return { matchedCount: r ? 1 : 0 };
    },
  };
}
async function main() {
  const cutoff = Date.parse('2026-09-13T16:00:00Z'); // Sunday 23:00 GMT+7
  let now = cutoff + 300000, calls = 0;
  const Settlement = memoryModel(), Mail = memoryModel();
  const Player = { findOne: () => ({ select() { return this; }, async lean() { return null; } }) };
  const options = { Settlement, Mail, Player, serverId: 1002, activationAt: cutoff - 3600000, clock: () => now,
    enabled: true, approved: true, rewardsForRank: (_, rank) => [{ id: 1, count: 100 / rank }],
    snapshotProvider: async ({ cutoffAt }) => { calls++; return { complete: true, cutoffAt,
      rows: [{ playerId: 'a', userId: 'u1', rank: 1, score: 1200 }, { playerId: 'b', userId: 'u2', rank: 2, score: 1000 }] }; } };
  assert.equal(dayKey(cutoff), '20260913');
  assert.equal(dueCutoffs(options.activationAt, now).length, 2);
  assert.equal(dueCutoffs(cutoff + 1, now).length, 0, 'activation never backpays earlier cutoff');
  assert.equal(dueCutoffs(cutoff, cutoff + 1000 * 86400000).length <= 33, true);
  const disabled = createService({ ...options, enabled: false });
  assert.equal((await disabled.settleArenaPeriod('day', cutoff)).reason, 'DISABLED');
  assert.deepEqual(await disabled.tick(), []);
  await assert.rejects(createService({ ...options, snapshotProvider: null }).settleArenaPeriod('day', cutoff), /PROVIDER_REQUIRED/);
  await assert.rejects(createService({ ...options, snapshotProvider: async () => ({ rows: [] }) }).settleArenaPeriod('day', cutoff), /NOT_FINAL/);
  const service = createService(options);
  Settlement.injectReceiptCrash();
  await assert.rejects(service.settleArenaPeriod('day', cutoff), /CRASH_AFTER_MAIL/);
  assert.equal(Mail.records.size, 1);
  // Restart and changed ranking: persisted snapshot must win, not recomputed rank/reward.
  const restarted = createService({ ...options, snapshotProvider: async () => { throw new Error('MUST_NOT_READ_NEW_RANK'); } });
  await restarted.settleArenaPeriod('day', cutoff);
  assert.equal(Mail.records.size, 2);
  assert.equal(calls, 1);
  assert.equal([...Mail.records.values()].find((m) => m.userId === 'u1').attachments[0].count, 100);
  await restarted.settleArenaPeriod('day', cutoff);
  assert.equal(Mail.records.size, 2, 'done settlement replay creates no mail');
  const parallel = await Promise.all([service.settleArenaPeriod('week', cutoff), service.settleArenaPeriod('week', cutoff)]);
  assert.equal(parallel.filter((r) => r.state === 'done').length, 1);
  assert.equal(Mail.records.size, 4);
  now += 86400000; // missed exact minute + restart catch-up
  await createService(options).tick();
  assert.equal(Mail.records.size, 6);
  await assert.rejects(service.settleArenaPeriod('day', cutoff - 86400000), /OUTSIDE_ACTIVATION/);
  const partial = [...Settlement.records.values()][0];
  partial.state = 'sending'; partial.delivered = []; partial.leaseUntil = now - 1; partial.leaseOwner = 'dead-process';
  now = cutoff + 31 * 86400000;
  Mail.records.clear();
  await restarted.settleArenaPeriod('day', cutoff);
  assert.equal(Mail.records.size, 0, 'TTL-expired mail never resurrects');
  console.log('Arena settlement PASS: disabled, activation, exact cutoff, immutable retry, mail/receipt crash, parallel leases, restart/catch-up, TTL replay. In-memory adapter; not Mongo/live acceptance.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
