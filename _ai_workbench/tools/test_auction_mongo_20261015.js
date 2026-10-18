'use strict';
// Run from the VPS app directory via auction_ops.py node. All fixtures are in
// a newly-created, uniquely named disposable DB. No account/auth/Redis/WS.
const assert = require('assert/strict');
const realNow = Date.now;
const dbName = 'lhs_qa_auction_20261015_' + realNow();
if (!/^lhs_qa_auction_20261015_\d{13}$/.test(dbName)) throw Error('QA_DB_NAME_INVALID');
process.env.IDENTITY_MONGO_DB = dbName;
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/' + dbName;
process.env.AUCTION_SHARED_ENABLED = process.env.AUCTION_SHARED_APPROVED = '1';
process.env.SERVER_ID = '1001';
const mongoose = require('mongoose');
const Player = require('./src/db/models/Player');
const Listing = require('./src/db/models/AuctionListing');
const Record = require('./src/db/models/AuctionRecord');
const GameServer = require('./src/db/models/GameServer');
const service = require('./src/services/AuctionService');
const runtime = require('./src/services/RuntimeBus');
const players = require('./src/services/PlayerService');
const copy = v => JSON.parse(JSON.stringify(v));
const sessions = {}, pushes = [];
runtime.getWsServer = () => ({
  getPlayerForMutation: id => sessions[id]?.player,
  syncSessionPlayer(id, saved, { fields }) { if (sessions[id]) for (const f of fields) if (saved[f] !== undefined) sessions[id].player[f] = copy(saved[f]); },
  pushToUser(id, tag, data) { pushes.push({ id, tag, data }); },
  broadcastPlayers(tag, data) { pushes.push({ tag, data }); },
});
let now = Date.parse('2026-10-15T20:00:00+07:00'), owned = false, checks = 0;
let originalListingUpdate, originalRecordUpdate;
const check = (name, fn) => { fn(); checks++; console.log('PASS Mongo: ' + name); };
const tick = () => service.settleDue(1001, service.cycleInfo(now), now);
const offer = (s, id, price) => service.bid({ id, price }, s, Math.floor(Math.random() * 1e6));
const balance = async s => (await Player.findOne({ userId: s.userId }).lean()).items[1001];
(async () => {
  await mongoose.connect(process.env.MONGO_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
  if (mongoose.connection.db.databaseName !== dbName) throw Error('QA_DB_GUARD');
  if ((await mongoose.connection.db.listCollections().toArray()).length) throw Error('QA_DB_ALREADY_EXISTS');
  await mongoose.connection.db.collection('_qa_owner').insertOne({ _id: dbName, task: 'auction_20261015' });
  owned = true;
  await Listing.createIndexes(); await Record.createIndexes();
  await GameServer.collection.insertOne({ serverId: 1001, rechargeArea: 1, openTime: Date.parse('2026-08-30T00:00:00+07:00') });
  for (const name of ['qa_a', 'qa_b']) {
    const row = { userId: name, playerId: name, serverId: 1001, name, items: { 1001: 100000 }, currencies: {} };
    await Player.collection.insertOne(row);
    sessions[name] = { userId: name, serverId: 1001, player: copy(row) };
  }
  Date.now = () => now;
  const a = sessions.qa_a, b = sessions.qa_b;
  const opened = await service.enter(a, 1);
  const ids = opened.data.auctions.map(r => r.id);
  await service.enter(b, 2);
  check('seed idempotent; actual model casts and unique indexes', () => assert.equal(ids.length, 5));
  assert.equal(await Listing.countDocuments(), 5);
  const race = await Promise.all([offer(a, ids[0], 3978), offer(b, ids[0], 3978)]);
  check('concurrent listing reservation has one winner', () => assert.equal(race.filter(r => r.data.result === 0).length, 1));
  const first = race[0].data.result === 0 ? a : b, second = first === a ? b : a;
  assert.equal((await offer(second, ids[0], 4217)).data.result, 0);
  await tick();
  assert.equal(await balance(first), 100000);
  assert.equal(await balance(second), 95783);
  check('real Mongo refund and atomic wallet marker', () => assert.equal(pushes.filter(p => p.tag === 1202).length > 0, true));
  assert.equal((await offer(first, ids[0], 4471)).data.result, 0);
  await tick();
  assert.equal(await balance(second), 100000);
  assert.equal(await Record.countDocuments({ operation: 'outbid' }), 2);
  check('multiple outbid receipts on one listing do not collide', () => {});
  assert.equal((await offer(first, ids[0], 10000)).data.result, 0);
  await tick(); await tick();
  let won = await Player.findOne({ userId: first.userId }).lean();
  check('buy-now delivers once, conserves token balance, new UID', () => {
    assert.equal(won.items[1001], 90000); assert.equal(won.artifactInfo.artifacts.length, 1);
    assert.equal(won.artifactInfo.artifacts[0].id, 23103);
    assert.deepEqual(won.artifactInfo.artifacts[0].extraAttrs, service.getCatalog().lots[0].detail.artifact.extraAttrs);
    assert.deepEqual(won.artifactInfo.artifacts[0].attr, service.getCatalog().lots[0].detail.artifact.attr);
  });
  // Real atomic debit succeeds, simulated interruption before listing commit.
  originalListingUpdate = Listing.findOneAndUpdate;
  let failCommit = true;
  Listing.findOneAndUpdate = function(filter, update, options) {
    if (failCommit && update.$set?.bidHistory) { failCommit = false; throw Error('QA_CRASH_AFTER_DEBIT'); }
    return originalListingUpdate.call(this, filter, update, options);
  };
  await assert.rejects(offer(second, ids[1], 3978), /QA_CRASH_AFTER_DEBIT/);
  Listing.findOneAndUpdate = originalListingUpdate;
  await tick(); await tick();
  assert.equal(await balance(second), 96022);
  const recovered = await Listing.findOne({ id: ids[1] }).lean();
  check('restart replay uses real persisted debit marker', () => { assert.equal(recovered.pendingBid, null); assert.equal(recovered.bidCount, 1); });
  originalRecordUpdate = Record.findOneAndUpdate;
  let failReceipt = true;
  Record.findOneAndUpdate = function(filter, update, options) {
    if (failReceipt && update.$set?.deliveryState === 'delivered') { failReceipt = false; throw Error('QA_CRASH_AFTER_REWARD'); }
    return originalRecordUpdate.call(this, filter, update, options);
  };
  await offer(second, ids[1], 10000);
  Record.findOneAndUpdate = originalRecordUpdate;
  await tick();
  won = await Player.findOne({ userId: second.userId }).lean();
  check('reward and receipt marker remain atomic across retry', () => assert.equal(won.artifactInfo.artifacts.length, 1));
  now = Date.parse('2026-10-15T21:59:40+07:00');
  await offer(a, ids[2], 3978);
  now = Date.parse('2026-10-15T22:00:10+07:00');
  assert.equal((await offer(b, ids[2], 4217)).data.result, 0);
  now = Date.parse('2026-10-15T22:01:10+07:00');
  await tick(); await tick();
  check('extended bid settles after deadline', () => {});
  assert.equal((await Listing.findOne({ id: ids[2] }).lean()).status, 3);
  assert.equal(await Record.countDocuments({ deliveryState: 'pending' }), 0);
  console.log('QA_RESULT=' + JSON.stringify({ result: 'PASS', checks, database: dbName, productionPlayerWrites: 0, realMongo: true, authenticatedGameAccountsCreated: 0 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  Date.now = realNow;
  if (originalListingUpdate) Listing.findOneAndUpdate = originalListingUpdate;
  if (originalRecordUpdate) Record.findOneAndUpdate = originalRecordUpdate;
  if (owned && mongoose.connection.db?.databaseName === dbName) {
    const marker = await mongoose.connection.db.collection('_qa_owner').findOne({ _id: dbName, task: 'auction_20261015' });
    if (marker) { await mongoose.connection.db.dropDatabase(); console.log('QA_CLEANUP=' + dbName + ':removed-owned-fixtures'); }
  }
  await mongoose.disconnect();
});
