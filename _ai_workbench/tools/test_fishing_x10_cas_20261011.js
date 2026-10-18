'use strict';
// Isolated RAM test: exercises the purchase CAS contract without Mongo or a
// production player. The save stub behaves like updateOne matchedCount=0 on a
// conflict and records the options passed by FishingX10Service.
const assert = require('assert');
const path = require('path');
process.env.SERVER_ID = '1001';
const app = process.env.APP_ROOT || path.join(process.cwd(), 'linhhoasu/lhs/newServer');
const players = require(path.join(app, 'src/services/PlayerService.js'));
const service = require(path.join(app, 'src/services/FishingX10Service.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const base = () => ({ userId: 'qa-fishing-x10-cas', serverId: 1001, level: 100,
  items: { 1001: 2400 }, currencies: {}, systemUnlockInfo: { unlockedSystem: [215] },
  rechargeInfo: { monthCards: {}, records: [] }, other_attr_info: {} });
const session = p => ({ userId: p.userId, serverId: 1001, player: p });
const req = id => ({ id: 11000022, multi: 1, requestId: `${Date.now()}-cas_${id}` });
const ack = out => (Array.isArray(out) ? out : [out]).find(row => row.tag === 1230).data;
let durable;
let saveMode;
let saveOptions;
players.drainPendingSaves = async () => {};
players.loadPlayer = async () => clone(durable);
players.savePlayer = async (_id, draft, options) => {
  saveOptions = options;
  if (saveMode === 'conflict') return null;
  durable = clone(draft);
  return draft;
};
async function run() {
  let p = base(); durable = clone(p); saveMode = 'conflict';
  const conflict = ack(await service.handle(req('conflict'), session(p), 1));
  assert.equal(conflict.code, 'FISH_X10_SAVE_CONFLICT');
  assert.equal(durable.items[1001], 2400, 'CAS miss must not debit');
  assert.ok(saveOptions.fishingX10CAS, 'scoped CAS option missing');
  assert.deepEqual(Object.keys(saveOptions.fishingX10CAS).sort(), ['items', 'other_attr_info', 'rechargeInfo'].sort());
  assert.equal(saveOptions.activity52CAS, undefined, 'legacy unsupported CAS must not be used');

  p = base(); durable = clone(p); saveMode = 'ok';
  const replayRequest = req('replay');
  const first = ack(await service.handle(replayRequest, session(p), 2));
  assert.equal(first.result, 0); assert.equal(durable.items[1001], 0);
  const retry = ack(await service.handle(replayRequest, session(p), 3));
  assert.equal(retry.replayed, true); assert.equal(durable.items[1001], 0, 'retry must not debit twice');
  console.log(JSON.stringify({ result: 'PASS', checks: 6, productionWrites: 0 }));
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
