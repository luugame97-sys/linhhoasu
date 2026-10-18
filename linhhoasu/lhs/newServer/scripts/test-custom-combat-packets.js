'use strict';
const assert = require('node:assert/strict');
const Module = require('module');
const originalLoad = Module._load;
class SchemaStub { constructor() { this.statics = {}; this.methods = {}; } index() {} pre() {} }
SchemaStub.Types = { Mixed: class {} };
Module._load = function (request, parent, isMain) {
  if (request === 'mongoose') {
    const conn = { models: {}, model: () => ({}), useDb() { return this; } };
    return { Schema: SchemaStub, model: conn.model, connection: conn };
  }
  if (request === 'ioredis') return class {};
  if (/logger(?:\.js)?$/.test(request)) return { info() {}, warn() {}, error() {}, debug() {} };
  return originalLoad.call(this, request, parent, isMain);
};
const custom = require('../src/services/CustomCombatService');
const helpers = require('../src/handlers/arena').competitionHelpers;
const player = { _id: '111111111111111111111111', playerId: 'fixture-attacker', name: 'Fixture A', level: 100, roleInfo: { kungfuId: 4 }, petInfo: { pets: [] } };
const opponent = { dbid: '222222222222222222222222', playerId: 'fixture-defender', name: 'Fixture B', level: 100, kungfuId: 8, serverId: 1002, isRobot: false };
const a = { 1: 10000, 2: 500, 3: 100, 4: 150, 101: 10000, 106: 1000 };
const d = { 1: 10000, 2: 300, 3: 100, 4: 100, 101: 10000 };
function flatten(v, out = []) { if (Array.isArray(v)) v.forEach(x => flatten(x, out)); else if (v && typeof v === 'object') { if (v.typ !== undefined) out.push(v); if (v.es) flatten(v.es, out); } return out; }
let maxBytes = 0;
for (let seed = 1; seed <= 200; seed++) {
  let state = seed * 2654435761 >>> 0;
  const fight = custom.simulateBattle(a, d, { mode: 'crossArena', maxRounds: seed % 2 ? 1 : 15, rng: () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296) });
  const packet = helpers.buildCompetitionFightResult(player, opponent, a, d, fight, 17, 1001);
  assert.equal(packet.win, Number(fight.win));
  assert.equal(packet.damage[1], fight.playerDamage);
  assert.equal(packet.damage[-1], fight.monsterDamage);
  assert.equal(packet.combatSummary.resolution, fight.resolution);
  const events = flatten(packet.events);
  assert(events.every(x => Number.isInteger(x.typ)), 'wire event type missing');
  const hp = { 1: a[1], '-1': d[1] };
  for (const e of events) {
    // Native BDamageAction, BBuffEffectAction, BSkillChangeAttrAction all
    // mutate HP; counting both heal packets would reveal double healing.
    if ([3, 7, 9].includes(e.typ) && e.vs?.[1] !== undefined) hp[e.t] += e.vs[1];
  }
  assert.equal(hp[1], fight.playerHPLeft);
  assert.equal(hp[-1], fight.monsterHPLeft);
  if (fight.resolution !== 'knockout') assert(!events.some(e => e.typ === 6), 'timeout fabricated death');
  const compact = helpers.compactArenaFightResult(packet);
  const bytes = Buffer.byteLength(JSON.stringify(compact)); maxBytes = Math.max(bytes, maxBytes);
  const originalRandom = Math.random;
  Math.random = () => { throw Error('RECOVERY_REROLLED'); };
  let recovered;
  try { recovered = helpers.recoverArenaFightResult({ fightResult: compact, win: packet.win }, player); }
  finally { Math.random = originalRandom; }
  assert.deepEqual(recovered.events, packet.events);
  assert.deepEqual(recovered.combatSummary, packet.combatSummary);
}
assert.throws(() => helpers.compactArenaFightResult({ combatSummary: { rulesVersion: custom.VERSION }, events: ['x'.repeat(100000)] }), /TOO_LARGE/);
assert.deepEqual(helpers.compactArenaFightResult({ events: [1], win: 1 }).events, []);
assert.throws(() => helpers.recoverArenaFightResult({ win: 1, fightResult: {
  combatSummary: { rulesVersion: custom.VERSION }, atkAttr: a, defAttr: d,
  entitys: [{ showInfo: {} }, { showInfo: {} }], events: [],
} }), /REPLAY_MISSING/);
console.log(JSON.stringify({ result: 'PASS', packetRecoveryCases: 200, maxBytes, productionWrites: 0 }));
