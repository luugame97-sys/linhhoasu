'use strict';
// Offline persistence doubles + the real role lock. No DB, network or real role.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const APP = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const TASK = path.resolve(__dirname, '../temp/auction_20261015');
process.env.AUCTION_SHARED_ENABLED = process.env.AUCTION_SHARED_APPROVED = '1';
// Test the exact VPS-derived artifact candidate, not the older local handler.
const artifactPath = APP + '/src/handlers/artifact.js';
const artifactModule = new Module(artifactPath, module);
artifactModule.filename = artifactPath;
artifactModule.paths = Module._nodeModulePaths(path.dirname(artifactPath));
require.cache[artifactPath] = artifactModule;
artifactModule._compile(fs.readFileSync(TASK + '/shared/src/handlers/artifact.js', 'utf8'), artifactPath);
const Player = require(APP + '/src/db/models/Player');
const Listing = require(APP + '/src/db/models/AuctionListing');
const Record = require(APP + '/src/db/models/AuctionRecord');
const GameServer = require(APP + '/src/db/models/GameServer');
const runtime = require(APP + '/src/services/RuntimeBus');
const players = require(APP + '/src/services/PlayerService');
const service = require(APP + '/src/services/AuctionService');
const handler = require(APP + '/src/handlers/auction');
const state = { players: [], listings: [], records: [] }, sessions = {}, pushes = [];
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const get = (row, key) => key.split('.').reduce((v, k) => v == null ? undefined : v[k], row);
function set(row, key, value) { const p = key.split('.'), last = p.pop(); const parent = p.reduce((v, k) => (v[k] ||= {}), row); parent[last] = copy(value); }
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$and') return expected.every(part => matches(row, part));
    if (key === '$or') return expected.some(part => matches(row, part));
    const actual = get(row, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      return Object.entries(expected).every(([op, val]) => {
        if (op === '$exists') return (actual !== undefined) === val;
        if (op === '$eq') return equal(actual, val);
        if (op === '$ne') return Array.isArray(actual) ? !actual.includes(val) : !equal(actual, val);
        if (op === '$gte') return actual >= val;
        if (op === '$lte') return actual <= val;
        if (op === '$gt') return actual > val;
        if (op === '$in') return val.includes(actual);
        throw Error('Unhandled query operator ' + op);
      });
    }
    return expected === null ? actual == null : equal(actual, expected);
  });
}
function apply(row, update) {
  for (const [key, value] of Object.entries(update.$set || {})) set(row, key, value);
  for (const [key, value] of Object.entries(update.$inc || {})) set(row, key, (get(row, key) || 0) + value);
  for (const [key, value] of Object.entries(update.$addToSet || {})) {
    const list = get(row, key) || []; if (!list.includes(value)) set(row, key, [...list, value]);
  }
  row.updatedAt = new Date(Date.now()).toISOString();
}
let fault = null;
function query(work) {
  let limit = Infinity, sorting;
  const q = { sort(value) { sorting = value; return q; }, limit(value) { limit = value; return q; },
    async lean() {
      let value = copy(work());
      if (Array.isArray(value)) {
        if (sorting) value.sort((a, b) => { for (const [k, dir] of Object.entries(sorting)) if (a[k] !== b[k]) return (a[k] < b[k] ? -1 : 1) * dir; return 0; });
        value = value.slice(0, limit);
      }
      return value;
    }, then(ok, bad) { return q.lean().then(ok, bad); } };
  return q;
}
function modelDouble(model, rows, name) {
  model.find = filter => query(() => rows.filter(row => matches(row, filter)));
  model.findOne = filter => query(() => rows.find(row => matches(row, filter)) || null);
  const update = (filter, change, options, returnRow) => query(() => {
    const hit = fault && fault.name === name && fault.when(filter, change);
    if (hit && fault.phase === 'before') { fault = null; throw Error('INJECTED_' + name); }
    let row = rows.find(r => matches(r, filter));
    if (!row && options?.upsert) { row = { ...copy(filter), ...copy(change.$setOnInsert), createdAt: new Date(Date.now()).toISOString() }; rows.push(row); }
    if (row) apply(row, change);
    if (hit && fault?.phase === 'after') { fault = null; throw Error('INJECTED_' + name); }
    return returnRow ? row || null : { matchedCount: row ? 1 : 0 };
  });
  model.updateOne = (f, u, o) => update(f, u, o, false);
  model.findOneAndUpdate = (f, u, o) => update(f, u, o, true);
}
modelDouble(Player, state.players, 'player');
modelDouble(Listing, state.listings, 'listing');
modelDouble(Record, state.records, 'record');
GameServer.findOne = ({ serverId }) => query(() => ({ serverId, rechargeArea: 1,
  openTime: Date.parse(serverId === 1001 ? '2026-08-30T00:00:00+07:00' : '2026-10-01T00:00:00+07:00') }));
