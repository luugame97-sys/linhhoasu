'use strict';

const crypto = require('crypto');

const suffix = crypto.randomBytes(6).toString('hex');
const selfUserId = `qa_arena_self_${suffix}`;
const targetUserId = `qa_arena_target_${suffix}`;
const selfPlayerId = `p_${selfUserId}`;
const targetPlayerId = `p_${targetUserId}`;
const selfName = `QA Arena Self ${suffix}`;
const targetName = `QA Arena Target ${suffix}`;

process.env.SERVER_ID = '1002';
process.env.DEFAULT_SERVER_ID = '1002';
process.env.REDIS_PREFIX = 's1002:';
process.env.MONGO_URI = 'mongodb://localhost:27017/lhs_s1002';
process.env.IDENTITY_MONGO_DB = 'lhs_s1001';

const mongo = require('../../linhhoasu/lhs/newServer/src/db/mongo');
const redis = require('../../linhhoasu/lhs/newServer/src/db/redis');
const ConfigService = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const Player = require('../../linhhoasu/lhs/newServer/src/db/models/Player');
const Account = require('../../linhhoasu/lhs/newServer/src/db/models/Account');
const ArenaFightLog = require('../../linhhoasu/lhs/newServer/src/db/models/ArenaFightLog');
const arena = require('../../linhhoasu/lhs/newServer/src/handlers/arena');
const rank = require('../../linhhoasu/lhs/newServer/src/services/RankService');

function basePlayer(userId, playerId, name, score) {
  return {
    userId, playerId, name, level: 120, arenaScore: score,
    arenaDayKey: arena.ensureArenaState({}).dayKey, arenaDailyCount: 0,
    items: { 10: 2 }, currencies: { silver: 500, diamond: 0, gold: 0 },
    roleInfo: { kungfuId: 1, subJob: 0, stageId: 1 },
    equipInfo: {}, formationInfo: {}, fashionInfo: {}, petInfo: {},
    other_attr_info: {}, boxInfo: {}, spiritInfo: {}, fishInfo: {}, artifactInfo: {},
  };
}

