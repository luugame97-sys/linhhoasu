'use strict';

const assert = require('assert');
const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');

// Reload config để nạp file bin vừa patch
config.reload();

console.log('=== TEST 1: Check ConfigService loaded tables ===');
const topCombatDay = config.get('TopCombatDayRankRewardConfig');
const topCombatWeek = config.get('TopCombatWeeklyRankRewardConfig');
const crossArenaDay = config.get('CrossArenaDayRankRewardConfig');
const crossArenaWeek = config.get('CrossArenaWeeklyRankRewardConfig');

assert.ok(topCombatDay, 'TopCombatDayRankRewardConfig must exist');
assert.ok(topCombatWeek, 'TopCombatWeeklyRankRewardConfig must exist');
assert.ok(crossArenaDay, 'CrossArenaDayRankRewardConfig must exist');
assert.ok(crossArenaWeek, 'CrossArenaWeeklyRankRewardConfig must exist');

assert.strictEqual(Object.keys(topCombatDay).length, 10, 'TopCombat Day config must have 10 rows');
assert.strictEqual(Object.keys(topCombatWeek).length, 10, 'TopCombat Weekly config must have 10 rows');
console.log('Test 1 PASS: Both configs have 10 rows');

console.log('=== TEST 2: Check TopCombat Day Reward values ===');
// Top 1: 400.000 diamond (id: 1), 10 boxes (id: 90077), 100 tokens (id: 89)
const day1 = topCombatDay[1].rewards;
assert.strictEqual(day1.find(r => r.id === 1).count, 400000);
assert.strictEqual(day1.find(r => r.id === 90077).count, 10);
assert.strictEqual(day1.find(r => r.id === 89).count, 100);

// Top 2: 360.000 diamond, 8 boxes, 90 tokens
const day2 = topCombatDay[2].rewards;
assert.strictEqual(day2.find(r => r.id === 1).count, 360000);
assert.strictEqual(day2.find(r => r.id === 90077).count, 8);
assert.strictEqual(day2.find(r => r.id === 89).count, 90);

// Top 3: 320.000 diamond, 5 boxes, 80 tokens
const day3 = topCombatDay[3].rewards;
assert.strictEqual(day3.find(r => r.id === 1).count, 320000);
assert.strictEqual(day3.find(r => r.id === 90077).count, 5);
assert.strictEqual(day3.find(r => r.id === 89).count, 80);

// Top 4: 280.000 diamond, 3 boxes, 70 tokens
const day4 = topCombatDay[4].rewards;
assert.strictEqual(day4.find(r => r.id === 1).count, 280000);
assert.strictEqual(day4.find(r => r.id === 90077).count, 3);
assert.strictEqual(day4.find(r => r.id === 89).count, 70);

// Top 5: 50.000 diamond, 3 boxes, 60 tokens
const day5 = topCombatDay[5].rewards;
assert.strictEqual(day5.find(r => r.id === 1).count, 50000);
assert.strictEqual(day5.find(r => r.id === 90077).count, 3);
assert.strictEqual(day5.find(r => r.id === 89).count, 60);

// Top 6-10: 50.000 diamond, 3 boxes, 50 tokens
const day6 = topCombatDay[6].rewards;
assert.strictEqual(day6.find(r => r.id === 1).count, 50000);
assert.strictEqual(day6.find(r => r.id === 90077).count, 3);
assert.strictEqual(day6.find(r => r.id === 89).count, 50);

// Top 11-20: 50.000 diamond, 2 boxes, 40 tokens
const day7 = topCombatDay[7].rewards;
assert.strictEqual(day7.find(r => r.id === 1).count, 50000);
assert.strictEqual(day7.find(r => r.id === 90077).count, 2);
assert.strictEqual(day7.find(r => r.id === 89).count, 40);

// Top 21-50: 50.000 diamond, 2 boxes, 30 tokens
const day8 = topCombatDay[8].rewards;
assert.strictEqual(day8.find(r => r.id === 1).count, 50000);
assert.strictEqual(day8.find(r => r.id === 90077).count, 2);
assert.strictEqual(day8.find(r => r.id === 89).count, 30);

// Top 51-500: 10.000 diamond, 2 boxes, 20 tokens
const day9 = topCombatDay[9].rewards;
assert.strictEqual(day9.find(r => r.id === 1).count, 10000);
assert.strictEqual(day9.find(r => r.id === 90077).count, 2);
assert.strictEqual(day9.find(r => r.id === 89).count, 20);

// Top 501+: 10.000 diamond, 2 boxes, 10 tokens
const day10 = topCombatDay[10].rewards;
assert.strictEqual(day10.find(r => r.id === 1).count, 10000);
assert.strictEqual(day10.find(r => r.id === 90077).count, 2);
assert.strictEqual(day10.find(r => r.id === 89).count, 10);
console.log('Test 2 PASS: TopCombat Day rewards match all expected values');

