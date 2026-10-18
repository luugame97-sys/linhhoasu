'use strict';

// Pure, side-effect-free Arena read model. Persistence/match locking remains
// in the handler; this module deliberately cannot consume tickets or mutate DB.
const battle = require('./BattleService');
const appearance = require('./RoleAppearanceService');
const config = require('./ConfigService');
// All top-level inputs of calcPlayerPower, its HomelandSkinUnlockService
// dependency and RoleAppearanceService. Query callers must use this projection.
const PLAYER_PROJECTION = Object.freeze(Object.fromEntries((
  '_id playerId userId roleId serverId serverName name level avatar avatarUrl avatarFrame title kungfuId subJob '
  + 'arenaScore arenaProtectUntil nextChallengeTime isBot managedBot '
  + 'artifactInfo boxInfo equipInfo fashionInfo fateInfo fishInfo formationInfo homelandInfo '
  + 'other_attr_info petInfo roleInfo spiritInfo swordInfo items'
).split(' ').map(key => [key, 1])));


function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? {} : value));
}
function objectId24(value) {
  const s = String(value == null ? '' : value);
  return /^[0-9a-f]{24}$/i.test(s) ? s : '';
}

// UI unit only: the native client uses ceil(sum(attr * AttrConfig.power)).
// BattleService.calcPowerScore is a legacy /100 score also used by combat;
// leave that calculator and all battle attributes untouched.
function displayPower(attrs = {}) {
  const weights = config.get('AttrConfig') || {};
  let sum = 0;
  for (const key of Object.keys(attrs || {})) {
    const row = weights[parseInt(key, 10)];
    if (row && Number(row.power) !== -1) sum += Number(attrs[key]) * Number(row.power);
  }
  const value = Math.ceil(sum);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

// Resolve the current, server-authoritative display value from a complete
// player snapshot.  `calcPowerScore` is deliberately not used here: it is a
// legacy /100 value consumed by battle internals.  Callers that only have a
// public row must pass an already-normalized `power` instead of guessing a
// conversion factor.
function displayPowerFromPlayer(player = {}) {
  // Do not fabricate a combat value from a partial public row.  Those rows
  // can legitimately carry an already-computed native `power` or a domain
  // score (guild/event points) and are not sufficient to recalculate attrs.
  const sourceKeys = [
    'roleInfo', 'equipInfo', 'formationInfo', 'fashionInfo', 'fateInfo',
    'fishInfo', 'artifactInfo', 'boxInfo', 'other_attr_info', 'petInfo',
    'petSoulInfo', 'spiritInfo', 'swordInfo', 'homelandInfo', 'oldTrekInfo',
    'valhallaInfo', 'bloodlineInfo', 'elfInfo', 'items', 'currencies',
  ];
  if (!player || !sourceKeys.some(key => player[key] && typeof player[key] === 'object')) return 0;
  try {
    return displayPower(battle.calcPlayerPower(player || {}));
  } catch (_err) {
    return 0;
  }
}

function buildPlayerView(player = {}, serverId = 0) {
  const source = {};
  for (const key of Object.keys(PLAYER_PROJECTION)) {
    if (player[key] !== undefined) source[key] = key === '_id' ? String(player[key]) : clone(player[key]);
  }
  appearance.ensureRoleAppearance(source);
  const attrs = clone(battle.calcPlayerPower(source));
  const powerScore = Math.max(0, int(battle.calcPowerScore(attrs), 0));
  const power = displayPower(attrs);
  const dbid = objectId24(source._id) || objectId24(source.dbid);
  if (!dbid) throw Object.assign(new Error('ARENA_PLAYER_DBID_INVALID'), { code: 'ARENA_PLAYER_DBID_INVALID' });
  const publicRow = {
    dbid, playerId: String(source.playerId || ''), serverId: Math.max(1, int(serverId, 1)),
    name: String(source.name || ''), level: Math.max(1, int(source.level, 1)),
    avatar: Math.max(0, int(source.avatar, 0)), avatarFrame: int(source.avatarFrame, -1),
    title: int(source.title, -1), kungfuId: int(source.kungfuId || (source.roleInfo || {}).kungfuId, 0),
    subJob: int(source.subJob || (source.roleInfo || {}).subJob, 0),
    score: Math.max(0, int(source.arenaScore, 1000)), point: Math.max(0, int(source.arenaScore, 1000)),
    power, powerScore, powerUnit: 'native-weighted-point', isRobot: false, nextChallengeTime: Math.max(0, int(source.arenaProtectUntil || source.nextChallengeTime, 0)),
  };
  const showInfo = appearance.normalizeShowInfo({ ...publicRow,
    avatarUrl: String(source.avatarUrl || ''),
    stage: int((source.roleInfo || {}).stageId || (source.roleInfo || {}).stage, 1),
    petId: appearance.getPrimaryBattlePetId(source),
    equipMap: clone((source.equipInfo || {}).equipMap),
    fashionMap: clone(appearance.getPlayerFashionMap(source)),
  });
  Object.assign(publicRow, showInfo);
  const petEntity = appearance.applyPrimaryBattlePetParts({ showInfo: clone(showInfo), parts: {}, partValues: {} }, source);
  const playerSnapshot = { ...source, dbid, serverId: publicRow.serverId, attrs: clone(attrs),
    power: powerScore, displayPower: power, score: publicRow.score, showInfo: petEntity.showInfo, parts: petEntity.parts,
    partValues: petEntity.partValues, battlePetIds: petEntity.battlePetIds || [] };
  return { publicRow, attrs, playerSnapshot };
}

function chooseOpponents(candidates, previousIds = [], count = 5, rng = Math.random) {
  const byId = new Map();
  for (const row of Array.isArray(candidates) ? candidates : []) {
    const id = String(row && (row.dbid || row.playerId) || '');
    if (id && !byId.has(id)) byId.set(id, row);
  }
  const rows = Array.from(byId.values());
  const old = new Set((Array.isArray(previousIds) ? previousIds : []).map(String));
  const limit = Math.max(0, Math.min(5, int(count, 5)));
  const shuffled = rows.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const value = Number(rng());
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('ARENA_RNG_INVALID');
    const j = Math.floor(value * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const unseen = shuffled.filter(row => !old.has(String(row.dbid || row.playerId || '')));
  const seen = shuffled.filter(row => old.has(String(row.dbid || row.playerId || '')));
  const selected = unseen.concat(seen).slice(0, limit);
  const changed = selected.length !== old.size || selected.some(row => !old.has(String(row.dbid || row.playerId || '')));
  return { opponents: selected, changed, noChange: !changed };
}

function isRankEligible(player, excludedIds = []) {
  if (!player || player.isBot || player.managedBot || !player.playerId || !objectId24(player._id)) return false;
  const ids = [player.playerId, player.userId, player._id].map(String);
  return !ids.some(id => /lhs_real_bot_/i.test(id) || excludedIds.includes(id));
}
function rankRows(players = [], limit = 20, excludedIds = []) {
  const rows = (Array.isArray(players) ? players : []).filter(p => isRankEligible(p, excludedIds));
  return rows.sort((a, b) => Math.max(0, int(b.arenaScore, 1000)) - Math.max(0, int(a.arenaScore, 1000))
    || Buffer.compare(Buffer.from(String(b.playerId)), Buffer.from(String(a.playerId)))).slice(0, Math.max(0, int(limit, 20)));
}

function buildRanking(players, selfId, limit = 20, excludedIds = []) {
  const sorted = rankRows(players, players.length, excludedIds);
  const index = sorted.findIndex(p => String(p.playerId) === String(selfId));
  return { rows: sorted.slice(0, limit), count: sorted.length, selfRank: index < 0 ? -1 : index + 1 };
}

function robotCandidates() {
  return Object.values(config.get('ArenaRobotConfig') || {}).filter(row => /^\d+$/.test(String(row.id)) && row.robotAttrs)
    .map(row => ({ dbid: String(row.id), isRobot: true, level: row.robotLv, robotLv: row.robotLv,
      score: row.score, point: row.score, robotAttrs: clone(row.robotAttrs),
      power: displayPower(row.robotAttrs), powerScore: battle.calcPowerScore(row.robotAttrs), powerUnit: 'native-weighted-point', nextChallengeTime: 0 }));
}

module.exports = { PLAYER_PROJECTION, displayPower, displayPowerFromPlayer, buildPlayerView, chooseOpponents, rankRows, buildRanking,
  isRankEligible, robotCandidates, objectId24 };