(async () => {
  ConfigService.loadAllTables();
  await mongo.connect(process.env.MONGO_URI);
  redis.connect();
  const client = redis.getClient();
  const self = basePlayer(selfUserId, selfPlayerId, selfName, 1000);
  const target = basePlayer(targetUserId, targetPlayerId, targetName, 1000);
  let created = false;
  try {
    await Account.create({ accountId: `qa_account_${suffix}`, passwordHash: 'qa', roles: [{ roleId: `r_${targetUserId}`, userId: targetUserId, serverId: 1002, serverName: 'S2', name: targetName, createTime: Number.MAX_SAFE_INTEGER, lastLoginTime: Number.MAX_SAFE_INTEGER }] });
    const accountReadback = await Account.findOne({ accountId: `qa_account_${suffix}` }).lean();
    if (!accountReadback) throw new Error('QA_ACCOUNT_WRITE_READBACK_FAILED');
    await Player.create(self);
    await Player.create(target);
    const roleProbe = await Account.find({ 'roles.serverId': 1002 }).lean();
    const playerProbe = await Player.find({ userId: targetUserId }).lean();
    if (!roleProbe.some((row) => Array.isArray(row.roles) && row.roles.some((role) => role.userId === targetUserId))) {
      throw new Error(`QA_ACCOUNT_ROLE_QUERY_FAILED:${roleProbe.length}`);
    }
    if (playerProbe.length !== 1) throw new Error(`QA_PLAYER_QUERY_FAILED:${playerProbe.length}`);
    created = true;
    await rank.updateScore('arena', selfPlayerId, 1000);
    await rank.updateScore('arena', targetPlayerId, 1000);
    const session = { userId: selfUserId, serverId: 1002, player: self };
    const info = await arena.handleArenaInfo({}, session, 101);
    if (!info.data || info.data.rank <= 0 || !Array.isArray(info.data.challengelist)) throw new Error('ARENA_INFO_INVALID');
    const existing = await Player.find({ userId: { $ne: targetUserId } }).lean();
    session._arenaChallengeSnapshot = {
      attackerId: selfUserId,
      expiresAt: Date.now() + 60000,
      rows: existing.map((row) => ({ playerId: row.playerId, dbid: String(row._id) })),
    };
    const refreshed = await arena.handleArenaRefresh({}, session, 102);
    const refreshPackets = Array.isArray(refreshed) ? refreshed : [refreshed];
    const refresh = refreshPackets.find((packet) => packet.tag === 2601);
    if (!refresh || refresh.data.result !== 0 || Number(self.currencies.silver) !== 400) throw new Error('ARENA_REFRESH_COST_INVALID');
    const cooldown = await arena.handleArenaRefresh({}, session, 103);
    const cooldownPacket = Array.isArray(cooldown) ? cooldown[cooldown.length - 1] : cooldown;
    if (!cooldownPacket || cooldownPacket.data.code !== 'ARENA_REFRESH_COOLDOWN') throw new Error('ARENA_REFRESH_COOLDOWN_INVALID');
    const targetRow = refresh.data.challengelist.find((row) => row.playerId === targetPlayerId)
      || refresh.data.challengelist.find((row) => row.isRobot);
    if (!targetRow || !targetRow.robotAttrs) {
      throw new Error(`ARENA_TARGET_SNAPSHOT_MISSING keys=${targetRow ? Object.keys(targetRow).join(',') : 'none'}`);
    }
    const fightTargetId = targetRow.playerId || targetRow.dbid;
    const result = await arena.handleArenaFight2300({ type: 2, enemyid: fightTargetId, challengeVersion: targetRow.challengeVersion, requestId: `qa_request_${suffix}` }, session, 104);
    const packets = Array.isArray(result) ? result : [result];
    const fight = packets.find((packet) => packet.tag === 2300);
    if (!fight || fight.data.result !== 0) throw new Error(`ARENA_FIGHT_FAILED:${JSON.stringify(fight && fight.data)}`);
    if (self.items[10] !== 1 || self.arenaDailyCount !== 1) throw new Error('ARENA_COST_OR_COUNT_INVALID');
    const reloaded = await Player.findOne({ playerId: selfPlayerId }).lean();
    const protectedTarget = targetRow.isRobot ? null : await Player.findOne({ playerId: fightTargetId }).lean();
    if (!reloaded || Number(reloaded.items && reloaded.items[10]) !== 1) throw new Error('ARENA_RELOAD_TICKET_INVALID');
    if (!targetRow.isRobot && (!protectedTarget || Number(protectedTarget.arenaProtectUntil || 0) <= Date.now())) throw new Error('ARENA_PROTECT_NOT_PERSISTED');
    const log = await ArenaFightLog.findOne({ fightId: new RegExp(`qa_request_${suffix}$`) }).lean();
    if (!log) throw new Error('ARENA_FIGHT_LOG_MISSING');
    const revengeUid = String(self.arenaLoglist[0] && self.arenaLoglist[0].uid || '');
    if (!/^\d+$/.test(revengeUid)) throw new Error('ARENA_LOG_UID_NOT_NUMERIC');
    const revenge = await arena.handleArenaFight2300({ type: 3, enemyid: revengeUid, requestId: `qa_revenge_${suffix}` }, session, 105);
    const revengePackets = Array.isArray(revenge) ? revenge : [revenge];
    const revengeFight = revengePackets.find((packet) => packet.tag === 2300);
    if (!revengeFight || revengeFight.data.result !== 0 || String(revengeFight.data.enemyid) !== revengeUid) throw new Error('ARENA_REVENGE_FAILED');
    console.log(JSON.stringify({ result: 'ok', serverId: 1002, rank: info.data.rank, rankRows: info.data.ranklist.length, targetIsRobot: !!targetRow.isRobot, ticketAfter: self.items[10], dailyCount: self.arenaDailyCount, protectUntil: protectedTarget && protectedTarget.arenaProtectUntil || 0, fightId: log.fightId }));
  } finally {
    if (created) {
      await Player.deleteMany({ playerId: { $in: [selfPlayerId, targetPlayerId] } });
      await Account.deleteMany({ accountId: `qa_account_${suffix}` });
      await ArenaFightLog.deleteMany({ fightId: new RegExp(`qa_request_${suffix}$`) });
      await client.zrem('rank:arena', selfPlayerId, targetPlayerId);
      await client.del(`arena:receipt:fight:1002:${selfPlayerId}:qa_request_${suffix}`);
    }
    await redis.disconnect();
    await mongo.disconnect();
  }
})().catch((err) => { console.error(err.message); process.exitCode = 1; });
