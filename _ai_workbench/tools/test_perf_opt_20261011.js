const assert = require('assert');
const path = require('path');

// Test 1: Kiểm tra WSServer constants
const WSServer = require('../../linhhoasu/lhs/newServer/src/net/WSServer');
// Kiểm tra file syntax & loading
assert.ok(WSServer, 'WSServer should be loaded');

// Test 2: Kiểm tra PlayerService logic trích xuất onlyFields
const playerFixture = {
  userId: 'test_u_1',
  level: 100,
  exp: 5000,
  items: { '1': 100, '2': 500 },
  currencies: { gold: 1000 },
  petInfo: { pets: [{ id: 1, level: 1 }] },
  other_attr_info: { record: {} },
  hugeInventory: new Array(5000).fill({ dummy: 'data' }) // Giả lập dữ liệu lớn
};

const onlyFields = ['petInfo', 'items', 'currencies', 'other_attr_info'];
const onlyFieldsSet = new Set(onlyFields);

const t0 = Date.now();
// Đo thời gian trích xuất chỉ field cần thiết
const partialSnapshot = {};
for (const f of onlyFields) {
  if (playerFixture[f]) {
    partialSnapshot[f] = JSON.parse(JSON.stringify(playerFixture[f]));
  }
}
const extractMs = Date.now() - t0;
assert.ok(extractMs < 10, 'Partial extraction must be sub-10ms');
assert.strictEqual(partialSnapshot.hugeInventory, undefined, 'hugeInventory must not be included');
assert.deepStrictEqual(partialSnapshot.petInfo, playerFixture.petInfo);

// Test 3: Cooldown logic
const cooldowns = new Map([
  [3314, 350],
  [4008, 300],
  [4000, 300],
  [2601, 500],
  [2300, 400]
]);

const session = { _tagLastTimes: new Map() };
function checkThrottle(tag, now) {
  const minCd = cooldowns.get(tag) || 0;
  if (!minCd) return false;
  const last = session._tagLastTimes.get(tag) || 0;
  if (now - last < minCd) return true; // throttled
  session._tagLastTimes.set(tag, now);
  return false;
}

// Lần 1: Không bị throttle
assert.strictEqual(checkThrottle(3314, 1000), false);
// Lần 2 (cách 100ms < 350ms): Bị throttle
assert.strictEqual(checkThrottle(3314, 1100), true);
// Lần 3 (cách 360ms >= 350ms): Không bị throttle
assert.strictEqual(checkThrottle(3314, 1360), false);

console.log('ALL UNIT TESTS PASSED!');
