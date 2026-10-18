const assert = require('assert');
const { rewardFor } = require('../../linhhoasu/lhs/newServer/src/services/EventRewardSettlementService');

console.log('Testing EventRewardSettlementService.rewardFor fail-safe...');

// Case 1: Table without 99002 (e.g. old binary)
const oldTable6006 = {
  '1': { rankMin: 1, rankMax: 1, rewards: [{ id: 11207, count: 1 }, { id: 50, count: 30 }, { id: 1, count: 10000000 }] },
  '2': { rankMin: 2, rankMax: 2, rewards: [{ id: 11207, count: 1 }, { id: 50, count: 15 }, { id: 1, count: 8000000 }] },
  '3': { rankMin: 3, rankMax: 3, rewards: [{ id: 11207, count: 1 }, { id: 50, count: 10 }, { id: 1, count: 6000000 }] },
  '4': { rankMin: 4, rankMax: 10, rewards: [{ id: 65, count: 150 }, { id: 50, count: 5 }, { id: 1, count: 5000000 }] },
  '11': { rankMin: 11, rankMax: 50, rewards: [{ id: 65, count: 120 }, { id: 50, count: 3 }, { id: 1, count: 4000000 }] }
};

// Rank 1
const r1 = rewardFor(oldTable6006, 1, { id: 6006 });
assert.strictEqual(r1[0].id, 99002, 'Rank 1 must have 99002 at index 0');
assert.strictEqual(r1[0].count, 10, 'Rank 1 must have 10 boxes');
console.log('PASS: Old table Rank 1 auto-injected 10 boxes 99002');

// Rank 2
const r2 = rewardFor(oldTable6006, 2, { id: 6006 });
assert.strictEqual(r2[0].id, 99002);
assert.strictEqual(r2[0].count, 7);
console.log('PASS: Old table Rank 2 auto-injected 7 boxes 99002');

// Rank 3
const r3 = rewardFor(oldTable6006, 3, { id: 6006 });
assert.strictEqual(r3[0].id, 99002);
assert.strictEqual(r3[0].count, 5);
console.log('PASS: Old table Rank 3 auto-injected 5 boxes 99002');

// Rank 4
const r4 = rewardFor(oldTable6006, 4, { id: 6006 });
assert.strictEqual(r4[0].id, 99002);
assert.strictEqual(r4[0].count, 3);
console.log('PASS: Old table Rank 4 auto-injected 3 boxes 99002');

// Rank 15
const r15 = rewardFor(oldTable6006, 15, { id: 6006 });
assert.strictEqual(r15[0].id, 99002);
assert.strictEqual(r15[0].count, 2);
console.log('PASS: Old table Rank 15 auto-injected 2 boxes 99002');

// Case 2: Table that ALREADY has 99002
const newTable6006 = {
  '1': { rankMin: 1, rankMax: 1, rewards: [{ id: 99002, count: 10 }, { id: 11207, count: 1 }] }
};
const rNew = rewardFor(newTable6006, 1, { id: 6006 });
const count99002 = rNew.filter(x => x.id === 99002).length;
assert.strictEqual(count99002, 1, 'Should NOT duplicate 99002');
assert.strictEqual(rNew[0].count, 10);
console.log('PASS: New table Rank 1 preserves single 99002 entry');

// Case 3: Non-fishing event
const otherTable = {
  '1': { rankMin: 1, rankMax: 1, rewards: [{ id: 1, count: 100 }] }
};
const rOther = rewardFor(otherTable, 1, { id: 44001 });
assert.strictEqual(rOther.some(x => x.id === 99002), false, 'Non-fishing event should not have 99002');
console.log('PASS: Other events remain unaffected');

console.log('\nALL 7 UNIT TESTS PASSED 100%!');
