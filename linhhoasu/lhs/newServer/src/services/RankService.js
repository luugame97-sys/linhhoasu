/**
 * RankService - 排行榜服务（Redis Sorted Set）
 * 竞技场积分排行、剑塔层数排行
 */

const redis = require('../db/redis');
const logger = require('../logger');

const KEYS = {
  arena: 'rank:arena',   // 竞技场积分排行
  crossArena: 'rank:crossArena',
  crossRival: 'rank:crossRival',
  topArena: 'rank:topArena',
  tower: 'rank:tower',   // 剑塔最高层排行
};

/**
 * 更新排行榜分数
 * @param {string} type - 排行榜类型（arena/tower）
 * @param {string} playerId - 玩家 ID
 * @param {number} score - 分数
 */
async function updateScore(type, playerId, score) {
  const client = redis.getClient();
  if (!client) return;

  const key = KEYS[type];
  if (!key) {
    logger.warn(`[Rank] 未知排行榜类型: ${type}`);
    return;
  }
  await client.zadd(key, score, playerId);
}

/**
 * 获取玩家排名（从高到低，0-based）
 * @param {string} type - 排行榜类型
 * @param {string} playerId - 玩家 ID
 * @returns {Promise<number>} 排名（1-based），未上榜返回 -1
 */
async function getRank(type, playerId) {
  const client = redis.getClient();
  if (!client) return -1;

  const key = KEYS[type];
  if (!key) return -1;

  const rank = await client.zrevrank(key, playerId);
  return rank !== null ? rank + 1 : -1;
}

/**
 * 获取玩家分数
 * @param {string} type - 排行榜类型
 * @param {string} playerId - 玩家 ID
 * @returns {Promise<number>} 分数，未上榜返回 0
 */
async function getScore(type, playerId) {
  const client = redis.getClient();
  if (!client) return 0;

  const key = KEYS[type];
  if (!key) return 0;

  const score = await client.zscore(key, playerId);
  return score !== null ? Number(score) : 0;
}

/**
 * 获取排行榜 Top N
 * @param {string} type - 排行榜类型
 * @param {number} count - 数量（默认 50）
 * @returns {Promise<Array<{playerId: string, score: number, rank: number}>>}
 */
async function getTopN(type, count = 50) {
  const client = redis.getClient();
  if (!client) return [];

  const key = KEYS[type];
  if (!key) return [];

  const raw = await client.zrevrange(key, 0, count - 1, 'WITHSCORES');
  const list = [];
  for (let i = 0; i < raw.length; i += 2) {
    list.push({
      playerId: raw[i],
      score: Number(raw[i + 1]),
      rank: Math.floor(i / 2) + 1,
    });
  }
  return list;
}

async function rebuildArenaFromMongo(PlayerModel, batchSize = 500) {
  const client = redis.getClient();
  if (!client || !PlayerModel) return { ok: false, reason: 'REDIS_OR_MODEL_UNAVAILABLE', count: 0 };
  const key = KEYS.arena;
  // Rebuild into a staging ZSET and atomically swap it in. This removes
  // deleted/managed-bot members instead of leaving stale Redis entries.
  const staging = `${key}:rebuild:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const rows = await PlayerModel.find({ arenaScore: { $exists: true }, isBot: { $ne: true }, managedBot: { $ne: true } })
    .select({ playerId: 1, arenaScore: 1, _id: 0 })
    .maxTimeMS(5000)
    .lean();
  let count = 0;
  for (let offset = 0; offset < rows.length; offset += Math.max(1, batchSize)) {
    const batch = rows.slice(offset, offset + Math.max(1, batchSize));
    const args = [];
    batch.forEach((row) => {
      const playerId = String(row && row.playerId || '').trim();
      if (!playerId) return;
      args.push(Math.max(0, Number(row.arenaScore) || 0), playerId);
      count += 1;
    });
    if (args.length > 0) await client.zadd(staging, ...args);
  }
  try {
    if (typeof client.rename === 'function') await client.rename(staging, key);
    else {
      await client.del(key);
      if (rows.length > 0) {
        const args = [];
        rows.forEach((row) => {
          const playerId = String(row && row.playerId || '').trim();
          if (playerId) args.push(Math.max(0, Number(row.arenaScore) || 0), playerId);
        });
        if (args.length) await client.zadd(key, ...args);
      }
      if (typeof client.del === 'function') await client.del(staging);
    }
  } catch (err) {
    if (typeof client.del === 'function') await client.del(staging).catch(() => undefined);
    throw err;
  }
  return { ok: true, count };
}

/**
 * 清除排行榜（用于测试/重置）
 * @param {string} type - 排行榜类型
 */
async function clear(type) {
  const client = redis.getClient();
  if (!client) return;

  const key = KEYS[type];
  if (key) await client.del(key);
}

module.exports = { updateScore, getRank, getScore, getTopN, rebuildArenaFromMongo, clear, KEYS };
