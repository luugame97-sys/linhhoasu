'use strict';

// RAM-only regression: arrival -> pending terminal event -> terminal resolve
// must settle once, even when the client never sends a second 7005.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const now = Date.parse('2026-09-25T00:00:00+07:00');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const loadTable = name => JSON.parse(fs.readFileSync(path.join(app, 'scripts/_tables_dump', `${name}.json`))).data;
const tables = Object.fromEntries([
  'OldTrekBaseConfig', 'OldTrekDestinationConfig', 'OldTrekPassShowConfig',
  'OldTrekStableConfig', 'OldTrekSailorConfig',
].map(name => [name, loadTable(name)]));

let saved;
let spawnCount = 0;
const schedule = { seasonNumber: 1, stage: 2, isDepartAllowed: true, seasonEnd: now + 6 * 86400000, matchId: 2, totalSeason: 2 };
const playerMutation = require(path.join(app, 'src/services/PlayerMutationService'));
const ledger = require(path.join(app, 'src/services/OldTrekLedgerService'));
const eventService = {
  spawn(info) {
    const trek = info.sailInfo && info.sailInfo.trekData;
    if (!trek || trek.dist < 2400 || info.sailInfo.currentEvent) return null;
    const event = { uid: 9001, id: 2, pre: -1, createdAt: now, trekUid: trek.uid, season: info.season, policyVersion: 'test' };
    info.sailInfo.currentEvent = event;
    spawnCount += 1;
    return event;
  },
  resolve(info, params) {
    assert.equal(Number(params.eventUid), 9001);
    const event = info.sailInfo.currentEvent;
    info.sailInfo.currentEvent = null;
    info.stateRevision = Number(info.stateRevision || 0) + 1;
    return {
      ok: true, replayed: false, event: null, lastLog: { uid: event.uid, id: event.id, result: 0 },
      rewardRows: [{ id: 331, count: 100 }], itemUpdate: [], check: [], battleLog: null, battleResult: null,
      shipExp: 0, terminal: true,
    };
  },
};
const deps = {
  '../services/ConfigService': { get: name => tables[name] || {} },
  '../services/OldTrekScheduleService': { getSchedule: () => schedule },
  '../services/PlayerMutationService': playerMutation,
  '../services/OldTrekLedgerService': ledger,
  '../services/OldTrekEventService': eventService,
  '../services/OldTrekArenaService': {},
  '../services/CurrencySync': require(path.join(app, 'src/services/CurrencySync')),
  '../services/OldTrekProgressService': require(path.join(app, 'src/services/OldTrekProgressService')),
  'node:crypto': require('node:crypto'),
  '../services/PlayerService': { savePlayer: async (_id, player) => {
    saved = JSON.parse(JSON.stringify(player));
    return player;
  } },
  './raid': { addRewardToPlayer: (player, id, count) => {
    player.items[id] = (player.items[id] || 0) + count;
  } },
};
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(app, 'src/handlers/old-trek.js'), 'utf8'), {
  Date: Clock,
  process: { env: { OLD_TREK_EVENT_ENGINE_ENABLED: '1' } },
  module: mod,
  exports: mod.exports,
  require: name => {
    if (!(name in deps)) throw Error(`Unexpected dependency ${name}`);
    return deps[name];
  },
});
const handler = mod.exports;
const fresh = () => {
  const player = { userId: 'ram-only', playerId: '1', name: 'ram', level: 100, items: {}, currencies: { diamond: 1000 } };
  handler.ensureOldTrekInfo(player);
  return { userId: player.userId, player };
};
const info = session => session.player.other_attr_info.oldTrekInfo;
const action = (session, tag, params = {}) => handler.handleOldTrekAction(tag, params, session, 2);
const data = result => (Array.isArray(result) ? result[0] : result).data;

(async () => {
  const session = fresh();
  assert.equal(data(await handler.handleOldTrekInfo({ id: 1, diff: 1 }, session, 1)).result, 0);
  const trek = info(session).sailInfo.trekData;
  trek.dist = 2400;

  const pending = await action(session, 7005, { uid: trek.uid });
  assert.equal(data(pending).result, 0);
  assert.equal(data(pending).pendingEvent, true);
  assert.equal(spawnCount, 1);
  assert.equal(info(session).sailing, true);

  const resolved = await action(session, 7002, { eventUid: 9001, operate: 0, param: 0 });
  const packets = Array.isArray(resolved) ? resolved : [resolved];
  assert.ok(packets.some(packet => packet.tag === 7010), 'terminal event must emit settlement packet');
  assert.equal(info(session).sailing, false);
  assert.equal(info(session).sailInfo.trekData, null);
  assert.equal(session.player.items[331], 340);
  assert.equal(session.player.items[339], 50000);

  const retry = await action(session, 7005, { uid: trek.uid });
  assert.equal(data(retry).replayed, true);
  assert.equal(session.player.items[339], 50000);
  assert.ok(saved);
  console.log(JSON.stringify({ status: 'PASS', checks: 8, productionWrites: 0, networkAttempts: 0 }));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
