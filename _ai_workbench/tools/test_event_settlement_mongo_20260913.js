'use strict';
const assert = require('node:assert/strict');
const mongoose = require((process.env.EVENT_TEST_LIVE || '/linhhoasu/lhs/newServer') + '/node_modules/mongoose');
mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
const root = process.env.EVENT_TEST_APP || '/linhhoasu/lhs/newServer';
const { createService } = require(root + '/src/services/EventRewardSettlementService');
const dbName = 'lhs_qa_event_settlement_20260913';
const uri = 'mongodb://127.0.0.1:27017/' + dbName;
const playerSchema = new mongoose.Schema({ userId: String, playerId: String, name: String, serverId: Number, isBot: Boolean, managedBot: Boolean, fishInfo: mongoose.Schema.Types.Mixed, activityInfo: mongoose.Schema.Types.Mixed }, { strict: false });
const Player = mongoose.model('QaEventPlayer20260913', playerSchema);
// Actual production Mail/ObjectId and immutable Mixed-array schema, QA DB only.
const Mail = require((process.env.EVENT_TEST_LIVE || root) + '/src/db/models/Mail');
const Settlement = require(root + '/src/db/models/EventRewardSettlement');
const table = { 1: { rankMin: 1, rankMax: 1, rewards: [{ id: 1, count: 3 }] }, 2: { rankMin: 2, rankMax: 2, rewards: [{ id: 1, count: 2 }] }, 3: { rankMin: 3, rankMax: 999, rewards: [{ id: 1, count: 1 }] } };
const event = { kind: 'fishing', id: 6006, key: 'F6006_1000', startTime: 1000, endTime: 2000 };
const docs = ['a', 'b', 'c'].map((id, i) => ({ userId: 'qa_event_u_' + id, playerId: 'qa_event_p_' + id, name: id, serverId: 1001, fishInfo: { eventStats: { [event.key]: { id: 6006, start: 1000, end: 2000, score: 30 - i * 10 } } } }));
(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  let owned = false;
  try {
    assert.equal(mongoose.connection.name, dbName);
    const guard = mongoose.connection.db.collection('qa_owner');
    // An existing DB without this task's owner marker must never be deleted.
    const collections = await mongoose.connection.db.listCollections().toArray();
    const marker = await guard.findOne({ _id: 'event-rank-20260913' });
    if (collections.length && !marker) throw Error('QA_DATABASE_NOT_OWNED');
    await guard.updateOne({ _id: 'event-rank-20260913' }, { $setOnInsert: { purpose: 'isolated event rank integration' } }, { upsert: true });
    owned = true;
    await Player.deleteMany({ userId: /^qa_event_u_/ }); await Mail.deleteMany({ userId: /^qa_event_u_/ }); await Settlement.deleteMany({ _id: /^event_rank_v2_/ });
    await Player.insertMany(docs);
    const service = createService({ Player, Mail, Settlement, serverId: 1001, enabled: true, activationAt: 1,
      readPlayers: async () => Player.find({ userId: /^qa_event_u_/ }).lean(), clock: () => 70000,
      config: { get: key => key === 'Activity6RankConfig' ? { 6006: table } : {} }, policy: { graceMs: 0, newYearWindows: {} },
      validateRewards: () => {}, logger: { error() {}, warn() {} } });
    const first = await service.settle(event); assert.equal(first.inserted, 3);
    assert.equal(await Mail.countDocuments({ userId: /^qa_event_u_/ }), 3);
    const second = await service.settle(event); assert.equal(second.skipped, 'done');
    assert.equal(await Mail.countDocuments({ userId: /^qa_event_u_/ }), 3);
    const row = await Settlement.findOne({ serverId: 1001 }); assert.equal(row.state, 'done'); assert.equal(row.delivered.length, 3);
    const toClientMail = require((process.env.EVENT_TEST_LIVE || root) + '/src/handlers/mail').toClientMail;
    const native = toClientMail(await Mail.findOne({ userId: 'qa_event_u_a' }).lean());
    assert.equal(native.rewardData[0].count, 3); assert.equal(native.sender, '0'); assert.equal(native.id.length, 24);
    const before = await Player.find().lean();
    assert.deepEqual(before.map(x => x.fishInfo), docs.map(x => x.fishInfo));
    console.log(JSON.stringify({ result: 'PASS', database: dbName, actualSchemas: true, nativeMailSerialization: true, mails: 3, delivered: row.delivered.length }));
  } finally { if (owned && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
