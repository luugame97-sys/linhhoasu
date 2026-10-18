'use strict';
const assert = require('assert');
const path = require('path');
process.env.SERVER_ID = '1001';
const app = process.env.APP_ROOT || path.join(process.cwd(), 'linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService.js'));
const players = require(path.join(app, 'src/services/PlayerService.js'));
const service = require(path.join(app, 'src/services/FishingX10Service.js'));
config.loadAllTables();
const clone = value => JSON.parse(JSON.stringify(value));
let durable = null;
players.drainPendingSaves = async () => {};
players.loadPlayer = async () => clone(durable);
players.savePlayer = async (_id, player) => { durable = clone(player); return player; };
function player(overrides = {}) {
  return { userId: 'qa-fishing-x10', serverId: 1001, level: 100,
    items: { 1001: 10000, 65: 20 }, currencies: {},
    systemUnlockInfo: { unlockedSystem: [215] },
    rechargeInfo: { monthCards: {}, records: [] }, other_attr_info: {}, ...overrides };
}
function session(p) { return { userId: p.userId, serverId: 1001, player: p }; }
function ack(out) { return (Array.isArray(out) ? out : [out]).find(row => row.tag === 1230).data; }
let seq = 0;
function req(extra = {}) { return { id: 11000022, multi: 1, requestId: `${Date.now()}-fx10_s1_${++seq}`, ...extra }; }
async function run() {
  let p = player(); durable = clone(p);
  const out = await service.handle(req(), session(p), 1); const result = ack(out);
  assert.equal(result.result, 0, JSON.stringify(result)); assert.equal(p.items[1001], 7600); assert.equal(result.tokenCount, 7600);
  assert.ok(result.expiresAt > Date.now() + 23 * 60 * 60 * 1000); assert.equal(p.rechargeInfo.monthCards[11000022], result.expiresAt);
  assert.deepEqual(result, { ...result, tokenCount: 7600 });
  p = player({ rechargeInfo: { monthCards: { 11000022: Date.now() + 3600000 }, records: [] } }); durable = clone(p);
  const before = p.items[1001]; const extended = ack(await service.handle(req(), session(p), 3));
  assert.equal(extended.result, 0); assert.equal(p.items[1001], before - 2400); assert.ok(extended.expiresAt > Date.now() + 24 * 60 * 60 * 1000);

  p = player({ serverId: 1002 }); durable = clone(p);
  assert.equal(ack(await service.handle(req(), { userId: p.userId, serverId: 1002, player: p }, 4)).code, 'FISH_X10_S1_ONLY');
  assert.equal(p.items[1001], 10000);

  p = player({ items: { 1001: 2399 } }); durable = clone(p);
  assert.equal(ack(await service.handle(req(), session(p), 5)).code, 'FISH_X10_NOT_ENOUGH_TOKEN');
  assert.equal(p.items[1001], 2399);

  p = player(); durable = clone(p); const same = req();
  const first = await service.handle(same, session(p), 6); const after = p.items[1001];
  const retry = await service.handle(same, session(p), 7); assert.equal(ack(retry).replayed, true); assert.equal(p.items[1001], after); assert.notEqual(after, 10000);

  p = player({ rechargeInfo: { monthCards: { 11000022: Date.now() - 1 }, records: [] } }); durable = clone(p);
  const status = ack(await service.handle({ query: true }, session(p), 8)); assert.equal(status.active, false); assert.equal(status.expiresAt, p.rechargeInfo.monthCards[11000022]);
  console.log(JSON.stringify({ result: 'PASS', checks: 6, productionWrites: 0 }));
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
