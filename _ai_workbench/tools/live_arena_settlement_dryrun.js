'use strict';
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const ConfigService = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const ArenaFightLog = require('/linhhoasu/lhs/newServer/src/db/models/ArenaFightLog');
const settlement = require('/linhhoasu/lhs/newServer/src/services/ArenaSettlementService');

(async () => {
  const serverId = Number(process.env.SERVER_ID || 1001);
  const now = Date.now();
  const cutoffAt = now - 3600000;
  await mongo.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001');
  ConfigService.loadAllTables();
  const [players, futureLogs] = await Promise.all([
    Player.find({ arenaScore: { $exists: true }, isBot: { $ne: true }, managedBot: { $ne: true } })
      .select({ userId: 1, playerId: 1, arenaScore: 1, _id: 0 }).lean(),
    ArenaFightLog.find({ serverId, createdAt: { $gt: new Date(cutoffAt) } })
      .select({ attackerId: 1, scoreChange: 1, _id: 0 }).lean(),
  ]);
  const reverse = new Map();
  futureLogs.forEach((r) => reverse.set(String(r.attackerId), (reverse.get(String(r.attackerId)) || 0) + (Number(r.scoreChange) || 0)));
  const rows = players.map((p) => ({ playerId: String(p.playerId), userId: String(p.userId), score: Math.max(0, (Number(p.arenaScore) || 0) - (reverse.get(String(p.playerId)) || 0)) }))
    .sort((a, b) => b.score - a.score || b.playerId.localeCompare(a.playerId));
  rows.forEach((r, i) => { if (i >= 10000 || !r.playerId || !r.userId) throw new Error('INVALID_SNAPSHOT_ROW'); });
  if (!settlement.rewardsForRank('day', 1).length || !settlement.rewardsForRank('week', 1).length) throw new Error('REWARD_CONFIG_MISSING');
  console.log(JSON.stringify({ result: 'PASS', serverId, cutoffAt, rows: rows.length, futureLogs: futureLogs.length, dayReward: settlement.rewardsForRank('day', 1), weekReward: settlement.rewardsForRank('week', 1) }));
  await mongo.disconnect();
})().catch(async (err) => { console.error(JSON.stringify({ result: 'FAIL', code: err.message })); try { await mongo.disconnect(); } catch (_) {} process.exitCode = 1; });