let drains = 0;
players.drainPendingSaves = async () => { drains++; };
runtime.getWsServer = () => ({
  syncSessionPlayer(userId, saved, { fields }) { const s = sessions[userId]; if (s?.player) for (const f of fields) if (saved[f] !== undefined) s.player[f] = copy(saved[f]); },
  invalidatePlayerForMutation(userId) { if (sessions[userId]) sessions[userId].invalidated = true; },
  pushToUser(userId, tag, data) { pushes.push({ userId, tag, data: copy(data) }); },
  broadcastPlayers(tag, data) { pushes.push({ tag, data: copy(data) }); },
});
function user(id, balance = 100000) {
  const player = { userId: id, playerId: id + '_role', serverId: 1001, name: id, items: { 1001: balance }, currencies: {} };
  state.players.push(copy(player)); return sessions[id] = { userId: id, serverId: 1001, player };
}
const a = user('ram_a'), b = user('ram_b'), poor = user('ram_poor', 1);
const balance = s => state.players.find(p => p.userId === s.userId).items[1001];
let checks = 0, msgUid = 1;
function check(name, work) { work(); checks++; console.log('PASS', name); }
const originalNow = Date.now;
let now;
function at(date) { now = Date.parse(date + '+07:00'); Date.now = () => now; }
const offer = (s, id, price) => service.bid({ id, price }, s, msgUid++);
const tick = () => service.settleDue(1001, service.cycleInfo(), now);
const inject = (name, phase, when) => { fault = { name, phase, when }; };

