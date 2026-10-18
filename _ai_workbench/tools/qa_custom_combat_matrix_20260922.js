'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), vm = require('vm');
const root = path.resolve(__dirname, '../..'), app = path.join(root, 'linhhoasu/lhs/newServer');
const custom = require(path.join(app, 'src/services/CustomCombatService'));
const fixtures = require('../temp/combat_parity_20260922/cross_arena_case.json');
const seeded = seed => { let s = Math.imul(seed, 2654435761) >>> 0; return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296); };
const rows = [];
for (const row of fixtures.fights) {
  for (const reverse of [false, true]) {
    const a = reverse ? row.defAttr : row.atkAttr, d = reverse ? row.atkAttr : row.defAttr;
    const summary = { receipt: row.id, reverse, attacker: reverse ? row.defender.name : row.attacker.name, defender: reverse ? row.attacker.name : row.defender.name, wins: 0, timeouts: 0, noDamage: 0, rounds: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const result = custom.simulateBattle(a, d, { mode: 'crossArena', rng: seeded(seed) });
      assert(result.totalRounds <= 15 && Number.isSafeInteger(result.playerDamage));
      summary.wins += Number(result.win); summary.timeouts += Number(result.resolution !== 'knockout');
      summary.noDamage += Number(result.playerDamage === 0 && result.monsterDamage === 0);
      summary.rounds += result.totalRounds;
    }
    rows.push(summary);
  }
}
const baseline = fs.readFileSync(path.join(root, '_ai_workbench/backups/custom_combat_v1_20260922/BattleService.js'), 'utf8');
const current = fs.readFileSync(path.join(app, 'src/services/BattleService.js'), 'utf8');
// Same dependencies and RNG on both sides; verify PVE/default PVP remains untouched.
const cfg = { get: name => name === 'ConstConfig' ? { fightMaxRound: 15 } : {} };
function execute(source, a, d, options) {
  const math = Object.create(Math); math.random = seeded(71);
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Math: math, require: name => {
    if (name === './ConfigService') return cfg;
    if (name === './CustomCombatService') return custom;
    throw Error('Unexpected dependency ' + name);
  } });
  return JSON.parse(JSON.stringify(module.exports.simulateBattle(a, d, options)));
}
let legacyParity = 0;
for (const row of fixtures.fights) for (const options of [{}, { isPvp: true }, { enforcePlayerMonsterMinDamage: true }]) {
  assert.deepEqual(execute(current, row.atkAttr, row.defAttr, options), execute(baseline, row.atkAttr, row.defAttr, options)); legacyParity++;
}
const result = { at: new Date().toISOString(), rulesVersion: custom.VERSION, matches: rows.length * 200, legacyParity, rows, productionWrites: 0 };
fs.writeFileSync(path.join(root, '_ai_workbench/temp/combat_parity_20260922/custom_matrix.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ result: 'PASS', matches: result.matches, legacyParity, exactPair: rows.slice(0, 2), noDamage: rows.reduce((s,r) => s+r.noDamage,0) }));
