'use strict';
const assert = require('node:assert/strict');
const battle = require('../src/services/BattleService');
const custom = require('../src/services/CustomCombatService');
const evidence = require('../../../../_ai_workbench/temp/combat_parity_20260922/cross_arena_case.json');
const exact = evidence.fights.find(row => row.defender?.name === 'FoxPlayer');
assert(exact && exact.atkAttr && exact.defAttr, 'live receipt fixture missing');
const seeded = (seed) => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
};
function run(a, d, mode = 'crossArena') {
  return battle.simulateBattle(a, d, { isPvp: true, formulaVersion: custom.VERSION, mode, rng: seeded(17) });
}
const customResult = run(exact.atkAttr, exact.defAttr);
assert.equal(customResult.rulesVersion, 'custom-pvp-v1');
assert(customResult.totalRounds >= 1 && customResult.totalRounds <= 15);
assert.notEqual(customResult.playerHPLeft, exact.atkAttr[1], 'double evade remains stuck');
assert.notEqual(customResult.monsterHPLeft, exact.defAttr[1], 'defender must take damage');
assert(['knockout', 'timeout-hp-ratio', 'timeout-tiebreak'].includes(customResult.resolution));
assert.equal(customResult.playerDamage > 0, true);
const reverse = run(exact.defAttr, exact.atkAttr);
assert.equal(reverse.rulesVersion, 'custom-pvp-v1');
assert.equal(reverse.mode, 'crossArena');
// PVE remains on its legacy route until its own formula is reviewed.
const pve = battle.simulateBattle({ 1: 10000, 2: 100, 3: 50, 4: 100 }, { 1: 10000, 2: 100, 3: 50, 4: 100 });
assert.equal(pve.rulesVersion, undefined);
assert.equal(battle.simulateBattle(exact.atkAttr, exact.defAttr, { isPvp: true }).rulesVersion, undefined);
assert.throws(() => custom.simulateBattle({ 1: 100, 2: -1 }, { 1: 100 }), /COMBAT_ATTR_VALUE_INVALID/);
assert.throws(() => custom.simulateBattle({ 1: 100 }, { 1: 100 }, { mode: 'bad' }), /COMBAT_MODE_INVALID/);
console.log(JSON.stringify({
  result: 'PASS', rulesVersion: customResult.rulesVersion,
  livePair: { attacker: exact.attacker.name, defender: exact.defender.name },
  old: { win: exact.win, atkHp: exact.atkAttr[1], defHp: exact.defAttr[1] },
  custom: { win: customResult.win, resolution: customResult.resolution, rounds: customResult.totalRounds, atkHp: customResult.playerHPLeft, defHp: customResult.monsterHPLeft },
  reverse: { win: reverse.win, resolution: reverse.resolution }, productionWrites: 0,
}));