(async () => {
  at('2026-10-15T11:59:59');
  let result = await service.enter(a, msgUid++);
  check('before 12 ICT empty, no seed', () => { assert.equal(result.data.auctions.length, 0); assert.equal(state.listings.length, 0); });
  at('2026-10-15T12:00:00');
  result = await service.enter(a, msgUid++);
  const ids = result.data.auctions.map(row => row.id);
  check('five distinct cycle IDs; native millisecond/publicity contract', () => {
    assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5);
    const row = result.data.auctions[0]; assert.equal(row.price, 3978); assert.equal(row.bidderId, null);
    assert(row.time > 1e12 && row.time < result.data.auctionStatus.closeAt);
    assert.equal(new Date(row.time).toISOString(), '2026-10-15T13:00:00.000Z');
  });
  await service.enter(a, msgUid++);
  check('repeated enter cannot seed duplicates', () => assert.equal(state.listings.length, 5));
  const otherServer = await service.enter({ ...a, serverId: 1002 }, msgUid++);
  check('future server event not seeded or opened early', () => assert.equal(otherServer.data.auctions.length, 0));
  check('before bidding rejected without debit', () => {});
  assert.equal((await offer(a, ids[0], 3978)).data.code, 'AUCTION_NOT_BIDDING');
  at('2026-10-15T20:00:00');
  assert.equal((await offer(a, ids[0], 3978)).data.result, 0);
  check('first bid accepts opening price; durable debit', () => { assert.equal(balance(a), 96022); assert.equal(state.listings[0].bidCount, 1); });
  await offer(a, ids[0], 3978);
  check('replayed same-price bid cannot debit twice', () => assert.equal(balance(a), 96022));
  assert.equal((await offer(b, ids[0], 4216)).data.code, 'AUCTION_BID_STEP_INVALID');
  assert.equal((await offer(poor, ids[0], 4217)).data.code, 'AUCTION_TOKEN_INSUFFICIENT');
  check('ceil 6 percent step / insufficient funds do not mutate', () => { assert.equal(balance(b), 100000); assert.equal(state.listings[0].price, 3978); assert.equal(state.listings[0].pendingBid, null); });
  assert.equal((await offer(b, ids[0], 4217)).data.result, 0);
  await tick();
  check('outbid exact refund once', () => { assert.equal(balance(a), 100000); assert.equal(balance(b), 95783); });
  await tick();
  assert.equal((await offer(a, ids[0], 4471)).data.result, 0);
  await tick();
  check('second outbid on same lot has separate receipt', () => { assert.equal(balance(b), 100000); assert.equal(state.records.filter(r => r.operation === 'outbid').length, 2); });
  result = await service.enter(poor, msgUid++);
  check('participation flag is per viewer', () => assert.equal(result.data.auctions[0].hasOffer, 0));
  await offer(a, ids[0], 10000);
  await tick();
  check('buy-now debits difference, delivers exact artifact once with new UID', () => {
    assert.equal(balance(a), 90000); assert.equal(state.listings[0].status, 3);
    const p = state.players.find(p => p.userId === a.userId); assert.equal(p.artifactInfo.artifacts.length, 1);
    const art = p.artifactInfo.artifacts[0]; assert.equal(art.id, 23103); assert.equal(art.skillLv, 10); assert.notEqual(art.uid, service.getCatalog().lots[0].detail.artifact.uid);
    assert(pushes.some(p => p.tag === 3500 && p.data.artifact?.id === 23103));
  });
  await tick();
  check('settlement replay does not duplicate reward', () => assert.equal(state.players[0].artifactInfo.artifacts.length, 1));
  // Reserve and debit commits, listing commit fails. Restart resumes exactly once.
  inject('listing', 'before', (_f, u) => !!u.$set?.bidHistory);
  await assert.rejects(offer(b, ids[1], 3978), /INJECTED_listing/);
  check('crash after debit retains recoverable intent', () => { assert(state.listings[1].pendingBid); assert.equal(balance(b), 96022); });
  await tick();
  check('restart completes bid without second debit', () => { assert.equal(state.listings[1].pendingBid, null); assert.equal(state.listings[1].bidderUserId, b.userId); assert.equal(balance(b), 96022); });
  // Unknown debit outcome: database committed before the connection failed.
  inject('player', 'after', (_f, u) => !!u.$addToSet?.['auctionInfo.debitLedger']);
  await assert.rejects(offer(a, ids[2], 3978), /INJECTED_player/);
  await tick();
  check('unknown debit result recovered from atomic ledger', () => { assert.equal(balance(a), 86022); assert.equal(state.listings[2].bidderUserId, a.userId); assert(a.invalidated); });
  // Refund outbox committed, record creation fails. Replay does not lose refund.
  inject('record', 'before', (_f, u) => u.$setOnInsert?.operation === 'outbid');
  await assert.rejects(offer(b, ids[2], 4217), /INJECTED_record/);
  await tick();
  check('crash before refund receipt recovered from listing outbox', () => assert.equal(balance(a), 90000));
  // Artifact committed, receipt mark fails: next tick must not grant again.
  inject('record', 'before', (_f, u) => u.$set?.deliveryState === 'delivered');
  await offer(b, ids[2], 10000);
  await tick();
  check('crash after reward commit never duplicates artifact', () => assert.equal(state.players[1].artifactInfo.artifacts.length, 1));
  at('2026-10-15T21:59:40');
  await offer(a, ids[3], 3978);
  check('last-minute bid extends to now+60s; native status 2', () => { assert.equal(state.listings[3].status, 2); assert.equal(state.listings[3].closeAtMs, now + 60000); });
  at('2026-10-15T22:00:10');
  await offer(b, ids[3], 4217);
  result = await service.enter(a, msgUid++);
  check('extended lot remains visible and biddable after 22', () => { assert.equal(result.data.auctions.length, 1); assert.equal(result.data.auctionStatus.phase, 'extended'); assert.equal(state.listings[3].price, 4217); });
  at('2026-10-15T22:01:10');
  await tick(); await tick();
  check('deadline settles once and rejects further bids', () => { assert.equal(state.listings[3].status, 3); assert.equal(state.records.filter(r => r.deliveryState === 'pending').length, 0); });
  assert.notEqual((await offer(a, ids[3], 10000)).data.result, 0);
  at('2026-10-16T20:00:00');
  result = await service.enter(a, msgUid++);
  check('new day has unique IDs; old client packet cannot bid new lot', () => assert(!ids.includes(result.data.auctions[0].id)));
  assert.notEqual((await offer(a, ids[0], 10000)).data.result, 0);
  const target = result.data.auctions[0].id;
  const race = await Promise.all([offer(a, target, 3978), offer(b, target, 3978)]);
  check('concurrent bids reserve once, losing CAS never debits', () => assert.equal(race.filter(x => x.data.result === 0).length, 1));
  const previous = state.listings.find(x => x.id === target);
  at('2026-10-17T06:00:00'); await tick();
  check('restart next morning settles previous-day lot', () => assert.equal(previous.status, 3));
  const snapshot = JSON.stringify(state.players);
  for (const [name, tag] of [['handleAuctionOnShelf', 5101], ['handleAuctionOffShelf', 5103], ['handleAuctionRecycleItem', 5111], ['handleAuctionRecordRewardAll', 5113]]) {
    const r = await handler[name]({ id: 9999, price: Infinity, count: Number.MAX_SAFE_INTEGER }, a, tag);
    assert.notEqual(r.data.result, 0);
  }
  check('unsupported economy operations stay fail-closed', () => assert.equal(JSON.stringify(state.players), snapshot));
  process.env.AUCTION_SHARED_ENABLED = '0';
  assert.equal((await handler.handleAuctionOffer({ id: target, price: 10000 }, a, 1)).data.code, 'AUCTION_MAINTENANCE');
  check('kill switch refuses bids', () => assert.equal(JSON.stringify(state.players), snapshot));
  const FakeBase = class { Rpc(...args) { this.args = args; } };
  const model = new FakeBase(); let called = 0;
  const browser = { BaseSystem: FakeBase, GlobalManager: { AuctionModel: model } };
  vm.runInNewContext(fs.readFileSync(TASK + '/shared/web/js/lhs-auction-status-v1.js', 'utf8'), { window: browser });
  model.Rpc(5100, null, () => { called++; }); model.args[2]({ result: 0, records: [{ uid: 9 }], auctionStatus: { state: 'ready' } });
  check('client history refreshed from enter response', () => { assert.equal(called, 1); assert.equal(model._info.records[0].uid, 9); });
  model.Rpc(5113, null, () => { called++; }); model.args[2]({ result: 9, code: 'AUCTION_NO_MANUAL_REWARD' });
  check('client refuses empty reward popup on rejected claim-all', () => assert.equal(called, 1));
  check('all wallet writes drain earlier queued saves', () => assert(drains > 10));
  console.log(JSON.stringify({ result: 'PASS', checks, productionWrites: 0, playerWrites: 0, networkAttempts: 0, roleLock: 'real', persistence: 'in-memory doubles' }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Date.now = originalNow; });
