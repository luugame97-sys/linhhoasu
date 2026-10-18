'use strict';

// Compact only an explicitly requested sell-all normal opening. Generation
// stays in the native handler so UID, variance and appearance side effects
// are identical to the non-compact path. No currency or EXP formula lives here.
function createService(equipService) {
  const pending = new WeakMap();
  function capture(player, openInfo, options = {}) {
    if (!player || !openInfo || options.normalOpen !== true
      || openInfo.sellAllEquipments !== true
      || !Number.isSafeInteger(openInfo.count) || openInfo.count < 101 || openInfo.count > 200) return null;
    const existing = new Set();
    const remember = row => {
      if (row && Number.isSafeInteger(Number(row.uid)) && Number(row.uid) > 0) existing.add(Number(row.uid));
    };
    const info = player.equipInfo || {};
    Object.values(info.openListMap || {}).forEach(rows => { if (Array.isArray(rows)) rows.forEach(remember); });
    Object.values(info.equipSetMap || {}).forEach(plan => { if (plan && typeof plan === 'object') Object.values(plan).forEach(remember); });
    if (Array.isArray(info.equipList)) info.equipList.forEach(remember);
    const token = Object.freeze({});
    pending.set(token, { player, existing });
    return token;
  }

  function settle(player, token, generatedRows) {
    const context = token && pending.get(token);
    if (!context || context.player !== player) throw new Error('DROP_COMPACT_CONTEXT_INVALID');
    pending.delete(token);
    if (!Array.isArray(generatedRows)) throw new Error('DROP_COMPACT_ROWS_INVALID');
    const seen = new Set();
    const uids = [];
    for (const row of generatedRows) {
      const uid = Number(row && row.uid);
      if (!Number.isSafeInteger(uid) || uid <= 0 || seen.has(uid) || context.existing.has(uid)) {
        throw new Error('DROP_COMPACT_UID_INVALID');
      }
      seen.add(uid);
      uids.push(uid);
    }
    const sale = equipService.saleOpenEquips(player, uids, { safeAutoDelegate: true, sellAllEquipments: true });
    if (!sale || sale.result !== 0) throw new Error('DROP_COMPACT_SALE_FAILED');
    const sold = new Set(Array.isArray(sale.uids) ? sale.uids.map(Number) : []);
    for (const uid of sold) if (!seen.has(uid)) throw new Error('DROP_COMPACT_SALE_SCOPE_INVALID');
    return {
      soldCount: sold.size,
      soldUids: Array.from(sold),
      rewardItems: Array.isArray(sale.rewardInfo && sale.rewardInfo.items) ? sale.rewardInfo.items : [],
      remainingEquips: generatedRows.filter(row => !sold.has(Number(row.uid))),
    };
  }
  return { capture, settle };
}

// Lazy loading keeps the pure contract checks below independent of config/DB.
let service;
function current() { return service || (service = createService(require('./EquipService'))); }
module.exports = {
  createService,
  capture: (...args) => current().capture(...args),
  settle: (...args) => current().settle(...args),
};

if (require.main === module) {
  const assert = require('node:assert/strict');
  let checks = 0;
  function check(fn) { fn(); checks++; }
  let calls = [];
  const fake = { saleOpenEquips(player, uids, options) {
    calls.push({ uids, options });
    const protectedUids = new Set(Object.values(player.equipInfo.equipSetMap[0] || {}).map(row => row.uid));
    const sold = uids.filter(uid => !protectedUids.has(uid));
    return { result: 0, uids: sold, rewardInfo: { items: [{ id: 2, count: sold.length * 17 }] } };
  } };
  const helper = createService(fake);
  const player = { equipInfo: { openListMap: { 0: [{ uid: 1 }] }, equipSetMap: { 0: { 1: { uid: 2 } } }, equipList: [{ uid: 3 }] } };
  const open = { count: 200, sellAllEquipments: true };
  check(() => assert.equal(helper.capture(player, open), null));
  for (const count of [1, 100, 201, 101.5, '200']) check(() => assert.equal(helper.capture(player, { ...open, count }, { normalOpen: true }), null));
  for (const flag of [false, 1, 'true', undefined]) check(() => assert.equal(helper.capture(player, { ...open, sellAllEquipments: flag }, { normalOpen: true }), null));
  const capture = () => helper.capture(player, open, { normalOpen: true });
  check(() => assert.throws(() => helper.settle({}, capture(), []), /CONTEXT_INVALID/));
  for (const uid of [1, 2, 3, 0, -1, NaN]) check(() => assert.throws(() => helper.settle(player, capture(), [{ uid }]), /UID_INVALID/));
  check(() => assert.throws(() => helper.settle(player, capture(), [{ uid: 4 }, { uid: 4 }]), /UID_INVALID/));
  check(() => assert.equal(calls.length, 0));
  const token = capture();
  const rows = Array.from({ length: 200 }, (_, index) => ({ uid: index + 4 }));
  let result;
  check(() => { result = helper.settle(player, token, rows); assert.equal(result.soldCount, 200); });
  check(() => assert.deepEqual(result.rewardItems, [{ id: 2, count: 3400 }]));
  check(() => assert.equal(result.remainingEquips.length, 0));
  check(() => assert.deepEqual(calls[0].options, { safeAutoDelegate: true, sellAllEquipments: true }));
  check(() => assert.throws(() => helper.settle(player, token, rows), /CONTEXT_INVALID/));
  const lateProtected = capture();
  player.equipInfo.equipSetMap[0][2] = { uid: 500 };
  check(() => assert.deepEqual(helper.settle(player, lateProtected, [{ uid: 500 }]).remainingEquips, [{ uid: 500 }]));
  console.log(JSON.stringify({ checks, passed: true, productionWrites: 0, networkAttempts: 0 }));
}
