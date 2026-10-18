'use strict';

// Exercise CrossArenaService's native Mongo path (no applyDefenderScore
// callback).  All models/collections are RAM doubles; no socket, HTTP, Redis
// or production database is touched.
const assert = require('node:assert/strict');
const path = require('node:path');
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const { memoryModel, clone } = require(path.join(app, 'scripts/test-competitions-v3'));
const cross = require(path.join(app, 'src/services/CrossServerEventService'));
const config = require(path.join(app, 'src/services/ConfigService'));
const battle = require(path.join(app, 'src/services/BattleService'));
const rank = require(path.join(app, 'src/services/RankService'));
const mongoose = require(path.join(app, 'node_modules/mongoose'));
const { createService } = require(path.join(app, 'src/services/CrossArenaService'));

const realSimulate = battle.simulateBattle;
const Entry = memoryModel();
const Action = memoryModel();
const stored = new Map();
const sessions = new Map();
const rankWrites = [];
const playerCollectionWrites = [];
let now = Date.parse(cross.schedule.anchor) + 7 * 86400000 + 3600000;
let seq = 0;
let failTargetSyncOnce = false;

// The service calls the real RankService only after the score mutation. Keep
// that side effect observable but offline.
rank.updateScore = async (kind, playerId, score) => {
  rankWrites.push({ kind, playerId, score });
};

function query(value) {
  let fields = null;
  const list = Array.isArray(value) ? value : [value];
  let limit = Infinity;
  return {
    select(f) { fields = f; return this; },
    sort() { return this; },
    limit(n) { limit = n; return this; },
    maxTimeMS() { return this; },
    lean() { return this; },
    async exec() {
      const cloneRow = (row) => {
        if (!row || !fields) return clone(row);
        const out = fields._id === 0 ? {} : { _id: row._id };
        for (const key of Object.keys(fields)) {
          if (!fields[key] || key === '_id') continue;
          const parts = key.split('.');
          let dst = out;
          let src = row;
          for (const part of parts.slice(0, -1)) { src = src?.[part]; dst = dst[part] ||= {}; }
          const leaf = parts.at(-1);
          if (src !== undefined) dst[leaf] = parts.length === 1 ? src[leaf] : src;
        }
        return out;
      };
      const out = list.slice(0, limit).map(cloneRow);
      return Array.isArray(value) ? out : out[0] || null;
    },
    then(resolve, reject) { return this.exec().then(resolve, reject); },
  };
}

function at(row, key) { return key.split('.').reduce((v, part) => v?.[part], row); }
function matches(row, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$and') return value.every((part) => matches(row, part));
    if (key === '$or') return value.some((part) => matches(row, part));
    const actual = at(row, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$exists') return (actual !== undefined) === expected;
        if (op === '$lte') return actual <= expected;
        if (op === '$lt') return actual < expected;
        if (op === '$gt') return actual > expected;
        if (op === '$gte') return actual >= expected;
        if (op === '$in') return expected.includes(actual);
        if (op === '$ne') return Array.isArray(actual)
          ? !actual.some((item) => JSON.stringify(item) === JSON.stringify(expected))
          : actual !== expected;
        if (op === '$not' && expected?.$elemMatch) {
          return !((actual || []).some((item) => Object.entries(expected.$elemMatch)
            .every(([k, v]) => item?.[k] === v)));
        }
        return actual === expected;
      });
    }
    return Array.isArray(actual) && !Array.isArray(value) ? actual.includes(value) : actual === value;
  });
}

function update(row, u) {
  Object.assign(row, clone(u.$set || {}));
  for (const [field, amount] of Object.entries(u.$inc || {})) row[field] = (Number(row[field]) || 0) + Number(amount || 0);
  for (const [field, value] of Object.entries(u.$push || {})) {
    row[field] ||= [];
    row[field].push(...clone(value?.$each || [value]));
    if (Number.isFinite(value?.$slice)) row[field] = value.$slice < 0 ? row[field].slice(value.$slice) : row[field].slice(0, value.$slice);
  }
}

function wrapRows(model) {
  model.find = (filter) => query([...model.rows.values()].filter((row) => matches(row, filter)));
  model.findOne = (filter) => query([...model.rows.values()].find((row) => matches(row, filter)) || null);
  model.findById = (id) => query(model.rows.get(String(id)) || null);
  model.countDocuments = (filter) => query([...model.rows.values()].filter((row) => matches(row, filter)).length);
  model.updateOne = (filter, u, opts = {}) => ({
    async exec() {
      let row = [...model.rows.values()].find((candidate) => matches(candidate, filter));
      if (!row && opts.upsert) {
        row = { _id: filter._id, ...clone(u.$setOnInsert || {}) };
        model.rows.set(row._id, row);
      }
      if (row) update(row, u);
      return { matchedCount: row ? 1 : 0 };
    },
  });
  model.findOneAndUpdate = (filter, u) => {
    const row = [...model.rows.values()].find((candidate) => matches(candidate, filter));
    if (row) update(row, u);
    return query(row || null);
  };
  model.create = async (row) => {
    if (model.rows.has(row._id)) throw Object.assign(new Error('DUPLICATE'), { code: 11000 });
    model.rows.set(row._id, clone(row));
    return clone(row);
  };
  return model;
}
wrapRows(Entry); wrapRows(Action);

