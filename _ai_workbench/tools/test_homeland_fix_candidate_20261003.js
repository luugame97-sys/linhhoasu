'use strict';

// RAM-only candidate test. No Mongo, Redis, websocket, or real player writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const playerPath = require.resolve(path.join(root, 'linhhoasu/lhs/newServer/src/services/PlayerService.js'));
const modelPath = require.resolve(path.join(root, 'linhhoasu/lhs/newServer/src/db/models/Player.js'));
const busPath = require.resolve(path.join(root, 'linhhoasu/lhs/newServer/src/services/RuntimeBus.js'));
const lockPath = require.resolve(path.join(root, 'linhhoasu/lhs/newServer/src/services/PlayerMutationService.js'));
const real = new Map();
let failSave = false;
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
const playerStub = {
  drainPendingSaves: async () => undefined,
  savePlayer: async (uid, data, opts = {}) => {
    const stored = real.get(String(uid));
    if (failSave) return null;
    for (const key of ['homelandInfo', 'items', 'currencies']) {
      const expected = opts.homelandCAS && opts.homelandCAS[key];
      if (expected !== undefined && !equal(stored[key], expected)) return null;
    }
    for (const key of opts.onlyFields || []) stored[key] = clone(data[key]);
    real.set(String(uid), stored);
    return data;
  },
};
const playerModelStub = { collection: { findOne: async ({ userId }) => {
  const row = real.get(String(userId));
  return row ? { homelandInfo: clone(row.homelandInfo), items: clone(row.items), currencies: clone(row.currencies) } : null;
} } };
const busStub = { getWsServer: () => null };
const lockStub = { run: (_uid, work) => Promise.resolve().then(work) };
require.cache[playerPath] = { id: playerPath, filename: playerPath, loaded: true, exports: playerStub };
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: playerModelStub };
require.cache[busPath] = { id: busPath, filename: busPath, loaded: true, exports: busStub };
require.cache[lockPath] = { id: lockPath, filename: lockPath, loaded: true, exports: lockStub };
const homeland = require(path.join(root, 'linhhoasu/lhs/newServer/src/handlers/homeland.js'));

function player(uid = 'homeland-fixture') {
  return {
    userId: uid, playerId: uid, name: 'QA', level: 100, items: { 225: 2 },
    currencies: { diamond: 0, silver: 0, gold: 0 },
    homelandInfo: {
      lv: 1, areaLv: 1, buildingLv: { 170011: 1, 170012: 1, 170013: 1, 170021: 1, 170022: 1 },
      collectMap: {}, fetters: [], dailyLike: [], likeCount: 0,
      dailyLikeDayKey: '', statueDayKey: '', statueTributeCount: 0,
      drawDayKey: '', drawFreeCount: 0, drawLuckCount: 0,
      unlockClues: {}, visitorMap: {}, prayBuff: 0, prayAttrs: {},
      lastPrayBuff: 0, lastPrayAttrs: {}, prayDayKey: '',
      layout: {}, mapId: 1001, shareLayouts: {}, msgRecord: { leaveMsg: '', records: [] },
      likeRecord: { records: [] }, aquariumFish: [], skinId: 0,
    },
  };
}
function session(uid = 'homeland-fixture') {
  const p = player(uid); real.set(uid, clone(p)); return { userId: uid, player: p };
}
function dataOf(response, tag) {
  const rows = Array.isArray(response) ? response : [response];
  return (rows.find(row => row && row.tag === tag) || rows[rows.length - 1]).data;
}

async function main() {
  const s = session();
  const free1 = await homeland.handleHomelandDraw({ count: 1, free: 1 }, s, 1);
  const free2 = await homeland.handleHomelandDraw({ count: 1, free: 1 }, s, 2);
  const free3 = await homeland.handleHomelandDraw({ count: 1, free: 1 }, s, 3);
  assert.equal(dataOf(free1, 6708).result, 0);
  assert.equal(dataOf(free2, 6708).result, 0);
  assert.equal(dataOf(free3, 6708).code, 'HOMELAND_DRAW_FREE_LIMIT');
  assert.equal(real.get(s.userId).items[225], 2, 'free draw must not consume brush');

  const statue = await homeland.handleHomelandPayTribute({ free: 1 }, s, 4);
  assert.equal(dataOf(statue, 6707).code, 'HOMELAND_STATUE_CONVERSION_PENDING');
  assert.equal(real.get(s.userId).homelandInfo.statueTributeCount, 0);

  const concurrentA = session('same-user');
  const concurrentB = { userId: 'same-user', player: clone(concurrentA.player) };
  const results = await Promise.all([
    homeland.handleHomelandDraw({ count: 1, free: 1, requestId: 'same-req-1' }, concurrentA, 5),
    homeland.handleHomelandDraw({ count: 1, free: 1, requestId: 'same-req-1' }, concurrentB, 6),
  ]);
  const accepted = results.filter(r => dataOf(r, 6708).result === 0);
  assert.equal(accepted.length, 1, 'CAS allows only one concurrent reward');

  const failed = session('save-failure'); failSave = true;
  const before = clone(real.get(failed.userId));
  const result = await homeland.handleHomelandDraw({ count: 1, free: 1 }, failed, 7);
  assert.equal(dataOf(result, 6708).code, 'HOMELAND_SAVE_UNKNOWN');
  assert.deepEqual(real.get(failed.userId), before, 'failed save must not persist cost/reward');
  failSave = false;

  console.log(JSON.stringify({ pass: true, productionWrites: 0, networkCalls: 0,
    checks: ['draw_free_limit', 'statue_conversion_fail_closed', 'concurrent_cas', 'save_failure_no_persist'] }, null, 2));
}
main().catch(err => { console.error(err.stack); process.exitCode = 1; });
