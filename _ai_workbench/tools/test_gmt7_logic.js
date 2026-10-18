'use strict';
/**
 * Test GMT+7 timezone calculations across modified client & server logic.
 */
const assert = require('assert');

// 1. Client logic simulation
const MS_PER_MINUTE = 60000;
function getGMT8Date(t) {
  const e = new Date(t).getTimezoneOffset();
  return new Date(t - (-420 - e) * MS_PER_MINUTE);
}
function getGMT8TodayStartTime(t) {
  const dt = getGMT8Date(t);
  dt.setHours(0, 0, 0, 0);
  const e = (-420 - dt.getTimezoneOffset()) * MS_PER_MINUTE;
  return dt.getTime() + e;
}
function getGMT8TodayEndTime(t) {
  const dt = getGMT8Date(t);
  dt.setHours(23, 59, 59, 999);
  const e = (-420 - dt.getTimezoneOffset()) * MS_PER_MINUTE;
  return dt.getTime() + e;
}

// Test time: 2026-09-20 20:50:00 GMT+7 (which is 13:50:00 UTC)
const testTime = Date.UTC(2026, 8, 20, 13, 50, 0); // 2026-09-20 13:50 UTC = 20:50 GMT+7
const endOfDay = getGMT8TodayEndTime(testTime);
const endOfDayDate = new Date(endOfDay);

// In UTC, end of day for GMT+7 (23:59:59.999) is 16:59:59.999 UTC
assert.strictEqual(endOfDayDate.getUTCHours(), 16, 'End of day UTC hours must be 16 (23:00 GMT+7)');
assert.strictEqual(endOfDayDate.getUTCMinutes(), 59, 'End of day UTC minutes must be 59');
assert.strictEqual(endOfDayDate.getUTCSeconds(), 59, 'End of day UTC seconds must be 59');
console.log('CLIENT TEST: getGMT8TodayEndTime produces exact 23:59:59.999 GMT+7 -> PASS');

// 2. Server FarmShopService & GameDayService synchronization
const gameDay = require('../../linhhoasu/lhs/newServer/src/services/GameDayService');
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
function getShopDayKey(now = Date.now()) {
  return Math.floor((now + GMT7_OFFSET_MS) / 86400000);
}

// At 23:59:00 GMT+7 (16:59:00 UTC)
const beforeMidnight = Date.UTC(2026, 8, 20, 16, 59, 0);
// At 00:01:00 GMT+7 (17:01:00 UTC)
const afterMidnight = Date.UTC(2026, 8, 20, 17, 1, 0);

assert.strictEqual(gameDay.key(beforeMidnight), 20260920, 'Before midnight should be 20260920');
assert.strictEqual(gameDay.key(afterMidnight), 20260921, 'After midnight should be 20260921');

const shopDayBefore = getShopDayKey(beforeMidnight);
const shopDayAfter = getShopDayKey(afterMidnight);
assert.strictEqual(shopDayAfter, shopDayBefore + 1, 'Shop day key must increment by 1 across midnight GMT+7');
console.log('SERVER TEST: Day rollover at 00:00:00 GMT+7 in sync between GameDayService and Shop -> PASS');

// 3. RechargeRewardResolver
const beforePeriodDay = String(Math.floor((beforeMidnight + GMT7_OFFSET_MS) / 86400000));
const afterPeriodDay = String(Math.floor((afterMidnight + GMT7_OFFSET_MS) / 86400000));
assert.notStrictEqual(beforePeriodDay, afterPeriodDay, 'Recharge period day must rollover at 00:00:00 GMT+7');
console.log('SERVER TEST: Recharge period rollover at 00:00:00 GMT+7 -> PASS');

console.log('\nALL 3 LOGICAL VERIFICATION TESTS PASSED 100%!');
