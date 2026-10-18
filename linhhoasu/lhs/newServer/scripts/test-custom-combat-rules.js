'use strict';
const assert = require('node:assert/strict');
const c = require('../src/services/CustomCombatService');
const base = () => ({ 1: 10000, 2: 400, 3: 100, 4: 100 });
function rng(seed) {
  let s = (Math.imul(seed, 2654435761) >>> 0);
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const run = (a, b, extra = {}) => c.simulateBattle(a, b, { rng: rng(123), ...extra });
let checks = 0;
function test(name, f) { f(); checks++; }
function replay(a, b, result) {
  const hp = { player: a[1], monster: b[1] }, max = { ...hp };
  const totals = { player: 0, monster: 0 };
  for (const round of result.rounds) {
    for (const action of round.actions) {
      if (['attack', 'counter', 'heal'].includes(action.kind)) assert(hp[action.caster] > 0, 'dead actor acts');
      if (['attack', 'counter'].includes(action.kind)) {
        assert(hp[action.target] > 0);
        assert(Number.isSafeInteger(action.damage) && action.damage > 0);
        hp[action.target] -= action.damage;
        totals[action.caster] += action.damage;
        assert.equal(hp[action.target], action.targetHp);
      } else if (action.kind === 'heal') {
        assert(action.value > 0);
        hp[action.target] += action.value;
        assert.equal(hp[action.target], action.targetHp);
      }
      for (const side of ['player', 'monster']) assert(hp[side] >= 0 && hp[side] <= max[side]);
    }
    assert.equal(round.playerHP, hp.player);
    assert.equal(round.monsterHP, hp.monster);
  }
  assert.equal(result.playerHPLeft, hp.player);
  assert.equal(result.monsterHPLeft, hp.monster);
  assert.equal(result.playerDamage, totals.player);
  assert.equal(result.monsterDamage, totals.monster);
  if (result.resolution === 'knockout') assert.equal(result.win, hp.player > 0 && hp.monster === 0);
  if (result.resolution === 'timeout-hp-ratio') assert.equal(result.win, hp.player / max.player > hp.monster / max.monster);
}
test('probability finite, monotone, resisted, saturated not certain', () => {
  for (const cap of Object.values(c.RULES.caps)) {
    let previous = 0;
    for (const n of [0, 1, 100, 10000, 100000, 1e12]) {
      const p = c.procProbability(n, 0, cap);
      assert(p >= previous && p < cap); previous = p;
      assert.equal(c.procProbability(n, n, cap), 0);
    }
  }
});
test('input unchanged and deterministic seed', () => {
  const a = base(), b = base(), saved = JSON.stringify([a, b]);
  assert.deepEqual(run(a, b), run(a, b)); assert.equal(JSON.stringify([a, b]), saved);
});
test('invalid numeric inputs and RNG reject', () => {
  for (const v of [NaN, Infinity, -1, 1e12 + 1]) assert.throws(() => run({ ...base(), 2: v }, base()));
  assert.throws(() => run({ ...base(), 1: 0 }, base()));
  for (const v of [-1, 1, NaN]) assert.throws(() => run(base(), base(), { rng: () => v }));
  for (const n of [0, 101, 1.5]) assert.throws(() => run(base(), base(), { maxRounds: n }));
});
test('critical uses202/222, not pet suppression205', () => {
  const a = { ...base(), 4: 200, 105: 10000 }, b = base(), opt = { rng: () => 0, maxRounds: 1 };
  const damage = (atk, def) => run(atk, def, opt).rounds[0].playerDmg;
  assert(damage({ ...a, 202: 5000 }, b) > damage(a, b));
  assert(damage(a, { ...b, 222: 5000 }) < damage(a, b));
  assert.equal(damage({ ...a, 205: 5000 }, b), damage(a, b));
});
test('element5/6 and final241/242 act, resistance171 does not damage', () => {
  const a = { ...base(), 4: 200 }, b = base(), opt = { rng: () => 0.99, maxRounds: 1 };
  const dmg = (x, y) => run(x, y, opt).rounds[0].playerDmg;
  assert(dmg({ ...a, 5: 1000 }, b) > dmg(a, b));
  assert(dmg({ ...a, 5: 1000 }, { ...b, 6: 5000 }) < dmg({ ...a, 5: 1000 }, b));
  assert(dmg({ ...a, 241: 2000 }, b) > dmg(a, b));
  assert(dmg(a, { ...b, 242: 2000 }) < dmg(a, b));
  assert.equal(dmg({ ...a, 171: 5000 }, b), dmg(a, b));
});
test('mode bonus does not leak into other modes', () => {
  const a = { ...base(), 533: 5000 }, b = base();
  assert.deepEqual(run(a, b), run(base(), b));
  assert(run(a, b, { mode: 'crossArena' }).playerDamage > run(base(), b, { mode: 'crossArena' }).playerDamage);
});
test('counter interrupts combo and dead attacker cannot attack again', () => {
  const a = { ...base(), 1: 10, 4: 200, 103: 10000 }, b = { ...base(), 2: 10000, 102: 10000 };
  const result = run(a, b, { rng: () => 0 }); replay(a, b, result);
  assert.equal(result.rounds[0].actions.filter(x => x.kind === 'attack' && x.caster === 'player').length, 1);
  assert.equal(result.win, false);
});
test('stun blocks counter and cannot permanently lock defender', () => {
  const a = { ...base(), 4: 200, 106: 10000 }, b = { ...base(), 102: 10000 };
  const result = run(a, b, { rng: () => 0, maxRounds: 4 });
  assert(!result.rounds[0].actions.some(x => x.kind === 'counter'));
  assert(result.rounds[0].actions.some(x => x.kind === 'skip'));
  assert(result.rounds[1].actions.some(x => x.kind === 'attack' && x.caster === 'monster'));
});
test('lifesteal bypasses evade but full HP emits no fake heal', () => {
  const a = { ...base(), 4: 200, 101: 10000 }, b = { ...base(), 104: 10000 };
  const result = run(a, b, { rng: () => 0, maxRounds: 1 });
  assert(result.rounds[0].actions.some(x => x.kind === 'attack' && x.caster === 'player'));
  assert(!result.rounds[0].actions.some(x => x.kind === 'heal'));
});
test('timeout compares HP ratio, does not fabricate a kill', () => {
  const a = { ...base(), 2: 1000 }, b = base();
  const r = run(a, b, { maxRounds: 1 });
  assert.equal(r.resolution, 'timeout-hp-ratio'); assert.equal(r.win, true);
  assert(r.monsterHPLeft > 0); replay(a, b, r);
});
test('exact tie has explicit symmetric tiebreak', () => {
  const a = { ...base(), 2: 0 }, b = { ...base(), 2: 0 };
  const yes = run(a, b, { rng: () => 0.1, maxRounds: 1 });
  const no = run(a, b, { rng: () => 0.9, maxRounds: 1 });
  assert.equal(yes.resolution, 'timeout-tiebreak'); assert.equal(yes.win, true); assert.equal(no.win, false);
});
const builds = {
  plain: base(), evade: { ...base(), 104: 40000 }, antiEvade: { ...base(), 154: 40000 },
  combo: { ...base(), 103: 40000 }, counter: { ...base(), 102: 40000 },
  crit: { ...base(), 105: 40000, 202: 5000 }, heal: { ...base(), 101: 40000 },
  stun: { ...base(), 106: 40000 },
};
const matrix = [];
test('build matrix and event conservation, 6400 battles', () => {
  for (const [an, a] of Object.entries(builds)) for (const [bn, b] of Object.entries(builds)) {
    let wins = 0, timeouts = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const result = run(a, b, { rng: rng(seed) }); replay(a, b, result);
      wins += Number(result.win); timeouts += Number(result.resolution !== 'knockout');
    }
    matrix.push({ attacker: an, defender: bn, wins, matches: 100, timeouts });
  }
  for (const row of matrix.filter(r => r.attacker === r.defender)) assert(row.wins >= 30 && row.wins <= 70, JSON.stringify(row));
});
test('numeric max values remain bounded and replayable', () => {
  const a = { 1: 1e12, 2: 1e12, 3: 1e12, 4: 1e12, 5: 1e12, 6: 1e12, 101: 1e12, 103: 1e12, 105: 1e12 };
  const r = run(a, a); replay(a, a, r);
});
console.log(JSON.stringify({ result: 'PASS', checks, matrix, productionWrites: 0 }));
