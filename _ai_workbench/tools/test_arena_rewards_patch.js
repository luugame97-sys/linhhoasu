'use strict';

const assert = require('assert');
const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');

config.reload();

console.log('=== TEST 1: Check Arena tables loaded ===');
const dayConfig = config.get('ArenaDayRankRewardConfig');
const weekConfig = config.get('ArenaWeeklyRankRewardConfig');

assert.ok(dayConfig, 'ArenaDayRankRewardConfig must exist');
assert.ok(weekConfig, 'ArenaWeeklyRankRewardConfig must exist');
assert.strictEqual(Object.keys(dayConfig).length, 10, 'Day config must have 10 rows');
assert.strictEqual(Object.keys(weekConfig).length, 10, 'Week config must have 10 rows');
console.log('Test 1 PASS: Both configs have 10 rows');

console.log('=== TEST 2: Check Arena Day Rewards ===');
// Top 1: 200.000 diamond, 10 boxes (id: 90077), 50 arena tokens (id: 7)
const day1 = dayConfig[1].rewards;
assert.strictEqual(day1.find(r => r.id === 1).count, 200000);
assert.strictEqual(day1.find(r => r.id === 90077).count, 10);
assert.strictEqual(day1.find(r => r.id === 7).count, 50);

// Top 2: 160.000 diamond, 8 boxes, 40 tokens
const day2 = dayConfig[2].rewards;
assert.strictEqual(day2.find(r => r.id === 1).count, 160000);
assert.strictEqual(day2.find(r => r.id === 90077).count, 8);

// Top 3: 120.000 diamond, 5 boxes, 30 tokens
const day3 = dayConfig[3].rewards;
assert.strictEqual(day3.find(r => r.id === 1).count, 120000);
assert.strictEqual(day3.find(r => r.id === 90077).count, 5);

// Top 4: 80.000 diamond, 3 boxes, 20 tokens
const day4 = dayConfig[4].rewards;
assert.strictEqual(day4.find(r => r.id === 1).count, 80000);
assert.strictEqual(day4.find(r => r.id === 90077).count, 3);

// Top 5: 50.000 diamond, 3 boxes, 16 tokens
const day5 = dayConfig[5].rewards;
assert.strictEqual(day5.find(r => r.id === 1).count, 50000);
assert.strictEqual(day5.find(r => r.id === 90077).count, 3);

// Top 6-10: 50.000 diamond, 3 boxes, 10 tokens
const day6 = dayConfig[6].rewards;
assert.strictEqual(day6.find(r => r.id === 1).count, 50000);
assert.strictEqual(day6.find(r => r.id === 90077).count, 3);

// Top 11-20: 50.000 diamond, 2 boxes, 6 tokens
const day7 = dayConfig[7].rewards;
assert.strictEqual(day7.find(r => r.id === 1).count, 50000);
assert.strictEqual(day7.find(r => r.id === 90077).count, 2);

// Top 501+: 10.000 diamond, 2 boxes, 1 token
const day10 = dayConfig[10].rewards;
assert.strictEqual(day10.find(r => r.id === 1).count, 10000);
assert.strictEqual(day10.find(r => r.id === 90077).count, 2);
console.log('Test 2 PASS: Arena Day rewards match all expected values');

console.log('=== TEST 3: Check Arena Weekly Rewards ===');
// Top 1: 2.000.000 diamond, 20 boxes, title 11201, 50 tokens (id: 8)
const w1 = weekConfig[1].rewards;
assert.strictEqual(w1.find(r => r.id === 1).count, 2000000);
assert.strictEqual(w1.find(r => r.id === 90077).count, 20);
assert.strictEqual(w1.find(r => r.id === 11201).count, 1);
assert.strictEqual(w1.find(r => r.id === 8).count, 50);

// Top 2: 1.500.000 diamond, 16 boxes, 40 tokens
const w2 = weekConfig[2].rewards;
assert.strictEqual(w2.find(r => r.id === 1).count, 1500000);
assert.strictEqual(w2.find(r => r.id === 90077).count, 16);

// Top 3: 1.000.000 diamond, 10 boxes, 30 tokens
const w3 = weekConfig[3].rewards;
assert.strictEqual(w3.find(r => r.id === 1).count, 1000000);
assert.strictEqual(w3.find(r => r.id === 90077).count, 10);

// Top 4: 800.000 diamond, 6 boxes, 25 tokens
const w4 = weekConfig[4].rewards;
assert.strictEqual(w4.find(r => r.id === 1).count, 800000);
assert.strictEqual(w4.find(r => r.id === 90077).count, 6);

// Top 5: 600.000 diamond, 6 boxes, 25 tokens
const w5 = weekConfig[5].rewards;
assert.strictEqual(w5.find(r => r.id === 1).count, 600000);
assert.strictEqual(w5.find(r => r.id === 90077).count, 6);

// Top 6-10: 400.000 diamond, 6 boxes, 20 tokens
const w6 = weekConfig[6].rewards;
assert.strictEqual(w6.find(r => r.id === 1).count, 400000);
assert.strictEqual(w6.find(r => r.id === 90077).count, 6);

// Top 11-20: 300.000 diamond, 4 boxes, 20 tokens
const w7 = weekConfig[7].rewards;
assert.strictEqual(w7.find(r => r.id === 300000) ? undefined : w7.find(r => r.id === 1).count, 300000);
assert.strictEqual(w7.find(r => r.id === 90077).count, 4);

// Top 501+: 60.000 diamond, 4 boxes, 10 tokens
const w10 = weekConfig[10].rewards;
assert.strictEqual(w10.find(r => r.id === 1).count, 60000);
assert.strictEqual(w10.find(r => r.id === 90077).count, 4);
console.log('Test 3 PASS: Arena Weekly rewards match all expected values');

console.log('=== TEST 4: Check TopCombat rewards are still intact with item 90078 ===');
const topCombatDay = config.get('TopCombatDayRankRewardConfig');
assert.strictEqual(topCombatDay[1].rewards.find(r => r.id === 90078).count, 10);
assert.strictEqual(topCombatDay[1].rewards.find(r => r.id === 1).count, 400000);
console.log('Test 4 PASS: TopCombat rewards intact');

console.log('=== TEST 5: Verify other gameplay tables ===');
config.validateGameplayTables(config.loadAllTables());
console.log('Test 5 PASS: Gameplay tables valid');

console.log('\n>>> ALL 5 TESTS PASSED SUCCESSFULLY! <<<');
