/** Pure rod/raft upgrade contract. Never normalizes or repairs saved progression. */
'use strict';
const config = require('./ConfigService');
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const TABLES = { rod: 'FishRodGradeConfig', raft: 'FishRaftGradeConfig' };

function read(info, kind) {
  if (!TABLES[kind]) return { error: 'FISH_GEAR_INVALID' };
  const rank = Number(info[kind + 'Rank']), level = Number(info[kind + 'Level']), exp = Number(info[kind + 'Exp']);
  const table = config.get(TABLES[kind]) || {}, row = table[rank], next = table[rank + 1];
  if (!integer(rank, 1) || !integer(level) || !integer(exp) || !row
      || !integer(row.level, 1) || !integer(row.exp, 1) || level > row.level || exp > row.exp
      || (level < row.level && exp === row.exp)) return { error: 'FISH_GEAR_STATE_INVALID' };
  const full = level === row.level && exp === row.exp;
  return { rank, level, exp, row, next, full, max: full && !next,
    state: { rank, level, exp } };
}

function plan(player, kind, params) {
  const info = player.fishInfo, meta = read(info, kind);
  if (meta.error) return meta;
  if (!(player.systemUnlockInfo?.unlockedSystem || []).includes(kind === 'rod' ? 215 : 223)) {
    return { error: 'FISH_GEAR_LOCKED' };
  }
  if (!params || !['level', 'fast', 'grade'].includes(params.action)
      || typeof params.upgradeAll !== 'boolean' || params.upgradeAll !== (params.action === 'fast')) {
    return { error: 'FISH_GEAR_ACTION_INVALID' };
  }
  const expected = params.expectedState;
  if (!expected || !integer(expected.rank, 1) || !integer(expected.level) || !integer(expected.exp)) {
    return { error: 'FISH_GEAR_STATE_REQUIRED' };
  }
  if (expected.rank !== meta.rank || expected.level !== meta.level || expected.exp !== meta.exp) {
    return { error: 'FISH_GEAR_STALE' };
  }
  if (meta.max) return { error: 'FISH_GEAR_MAX' };
  const grade = params.action === 'grade';
  if (grade !== meta.full) return { error: grade ? 'FISH_GEAR_NOT_READY' : 'FISH_GEAR_GRADE_REQUIRED' };
  const cost = grade ? meta.row.gradeUpCost : meta.row.levelUpCost;
  if (!cost || cost.id !== (grade ? 69 : 68) || !integer(cost.count, 1)) {
    return { error: 'FISH_GEAR_CONFIG_INVALID' };
  }
  const have = Number(player.items?.[cost.id] || 0);
  if (!integer(have)) return { error: 'FISH_GEAR_INVENTORY_INVALID' };
  const steps = grade || params.action === 'level' ? 1
    : Math.min(meta.row.exp - meta.exp, Math.floor(have / cost.count));
  const amount = cost.count * steps;
  if (!steps || !integer(amount, 1) || have < amount) return { error: 'FISH_GEAR_FUNDS_NOT_ENOUGH', cost };
  let { rank, level, exp } = meta;
  if (grade) { rank++; level = 1; exp = 0; }
  else {
    exp += steps;
    if (exp === meta.row.exp && level < meta.row.level) { level++; exp = 0; }
    // At the level cap the final bar stays full, ready for explicit grade/MAX.
  }
  return { before: meta.state, state: { rank, level, exp }, cost: { id: cost.id, count: amount }, steps, action: params.action };
}

function apply(info, kind, plan) {
  const { rank, level, exp } = plan.state;
  info[kind + 'Rank'] = rank;
  info[kind + 'Level'] = level;
  info[kind + 'Exp'] = exp;
}

function response(info, kind) {
  const meta = read(info, kind);
  return { rank: info[kind + 'Rank'], level: info[kind + 'Level'], exp: info[kind + 'Exp'],
    max: !!meta.max, gradeReady: !!meta.full && !!meta.next, gearProtocol: 1 };
}

function raftMastery(info, player) {
  // The model's raftId alone is insufficient: legacy normalization inserts the
  // default raft before the feature is unlocked. Use the server unlock ledger.
  if (!(player?.systemUnlockInfo?.unlockedSystem || []).includes(223)) return 0;
  const raftId = Number(info.raftId), rank = Number(info.raftRank);
  if (!integer(raftId, 1) || !(config.get('FishRaftConfig') || {})[raftId]) return 0;
  const value = (config.get('FishRaftGradeConfig') || {})[rank]?.attrs?.[104];
  return integer(value) ? value : 0;
}

module.exports = { read, plan, apply, response, raftMastery };
