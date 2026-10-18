'use strict';
// Read-only audit. No handler invocation and no writes to Mongo/Redis/player state.
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const app = '/linhhoasu/lhs/newServer';
const log = require.resolve(app + '/src/logger');
require.cache[log] = { id: log, filename: log, loaded: true,
  exports: { info() {}, warn() {}, error() {}, debug() {} } };
const battle = require(app + '/src/services/BattleService');
const read = require(app + '/src/services/ArenaReadModelService');
const config = require(app + '/src/services/ConfigService');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const sidList = [1001, 1002, 1003, 1004, 1005];

function power(doc) {
  const attrs = battle.calcPlayerPower(clone(doc));
  return {
    native: read.displayPower(attrs),
    legacy: battle.calcPowerScore(attrs),
    attrs,
  };
}

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const out = {
      at: new Date().toISOString(),
      readOnly: true,
      productionWrites: 0,
      sourceHashes: {},
      weightsHash: sha(JSON.stringify(config.loadAllTables().AttrConfig || {})),
      servers: [],
      cross: { currentCycle: null, entries: 0, comparable: 0, stale: 0, missingPlayer: 0, samples: [] },
    };
    for (const rel of [
      'src/services/ArenaReadModelService.js',
      'src/services/CrossArenaService.js',
      'src/handlers/arena.js',
      'src/handlers/basic.js',
      'src/handlers/playerPayload.js',
    ]) out.sourceHashes[rel] = sha(fs.readFileSync(app + '/' + rel));

    const dbBySid = new Map();
    for (const sid of sidList) {
      const db = client.db('lhs_s' + sid);
      dbBySid.set(sid, db);
      const realQuery = { isBot: { $ne: true }, managedBot: { $ne: true } };
      const count = await db.collection('players').countDocuments(realQuery, { maxTimeMS: 7000 });
      const rows = await db.collection('players').find(realQuery, {
        // Use the exact projection consumed by buildPlayerView. A hand-written
        // subset can silently omit boxInfo/other sources and create a false
        // power mismatch in this audit.
        projection: { ...read.PLAYER_PROJECTION, power: 1, powerScore: 1, updatedAt: 1 },
        maxTimeMS: 7000 }).sort({ arenaScore: -1, updatedAt: -1 }).limit(10).toArray();
      const samples = rows.map(row => {
        const v = power(row);
        return { playerId: String(row.playerId || ''), name: String(row.name || ''), level: row.level,
          arenaScore: row.arenaScore || 0, updatedAt: row.updatedAt || null,
          native: v.native, legacy: v.legacy, storedPower: row.power ?? null,
          storedPowerScore: row.powerScore ?? null,
          nativeMatchesReadModel: v.native === read.displayPower(v.attrs),
          nativeOverLegacy: v.legacy > 0 ? v.native / v.legacy : null,
        };
      });
      out.servers.push({ serverId: sid, realPlayers: count, rankedSamples: samples });
    }

    const shared = client.db('lhs_s1001');
    const latest = await shared.collection('crossevententries').findOne(
      { event: 'crossArena' }, { sort: { cycleKey: -1, updatedAt: -1 }, projection: { cycleKey: 1 } });
    const cycleKey = latest?.cycleKey || null;
    out.cross.currentCycle = cycleKey;
    if (cycleKey) {
      const entries = await shared.collection('crossevententries').find(
        { event: 'crossArena', cycleKey },
        { projection: { _id: 1, serverId: 1, playerId: 1, name: 1, updatedAt: 1,
          'payload.publicRow.power': 1, 'payload.publicRow.dbid': 1, 'payload.attrs': 1 }, maxTimeMS: 10000 }).toArray();
      out.cross.entries = entries.length;
      const idsBySid = new Map();
      for (const e of entries) {
        const sid = Number(e.serverId);
        if (!idsBySid.has(sid)) idsBySid.set(sid, []);
        idsBySid.get(sid).push(String(e.playerId));
      }
      const liveByKey = new Map();
      for (const [sid, ids] of idsBySid.entries()) {
        const db = dbBySid.get(sid) || client.db('lhs_s' + sid);
        const rows = await db.collection('players').find(
          { playerId: { $in: ids } },
          { projection: { ...read.PLAYER_PROJECTION, updatedAt: 1 }, maxTimeMS: 10000 }).toArray();
        for (const row of rows) liveByKey.set(sid + ':' + String(row.playerId), row);
      }
      for (const entry of entries) {
        const live = liveByKey.get(Number(entry.serverId) + ':' + String(entry.playerId));
        if (!live) { out.cross.missingPlayer++; continue; }
        const snapshotPower = read.displayPower(entry.payload?.attrs || {});
        const livePower = power(live).native;
        out.cross.comparable++;
        if (snapshotPower !== livePower) {
          out.cross.stale++;
          if (out.cross.samples.length < 12) out.cross.samples.push({
            serverId: Number(entry.serverId), playerId: String(entry.playerId), name: String(entry.name || live.name || ''),
            entryUpdatedAt: entry.updatedAt || null, playerUpdatedAt: live.updatedAt || null,
            snapshotPower, livePower, snapshotPublicPower: entry.payload?.publicRow?.power ?? null,
            ratio: livePower > 0 ? snapshotPower / livePower : null,
          });
        }
      }
    }
    console.log(JSON.stringify(out));
  } finally {
    await client.close();
  }
})().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