// Replace only the mongoose collection used to synchronize the target server's
// player document. The shared CrossEventEntry mutation still goes through the
// native service path under test.
const originalUseDb = mongoose.connection.useDb.bind(mongoose.connection);
mongoose.connection.useDb = (name) => ({
  collection(collectionName) {
    assert.equal(collectionName, 'players');
    return {
      async updateOne(filter, u) {
        if (failTargetSyncOnce) { failTargetSyncOnce = false; return { matchedCount: 0 }; }
        const target = [...stored.values()].find((row) => row.playerId === filter.playerId
          && (!filter.userId || row.userId === filter.userId));
        if (!target) return { matchedCount: 0 };
        target.crossArenaInfo ||= {};
        target.crossArenaInfo.score = u.$set['crossArenaInfo.score'];
        target.crossArenaInfo.revision = u.$set['crossArenaInfo.revision'];
        playerCollectionWrites.push({ name, playerId: target.playerId, score: target.crossArenaInfo.score });
        stored.set(target.userId, clone(target));
        return { matchedCount: 1 };
      },
    };
  },
});

const players = {
  drainPendingSaves: async () => {},
  savePlayer: async (userId, player) => { stored.set(userId, clone(player)); return player; },
};
const runtime = { getWsServer: () => null };
const logger = { warn() {}, error() {}, info() {} };
const service = createService({
  Entry, Action, players, runtime, clock: () => now, logger,
  battle: { ...battle, simulateBattle: (a, b, o) => ({ ...realSimulate(a, b, o), win: true }) },
  getServer: async (serverId) => ({ serverId, openTime: now - 30 * 86400000, running: true }),
  loadProfile: async (serverId, playerId, userId) => clone([...stored.values()].find((p) => p.serverId === serverId
    && p.playerId === playerId && (!userId || p.userId === userId))),
});

function session(serverId, n) {
  const id = `${(n + 1).toString(16).padStart(24, '0')}`;
  const p = { _id: id, userId: `native_cross_user_${n}`, playerId: `native_cross_player_${n}`, serverId,
    name: `Native Cross QA ${n}`, level: 120, roleInfo: { kungfuId: 4, subJob: 0, stage: 1 },
    boxInfo: { level: 1 }, equipInfo: { curIndex: 0, equipSetMap: { 0: {} } }, fashionInfo: {}, petInfo: { pets: [] },
    items: { 110: 50 }, currencies: { diamond: 1000, silver: 0, gold: 0 } };
  const s = { serverId, userId: p.userId, player: p };
  sessions.set(p.userId, s); stored.set(p.userId, clone(p));
  return s;
}

const ack = (value) => (Array.isArray(value) ? value : [value]).find((row) => row.tag === 2300)?.data;
function request(s, target, id) {
  return { requestId: id, type: 16, enemyid: target.dbid,
    challengeVersion: s.player.crossArenaInfo.challenge.version, cycleKey: s.player.crossArenaInfo.cycleKey };
}

async function main() {
  const target = session(1002, ++seq);
  const attacker = session(1001, ++seq);
  await service.info({}, target, ++seq);
  await service.info({}, attacker, ++seq);
  const targetRow = attacker.player.crossArenaInfo.challenge.rows.find((row) => row.playerId === target.player.playerId);
  assert(targetRow && !targetRow.isRobot, 'attacker must receive a real target');
  const entryBefore = Entry.rows.get(targetRow.entryId);
  const before = Number(entryBefore.score);
  const requestId = `native_cross_fight_${++seq}`;
  const firstParams = request(attacker, targetRow, requestId);
  failTargetSyncOnce = true;
  const response = ack(await service.fight(firstParams, attacker, ++seq));
  assert.equal(response.result, 0, JSON.stringify(response));
  const delta = Number(response.scorechange);
  assert(delta > 0, 'fixture must be a win');
  const entryAfter = Entry.rows.get(targetRow.entryId);
  assert.equal(entryAfter.score, before - delta);
  assert.equal(entryAfter.scoreReceipts.length, 1);
  assert.equal(entryAfter.scoreReceipts[0].delta, -delta);
  assert.equal(response.targetScorePending, true);
  assert.equal(stored.get(target.userId).crossArenaInfo?.score, before);
  assert.equal(Action.rows.size, 0);
  const pending = attacker.player.crossArenaInfo.outbox.find((row) => row._id === response.fightId);
  assert(pending && pending.log.zeroSumVersion === 1);
  assert.equal(pending.log.targetScoreChange, -delta);
  const replay = ack(await service.fight(firstParams, attacker, ++seq));
  assert.equal(replay.recovered, true);
  assert.equal(Entry.rows.get(targetRow.entryId).score, before - delta);
  assert.equal(Entry.rows.get(targetRow.entryId).scoreReceipts.length, 1);
  const targetAfter = stored.get(target.userId);
  assert.equal(targetAfter.crossArenaInfo.score, before - delta);
  assert.equal(playerCollectionWrites.length, 1);
  assert.deepEqual(rankWrites.at(-1), { kind: 'crossArena', playerId: target.player.playerId, score: before - delta });
  const action = [...Action.rows.values()].find((row) => row._id === response.fightId);
  assert(action && action.log.zeroSumVersion === 1);
  assert.equal(action.log.targetScoreChange, -delta);
  mongoose.connection.useDb = originalUseDb;
  console.log(JSON.stringify({ result: 'PASS', checks: 12, targetDelta: -delta, productionWrites: 0, networkAttempts: 0 }, null, 2));
}

main().catch((error) => { mongoose.connection.useDb = originalUseDb; console.error(error.stack); process.exitCode = 1; });
