'use strict';
// Runs on the VPS against an isolated temporary player and cleans all rows.
const crypto = require('crypto');
const mongoose = require('mongoose');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const redis = require('/linhhoasu/lhs/newServer/src/db/redis');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const ArenaFightLog = require('/linhhoasu/lhs/newServer/src/db/models/ArenaFightLog');
const arena = require('/linhhoasu/lhs/newServer/src/handlers/arena');

(async () => {
  const token = crypto.randomBytes(5).toString('hex');
  const userId = `qa_arena_${token}`;
  const playerId = `p_${userId}`;
  const name = `QA Arena ${token}`;
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongo.connect(process.env.MONGO_URI);
  redis.connect();
  const player = await Player.create({ userId, playerId, name, level: 50, arenaScore: 1000,
    items: { 10: 3, 2: 1000 }, currencies: { gold: 1000, silver: 1000, diamond: 0 },
    roleInfo: { kungfuId: 4, subJob: 0 }, petInfo: { pets: [] },
    arenaDayKey: '', arenaLoglist: [], arenaReceiptLedger: [] });
  const session = { userId, serverId: 1001, player };
  let passed = 0;
  let targetRow = null;
  const lastPacket = (value) => Array.isArray(value) ? value[value.length - 1] : value;
  try {
    const info = await arena.handleArenaInfo({}, session, 1);
    const row = (info.data.challengelist || [])[0];
    if (!row) throw new Error('QA_OPPONENT_NOT_AVAILABLE');
    targetRow = row;
    const params = { type: 2, index: 0, enemyid: String(row.dbid), challengeVersion: row.challengeVersion, requestId: 'qa-fight-1' };
    const beforeTickets = Number(session.player.items[10]);
    const first = lastPacket(await arena.handleArenaFight(params, session, 2));
    if (!first || !first.data || first.data.result !== 0) throw new Error(`QA_FIGHT_FAILED:${JSON.stringify(first)}`);
    if (Number(session.player.items[10]) !== beforeTickets - 1) throw new Error('QA_TICKET_NOT_CONSUMED_ONCE');
    passed++;
    const afterScore = Number(session.player.arenaScore);
    const second = lastPacket(await arena.handleArenaFight(params, session, 3));
    if (!second || !second.data || second.data.result !== 0 || !second.data.recovered) throw new Error('QA_DUPLICATE_NOT_RECOVERED');
    if (Number(session.player.items[10]) !== beforeTickets - 1 || Number(session.player.arenaScore) !== afterScore) throw new Error('QA_DUPLICATE_MUTATED_STATE');
    passed++;
    session.player.arenaRefreshAt = 0;
    const refreshParams = { requestId: 'qa-refresh-1' };
    const silverBefore = Number(session.player.currencies.silver);
    const refreshed = lastPacket(await arena.handleArenaRefresh(refreshParams, session, 4));
    if (!refreshed || !refreshed.data || refreshed.data.result !== 0) throw new Error('QA_REFRESH_FAILED');
    if (Number(session.player.currencies.silver) !== silverBefore - 100) throw new Error('QA_REFRESH_COST_WRONG');
    console.log('QA_LEDGER', JSON.stringify(session.player.arenaReceiptLedger));
    passed++;
    const refreshAgain = lastPacket(await arena.handleArenaRefresh(refreshParams, session, 5));
    if (!refreshAgain || !refreshAgain.data || refreshAgain.data.result !== 0) throw new Error(`QA_REFRESH_DUPLICATE_NOT_RECOVERED:${JSON.stringify(refreshAgain)}`);
    if (Number(session.player.currencies.silver) !== silverBefore - 100) throw new Error('QA_REFRESH_DUPLICATE_MUTATED_STATE');
    passed++;
    const logs = await ArenaFightLog.countDocuments({ attackerId: playerId });
    if (logs < 1) throw new Error('QA_FIGHT_LOG_MISSING');
    passed++;
    console.log(JSON.stringify({ result: 'PASS', checks: passed, playerId, logCount: logs, score: session.player.arenaScore }));
  } finally {
    await ArenaFightLog.deleteMany({ attackerId: playerId });
    if (targetRow && targetRow.playerId && !targetRow.isRobot) {
      await Player.updateOne({ playerId: String(targetRow.playerId) }, { $set: { arenaProtectUntil: 0 } });
    }
    const redisClient = redis.getClient();
    if (redisClient) await redisClient.zrem(`rank:arena`, playerId).catch(() => undefined);
    await Player.deleteOne({ _id: player._id });
    await redis.disconnect();
    await mongo.disconnect();
  }
})().catch((err) => { console.error(JSON.stringify({ result: 'FAIL', code: err.message })); process.exitCode = 1; });