console.log('=== TEST 3: Check TopCombat Weekly Reward values ===');
// Top 1: 2.000.000 diamond, 20 boxes, title 11221, 1000 tokens
const w1 = topCombatWeek[1].rewards;
assert.strictEqual(w1.find(r => r.id === 1).count, 2000000);
assert.strictEqual(w1.find(r => r.id === 90077).count, 20);
assert.strictEqual(w1.find(r => r.id === 11221).count, 1);
assert.strictEqual(w1.find(r => r.id === 89).count, 1000);

// Top 2: 1.500.000 diamond, 16 boxes, title 11222, 900 tokens
const w2 = topCombatWeek[2].rewards;
assert.strictEqual(w2.find(r => r.id === 1).count, 1500000);
assert.strictEqual(w2.find(r => r.id === 90077).count, 16);
assert.strictEqual(w2.find(r => r.id === 11222).count, 1);
assert.strictEqual(w2.find(r => r.id === 89).count, 900);

// Top 3: 1.000.000 diamond, 10 boxes, title 11223, 800 tokens
const w3 = topCombatWeek[3].rewards;
assert.strictEqual(w3.find(r => r.id === 1).count, 1000000);
assert.strictEqual(w3.find(r => r.id === 90077).count, 10);
assert.strictEqual(w3.find(r => r.id === 11223).count, 1);
assert.strictEqual(w3.find(r => r.id === 89).count, 800);

// Top 4: 800.000 diamond, 6 boxes, 700 tokens
const w4 = topCombatWeek[4].rewards;
assert.strictEqual(w4.find(r => r.id === 1).count, 800000);
assert.strictEqual(w4.find(r => r.id === 90077).count, 6);
assert.strictEqual(w4.find(r => r.id === 89).count, 700);

// Top 5: 600.000 diamond, 6 boxes, 600 tokens
const w5 = topCombatWeek[5].rewards;
assert.strictEqual(w5.find(r => r.id === 1).count, 600000);
assert.strictEqual(w5.find(r => r.id === 90077).count, 6);
assert.strictEqual(w5.find(r => r.id === 89).count, 600);

// Top 6-10: 400.000 diamond, 6 boxes, 500 tokens
const w6 = topCombatWeek[6].rewards;
assert.strictEqual(w6.find(r => r.id === 1).count, 400000);
assert.strictEqual(w6.find(r => r.id === 90077).count, 6);
assert.strictEqual(w6.find(r => r.id === 89).count, 500);

// Top 11-20: 300.000 diamond, 4 boxes, 400 tokens
const w7 = topCombatWeek[7].rewards;
assert.strictEqual(w7.find(r => r.id === 1).count, 300000);
assert.strictEqual(w7.find(r => r.id === 90077).count, 4);
assert.strictEqual(w7.find(r => r.id === 89).count, 400);

// Top 21-50: 200.000 diamond, 4 boxes, 300 tokens
const w8 = topCombatWeek[8].rewards;
assert.strictEqual(w8.find(r => r.id === 1).count, 200000);
assert.strictEqual(w8.find(r => r.id === 90077).count, 4);
assert.strictEqual(w8.find(r => r.id === 89).count, 300);

// Top 51-500: 100.000 diamond, 4 boxes, 200 tokens
const w9 = topCombatWeek[9].rewards;
assert.strictEqual(w9.find(r => r.id === 1).count, 100000);
assert.strictEqual(w9.find(r => r.id === 90077).count, 4);
assert.strictEqual(w9.find(r => r.id === 89).count, 200);

// Top 501+: 60.000 diamond, 4 boxes, 100 tokens
const w10 = topCombatWeek[10].rewards;
assert.strictEqual(w10.find(r => r.id === 1).count, 60000);
assert.strictEqual(w10.find(r => r.id === 90077).count, 4);
assert.strictEqual(w10.find(r => r.id === 89).count, 100);
console.log('Test 3 PASS: TopCombat Weekly rewards match all expected values');

console.log('=== TEST 4: Check CrossArena rewards are still intact ===');
assert.strictEqual(crossArenaDay[1].rewards.find(r => r.id === 1).count, 400000);
assert.strictEqual(crossArenaDay[1].rewards.find(r => r.id === 90077).count, 10);
assert.strictEqual(crossArenaWeek[1].rewards.find(r => r.id === 1).count, 2000000);
assert.strictEqual(crossArenaWeek[1].rewards.find(r => r.id === 90077).count, 20);
console.log('Test 4 PASS: CrossArena rewards remain intact');

console.log('=== TEST 5: Verify other critical tables are intact ===');
config.validateGameplayTables(config.loadAllTables());
console.log('Test 5 PASS: Gameplay tables valid');

console.log('\n>>> ALL 5 TESTS PASSED SUCCESSFULLY! <<<');
