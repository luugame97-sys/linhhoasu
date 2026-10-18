/**
 * Arena and cross-arena handlers.
 * tag: 2600/2601/2602 arena
 * tag: 4500/4501 double tower basic flow
 * tag: 5000/5001/5002 cross arena basic flow
 */

const crypto = require('crypto');
const battle = require('../services/BattleService');
const playerService = require('../services/PlayerService');
const rank = require('../services/RankService');
const redis = require('../db/redis');
const arenaReadModel = require('../services/ArenaReadModelService');
const config = require('../services/ConfigService');
const logger = require('../logger');
const Account = require('../db/models/Account');
const Player = require('../db/models/Player');
const ArenaFightLog = require('../db/models/ArenaFightLog');
const { addArenaChallengeCount } = require('../services/MainTaskProgressService');
const { addRewardToPlayer, buildChapterFightEvents } = require('./raid');
const { buildPlayer500Data } = require('./playerPayload');
const runtimeBus = require('../services/RuntimeBus');
const playerMutation = require('../services/PlayerMutationService');
const scoreMutation = require('../services/CompetitionScoreService');
const {
  ensureRoleAppearance,
  getPlayerFashionMap,
  getPrimaryBattlePetId,
  applyPrimaryBattlePetParts,
} = require('../services/RoleAppearanceService');
const { ensureValhallaInfo } = require('./valhalla');
const crossEvents = require('../services/CrossServerEventService');
const sideTasks = require('../services/SideTaskProgressService');
const doubleTowerLifecycle = require('../services/DoubleTowerLifecycleService');
const featureMutation = require('../services/FeatureMutationService');

const ARENA_ROBOT_KUNGFU_IDS = [4, 5, 6, 8, 1];
const ARENA_PLAYER_SKILL_ID = 1002;
const ARENA_PLAYER_BEHAVIOR_ID = 10020;

function buildTaskUpdatePacketsSafe(player, msgUid = 0) {
  try {
    // eslint-disable-next-line global-require
    const task = require('./task');
    if (task && typeof task.buildActiveTaskUpdatePackets === 'function') {
      return task.buildActiveTaskUpdatePackets(player, msgUid);
    }
  } catch (_err) {}
  return [];
}

const DOUBLE_TOWER_DAY_MS = 24 * 60 * 60 * 1000;
const TOP_COMBAT_FALLBACK_RANK = 9999;
const TOP_COMBAT_REFRESH_SEC = 30;
const TOP_ARENA_DEFAULT_RANK = 200;
const TOP_ARENA_MAX_RANK = 2000;
const TOP_ARENA_REFRESH_SEC = 30;
const ARENA_DEFAULT_MAX_COUNT = 10;
const ARENA_REFRESH_SEC = 3;
const ARENA_PROTECT_SEC = 30;
const ARENA_CHALLENGE_TTL_SEC = 90;
const ARENA_RECEIPT_PENDING_SEC = 30;
const ARENA_LEDGER_LIMIT = 32;
const ARENA_TIMEZONE_OFFSET_MIN = Math.max(
  -720,
  Math.min(840, toSafeInt(process.env.ARENA_TIMEZONE_OFFSET_MIN, 420))
);

function topArenaLiveState(now = Date.now()) {
  return require('../services/CrossEventScheduleService').topInfo(
    crossEvents.cycleFor('topArena', now), now,
  );
}

function topArenaGateResponse(tag, msgUid, state, code = 'TOP_ARENA_CLOSED') {
  return { tag, msgUid, data: {
    result: 1, code, message: code === 'TOP_ARENA_CLOSED'
      ? 'Thiên Hạ Đệ Nhất chưa đến kỳ mở.' : 'Thiên Hạ Đệ Nhất chưa ở giai đoạn này.',
    info: state, challengeInfo: { rank: TOP_ARENA_DEFAULT_RANK, refreshtime: 0, challengeList: [], infoMap: {} },
  } };
}

// A player can be connected through more than one socket. Serialize Arena
// mutations per user so duplicate sockets cannot race the same in-memory
// snapshot. The map is intentionally narrow and is cleaned after completion.
const arenaMutationLocks = new Map();
const arenaReceiptCache = new Map();

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function ensurePlainObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }
  return value;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function arenaDayKey(now = Date.now()) {
  const shifted = new Date(now + ARENA_TIMEZONE_OFFSET_MIN * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function arenaMaxCount() {
  const base = ensurePlainObject(config.get('ArenaBaseConfig'));
  const constCfg = ensurePlainObject(config.get('ConstConfig'));
  return Math.max(
    1,
    toSafeInt(base.maxCount, toSafeInt(constCfg.arenaDailyMaxCount, ARENA_DEFAULT_MAX_COUNT))
  );
}

function arenaTicketMax() {
  const base = ensurePlainObject(config.get('ArenaBaseConfig'));
  const constCfg = ensurePlainObject(config.get('ConstConfig'));
  return Math.max(1, toSafeInt(
    base.ticketMax,
    toSafeInt(constCfg.arenaTicketMax, 3)
  ));
}

function arenaTicketInit() {
  const constCfg = ensurePlainObject(config.get('ConstConfig'));
  return Math.max(0, toSafeInt(constCfg.initArenaTicket, arenaTicketMax()));
}

function recoverArenaTickets(player, dayChanged = false) {
  if (!player || typeof player !== 'object' || !dayChanged) return false;
  const max = arenaTicketMax();
  const current = getArenaItemCount(player, 10);
  if (current >= max) return false;
  player.items = ensurePlainObject(player.items);
  player.items[10] = Math.max(current, arenaTicketInit());
  return player.items[10] !== current;
}

function calculateArenaScoreChange(attackerScore, defenderScore, win) {
  const base = ensurePlainObject(config.get('ArenaBaseConfig'));
  const scoreStep = Math.max(1, toSafeInt(base.scoreStep, 100));
  const baseDelta = Math.max(1, toSafeInt(base.scoreBase, 10));
  const maxDelta = Math.max(baseDelta, toSafeInt(base.scoreMaxDelta, 50));
  const advantage = toSafeInt(defenderScore, 0) - toSafeInt(attackerScore, 0);
  const delta = Math.max(1, Math.min(maxDelta, baseDelta + Math.floor(advantage / scoreStep)));
  return win ? delta : -delta;
}

function getArenaBattleRewards(score) {
  const base = ensurePlainObject(config.get('ArenaBaseConfig'));
  const sections = ensureArray(base.arenaReward);
  if (sections.length <= 0) return [];
  const thresholds = ensureArray(base.arenaScoreSection);
  let index = 0;
  thresholds.forEach((threshold, idx) => {
    if (toSafeInt(score, 0) >= toSafeInt(threshold, 0)) index = idx;
  });
  return ensureArray(sections[Math.min(index, sections.length - 1)])
    .map((row) => ({ id: Math.max(0, toSafeInt(row && row.id, 0)), count: Math.max(0, toSafeInt(row && row.count, 0)) }))
    .filter((row) => row.id > 0 && row.count > 0);
}

function ensureArenaState(player, now = Date.now()) {
  if (!player || typeof player !== 'object') {
    return { changed: false, dayKey: arenaDayKey(now), dailyCount: 0, maxCount: arenaMaxCount() };
  }

  let changed = false;
  const dayKey = arenaDayKey(now);
  const previousDay = String(player.arenaDayKey || '');
  if (previousDay && previousDay !== dayKey) {
    player.arenaDayKey = dayKey;
    player.arenaDailyCount = 0;
    player.arenaRefreshAt = 0;
    changed = true;
    changed = recoverArenaTickets(player, true) || changed;
  } else if (!previousDay) {
    player.arenaDayKey = dayKey;
    changed = true;
    // Legacy documents may not have an Arena day marker. Grant only up to
    // the configured ticket cap; never reduce an existing balance.
    changed = recoverArenaTickets(player, true) || changed;
  }
  const dailyCount = Math.max(0, toSafeInt(player.arenaDailyCount, 0));
  if (dailyCount !== player.arenaDailyCount) {
    player.arenaDailyCount = dailyCount;
    changed = true;
  }
  const refreshAt = Math.max(0, toSafeInt(player.arenaRefreshAt, 0));
  if (refreshAt !== player.arenaRefreshAt) {
    player.arenaRefreshAt = refreshAt;
    changed = true;
  }
  const protectUntil = Math.max(0, toSafeInt(player.arenaProtectUntil, 0));
  if (protectUntil !== player.arenaProtectUntil) {
    player.arenaProtectUntil = protectUntil;
    changed = true;
  }
  player.arenaStateVersion = Math.max(1, toSafeInt(player.arenaStateVersion, 1));
  return { changed, dayKey, dailyCount: player.arenaDailyCount, maxCount: arenaMaxCount() };
}

function arenaPlayerId(session, player) {
  return String((player && (player.playerId || player.userId)) || (session && session.userId) || '').trim();
}

function arenaReceiptId(params, session, player, action = 'fight', msgUid = 0) {
  const requestId = String(
    (params && (params.requestId || params.fightId || params.msgUid))
      || msgUid
      || (session && session._lastArenaMsgUid)
      || ''
  ).trim();
  const target = String(
    (params && (params.logUid || params.enemyid || params.targetId || params.targetIndex || params.index)) || ''
  ).trim();
  const version = String(params && params.challengeVersion || '').trim();
  const raw = `${action}:${resolveArenaServerId(session, player)}:${arenaPlayerId(session, player)}:${requestId || crypto.randomUUID()}:${target}:${version}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function withArenaMutationLock(key, work) {
  const lockKey = String(key || 'arena:anonymous');
  const previous = arenaMutationLocks.get(lockKey) || Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  const settled = current.finally(() => {
    if (arenaMutationLocks.get(lockKey) === settled) arenaMutationLocks.delete(lockKey);
  });
  arenaMutationLocks.set(lockKey, settled);
  return current;
}

function cloneArenaResponse(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
}

function normalizeArenaErrorResponse(value, fallbackTag, msgUid) {
  const packets = Array.isArray(value) ? value : [value];
  const normalized = packets.map((packet) => {
    if (!packet || typeof packet !== 'object') return packet;
    const data = packet.data && typeof packet.data === 'object' ? packet.data : null;
    if (!data || Number(data.result) !== -1) return packet;
    return {
      ...packet,
      tag: packet.tag || fallbackTag,
      msgUid: packet.msgUid == null ? msgUid : packet.msgUid,
      data: {
        enemyid: '000000000000000000000000',
        retryable: /SAVE_FAILED|INTERNAL|RECEIPT_UNAVAILABLE|REQUEST_IN_PROGRESS|LIST_FAILED|SIMULATION_FAILED/.test(String(data.code || '')),
        ...data,
      },
    };
  });
  return Array.isArray(value) ? normalized : normalized[0];
}

function rebindArenaResponseMsgUid(value, msgUid) {
  const packets = Array.isArray(value) ? value : [value];
  const rebound = packets.map((packet) => {
    if (!packet || typeof packet !== 'object' || packet.msgUid == null || Number(packet.msgUid) === 0) return packet;
    return { ...packet, msgUid };
  });
  return Array.isArray(value) ? rebound : rebound[0];
}

function getArenaReceipt(id) {
  const row = arenaReceiptCache.get(id);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    arenaReceiptCache.delete(id);
    return null;
  }
  return row;
}

function putArenaReceipt(id, response, status = 'done') {
  arenaReceiptCache.set(id, {
    status,
    response: cloneArenaResponse(response),
    expiresAt: Date.now() + (status === 'pending' ? ARENA_RECEIPT_PENDING_SEC * 1000 : 5 * 60 * 1000),
  });
}

function clearArenaReceipt(id) {
  arenaReceiptCache.delete(id);
}

function getArenaLedger(player) {
  if (!player || typeof player !== 'object') return [];
  if (!Array.isArray(player.arenaReceiptLedger)) player.arenaReceiptLedger = [];
  return sanitizeArenaLedgerList(player.arenaReceiptLedger);
}

function findArenaLedgerEntry(player, receiptId) {
  const id = String(receiptId || '');
  if (!id) return null;
  return getArenaLedger(player).find((row) => row && String(row.id || '') === id) || null;
}

function sanitizeArenaLedgerEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const clean = { ...entry };
  if (clean.targetScore && typeof clean.targetScore === 'object') {
    const { document: _doc, ...cleanTargetScore } = clean.targetScore;
    clean.targetScore = cleanTargetScore;
  }
  return clean;
}

function sanitizeArenaLedgerList(list) {
  if (!Array.isArray(list)) return list;
  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index];
    if (entry && typeof entry === 'object') list[index] = sanitizeArenaLedgerEntry(entry);
  }
  return list;
}

function rememberArenaLedger(player, entry) {
  if (!player || typeof player !== 'object' || !entry || !entry.id) return;
  const list = getArenaLedger(player);
  const id = String(entry.id);
  const sanitized = sanitizeArenaLedgerEntry(entry);
  const index = list.findIndex((row) => row && String(row.id || '') === id);
  if (index >= 0) list[index] = { ...list[index], ...sanitized };
  else list.push({ ...sanitized, id });
  list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  if (list.length > ARENA_LEDGER_LIMIT) list.splice(0, list.length - ARENA_LEDGER_LIMIT);
}

function buildRecoveredArenaResponse(entry, msgUid, responseTag = 2602, player = {}) {
  if (!entry) return null;
  const recoveredFight = recoverArenaFightResult(entry, player);
  return {
    tag: responseTag,
    msgUid,
    data: {
      result: 0,
      recovered: true,
      enemyid: String(entry.enemyid || entry.enemyDbid || ''),
      score: Math.max(0, toSafeInt(entry.score, 0)),
      scorechange: toSafeInt(entry.scorechange, 0),
      rank: Math.max(1, toSafeInt(entry.rank, 999)),
      rewards: ensureArray(entry.rewards),
      rewardInfo: buildRewardInfo(ensureArray(entry.rewards)),
      fightId: String(entry.fightId || ''),
      logUid: Math.max(0, toSafeInt(entry.logUid, 0)),
      items: ensureArray(entry.items),
      changed: ensureArray(entry.changed),
      win: toSafeInt(entry.win, 0),
      fightResult: recoveredFight,
      playerAttrs: entry.playerAttrs || {}, opponentAttrs: entry.opponentAttrs || {},
    },
  };
}

function recoverArenaFightResult(entry, player = {}) {
  const result = clonePlain(entry.fightResult || {});
  const atk = entry.playerAttrs || result.atkAttr || {};
  const def = entry.opponentAttrs || result.defAttr || {};
  const win = !!entry.win;
  if (!Array.isArray(result.entitys) || result.entitys.length < 2) {
    // Legacy committed receipts contain attrs/outcome but no entities. Repair
    // the presentation only; never re-simulate, charge, or grant on recovery.
    const own = buildArenaFightSelfShowInfo(player, resolveArenaServerId(null, player), arenaReadModel.displayPower(atk));
    const enemy = buildArenaFightOpponentShowInfo({ dbid: entry.enemyDbid || entry.enemyid,
      name: 'Đối thủ Võ Đạo Hội', level: player.level, power: arenaReadModel.displayPower(def) }, player.level);
    result.entitys = [own, enemy].map((showInfo, i) => {
      const hp = Math.max(1, toSafeInt((i ? def : atk)[1], 100));
      const entity = { id: Math.max(1, toSafeInt(showInfo.kungfuId, 4)), dbid: showInfo.dbid, name: showInfo.name,
        type: 1, side: i + 1, camp: i + 1, pos: i ? -1 : 1, posIndex: i ? -1 : 1,
        hp, maxhp: hp, maxHp: hp, vars: buildFightVars(hp), showInfo, parts: {}, partValues: {} };
      return i ? entity : applyPrimaryBattlePetParts(entity, player);
    });
  }
  result.type = toSafeInt(result.type, 2); result.win = win ? 1 : 0;
  result.atkAttr = atk; result.defAttr = def;
  result.entitys.slice(0, 2).forEach((entity, i) => {
    if (entity.showInfo) entity.showInfo = { ...entity.showInfo,
      power: arenaReadModel.displayPower(i ? def : atk), powerUnit: 'native-weighted-point' };
  });
  if (!Array.isArray(result.events) || !result.events.length) {
    if (result.combatSummary?.rulesVersion === 'custom-pvp-v1') throw new Error('CUSTOM_COMBAT_REPLAY_MISSING');
    result.events = buildArenaBattleEvents(Math.max(1, toSafeInt(atk[1], 100)), Math.max(1, toSafeInt(def[1], 100)), result.entitys[1].showInfo, win).events;
  }
  return result;
}

function compactArenaFightResult(result) {
  const copy = clonePlain(result);
  if (copy.combatSummary?.rulesVersion === 'custom-pvp-v1') {
    // Preserve the committed animation, especially timeout wins with both
    // actors alive. Never manufacture a kill or reroll RNG on receipt recovery.
    if (Buffer.byteLength(JSON.stringify(copy)) > 96 * 1024) throw new Error('CUSTOM_COMBAT_RECEIPT_TOO_LARGE');
    return copy;
  }
  // Bound durable ledger size. The persisted actors, attributes and outcome
  // are enough to rebuild a deterministic recovery animation.
  copy.events = [];
  return copy;
}

function customCombatSummary(fight) {
  if (fight?.rulesVersion !== 'custom-pvp-v1') return {};
  return { combatSummary: {
    rulesVersion: fight.rulesVersion, mode: fight.mode, resolution: fight.resolution,
    totalRounds: fight.totalRounds, firstActor: fight.firstActor,
    playerHPLeft: fight.playerHPLeft, monsterHPLeft: fight.monsterHPLeft,
    playerDamage: fight.playerDamage, monsterDamage: fight.monsterDamage,
  } };
}

function buildCompetitionFightResult(player, opponent, atk, def, fight, type, serverId) {
  const own = buildArenaFightSelfShowInfo(player, serverId, arenaReadModel.displayPower(atk));
  own.dbid = toArenaDbid(player);
  const enemy = buildArenaFightOpponentShowInfo(opponent, player.level);
  const entities = [own, enemy].map((showInfo, i) => {
    const hp = Math.max(1, toSafeInt((i ? def : atk)[1], 100));
    const entity = { id: Math.max(1, toSafeInt(showInfo.kungfuId, 4)), dbid: showInfo.dbid, name: showInfo.name,
      type: 1, side: i + 1, camp: i + 1, pos: i ? -1 : 1, posIndex: i ? -1 : 1,
      hp, maxhp: hp, maxHp: hp, vars: buildFightVars(hp), showInfo,
      parts: i ? clonePlain(opponent.parts || {}) : {}, partValues: i ? clonePlain(opponent.partValues || {}) : {} };
    return i ? entity : applyPrimaryBattlePetParts(entity, player);
  });
  let events = buildChapterFightEvents(null, null, atk, def, fight, { player, enemyAsPlayer: !opponent.isRobot,
    enemyPlayer: { ...opponent, roleInfo: { kungfuId: opponent.kungfuId, subJob: opponent.subJob } } });
  if (!Array.isArray(events) || !events.length) events = buildArenaBattleEvents(atk[1], def[1], enemy, !!fight.win).events;
  return { type, win: fight.win ? 1 : 0, mustChangeTurn: 0, notChangeTurn: 1,
    ...customCombatSummary(fight),
    atkAttr: clonePlain(atk), defAttr: clonePlain(def), damage: fight.rulesVersion === 'custom-pvp-v1'
      ? { 1: intDamage(fight.playerDamage), '-1': intDamage(fight.monsterDamage) }
      : { 1: intDamage(fight.monsterDamage), '-1': intDamage(fight.playerDamage) },
    isBackFight: type === 17, events, entitys: entities, guildBossAllDamage: 0, bloodlineOffset: 0 };
}
function intDamage(value) { return Math.max(0, toSafeInt(value)); }

function buildRecoveredArenaRefreshResponse(entry, msgUid) {
  if (!entry) return null;
  return {
    tag: 2601,
    msgUid,
    data: {
      result: 0,
      recovered: true,
      score: Math.max(0, toSafeInt(entry.score, 1000)),
      dailyCount: Math.max(0, toSafeInt(entry.dailyCount, 0)),
      maxCount: Math.max(1, toSafeInt(entry.maxCount, arenaMaxCount())),
      challengelist: ensureArray(entry.challengelist),
      challengeVersion: String(entry.challengeVersion || ''),
      refreshtime: Math.max(0, toSafeInt(entry.refreshtime, 0)),
      items: ensureArray(entry.items),
      changed: ensureArray(entry.changed),
    },
  };
}

async function ensureArenaFightLogFromLedger(entry, session, player) {
  if (!entry || !entry.fightId || !player) return;
  try {
    await ArenaFightLog.updateOne(
      { fightId: String(entry.fightId) },
      { $setOnInsert: {
        fightId: String(entry.fightId),
        serverId: resolveArenaServerId(session, player),
        attackerId: String(player.playerId || player.userId || ''),
        targetId: String(entry.enemyDbid || entry.enemyid || ''),
        logUid: Math.max(0, toSafeInt(entry.logUid, 0)),
        msgUid: 0,
        preScore: Math.max(0, toSafeInt(entry.score, 0) - toSafeInt(entry.scorechange, 0)),
        postScore: Math.max(0, toSafeInt(entry.score, 0)),
        scoreChange: toSafeInt(entry.scorechange, 0),
        targetPlayerId: String(entry.targetScore?.targetPlayerId || ''),
        targetPreScore: Math.max(0, toSafeInt(entry.targetScore?.scoreBefore, 0)),
        targetPostScore: Math.max(0, toSafeInt(entry.targetScore?.scoreAfter, 0)),
        targetScoreChange: toSafeInt(entry.targetScore?.scoreChange, 0),
        zeroSumVersion: entry.targetScore && entry.targetScore.status === 'done' ? 1 : 0,
        cost: [{ id: 10, count: 1 }],
        rewards: ensureArray(entry.rewards),
        win: toSafeInt(entry.win, 0),
        createdAt: new Date(Math.max(0, toSafeInt(entry.createdAt, Date.now()))),
      } },
      { upsert: true, maxTimeMS: 1500 },
    ).exec();
  } catch (err) {
    logger.warn(`[Arena] ledger log repair failed: ${err.message}`);
  }
}

async function retryArenaTargetScoreFromLedger(entry) {
  const target = entry && entry.targetScore;
  if (!target || !target.targetPlayerId || !entry.fightId || !entry.scorechange) {
    return { status: 'skipped', scoreChange: 0 };
  }
  return applyArenaDefenderScore({
    selectedChallenge: { playerId: target.targetPlayerId, isRobot: false },
    scoreChange: toSafeInt(entry.scorechange, 0),
    fightId: entry.fightId,
    serverId: Math.max(1, toSafeInt(target.targetServerId, 1)),
  });
}

function arenaReceiptRedisKey(id) {
  return `arena:receipt:${String(id || '').replace(/[^0-9A-Za-z:_-]/g, '_')}`;
}

async function claimArenaReceipt(id) {
  const local = getArenaReceipt(id);
  if (local) return local;
  const client = redis.getClient();
  const allowMemory = String(process.env.ARENA_ALLOW_MEMORY_RECEIPTS || '0') === '1';
  if (!client && !allowMemory) return { status: 'unavailable' };
  if (client) {
    try {
      const key = arenaReceiptRedisKey(id);
      const claimed = await client.set(
        key,
        JSON.stringify({ status: 'pending', expiresAt: Date.now() + ARENA_RECEIPT_PENDING_SEC * 1000 }),
        'EX',
        ARENA_RECEIPT_PENDING_SEC,
        'NX'
      );
      if (claimed !== 'OK') {
        const raw = await client.get(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          // A process can die after claiming the receipt. Reclaim only after
          // the short pending lease; a live request remains protected from a
          // duplicate while it is inside the mutation lock.
          if (parsed && parsed.status === 'pending' && Number(parsed.expiresAt) <= Date.now()) {
            await client.del(key);
            const reclaimed = await client.set(
              key,
              JSON.stringify({ status: 'pending', expiresAt: Date.now() + ARENA_RECEIPT_PENDING_SEC * 1000 }),
              'EX',
              ARENA_RECEIPT_PENDING_SEC,
              'NX'
            );
            if (reclaimed === 'OK') {
              putArenaReceipt(id, null, 'pending');
              return null;
            }
          }
          arenaReceiptCache.set(id, parsed);
          return parsed;
        }
      }
    } catch (err) {
      logger.warn(`[Arena] receipt claim fallback: ${err.message}`);
      if (!allowMemory) return { status: 'unavailable' };
    }
  }
  putArenaReceipt(id, null, 'pending');
  return null;
}

async function storeArenaReceipt(id, response) {
  putArenaReceipt(id, response, 'done');
  const client = redis.getClient();
  if (!client) return;
  try {
    await client.set(
      arenaReceiptRedisKey(id),
      JSON.stringify({ status: 'done', response: cloneArenaResponse(response), expiresAt: Date.now() + 5 * 60 * 1000 }),
      'EX',
      300
    );
  } catch (err) {
    logger.warn(`[Arena] receipt store fallback: ${err.message}`);
  }
}

async function clearArenaReceiptAsync(id) {
  clearArenaReceipt(id);
  const client = redis.getClient();
  if (!client) return;
  try { await client.del(arenaReceiptRedisKey(id)); } catch (_err) {}
}

function getArenaItemCount(player, itemId) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  if (id === 1) return Math.max(0, toSafeInt(player && player.currencies && player.currencies.diamond, 0));
  if (id === 2) return Math.max(0, toSafeInt(player && player.currencies && player.currencies.silver, 0));
  return Math.max(0, toSafeInt(player && player.items && player.items[id], 0));
}

function consumeArenaItem(player, itemId, count) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  const amount = Math.max(0, toSafeInt(count, 0));
  if (!player || id <= 0 || amount <= 0 || getArenaItemCount(player, id) < amount) return false;
  player.items = ensurePlainObject(player.items);
  player.currencies = ensurePlainObject(player.currencies, { diamond: 0, silver: 0, gold: 0 });
  if (id === 1) player.currencies.diamond = getArenaItemCount(player, id) - amount;
  else if (id === 2) player.currencies.silver = getArenaItemCount(player, id) - amount;
  else {
    const left = getArenaItemCount(player, id) - amount;
    if (left > 0) player.items[id] = left;
    else delete player.items[id];
  }
  return true;
}

function buildArenaInventoryDelta(before, player, ids = []) {
  const uniqueIds = Array.from(new Set(ensureArray(ids).map((id) => Math.max(0, toSafeInt(id, 0))).filter((id) => id > 0)));
  const items = [];
  const changed = [];
  uniqueIds.forEach((id) => {
    const beforeCount = getArenaItemCount(before || {}, id);
    const afterCount = getArenaItemCount(player || {}, id);
    const delta = afterCount - beforeCount;
    if (delta !== 0) items.push({ id, count: delta });
    changed.push({ id, count: afterCount });
  });
  return { items, changed };
}

function nextArenaLogUid(player) {
  const current = Number(player && player.arenaLogUid);
  const base = Number.isSafeInteger(current) && current > 0
    ? current
    : Math.floor(Date.now() % 9000000000000000);
  const next = base >= Number.MAX_SAFE_INTEGER - 1 ? 1 : base + 1;
  if (player && typeof player === 'object') player.arenaLogUid = next;
  return next;
}

function buildArenaFightId(session, player, params, msgUid) {
  const request = String(
    (params && (params.fightId || params.requestId)) || msgUid || `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  ).replace(/[^0-9A-Za-z:_-]/g, '_');
  const target = String(
    (params && (params.logUid || params.enemyid || params.targetId || params.targetIndex || params.index)) || ''
  ).replace(/[^0-9A-Za-z:_-]/g, '_');
  return `${resolveArenaServerId(session, player)}:${arenaPlayerId(session, player)}:${request}:${target || 'unknown'}`;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueInts(values = []) {
  const seen = new Set();
  const out = [];
  ensureArray(values).forEach((value) => {
    const id = Math.max(0, toSafeInt(value, 0));
    if (id <= 0 || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function buildFightVars(hpValue = 0) {
  const hp = Math.max(0, toSafeInt(hpValue, 0));
  return {
    1: hp,
    2: 0,
    3: 0,
    '-1': hp,
  };
}

function normalizeArenaRoleSelection(kungfuId, subJob = 0) {
  const probe = { roleInfo: { kungfuId, subJob }, fashionInfo: {} };
  ensureRoleAppearance(probe);
  const roleInfo = ensurePlainObject(probe.roleInfo);
  let normalizedKungfuId = Math.max(1, toSafeInt(roleInfo.kungfuId, 4));
  let normalizedSubJob = Math.max(0, toSafeInt(roleInfo.subJob, 0));

  // GetInitShowDataByKungfu indexes RoleGenderConfig[kungfuId][subJob]
  // directly. A stale persisted row must not be allowed to reach that path.
  const roleGenderConfig = config.get('RoleGenderConfig') || {};
  const hasRoleRow = (id, job) => {
    const kungfu = roleGenderConfig[id] || roleGenderConfig[String(id)];
    if (!kungfu || typeof kungfu !== 'object' || Array.isArray(kungfu)) return false;
    const row = kungfu[job] || kungfu[String(job)];
    return !!row && typeof row === 'object' && !Array.isArray(row);
  };

  if (!hasRoleRow(normalizedKungfuId, normalizedSubJob)) {
    const fallback = Object.keys(roleGenderConfig)
      .map((id) => Math.max(0, toSafeInt(id, 0)))
      .filter((id) => id > 0)
      .sort((a, b) => a - b)
      .map((id) => {
        const kungfu = roleGenderConfig[id] || roleGenderConfig[String(id)];
        const jobs = kungfu && typeof kungfu === 'object' && !Array.isArray(kungfu)
          ? Object.keys(kungfu)
            .map((job) => Math.max(0, toSafeInt(job, -1)))
            .filter((job) => job >= 0)
            .sort((a, b) => a - b)
          : [];
        return jobs.length > 0 ? { kungfuId: id, subJob: jobs.includes(0) ? 0 : jobs[0] } : null;
      })
      .find(Boolean);
    if (fallback) {
      normalizedKungfuId = fallback.kungfuId;
      normalizedSubJob = fallback.subJob;
    }
  }

  return { kungfuId: normalizedKungfuId, subJob: normalizedSubJob };
}

function pickArenaRobotKungfuId(rank) {
  const idx = Math.max(0, toSafeInt(rank, 1) - 1) % ARENA_ROBOT_KUNGFU_IDS.length;
  return ARENA_ROBOT_KUNGFU_IDS[idx] || 4;
}

function getArenaConfigRow(map, id) {
  if (!map || id == null) return null;
  return map[id] || map[String(id)] || null;
}

function resolveArenaBattleActionIds(skillId, fallbackSkillId, fallbackBehaviorId) {
  const skillCfgMap = config.get('SkillConfig') || {};
  const behaviorCfgMap = config.get('SkillBehaviorConfig') || {};
  const safeFallbackSkillId = Math.max(1, toSafeInt(fallbackSkillId, ARENA_PLAYER_SKILL_ID));
  const safeFallbackBehaviorId = Math.max(1, toSafeInt(fallbackBehaviorId, ARENA_PLAYER_BEHAVIOR_ID));

  const preferredSkillCfg = getArenaConfigRow(skillCfgMap, skillId);
  const fallbackSkillCfg = getArenaConfigRow(skillCfgMap, safeFallbackSkillId);
  const skillCfg = preferredSkillCfg || fallbackSkillCfg;
  const resolvedSkillId = Math.max(
    1,
    toSafeInt(skillCfg && skillCfg.id, toSafeInt(skillId, safeFallbackSkillId) || safeFallbackSkillId),
  );

  const actionIds = Array.isArray(skillCfg && skillCfg.actions) ? skillCfg.actions : [];
  let behaviorId = actionIds
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .find((id) => id > 0) || 0;

  if (behaviorId <= 0 && getArenaConfigRow(behaviorCfgMap, resolvedSkillId)) {
    behaviorId = resolvedSkillId;
  }

  if (behaviorId <= 0) {
    behaviorId = safeFallbackBehaviorId;
  }

  return {
    skillId: resolvedSkillId,
    behaviorId,
  };
}

function buildArenaDamageAction(casterPos, targetPos, damage, targetHpAfterHit) {
  const safeDamage = Math.max(0, toSafeInt(damage, 0));
  if (safeDamage <= 0) return null;

  const action = {
    typ: 3,
    i: 0,
    c: casterPos,
    t: targetPos,
    as: [0],
    vs: { 1: -safeDamage },
  };

  if (Math.max(0, toSafeInt(targetHpAfterHit, 0)) <= 0) {
    action.es = [[{ typ: 6, i: 0, c: casterPos, t: targetPos }]];
  }

  return action;
}

function buildArenaSkillEvent(skillId, behaviorId, casterPos, targetPos, damage, targetHpAfterHit) {
  const damageAction = buildArenaDamageAction(casterPos, targetPos, damage, targetHpAfterHit);
  if (!damageAction) return null;

  return {
    typ: 1,
    i: Math.max(1, toSafeInt(skillId, ARENA_PLAYER_SKILL_ID)),
    c: casterPos,
    t: 0,
    as: [0],
    es: [[{
      typ: 2,
      i: Math.max(1, toSafeInt(behaviorId, ARENA_PLAYER_BEHAVIOR_ID)),
      c: casterPos,
      t: 0,
      es: [[damageAction]],
    }]],
  };
}

function buildArenaBattleEvents(playerHpMax, enemyHpMax, enemyShowInfo = {}, playerWins = true) {
  const roundCount = 4;
  const playerSkill = resolveArenaBattleActionIds(
    ARENA_PLAYER_SKILL_ID,
    ARENA_PLAYER_SKILL_ID,
    ARENA_PLAYER_BEHAVIOR_ID,
  );
  const enemyRoleSelection = normalizeArenaRoleSelection(enemyShowInfo.kungfuId, enemyShowInfo.subJob);
  const enemySkill = resolveArenaBattleActionIds(
    enemyRoleSelection.kungfuId,
    ARENA_PLAYER_SKILL_ID,
    ARENA_PLAYER_BEHAVIOR_ID,
  );
  const enemyHit = Math.max(1, Math.floor(playerHpMax * 0.12));
  const playerHit = Math.max(1, Math.floor(enemyHpMax / roundCount));
  let currentEnemyHp = enemyHpMax;
  let currentPlayerHp = playerHpMax;
  const events = [{ typ: 0, i: 0, c: 0, t: 0, es: [] }];

  for (let roundIndex = 1; roundIndex <= roundCount; roundIndex += 1) {
    const round = { typ: 0, i: roundIndex, c: 0, t: 0, es: [] };
    const isFinalRound = roundIndex === roundCount;
    const playerDamage = playerWins && isFinalRound
      ? currentEnemyHp
      : Math.max(0, Math.min(Math.max(0, currentEnemyHp - 1), playerHit));
    currentEnemyHp = Math.max(0, currentEnemyHp - playerDamage);
    const playerEvent = buildArenaSkillEvent(
      playerSkill.skillId,
      playerSkill.behaviorId,
      1,
      -1,
      playerDamage,
      currentEnemyHp,
    );
    if (playerEvent) round.es.push([playerEvent]);

    if (!playerWins || !isFinalRound) {
      const enemyDamage = !playerWins && isFinalRound
        ? currentPlayerHp
        : Math.max(0, Math.min(Math.max(0, currentPlayerHp - 1), enemyHit));
      currentPlayerHp = Math.max(0, currentPlayerHp - enemyDamage);
      const enemyEvent = buildArenaSkillEvent(
        enemySkill.skillId,
        enemySkill.behaviorId,
        -1,
        1,
        enemyDamage,
        currentPlayerHp,
      );
      if (enemyEvent) round.es.push([enemyEvent]);
    }

    if (round.es.length > 0) events.push(round);
  }

  return {
    events,
    currentPlayerHp,
    currentEnemyHp,
  };
}

function buildArenaPostFightChallengeList(challengeList = [], selectedChallenge = null, selectedIndex = -1) {
  const selectedDbid = String(selectedChallenge && selectedChallenge.dbid || '');
  const selectedPlayerId = String(selectedChallenge && selectedChallenge.playerId || '');

  return ensureArray(challengeList)
    .filter((row, index) => {
      if (row === selectedChallenge) return false;
      const rowDbid = String(row && row.dbid || '');
      const rowPlayerId = String(row && row.playerId || '');
      if (selectedDbid && rowDbid === selectedDbid) return false;
      if (selectedPlayerId && rowPlayerId === selectedPlayerId) return false;
      return selectedChallenge ? true : index !== selectedIndex;
    })
    .map((row, index) => {
      const source = ensurePlainObject(row);
      const roleSelection = normalizeArenaRoleSelection(source.kungfuId, source.subJob);
      const level = Math.max(1, toSafeInt(source.level || source.robotLv, 1));
      const power = Math.max(100, toSafeInt(source.power || source.powerScore, 100 + level * 100));
      return {
        ...source,
        score: Math.max(0, toSafeInt(source.score != null ? source.score : source.point, 0)),
        point: Math.max(0, toSafeInt(source.point != null ? source.point : source.score, 0)),
        nextChallengeTime: Math.max(0, toSafeInt(source.nextChallengeTime, 0)),
        dbid: String(source.dbid || source.playerId || (index + 1)),
        serverId: Math.max(1, toSafeInt(source.serverId, 1)),
        avatar: Math.max(0, toSafeInt(source.avatar, 11300)),
        avatarFrame: Math.max(-1, toSafeInt(source.avatarFrame, -1)),
        level,
        power,
        powerScore: Math.max(0, toSafeInt(source.powerScore, power)),
        kungfuId: roleSelection.kungfuId,
        subJob: roleSelection.subJob,
      };
    });
}

function getArenaRobotConfigMap(crossArena = false) {
  if (crossArena) {
    const crossRows = ensurePlainObject(config.get('CrossArenaRobotConfig'));
    if (Object.keys(crossRows).length > 0) return crossRows;
  }
  return ensurePlainObject(config.get('ArenaRobotConfig'));
}

function parseServerIdFromPrefixedId(value, prefix) {
  const text = String(value || '').trim();
  if (!text.startsWith(`${prefix}_`)) return 0;
  const parts = text.split('_');
  return Math.max(0, toSafeInt(parts[1], 0));
}

function resolveArenaServerId(session, player) {
  const candidates = [
    toSafeInt(session && session.serverId, 0),
    parseServerIdFromPrefixedId(session && session.roleId, 'r'),
    parseServerIdFromPrefixedId(player && player.roleId, 'r'),
    parseServerIdFromPrefixedId(session && session.userId, 'u'),
    parseServerIdFromPrefixedId(player && player.userId, 'u'),
    toSafeInt(process.env.DEFAULT_SERVER_ID, 1001),
  ];
  return candidates.find((value) => value > 0) || 1001;
}

function toArenaDbid(targetPlayer) {
  const objectId = targetPlayer && targetPlayer._id != null ? String(targetPlayer._id) : '';
  if (objectId.length === 24) return objectId;
  const raw = String(
    (targetPlayer && (targetPlayer.playerId || targetPlayer.userId || targetPlayer.name)) || 'arena_player'
  )
    .replace(/[^0-9a-z]/gi, '')
    .toLowerCase();
  const normalized = raw.length > 0 ? raw : 'arenaplayer';
  return normalized.padEnd(24, '0').slice(0, 24);
}

function clonePlayerSnapshot(player = {}) {
  if (!player || typeof player !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(player));
  } catch (_err) {
    return { ...player };
  }
}

function buildArenaChallengeRowFromPlayer(targetPlayer, serverId, options = {}) {
  // `lean()` opponent rows are short-lived read models. Avoid cloning a full
  // player document for every candidate; retain the clone for live session
  // objects used by push/update paths.
  const show = options.clone === false ? (targetPlayer || {}) : clonePlayerSnapshot(targetPlayer);
  ensureRoleAppearance(show);
  const attrs = battle.calcPlayerPower(show);
  const roleInfo = ensurePlainObject(show.roleInfo);
  const roleSelection = normalizeArenaRoleSelection(show.kungfuId || roleInfo.kungfuId, roleInfo.subJob);
  const point = Math.max(0, toSafeInt(show.arenaScore, 1000));
  const powerScore = Math.max(100, toSafeInt(battle.calcPowerScore(attrs), 100));
  const power = arenaReadModel.displayPower(attrs);
  return {
    dbid: toArenaDbid(show),
    playerId: show.playerId || '',
    serverId: Math.max(1, toSafeInt(serverId, 1)),
    serverName: '',
    name: show.name || "Tiên hữu cùng máy chủ",
    level: Math.max(1, toSafeInt(show.level, 1)),
    avatar: Math.max(0, toSafeInt(show.avatar, 11300)),
    avatarUrl: show.avatarUrl || '',
    avatarFrame: Math.max(-1, toSafeInt(show.avatarFrame, -1)),
    title: Math.max(0, toSafeInt(show.title, 0)),
    kungfuId: roleSelection.kungfuId,
    subJob: roleSelection.subJob,
    petId: getPrimaryBattlePetId(show),
    robotLv: Math.max(1, toSafeInt(show.level, 1)),
    point,
    score: point,
    power,
    powerScore,
    powerUnit: 'native-weighted-point',
    // Keep a server-authoritative combat snapshot with the display row. The
    // client may ignore this field, while the fight handler can reproduce the
    // exact opponent instead of generating attrs from attacker level/index.
    robotAttrs: clonePlain(attrs),
    isRobot: false,
    nextChallengeTime: 0,
  };
}

async function notifyArenaTargetUpdate(selectedChallenge, player, serverId, pushTag = 2603) {
  const targetPlayerId = String(selectedChallenge && selectedChallenge.playerId || '').trim();
  const selfPlayerId = String(player && player.playerId || '').trim();
  if (!targetPlayerId || targetPlayerId === selfPlayerId || /^\d+$/.test(targetPlayerId)) return;

  try {
    const target = await Player.findOne({ playerId: targetPlayerId }).select({ userId: 1 }).lean();
    const wsServer = runtimeBus.getWsServer();
    if (!target || !target.userId || !wsServer || typeof wsServer.pushToUser !== 'function') return;
    const info = buildArenaChallengeRowFromPlayer(player, serverId);
    wsServer.pushToUser(String(target.userId), pushTag, { info });
  } catch (err) {
    logger.warn(`[Arena] failed to push player update: ${err.message}`);
  }
}

// Apply the defender side of a real-player Võ Đạo Hội result.  The attacker
// receipt is committed first; this mutation is independently idempotent so a
// retry can finish it without charging the attacker again.
async function applyArenaDefenderScore({ selectedChallenge, scoreChange, fightId, serverId }) {
  const targetPlayerId = String(selectedChallenge && selectedChallenge.playerId || '').trim();
  const attackerDelta = toSafeInt(scoreChange, 0);
  if (!targetPlayerId || !attackerDelta || selectedChallenge?.isRobot || /^\d+$/.test(targetPlayerId)) {
    return { status: 'skipped', scoreChange: 0, targetPlayerId };
  }
  const target = await Player.findOne({ playerId: targetPlayerId, isBot: { $ne: true }, managedBot: { $ne: true } })
    .select(arenaReadModel.PLAYER_PROJECTION)
    .maxTimeMS(1500)
    .lean();
  if (!target) throw Object.assign(new Error('ARENA_TARGET_SCORE_NOT_FOUND'), { code: 'ARENA_TARGET_SCORE_NOT_FOUND', retryable: true });

  const result = await scoreMutation.applyAtomicScoreMutation({
    Model: Player,
    query: { playerId: targetPlayerId, isBot: { $ne: true }, managedBot: { $ne: true } },
    field: 'arenaScore',
    markerField: 'arenaScoreReceipts',
    receiptId: String(fightId),
    delta: -attackerDelta,
    defaultScore: 1000,
  });
  const updated = result.document || { ...target, arenaScore: result.scoreAfter };
  const targetScore = Math.max(0, toSafeInt(result.scoreAfter, 0));
  let rankPending = false;
  try {
    await rank.updateScore('arena', targetPlayerId, targetScore);
  } catch (err) {
    rankPending = true;
    await Player.updateOne({ playerId: targetPlayerId }, {
      $set: { arenaRankSyncPending: { score: targetScore, updatedAt: Date.now() } },
    }, { maxTimeMS: 1500 }).exec().catch(() => undefined);
    logger.warn(`[Arena] defender rank update deferred player=${targetPlayerId}: ${err.message}`);
  }

  // Keep an online defender from saving a stale arenaScore over the CAS result
  // on its next action, and push the authoritative row for immediate UI sync.
  const wsServer = runtimeBus.getWsServer();
  const targetUserId = String(target.userId || '').trim();
  if (targetUserId && wsServer) {
    const live = wsServer.getPlayerForMutation?.(targetUserId);
    if (live) {
      live.arenaScore = targetScore;
      if (Array.isArray(updated.arenaScoreReceipts)) live.arenaScoreReceipts = clonePlain(updated.arenaScoreReceipts);
    }
    if (typeof wsServer.pushToUser === 'function') {
      const info = buildArenaChallengeRowFromPlayer({ ...target, ...updated, arenaScore: targetScore }, serverId);
    }
  }
  const { document: _doc, ...cleanResult } = result || {};
  return { ...cleanResult, targetPlayerId, targetUserId, scoreChange: result.scoreChange, rankPending };
}

function buildArenaFightSelfShowInfo(player, serverId, power = 0) {
  const show = clonePlayerSnapshot(player);
  ensureRoleAppearance(show);
  const roleInfo = ensurePlainObject(show.roleInfo);
  const equipInfo = ensurePlainObject(show.equipInfo);
  const roleSelection = normalizeArenaRoleSelection(show.kungfuId || roleInfo.kungfuId, roleInfo.subJob);
  return {
    dbid: String(show.playerId || show.userId || 'arena_self'),
    serverId: Math.max(1, toSafeInt(serverId, 1)),
    serverName: '',
    kungfuId: roleSelection.kungfuId,
    subJob: roleSelection.subJob,
    level: Math.max(1, toSafeInt(show.level, 1)),
    name: String(show.name || 'Player'),
    power: Math.max(0, toSafeInt(power, 0)),
    stage: Math.max(1, toSafeInt(roleInfo.stage, toSafeInt(roleInfo.stageId, 1))),
    petId: getPrimaryBattlePetId(show),
    petSoulId: -1,
    artifactId: 0,
    fate: 0,
    foreverCard: 0,
    equipMap: ensurePlainObject(equipInfo.equipMap),
    fashionMap: getPlayerFashionMap(show),
    avatar: Math.max(0, toSafeInt(show.avatar, toSafeInt(roleInfo.avatar, 11300))),
    avatarUrl: show.avatarUrl ? String(show.avatarUrl) : '',
    avatarFrame: Math.max(-1, toSafeInt(show.avatarFrame, toSafeInt(roleInfo.avatarFrame, -1))),
    title: Math.max(-1, toSafeInt(show.title, toSafeInt(roleInfo.title, -1))),
  };
}

function buildArenaFightOpponentShowInfo(challenge = {}, fallbackLevel = 1) {
  const row = ensurePlainObject(challenge);
  const roleSelection = normalizeArenaRoleSelection(row.kungfuId, row.subJob);
  const nativePower = row.power != null
    ? row.power
    : (row.robotAttrs && typeof row.robotAttrs === 'object'
      ? arenaReadModel.displayPower(row.robotAttrs)
      : (row.displayPower != null ? row.displayPower : row.powerScore));
  return {
    dbid: String(row.dbid || row.playerId || 'arena_enemy'),
    serverId: Math.max(1, toSafeInt(row.serverId, 1)),
    serverName: row.serverName || '',
    kungfuId: roleSelection.kungfuId,
    subJob: roleSelection.subJob,
    level: Math.max(1, toSafeInt(row.level, fallbackLevel)),
    name: String(row.name || "Đối thủ Võ đạo hội"),
    power: Math.max(100, toSafeInt(nativePower, 100)),
    powerUnit: 'native-weighted-point',
    stage: Math.max(1, toSafeInt(row.stage, Math.floor(Math.max(1, toSafeInt(row.level, fallbackLevel)) / 10) + 1)),
    petId: Math.max(0, toSafeInt(row.petId, 0)),
    petSoulId: toSafeInt(row.petSoulId, -1),
    artifactId: Math.max(-1, toSafeInt(row.artifactId, -1)),
    fate: Math.max(0, toSafeInt(row.fate, 0)),
    foreverCard: Math.max(0, toSafeInt(row.foreverCard, 0)),
    equipMap: ensurePlainObject(row.equipMap),
    fashionMap: ensurePlainObject(row.fashionMap),
    avatar: Math.max(0, toSafeInt(row.avatar, 11300)),
    avatarUrl: row.avatarUrl ? String(row.avatarUrl) : '',
    avatarFrame: Math.max(-1, toSafeInt(row.avatarFrame, -1)),
    title: Math.max(-1, toSafeInt(row.title, -1)),
  };
}

async function loadSameServerArenaOpponents(session, player, limit = 5) {
  const maxCount = Math.max(0, toSafeInt(limit, 5));
  if (!player || maxCount <= 0) return [];

  const serverId = resolveArenaServerId(session, player);
  const selfUserId = String((session && session.userId) || (player && player.userId) || '').trim();
  const selfPlayerId = String((player && player.playerId) || '').trim();

  try {
    const accountRows = await Account.find(
      { 'roles.serverId': serverId },
      {
        'roles.userId': 1,
        'roles.serverId': 1,
        'roles.lastLoginTime': 1,
        'roles.createTime': 1,
        _id: 0,
      }
    ).select({
      'roles.userId': 1,
      'roles.serverId': 1,
      'roles.lastLoginTime': 1,
      'roles.createTime': 1,
      _id: 0,
    }).limit(Math.max(100, Math.min(10000, toSafeInt(process.env.ARENA_ACCOUNT_SCAN_LIMIT, 5000))))
      .maxTimeMS(1500).lean();

    const roleRows = [];
    ensureArray(accountRows).forEach((accountRow) => {
      ensureArray(accountRow && accountRow.roles).forEach((role) => {
        if (toSafeInt(role && role.serverId, 0) !== serverId) return;
        const userId = String((role && role.userId) || '').trim();
        if (!userId || userId === selfUserId) return;
        roleRows.push({
          userId,
          lastLoginTime: toSafeInt(role && role.lastLoginTime, 0),
          createTime: toSafeInt(role && role.createTime, 0),
        });
      });
    });

    if (roleRows.length <= 0) return [];

    roleRows.sort((a, b) => {
      if (b.lastLoginTime !== a.lastLoginTime) return b.lastLoginTime - a.lastLoginTime;
      return b.createTime - a.createTime;
    });

    const userIds = Array.from(new Set(roleRows.map((row) => row.userId))).slice(0, Math.max(maxCount * 4, 20));
    if (userIds.length <= 0) return [];

    const playerRows = await Player.find({ userId: { $in: userIds } })
      .select(arenaReadModel.PLAYER_PROJECTION)
      .maxTimeMS(1500)
      .lean();
    const playerMap = new Map(
      ensureArray(playerRows).map((row) => [String((row && row.userId) || '').trim(), row])
    );

    const selfScore = Math.max(0, toSafeInt(player && player.arenaScore, 1000));
    const selfLevel = Math.max(1, toSafeInt(player && player.level, 1));
    const challengers = [];

    userIds.forEach((userId) => {
      const targetPlayer = playerMap.get(userId);
      if (!targetPlayer) return;
      if (toSafeInt(targetPlayer.arenaProtectUntil, 0) > Date.now()) return;
      const targetPlayerId = String(targetPlayer.playerId || '').trim();
      if (!targetPlayerId || targetPlayerId === selfPlayerId) return;
      challengers.push(buildArenaChallengeRowFromPlayer(targetPlayer, serverId, { clone: false }));
    });

    challengers.sort((a, b) => {
      const scoreDelta = Math.abs(toSafeInt(a.point, 0) - selfScore) - Math.abs(toSafeInt(b.point, 0) - selfScore);
      if (scoreDelta !== 0) return scoreDelta;
      const levelDelta = Math.abs(toSafeInt(a.level, 1) - selfLevel) - Math.abs(toSafeInt(b.level, 1) - selfLevel);
      if (levelDelta !== 0) return levelDelta;
      return toSafeInt(b.point, 0) - toSafeInt(a.point, 0);
    });

    return challengers.slice(0, maxCount);
  } catch (err) {
    logger.warn(`[Arena] failed to load same-server opponents: ${err.message}`);
    return [];
  }
}

async function markArenaTargetProtected(selectedChallenge, until) {
  const targetPlayerId = String(selectedChallenge && selectedChallenge.playerId || '').trim();
  if (!targetPlayerId || selectedChallenge.isRobot || /^\d+$/.test(targetPlayerId)) return;
  await Player.updateOne(
    { playerId: targetPlayerId },
    { $max: { arenaProtectUntil: Math.max(0, toSafeInt(until, 0)) } },
    { maxTimeMS: 1500 }
  ).exec();
}

async function claimArenaTargetProtection(selectedChallenge, now, bypass = false) {
  const targetPlayerId = String(selectedChallenge && selectedChallenge.playerId || '').trim();
  if (!targetPlayerId || selectedChallenge.isRobot || /^\d+$/.test(targetPlayerId)) return 0;
  const until = Math.max(0, toSafeInt(now, Date.now())) + ARENA_PROTECT_SEC * 1000;
  if (bypass) {
    await markArenaTargetProtected(selectedChallenge, until);
    return until;
  }
  const result = await Player.updateOne(
    {
      playerId: targetPlayerId,
      $or: [
        { arenaProtectUntil: { $exists: false } },
        { arenaProtectUntil: { $lte: Math.max(0, toSafeInt(now, Date.now())) } },
      ],
    },
    { $set: { arenaProtectUntil: until } },
    { maxTimeMS: 1500 }
  ).exec();
  return Number(result && (result.matchedCount ?? result.n)) > 0 ? until : -1;
}

async function buildArenaChallengeListBase(session, player, limit = 5) {
  const maxCount = Math.max(1, toSafeInt(limit, 5));
  const poolLimit = Math.max(maxCount * 4, 20);
  const challengers = await loadSameServerArenaOpponents(session, player, poolLimit);
  if (challengers.length >= poolLimit) return challengers.slice(0, poolLimit);

  const taken = new Set(
    challengers.map((row) => String((row && (row.dbid || row.playerId)) || '').trim()).filter(Boolean)
  );
  const robots = generateOpponents(player).filter((row) => {
    const id = String((row && (row.dbid || row.playerId)) || '').trim();
    return !id || !taken.has(id);
  });
  return [...challengers, ...robots].slice(0, poolLimit);
}

function decorateArenaChallengeList(session, player, rows) {
  const version = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const expiresAt = Date.now() + ARENA_CHALLENGE_TTL_SEC * 1000;
  const attackerId = arenaPlayerId(session, player);
  const decorated = ensureArray(rows).map((row) => ({
    ...row,
    challengeVersion: version,
    challengeExpiresAt: expiresAt,
    attackerId,
  }));
  if (session && typeof session === 'object') {
    session._arenaChallengeSnapshot = {
      version,
      expiresAt,
      attackerId,
      rows: decorated,
    };
  }
  return decorated;
}

async function buildArenaChallengeList(session, player, limit = 5, options = {}) {
  const force = !!(options && options.force);
  const snapshot = session && session._arenaChallengeSnapshot;
  const attackerId = arenaPlayerId(session, player);
  if (!force && snapshot && snapshot.expiresAt > Date.now() && snapshot.attackerId === attackerId) {
    return ensureArray(snapshot.rows).slice(0, Math.max(1, toSafeInt(limit, 5)));
  }
  const rows = await buildArenaChallengeListBase(session, player, limit);
  const previousIds = snapshot && Array.isArray(snapshot.rows)
    ? snapshot.rows.map((row) => row && (row.dbid || row.playerId)).filter(Boolean)
    : [];
  const choice = arenaReadModel.chooseOpponents(rows, previousIds, Math.max(1, toSafeInt(limit, 5)));
  return decorateArenaChallengeList(session, player, choice.opponents);
}

async function getArenaChallengeListForFight(session, player, limit = 5) {
  const snapshot = session && session._arenaChallengeSnapshot;
  const attackerId = arenaPlayerId(session, player);
  if (snapshot && snapshot.expiresAt > Date.now() && snapshot.attackerId === attackerId) {
    return ensureArray(snapshot.rows).slice(0, Math.max(1, toSafeInt(limit, 5)));
  }
  return buildArenaChallengeList(session, player, limit, { force: true });
}

async function buildCrossArenaChallengeList(session, player, limit = 5) {
  const maxCount = Math.max(1, toSafeInt(limit, 5));
  let challengers = [];
  try {
    const crossEvents = require('../services/CrossServerEventService');
    const rows = await crossEvents.top('crossArena', crossEvents.cycleFor('crossArena'), Math.max(maxCount * 4, 20));
    challengers = rows.filter((row) => String(row.playerId) !== String(player && player.playerId))
      .map((row) => arenaReadModel.buildPlayerView({ playerId: row.playerId, userId: row.userId, name: row.name, level: row.level, arenaScore: row.score, serverId: row.serverId, roleInfo: row.payload?.roleInfo || {} }, row.serverId).publicRow);
  } catch (err) {
    logger.warn(`[CrossArena] shared roster unavailable: ${err.message}`);
  }
  if (challengers.length === 0) challengers = await loadSameServerArenaOpponents(session, player, maxCount);
  if (challengers.length >= maxCount) return challengers.slice(0, maxCount);

  const taken = new Set(
    challengers.map((row) => String((row && (row.dbid || row.playerId)) || '').trim()).filter(Boolean)
  );
  const robots = generateOpponents(player, { crossArena: true }).filter((row) => {
    const id = String((row && (row.dbid || row.playerId)) || '').trim();
    return !id || !taken.has(id);
  });
  return [...challengers, ...robots].slice(0, maxCount);
}

function ensureDoubleTowerInfo(player) {
  const now = Date.now();
  if (!player || typeof player !== 'object') {
    return {
      outbounds: {},
      index: 0,
      winAdsNum: 0,
      dailyWinNum: 0,
      stage: 1,
      endTime: now + DOUBLE_TOWER_DAY_MS,
      point: 0,
      maxPoint: 0,
      rankRewardList: [],
      loglist: [],
      rank: 0,
      defence: 0,
      enemyId: '',
      pendingBattle: null,
      lastBattleReceipt: null,
    };
  }

  player.doubleTowerInfo = ensurePlainObject(player.doubleTowerInfo);
  const info = player.doubleTowerInfo;
  info.outbounds = ensurePlainObject(info.outbounds);
  info.index = Math.max(1, toSafeInt(info.index, 1));
  info.winAdsNum = Math.max(0, toSafeInt(info.winAdsNum, 0));
  info.dailyWinNum = Math.max(0, toSafeInt(info.dailyWinNum, 0));
  info.stage = Math.max(1, toSafeInt(info.stage, 1));
  info.endTime = Math.max(now + 60 * 1000, toSafeInt(info.endTime, now + DOUBLE_TOWER_DAY_MS));
  info.point = toSafeInt(info.point, 0);
  info.maxPoint = Math.max(info.point, toSafeInt(info.maxPoint, info.point));
  info.rankRewardList = ensureArray(info.rankRewardList);
  info.loglist = ensureArray(info.loglist);
  info.rank = Math.max(0, toSafeInt(info.rank, 0));
  info.defence = Math.max(0, toSafeInt(info.defence, 0));
  info.enemyId = typeof info.enemyId === 'string' ? info.enemyId : '';
  info.pendingBattle = info.pendingBattle && typeof info.pendingBattle === 'object'
    ? {
      ...info.pendingBattle,
      uid: String(info.pendingBattle.uid || ''),
      mode: String(info.pendingBattle.mode || ''),
      aiId: Math.max(0, toSafeInt(info.pendingBattle.aiId, 0)),
      index: Math.max(1, toSafeInt(info.pendingBattle.index, info.index)),
      startedAt: Math.max(0, toSafeInt(info.pendingBattle.startedAt, 0)),
    } : null;
  info.lastBattleReceipt = info.lastBattleReceipt && typeof info.lastBattleReceipt === 'object'
    ? info.lastBattleReceipt : null;
  info.outbounds = normalizeDoubleTowerOutbounds(player, info.outbounds, info.index);
  return info;
}

function ensureCrossArenaInfo(player) {
  if (!player || typeof player !== 'object') {
    return {
      score: 1000,
      dailyCount: 0,
      maxCount: 10,
      refreshtime: 0,
      loglist: [],
    };
  }

  player.crossArenaInfo = ensurePlainObject(player.crossArenaInfo);
  const info = player.crossArenaInfo;
  info.score = Math.max(0, toSafeInt(info.score, toSafeInt(player.arenaScore, 1000)));
  info.dailyCount = Math.max(0, toSafeInt(info.dailyCount, 0));
  info.maxCount = Math.max(1, toSafeInt(info.maxCount, 10));
  info.refreshtime = Math.max(0, toSafeInt(info.refreshtime, 0));
  info.loglist = ensureArray(info.loglist);
  return info;
}

function normalizeOutbound(outbound) {
  if (!Array.isArray(outbound)) return [];
  return outbound.map((row) => ({
    id: Math.max(0, toSafeInt(row && row.id, 0)),
    level: Math.max(0, toSafeInt(row && row.level, 0)),
  }));
}

function getDoubleTowerFallbackHeroIds() {
  const cfgMap = ensurePlainObject(config.get('DoubleTowerHeroConfig'));
  const ids = Object.keys(cfgMap)
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .filter((id) => id > 0)
    .sort((a, b) => a - b);
  if (ids.length > 0) return ids;
  return [26111, 26112, 26113, 26121, 26122, 26123, 26131, 26132, 26133, 26211];
}

function buildDefaultDoubleTowerOutbound(player, minimumSize = 6) {
  const safePlayer = player && typeof player === 'object' ? player : {};
  const level = Math.max(1, toSafeInt(safePlayer.level, 1));
  const validHeroIds = new Set(getDoubleTowerFallbackHeroIds());
  const valhallaInfo = ensureValhallaInfo(safePlayer);
  const unlockedIds = ensureArray(valhallaInfo.unlockedIds)
    .concat(ensureArray(valhallaInfo.valhalla).map((hero) => toSafeInt(hero && hero.id, 0)));
  const pickedIds = uniqueInts([...unlockedIds, ...Array.from(validHeroIds)])
    .filter((id) => validHeroIds.has(id))
    .slice(0, Math.max(3, minimumSize));
  return pickedIds.map((id) => ({ id, level }));
}

function normalizeDoubleTowerTeam(outbound, defaultOutbound) {
  const fallback = Array.isArray(defaultOutbound) ? defaultOutbound : [];
  const levelFallback = Math.max(1, toSafeInt(fallback[0] && fallback[0].level, 1));
  const rows = [];
  const seen = new Set();

  normalizeOutbound(outbound).forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    if (id <= 0 || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      level: Math.max(1, toSafeInt(row && row.level, levelFallback)),
    });
  });

  fallback.forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    if (rows.length >= fallback.length || id <= 0 || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      level: Math.max(1, toSafeInt(row && row.level, levelFallback)),
    });
  });

  return rows;
}

function normalizeDoubleTowerOutbounds(player, rawOutbounds, currentIndex = 1) {
  const outbounds = ensurePlainObject(rawOutbounds);
  const defaultOutbound = buildDefaultDoubleTowerOutbound(player);
  const normalized = {};

  Object.keys(outbounds).forEach((key) => {
    const idx = Math.max(1, toSafeInt(key, 0));
    normalized[String(idx)] = normalizeDoubleTowerTeam(outbounds[key], defaultOutbound);
  });

  const activeIndex = Math.max(1, toSafeInt(currentIndex, 1));
  if (!Array.isArray(normalized['1']) || normalized['1'].length < 3) {
    normalized['1'] = normalizeDoubleTowerTeam(normalized['1'], defaultOutbound);
  }
  if (!Array.isArray(normalized[String(activeIndex)]) || normalized[String(activeIndex)].length < 3) {
    normalized[String(activeIndex)] = clonePlain(normalized['1']);
  }

  return normalized;
}

function buildDoubleTowerData(info) {
  return {
    outbounds: info.outbounds,
    index: info.index,
    winAdsNum: info.winAdsNum,
    dailyWinNum: info.dailyWinNum,
    stage: info.stage,
    endTime: info.endTime,
    point: info.point,
    maxPoint: info.maxPoint,
    rankRewardList: info.rankRewardList,
    loglist: info.loglist,
    rank: info.rank,
    defence: info.defence,
    enemyId: info.enemyId,
  };
}

function normalizeRewardRows(rows = []) {
  const map = new Map();
  ensureArray(rows).forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id <= 0 || count <= 0) return;
    map.set(id, (map.get(id) || 0) + count);
  });
  const items = [];
  map.forEach((count, id) => items.push({ id, count }));
  items.sort((a, b) => a.id - b.id);
  return items;
}

function buildRewardInfo(rows = []) {
  return {
    items: normalizeRewardRows(rows),
    equips: [],
    heros: [],
  };
}

function grantRewardInfo(player, rows = []) {
  const rewardInfo = buildRewardInfo(rows);
  rewardInfo.items.forEach((row) => addRewardToPlayer(player, row.id, row.count));
  return rewardInfo;
}

function appendDoubleTowerLog(info, row = {}) {
  info.loglist = ensureArray(info.loglist);
  info.loglist.push({
    logtime: Math.floor(Date.now() / 1000),
    type: toSafeInt(row.type, 0),
    result: toSafeInt(row.result, 0),
    uid: row.uid == null ? '' : String(row.uid),
    point: toSafeInt(row.point, 0),
    rank: toSafeInt(row.rank, 0),
  });
  if (info.loglist.length > 50) {
    info.loglist = info.loglist.slice(info.loglist.length - 50);
  }
  return info.loglist[info.loglist.length - 1];
}

function getDoubleTowerBattleScore(type = 0) {
  const scoreRows = ensureArray((config.get('DoubleTowerBaseConfig') || {}).firstBattleScore);
  const idx = Math.max(0, Math.min(scoreRows.length - 1, toSafeInt(type, 0)));
  if (scoreRows.length > 0) return toSafeInt(scoreRows[idx], 0);
  if (idx === 0) return 30;
  if (idx === 2) return -10;
  return 0;
}

function resolveDoubleTowerAIId() {
  const aiConfig = ensurePlainObject(config.get('DoubleTowerAIConfig'));
  const aiBaseConfig = ensurePlainObject(config.get('DoubleTowerAIBaseConfig'));
  const baseCfg = ensurePlainObject(config.get('DoubleTowerBaseConfig'));
  const preferred = Math.max(0, toSafeInt(baseCfg.firstBattleAI, 0));
  if (preferred > 0 && aiConfig[preferred] && aiBaseConfig[preferred]) return preferred;

  const ids = Object.keys(aiConfig)
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .filter((id) => id > 0 && aiConfig[id] && aiBaseConfig[id])
    .sort((a, b) => a - b);
  return ids[0] || 101;
}

function updateDoubleTowerPointRank(info, pointChange = 0) {
  info.point = Math.max(0, toSafeInt(info.point, 0) + toSafeInt(pointChange, 0));
  info.maxPoint = Math.max(toSafeInt(info.maxPoint, 0), info.point);
  info.rank = Math.max(1, 1000 - Math.floor(info.point / 10));
}

function buildDoubleTowerRankList(player, info) {
  const selfDbid = player && player.playerId ? player.playerId : 'self';
  const self = {
    dbid: selfDbid,
    name: player && player.name ? player.name : 'self',
    level: Math.max(1, toSafeInt(player && player.level, 1)),
    avatar: 11300,
    avatarFrame: -1,
    point: toSafeInt(info.point, 0),
  };

  const robots = generateOpponents(player).map((row, idx) => ({
    dbid: `double_robot_${idx + 1}`,
    name: row.name,
    level: row.level,
    avatar: row.avatar,
    avatarFrame: -1,
    point: Math.max(0, toSafeInt(row.point, 0) + 50),
  }));

  const rankList = [self, ...robots].sort((a, b) => b.point - a.point);
  rankList.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return rankList;
}

function buildDoubleTowerEnemyInfo(player, info, params = {}) {
  const index = Math.max(1, toSafeInt(params.index, 1));
  const uid = params.uid == null ? '' : String(params.uid);
  const robotCfgMap = ensurePlainObject(config.get('DoubleTowerRankRobotConfig'));
  const robotCfg = robotCfgMap[uid] || robotCfgMap[toSafeInt(uid, 0)] || null;
  const heroRows = ensureArray(robotCfg && robotCfg.hero);
  const fallbackHeroIds = getDoubleTowerFallbackHeroIds().slice(0, 10);
  const outbound = heroRows.map((id) => ({ id: Math.max(0, toSafeInt(id, 0)), level: Math.max(1, toSafeInt(player && player.level, 1)) }));

  return {
    dbid: uid || `double_enemy_${Date.now() % 100000}`,
    name: uid ? `Người thủ lôi-${uid}` : "Người thủ lôi",
    avatar: 11320 + (index % 5),
    avatarUrl: '',
    avatarFrame: 0,
    point: Math.max(0, toSafeInt(info.point, 0) + 50 + index * 5),
    outbound: outbound.length > 0
      ? outbound
      : (fallbackHeroIds.length > 0 ? fallbackHeroIds : [26111])
        .map((id) => ({ id, level: Math.max(1, toSafeInt(player && player.level, 1)) })),
    formationSkill: {},
    hp: Math.max(1000, toSafeInt((config.get('DoubleTowerBaseConfig') || {}).CarBasicHP, 100000)),
  };
}

function ensureTopCombatInfo(player) {
  const nowSec = Math.floor(Date.now() / 1000);
  const initialRank = getTopCombatInitialRank();
  if (!player || typeof player !== 'object') {
    return {
      rank: initialRank,
      maxRank: initialRank,
      records: [],
      loglist: [],
      matchStatus: 1,
      matchEndTime: nowSec + 24 * 3600,
      refreshtime: nowSec + TOP_COMBAT_REFRESH_SEC,
      challengeList: [],
      infoMap: {},
    };
  }

  player.topCombatInfo = ensurePlainObject(player.topCombatInfo);
  const info = player.topCombatInfo;
  if (toSafeInt(info.protocolVersion, 0) < 2) {
    info.rank = initialRank;
    info.maxRank = initialRank;
    info.challengeList = [];
    info.infoMap = {};
    info.refreshtime = 0;
    info.protocolVersion = 2;
  }
  info.rank = Math.max(1, Math.min(initialRank, toSafeInt(info.rank, initialRank)));

  const maxRank = toSafeInt(info.maxRank, info.rank);
  info.maxRank = Math.max(1, Math.min(info.rank, maxRank));

  const records = ensureArray(info.records)
    .map((row) => Math.max(0, toSafeInt(row, 0)))
    .filter((row) => row > 0);
  info.records = Array.from(new Set(records)).sort((a, b) => a - b);

  info.loglist = ensureArray(info.loglist).map((row) => ({
    atk: Math.max(0, toSafeInt(row && row.atk, 0)),
    logtime: Math.max(0, toSafeInt(row && row.logtime, 0)),
    rank: Math.max(1, toSafeInt(row && row.rank, info.rank)),
  }));
  if (info.loglist.length > 100) {
    info.loglist = info.loglist.slice(info.loglist.length - 100);
  }

  info.matchStatus = Math.max(0, toSafeInt(info.matchStatus, 1));
  info.matchEndTime = Math.max(nowSec + 300, toSafeInt(info.matchEndTime, nowSec + 24 * 3600));
  info.refreshtime = Math.max(0, toSafeInt(info.refreshtime, nowSec + TOP_COMBAT_REFRESH_SEC));
  info.challengeList = ensureArray(info.challengeList)
    .map((row) => Math.max(0, toSafeInt(row, 0)))
    .filter((row) => row > 0);
  info.infoMap = ensurePlainObject(info.infoMap);
  return info;
}

function buildTopCombatSelfShowInfo(player) {
  player = clonePlayerSnapshot(player);
  ensureRoleAppearance(player);
  const roleInfo = ensurePlainObject(player && player.roleInfo);
  const equipInfo = ensurePlainObject(player && player.equipInfo);
  return {
    dbid: toArenaDbid(player),
    serverId: Math.max(1, toSafeInt(player && player.serverId, toSafeInt(process.env.SERVER_ID, 1001))),
    serverName: '',
    kungfuId: Math.max(1, toSafeInt((player && player.kungfuId) || roleInfo.kungfuId, 4)),
    subJob: Math.max(0, toSafeInt(roleInfo.subJob, 0)),
    level: Math.max(1, toSafeInt(player && player.level, 1)),
    name: (player && player.name) || 'self',
    power: Math.max(100, toSafeInt(
      arenaReadModel.displayPowerFromPlayer(player) || (player && player.displayPower) || (player && player.power),
      1000,
    )),
    stage: Math.max(1, toSafeInt(roleInfo.stageId, 1)),
    petId: getPrimaryBattlePetId(player),
    petSoulId: -1,
    artifactId: 0,
    fate: 0,
    foreverCard: 0,
    equipMap: ensurePlainObject(equipInfo.equipMap),
    fashionMap: getPlayerFashionMap(player),
    avatar: Math.max(0, toSafeInt(player && player.avatar, 11300)),
    avatarUrl: (player && player.avatarUrl) || '',
    avatarFrame: Math.max(-1, toSafeInt(player && player.avatarFrame, -1)),
    title: Math.max(0, toSafeInt(player && player.title, 0)),
  };
}

function getTopCombatInitialRank() {
  const base = ensurePlainObject(config.get('TopCombatConfig'));
  return Math.max(1, toSafeInt(base.initialRank, TOP_COMBAT_FALLBACK_RANK));
}

function getTopCombatRobotId(rank) {
  const rankSafe = Math.max(1, toSafeInt(rank, 1));
  const base = ensurePlainObject(config.get('TopCombatConfig'));
  const rules = ensurePlainObject(config.get('TopCombatRobotRuleConfig'));
  const matchedRule = Object.keys(rules)
    .map((key) => ensurePlainObject(rules[key]))
    .find((row) => rankSafe >= toSafeInt(row.rankMin, 1) && rankSafe <= toSafeInt(row.rankMax, 0));
  const robotIds = ensureArray(matchedRule && matchedRule.robotId)
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .filter((id) => id > 0);
  if (robotIds.length > 0) {
    const minRank = Math.max(1, toSafeInt(matchedRule.rankMin, 1));
    return robotIds[(rankSafe - minRank) % robotIds.length];
  }
  return Math.max(1, toSafeInt(base.initialRobotId, 1));
}

function getConfiguredRobotName(nameId, fallback) {
  const language = ensurePlainObject(config.get('LanguageConfig'));
  const row = ensurePlainObject(language[nameId] || language[String(nameId)]);
  return String(row.cn || row.tw || row.en || fallback);
}

function buildRobotFashionMap(robotShow = []) {
  const fashionCfg = ensurePlainObject(config.get('FashionConfig'));
  const fashionMap = {};
  ensureArray(robotShow).forEach((fashionIdRaw) => {
    const fashionId = Math.max(0, toSafeInt(fashionIdRaw, 0));
    const row = ensurePlainObject(fashionCfg[fashionId] || fashionCfg[String(fashionId)]);
    const type = Math.max(0, toSafeInt(row.type, 0));
    if (fashionId > 0 && type > 0) fashionMap[type] = fashionId;
  });
  return fashionMap;
}

function buildTopCombatRobotShowInfo(player, rank) {
  const playerLv = Math.max(1, toSafeInt(player && player.level, 1));
  const rankSafe = Math.max(1, toSafeInt(rank, 1));
  const initialRank = getTopCombatInitialRank();
  const robotId = getTopCombatRobotId(rankSafe);
  const robotCfgMap = ensurePlainObject(config.get('TopCombatRobotConfig'));
  const robotCfg = ensurePlainObject(robotCfgMap[robotId] || robotCfgMap[String(robotId)]);
  const levelDelta = Math.max(-5, Math.min(10, Math.floor((initialRank - rankSafe) / 1000)));
  const level = Math.max(1, toSafeInt(robotCfg.robotLv, playerLv + levelDelta));
  const robotAttrs = ensurePlainObject(robotCfg.robotAttrs);
  const power = Math.max(100, toSafeInt(
    Object.keys(robotAttrs).length > 0 ? arenaReadModel.displayPower(robotAttrs) : 0,
    1000 + level * 120 + Math.max(0, initialRank - rankSafe),
  ));
  const roleSelection = normalizeArenaRoleSelection(1, 0);
  const fashionMap = buildRobotFashionMap(robotCfg.robotShow);
  return {
    dbid: String(robotId),
    serverId: Math.max(1, toSafeInt(player && player.serverId, toSafeInt(process.env.SERVER_ID, 1001))),
    serverName: '',
    kungfuId: roleSelection.kungfuId,
    subJob: roleSelection.subJob,
    level,
    name: getConfiguredRobotName(robotCfg.name, `天梯守擂者${rankSafe}`),
    power,
    stage: Math.max(1, Math.floor(level / 10) + 1),
    petId: 0,
    petSoulId: -1,
    artifactId: 0,
    fate: 0,
    foreverCard: 0,
    equipMap: {},
    fashionMap,
    avatar: Math.max(0, toSafeInt(fashionMap[102], 11300 + (robotId % 6))),
    avatarUrl: '',
    avatarFrame: -1,
    title: 0,
  };
}

function buildTopCombatRankList(rank) {
  const initialRank = getTopCombatInitialRank();
  const rankSafe = Math.max(1, toSafeInt(rank, initialRank));
  const list = [];
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue;
    const row = rankSafe + offset;
    if (row < 1 || row > initialRank) continue;
    list.push(row);
  }
  if (!list.includes(Math.max(1, rankSafe - 1))) {
    list.push(Math.max(1, rankSafe - 1));
  }
  return Array.from(new Set(list)).sort((a, b) => a - b);
}

function buildTopCombatChallengeInfo(player, info, forceRefresh = false) {
  const nowSec = Math.floor(Date.now() / 1000);
  const shouldRefresh =
    forceRefresh ||
    !Array.isArray(info.challengeList) ||
    info.challengeList.length === 0 ||
    !info.infoMap ||
    typeof info.infoMap !== 'object' ||
    nowSec >= toSafeInt(info.refreshtime, 0);

  if (shouldRefresh) {
    info.challengeList = buildTopCombatRankList(info.rank);
    info.refreshtime = nowSec + TOP_COMBAT_REFRESH_SEC;
    const map = {};
    const ranks = new Set([1, 2, 3, info.rank, ...info.challengeList]);
    ranks.forEach((rank) => {
      map[rank] =
        rank === info.rank ? buildTopCombatSelfShowInfo(player) : buildTopCombatRobotShowInfo(player, rank);
    });
    info.infoMap = map;
  }

  return {
    rank: info.rank,
    refreshtime: info.refreshtime,
    challengeList: ensureArray(info.challengeList),
    infoMap: ensurePlainObject(info.infoMap),
  };
}

function toTopCombatRankBaseInfo(showInfo = {}, isSelf = false) {
  const row = ensurePlainObject(showInfo);
  return {
    dbid: row.dbid == null ? '' : String(row.dbid),
    name: row.name || (isSelf ? 'self' : "Người thủ lôi"),
    level: Math.max(1, toSafeInt(row.level, 1)),
    avatar: Math.max(0, toSafeInt(row.avatar, 11300)),
    avatarUrl: row.avatarUrl || '',
    avatarFrame: Math.max(-1, toSafeInt(row.avatarFrame, -1)),
    title: Math.max(0, toSafeInt(row.title, 0)),
    kungfuId: Math.max(1, toSafeInt(row.kungfuId, 4)),
    power: Math.max(100, toSafeInt(row.power, 1000)),
  };
}

function buildTopCombatRankInfo(player, info) {
  const count = 20;
  const rankMap = {};
  const topMap = {};
  const selfShowInfo = buildTopCombatSelfShowInfo(player);

  for (let i = 1; i <= count; i++) {
    const showInfo = i === info.rank ? selfShowInfo : buildTopCombatRobotShowInfo(player, i);
    rankMap[i] = toTopCombatRankBaseInfo(showInfo, i === info.rank);
    if (i <= 3) {
      topMap[i] = showInfo;
    }
  }

  return {
    rank: info.rank,
    count,
    topMap,
    rankMap,
  };
}

function appendTopCombatLog(info, row = {}) {
  info.loglist = ensureArray(info.loglist);
  info.loglist.push({
    atk: Math.max(0, toSafeInt(row.atk, 0)),
    logtime: Math.max(0, toSafeInt(row.logtime, Math.floor(Date.now() / 1000))),
    rank: Math.max(1, toSafeInt(row.rank, info.rank)),
  });
  if (info.loglist.length > 100) {
    info.loglist = info.loglist.slice(info.loglist.length - 100);
  }
}

function ensureTopArenaInfo(player) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!player || typeof player !== 'object') {
    return {
      rank: TOP_ARENA_DEFAULT_RANK,
      maxRank: TOP_ARENA_DEFAULT_RANK,
      loglist: [],
      matchStatus: 1,
      matchEndTime: nowSec + 24 * 3600,
      refreshtime: nowSec + TOP_ARENA_REFRESH_SEC,
      challengeList: [],
      infoMap: {},
      showInfo: { worship: 0, showMap: {} },
      lockTime: 0,
      passRecord: 0,
      guessLogs: [],
    };
  }

  const { info, cycle } = require('../services/CrossEventScheduleService').seasonState(player, 'topArena');
  info.rank = Math.max(1, toSafeInt(info.rank, TOP_ARENA_DEFAULT_RANK));
  info.maxRank = Math.max(1, Math.min(info.rank, toSafeInt(info.maxRank, info.rank)));
  info.loglist = ensureArray(info.loglist).map((row) => ({
    atk: Math.max(0, toSafeInt(row && row.atk, 0)),
    logtime: Math.max(0, toSafeInt(row && row.logtime, 0)),
    rank: Math.max(1, toSafeInt(row && row.rank, info.rank)),
  }));
  if (info.loglist.length > 100) {
    info.loglist = info.loglist.slice(info.loglist.length - 100);
  }
  info.matchStatus = cycle ? 1 : 0;
  info.matchEndTime = cycle ? Math.floor(cycle.endTime / 1000) : 0;
  info.refreshtime = Math.max(0, toSafeInt(info.refreshtime, nowSec + TOP_ARENA_REFRESH_SEC));
  info.challengeList = ensureArray(info.challengeList)
    .map((row) => Math.max(0, toSafeInt(row, 0)))
    .filter((row) => row > 0);
  info.infoMap = ensurePlainObject(info.infoMap);
  info.showInfo = ensurePlainObject(info.showInfo, { worship: 0, showMap: {} });
  info.showInfo.worship = Math.max(0, Math.min(1, toSafeInt(info.showInfo.worship, 0)));
  info.showInfo.showMap = ensurePlainObject(info.showInfo.showMap);
  info.lockTime = Math.max(0, toSafeInt(info.lockTime, 0));
  info.passRecord = Math.max(0, toSafeInt(info.passRecord, 0));
  info.guessLogs = ensureArray(info.guessLogs).map((row) => ({
    round: Math.max(0, toSafeInt(row && row.round, 0)),
    roomId: Math.max(0, toSafeInt(row && row.roomId, 0)),
    playerId: row && row.playerId != null ? String(row.playerId) : '',
    supportCount: Math.max(0, toSafeInt(row && row.supportCount, 0)),
    isWin: Math.max(0, toSafeInt(row && row.isWin, 0)),
    logtime: Math.max(0, toSafeInt(row && row.logtime, 0)),
  }));
  if (info.guessLogs.length > 100) {
    info.guessLogs = info.guessLogs.slice(info.guessLogs.length - 100);
  }
  return info;
}

function buildTopArenaSelfShowInfo(player) {
  return buildTopCombatSelfShowInfo(player);
}

function buildTopArenaRobotShowInfo(player, rank) {
  const playerLv = Math.max(1, toSafeInt(player && player.level, 1));
  const rankSafe = Math.max(1, toSafeInt(rank, 1));
  const levelDelta = Math.max(-5, Math.min(10, Math.floor((TOP_ARENA_DEFAULT_RANK - rankSafe) / 20)));
  const level = Math.max(1, playerLv + levelDelta);
  return {
    dbid: `ta_robot_${rankSafe}`,
    serverId: Math.max(1, toSafeInt(player && player.serverId, toSafeInt(process.env.SERVER_ID, 1001))),
    serverName: '',
    kungfuId: pickArenaRobotKungfuId(rankSafe),
    subJob: 0,
    level,
    name: `Lôi chủ đỉnh phong${rankSafe}`,
    power: 1200 + level * 130 + Math.max(0, TOP_ARENA_DEFAULT_RANK - rankSafe) * 5,
    stage: Math.max(1, Math.floor(level / 10) + 1),
    petId: 0,
    petSoulId: -1,
    artifactId: 0,
    fate: 0,
    foreverCard: 0,
    equipMap: {},
    fashionMap: {},
    avatar: 11300 + (rankSafe % 6),
    avatarUrl: '',
    avatarFrame: -1,
    title: 0,
  };
}

function buildTopArenaRankList(rank) {
  const rankSafe = Math.max(1, toSafeInt(rank, TOP_ARENA_DEFAULT_RANK));
  const list = [];
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue;
    const row = rankSafe + offset;
    if (row < 1 || row > TOP_ARENA_MAX_RANK) continue;
    list.push(row);
  }
  if (!list.includes(Math.max(1, rankSafe - 1))) {
    list.push(Math.max(1, rankSafe - 1));
  }
  return Array.from(new Set(list)).sort((a, b) => a - b);
}

function buildTopArenaChallengeInfo(player, info, forceRefresh = false) {
  const nowSec = Math.floor(Date.now() / 1000);
  const shouldRefresh =
    forceRefresh ||
    !Array.isArray(info.challengeList) ||
    info.challengeList.length === 0 ||
    !info.infoMap ||
    typeof info.infoMap !== 'object' ||
    nowSec >= toSafeInt(info.refreshtime, 0);

  if (shouldRefresh) {
    info.challengeList = buildTopArenaRankList(info.rank);
    info.refreshtime = nowSec + TOP_ARENA_REFRESH_SEC;
    const map = {};
    const ranks = new Set([1, 2, 3, info.rank, ...info.challengeList]);
    ranks.forEach((rank) => {
      map[rank] =
        rank === info.rank ? buildTopArenaSelfShowInfo(player) : buildTopArenaRobotShowInfo(player, rank);
    });
    info.infoMap = map;
  }

  return {
    rank: info.rank,
    refreshtime: info.refreshtime,
    challengeList: ensureArray(info.challengeList),
    infoMap: ensurePlainObject(info.infoMap),
  };
}

function appendTopArenaLog(info, row = {}) {
  info.loglist = ensureArray(info.loglist);
  info.loglist.push({
    atk: Math.max(0, toSafeInt(row.atk, 0)),
    logtime: Math.max(0, toSafeInt(row.logtime, Math.floor(Date.now() / 1000))),
    rank: Math.max(1, toSafeInt(row.rank, info.rank)),
  });
  if (info.loglist.length > 100) {
    info.loglist = info.loglist.slice(info.loglist.length - 100);
  }
}

function buildTopArenaRankPayload(player, info, type = 1) {
  const rankType = Math.max(1, toSafeInt(type, 1));
  const selfRank = Math.max(1, toSafeInt(info.rank, TOP_ARENA_DEFAULT_RANK));
  const selfValue = Math.max(1, TOP_ARENA_MAX_RANK - selfRank + 1);
  const rankList = [];

  for (let i = 1; i <= 20; i++) {
    const show = i === selfRank ? buildTopArenaSelfShowInfo(player) : buildTopArenaRobotShowInfo(player, i);
    rankList.push({
      dbid: show.dbid == null ? '' : String(show.dbid),
      serverId: Math.max(1, toSafeInt(show.serverId, 1)),
      name: show.name || '',
      level: Math.max(1, toSafeInt(show.level, 1)),
      avatar: Math.max(0, toSafeInt(show.avatar, 11300)),
      avatarUrl: show.avatarUrl || '',
      avatarFrame: Math.max(-1, toSafeInt(show.avatarFrame, -1)),
      title: Math.max(0, toSafeInt(show.title, 0)),
      kungfuId: Math.max(1, toSafeInt(show.kungfuId, 4)),
      power: Math.max(100, toSafeInt(show.power, 1000)),
      value: Math.max(1, TOP_ARENA_MAX_RANK - i + 1),
    });
  }

  return {
    type: rankType,
    rank: selfRank,
    value: selfValue,
    rankList,
  };
}

function buildTopArenaShowInfo(player, info) {
  const selfRank = Math.max(1, toSafeInt(info.rank, TOP_ARENA_DEFAULT_RANK));
  const expected = {
    1: selfRank === 1 ? buildTopArenaSelfShowInfo(player) : buildTopArenaRobotShowInfo(player, 1),
    2: selfRank === 2 ? buildTopArenaSelfShowInfo(player) : buildTopArenaRobotShowInfo(player, 2),
    3: selfRank === 3 ? buildTopArenaSelfShowInfo(player) : buildTopArenaRobotShowInfo(player, 3),
  };

  // showMap is persisted, but the client indexes every row through
  // RoleGenderConfig[kungfuId][subJob]. Rebuild missing or malformed rows so
  // an old record cannot crash the top-arena panel on login/open.
  const current = ensurePlainObject(info.showInfo.showMap);
  [1, 2, 3].forEach((position) => {
    const row = ensurePlainObject(current[position] || current[String(position)]);
    const role = normalizeArenaRoleSelection(row.kungfuId, row.subJob);
    const hasIdentity = String(row.dbid || '').trim().length > 0;
    const hasShowFields = Object.prototype.hasOwnProperty.call(row, 'fashionMap')
      && Object.prototype.hasOwnProperty.call(row, 'equipMap');
    const configured = role.kungfuId > 0 && role.subJob >= 0;
    const isSelfRow = String(row.dbid || '') === String(player && player.playerId || '');
    const identityMatchesRank = selfRank === position ? isSelfRow : !isSelfRow;
    if (!hasIdentity || !hasShowFields || !configured || !identityMatchesRank) {
      current[position] = expected[position];
      return;
    }
    current[position] = {
      ...expected[position],
      ...row,
      kungfuId: role.kungfuId,
      subJob: role.subJob,
      equipMap: ensurePlainObject(row.equipMap),
      fashionMap: ensurePlainObject(row.fashionMap),
    };
  });
  info.showInfo.showMap = current;

  return {
    worship: info.showInfo.worship,
    showMap: ensurePlainObject(info.showInfo.showMap),
  };
}

function normalizeTopArenaRoomPlayer(playerRow = {}, index = 0) {
  const row = ensurePlainObject(playerRow);
  const role = normalizeArenaRoleSelection(row.kungfuId, row.subJob);
  return {
    dbid: row.dbid == null ? '' : String(row.dbid),
    serverId: Math.max(1, toSafeInt(row.serverId, 1)),
    name: row.name || `Đấu sĩ phòng${index + 1}`,
    level: Math.max(1, toSafeInt(row.level, 1)),
    avatar: Math.max(0, toSafeInt(row.avatar, 11300)),
    avatarUrl: row.avatarUrl || '',
    avatarFrame: Math.max(-1, toSafeInt(row.avatarFrame, -1)),
    title: Math.max(0, toSafeInt(row.title, 0)),
    kungfuId: role.kungfuId,
    subJob: role.subJob,
    power: Math.max(100, toSafeInt(row.power, 1000)),
  };
}

function buildTopArenaRoomPlayerMap(player, info, roomId = 1) {
  const map = {};
  const selfIndex = Math.max(0, Math.min(7, toSafeInt(info.rank, TOP_ARENA_DEFAULT_RANK) % 8));
  const selfShow = buildTopArenaSelfShowInfo(player);
  for (let i = 0; i < 8; i++) {
    if (i === selfIndex) {
      map[i] = normalizeTopArenaRoomPlayer(selfShow, i);
      continue;
    }
    const robotRank = Math.max(1, i + 1 + (roomId - 1) * 8);
    map[i] = normalizeTopArenaRoomPlayer(buildTopArenaRobotShowInfo(player, robotRank), i);
  }
  return map;
}

function ensureTopArenaMatchInfo(player, info) {
  info.matchInfo = ensurePlainObject(info.matchInfo);
  const matchInfo = info.matchInfo;
  matchInfo.round = Math.max(1, toSafeInt(matchInfo.round, 1));
  matchInfo.roomInfo = ensurePlainObject(matchInfo.roomInfo);
  const roomInfo = matchInfo.roomInfo;
  roomInfo.roomId = Math.max(1, toSafeInt(roomInfo.roomId, 1));
  roomInfo.step = Math.max(1, toSafeInt(roomInfo.step, 1));
  roomInfo.playerMap = ensurePlainObject(roomInfo.playerMap);
  roomInfo.winCount = ensurePlainObject(roomInfo.winCount);

  if (Object.keys(roomInfo.playerMap).length === 0) {
    roomInfo.playerMap = buildTopArenaRoomPlayerMap(player, info, roomInfo.roomId);
  } else {
    Object.keys(roomInfo.playerMap).forEach((key) => {
      const idx = Math.max(0, toSafeInt(key, 0));
      roomInfo.playerMap[key] = normalizeTopArenaRoomPlayer(roomInfo.playerMap[key], idx);
    });
  }

  Object.keys(roomInfo.playerMap).forEach((key) => {
    const row = roomInfo.playerMap[key];
    const dbid = row.dbid == null ? '' : String(row.dbid);
    if (!Object.prototype.hasOwnProperty.call(roomInfo.winCount, dbid)) {
      roomInfo.winCount[dbid] = 0;
    } else {
      roomInfo.winCount[dbid] = Math.max(0, toSafeInt(roomInfo.winCount[dbid], 0));
    }
  });

  return matchInfo;
}

function ensureTopArenaGuessMap(info) {
  info.roomGuessMap = ensurePlainObject(info.roomGuessMap);
  return info.roomGuessMap;
}

function buildTopArenaGuessInfo(roomInfo, row = {}) {
  const room = ensurePlainObject(roomInfo);
  const data = ensurePlainObject(row, { roomGuess: {}, playerGuess: {} });
  data.roomGuess = ensurePlainObject(data.roomGuess);
  data.playerGuess = ensurePlainObject(data.playerGuess);
  if (Object.keys(data.roomGuess).length === 0) {
    Object.keys(ensurePlainObject(room.playerMap)).forEach((slot) => {
      const playerRow = room.playerMap[slot];
      const dbid = playerRow && playerRow.dbid != null ? String(playerRow.dbid) : '';
      if (!dbid) return;
      data.roomGuess[dbid] = Math.max(0, toSafeInt(data.roomGuess[dbid], 0));
    });
  }
  return data;
}

function getTopArenaRoomGuessStore(info, round, roomId, roomInfo) {
  const guessMap = ensureTopArenaGuessMap(info);
  const key = `${Math.max(1, toSafeInt(round, 1))}_${Math.max(1, toSafeInt(roomId, 1))}`;
  guessMap[key] = buildTopArenaGuessInfo(roomInfo, guessMap[key]);
  return guessMap[key];
}

function buildCrossArenaRankRows(player, score, challengelist) {
  const selfDbid = player && player.playerId ? player.playerId : 'self';
  const selfAttrs = battle.calcPlayerPower(player || {});
  const selfPower = Math.max(100, toSafeInt(arenaReadModel.displayPower(selfAttrs), Math.max(100, score * 10)));
  const selfPowerScore = Math.max(0, toSafeInt(battle.calcPowerScore(selfAttrs), 0));
  const self = {
    dbid: selfDbid,
    playerId: selfDbid,
    name: player && player.name ? player.name : 'self',
    level: Math.max(1, toSafeInt(player && player.level, 1)),
    avatar: 11300,
    point: score,
    score,
    power: selfPower,
    powerScore: selfPowerScore,
    powerUnit: 'native-weighted-point',
  };

  const rows = [self];
  for (const row of challengelist) {
    rows.push({
      dbid: row.dbid,
      playerId: row.playerId || row.dbid,
      name: row.name,
      level: row.level,
      avatar: row.avatar,
      point: row.point,
      score: row.point,
      power: Math.max(100, toSafeInt(row.power || row.powerScore, 100)),
      powerScore: Math.max(100, toSafeInt(row.powerScore || row.power, 100)),
    });
  }

  rows.sort((a, b) => b.point - a.point);
  return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

async function buildArenaAuthoritativeRankRows(session, player, limit = 20) {
  const maxRows = Math.max(1, Math.min(100, toSafeInt(limit, 20)));
  const rankRows = await rank.getTopN('arena', maxRows).catch(() => []);
  const ids = rankRows.map((row) => String(row && row.playerId || '').trim()).filter(Boolean);
  if (ids.length <= 0) return [];

  // Keep the rank/profile projection identical to the fight snapshot. A
  // partial DTO makes the same player show a different combat power in BXH.
  const projection = arenaReadModel.PLAYER_PROJECTION;
  const playerRows = await Player.find({ playerId: { $in: ids } })
    .select(projection)
    .maxTimeMS(1500)
    .lean()
    .catch(() => []);
  const byId = new Map(playerRows.map((row) => [String(row && row.playerId || '').trim(), row]));
  const serverId = resolveArenaServerId(session, player);
  return rankRows.map((rankRow, index) => {
    const id = String(rankRow.playerId || '').trim();
    const source = byId.get(id) || { playerId: id, arenaScore: rankRow.score, name: 'Đạo hữu Võ đạo hội' };
    let row;
    try {
      const view = arenaReadModel.buildPlayerView({
        ...source,
        arenaScore: Number.isFinite(Number(rankRow.score)) ? Number(rankRow.score) : source.arenaScore,
      }, serverId);
      row = view.publicRow;
    } catch (err) {
      logger.warn(`[Arena] rank row skipped player=${id}: ${err.message}`);
      return null;
    }
    const isSelf = Boolean(player && (id === String(player.playerId || '') || id === String(player._id || '')));
    return {
      ...row,
      // Native rank/profile paths expect the Mongo ObjectId24 in `dbid`;
      // For self player, use player.playerId so client e[n].dbid == ActorModel.actorID recognizes self.
      dbid: isSelf ? String(player.playerId || row.dbid) : row.dbid,
      playerId: id || row.playerId,
      point: Number(rankRow.score) || 0,
      score: Number(rankRow.score) || 0,
      rank: Math.max(1, toSafeInt(rankRow.rank, index + 1)),
    };
  }).filter(Boolean);
}

async function loadArenaLogRows(player, limit = 30) {
  const embedded = ensureArray(player && player.arenaLoglist).slice(-Math.max(1, limit));
  const attackerId = String(player && (player.playerId || player.userId) || '').trim();
  if (!attackerId) return embedded;
  try {
    const rows = await ArenaFightLog.find({
      $or: [{ attackerId }, { targetId: attackerId }, { targetPlayerId: attackerId }],
    })
      .sort({ createdAt: -1 }).limit(Math.max(1, limit)).lean();
    const merged = new Map();
    embedded.forEach((row) => {
      if (!row) return;
      const key = String(row.fightId || row.uid || `${row.logtime || 0}:${row.dbid || ''}`);
      merged.set(key, row);
    });
    ensureArray(rows).forEach((row) => {
      const defending = String(row.attackerId || '') !== attackerId;
      if (defending) {
        if (toSafeInt(row.zeroSumVersion, 0) !== 1) return;
        const targetDelta = toSafeInt(row.targetScoreChange, -toSafeInt(row.scoreChange, 0));
        const key = `${String(row.fightId || row.logUid || '')}:defender`;
        if (!key || merged.has(key)) return;
        merged.set(key, {
          fightId: row.fightId,
          uid: Math.max(0, toSafeInt(row.logUid, 0)),
          dbid: String(row.attackerId || ''),
          name: String(row.attackerName || 'Đối thủ Võ đạo hội'),
          level: Math.max(1, toSafeInt(row.attackerLevel, 1)),
          avatar: 0,
          avatarFrame: -1,
          kungfuId: 4,
          logtime: row.createdAt ? Math.floor(new Date(row.createdAt).getTime() / 1000) : 0,
          win: toSafeInt(row.win, 0) ? 0 : 1,
          score: targetDelta,
          scorechange: targetDelta,
          enemyscore: Math.max(0, toSafeInt(row.preScore, 1000)),
          revenge: 3,
        });
        return;
      }
      const key = String(row.fightId || row.logUid || '');
      if (!key || merged.has(key)) return;
      merged.set(key, {
        fightId: row.fightId,
        uid: Math.max(0, toSafeInt(row.logUid, 0)),
        dbid: String(row.targetId || ''),
        name: String(row.targetName || 'Đối thủ Võ đạo hội'),
        level: Math.max(1, toSafeInt(row.targetLevel, 1)),
        avatar: Math.max(0, toSafeInt(row.targetAvatar, 0)),
        avatarFrame: Math.max(-1, toSafeInt(row.targetAvatarFrame, -1)),
        kungfuId: Math.max(1, toSafeInt(row.targetKungfuId, 4)),
        logtime: row.createdAt ? Math.floor(new Date(row.createdAt).getTime() / 1000) : 0,
        win: toSafeInt(row.win, 0), score: toSafeInt(row.scoreChange, 0),
        scorechange: toSafeInt(row.scoreChange, 0),
        enemyscore: Math.max(0, toSafeInt(row.enemyScore, row.preScore)),
        revenge: Math.max(0, toSafeInt(row.revenge, 0)),
      });
    });
    return Array.from(merged.values()).slice(-Math.max(1, limit));
  } catch (err) {
    logger.warn(`[Arena] log read fallback: ${err.message}`);
    return embedded;
  }
}

async function flushArenaLogOutbox(session, player) {
  if (!player || !Array.isArray(player.arenaLogOutbox) || player.arenaLogOutbox.length === 0) return;
  const pending = player.arenaLogOutbox.slice();
  const remain = [];
  for (const row of pending) {
    try { await ArenaFightLog.create(row); }
    catch (err) {
      if (!(err && err.code === 11000)) remain.push(row);
    }
  }
  if (remain.length !== pending.length) {
    player.arenaLogOutbox = remain;
    await playerService.savePlayer(session.userId, player, { returnSaved: false }).catch(() => undefined);
  }
}

// Arena info (tag:2600)
async function handleArenaInfo(_params, session, msgUid) {
  const player = session.player;
  await flushArenaLogOutbox(session, player);
  const beforeArenaState = clonePlayerSnapshot(player);
  const state = ensureArenaState(player);
  if (player && state.changed) {
    try {
      const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
      if (!saved) throw new Error('ARENA_DAILY_STATE_SAVE_NOT_CONFIRMED');
    } catch (err) {
      runtimeBus.getWsServer()?.invalidatePlayerForMutation?.(session.userId);
      session.player = null;
      logger.warn(`[Arena] daily state save failed: ${err.message}`);
      return { tag: 2600, msgUid, data: { result: -1, code: 'ARENA_SAVE_UNKNOWN', retryable: true,
        message: 'Chưa xác nhận đồng bộ Võ Đạo Hội. Hãy đăng nhập lại.' } };
    }
  }
  const score = player ? Math.max(0, toSafeInt(player.arenaScore, 1000)) : 1000;
  const arenaStateSync = player ? buildArenaInventoryDelta(beforeArenaState, player, [10]) : { items: [], changed: [] };
  const playerId = player ? player.playerId : '';
  const [myRank, challengelist, rankRows, logRows] = await Promise.all([
    playerId ? rank.getRank('arena', playerId).catch(() => -1) : Promise.resolve(999),
    buildArenaChallengeList(session, player),
    buildArenaAuthoritativeRankRows(session, player),
    loadArenaLogRows(player),
  ]);

  return {
    tag: 2600,
    msgUid,
    data: {
      score,
      rank: myRank > 0 ? myRank : 999,
      dailyCount: player ? Math.max(0, toSafeInt(player.arenaDailyCount, 0)) : 0,
      maxCount: state.maxCount,
      challengelist,
      refreshtime: player ? Math.floor(Math.max(0, toSafeInt(player.arenaRefreshAt, 0)) / 1000) : 0,
      loglist: logRows,
      ranklist: rankRows,
      toplist: rankRows.slice(0, 3),
      items: arenaStateSync.items,
      changed: arenaStateSync.changed,
    },
  };
}

// Arena refresh (tag:2601)
async function handleArenaRefreshUnlocked(_params, session, msgUid, options = {}) {
  const player = session && session.player;
  if (!player) {
    return { tag: 2601, msgUid, data: { result: -1, code: 'ARENA_SESSION_INVALID' } };
  }
  const now = Date.now();
  ensureArenaState(player, now);
  const refreshAt = Math.max(0, toSafeInt(player.arenaRefreshAt, 0));
  if (refreshAt > now) {
    return {
      tag: 2601,
      msgUid,
      data: {
        result: -1,
        code: 'ARENA_REFRESH_COOLDOWN',
        refreshtime: Math.floor(refreshAt / 1000),
        remainingMs: refreshAt - now,
      },
    };
  }
  const base = ensurePlainObject(config.get('ArenaBaseConfig'));
  const refreshCost = ensurePlainObject(base.arenaRefreshCost, { id: 2, count: 100 });
  const before = clonePlayerSnapshot(player);
  const snapshotBefore = session && session._arenaChallengeSnapshot;
  let refreshChoice;
  try {
    const pool = await buildArenaChallengeListBase(session, player, 5);
    const previousIds = snapshotBefore && Array.isArray(snapshotBefore.rows)
      ? snapshotBefore.rows.map((row) => row && (row.dbid || row.playerId)).filter(Boolean)
      : [];
    refreshChoice = arenaReadModel.chooseOpponents(pool, previousIds, 5);
    if (snapshotBefore && refreshChoice.noChange) {
      return {
        tag: 2601,
        msgUid,
        data: { result: -1, code: 'ARENA_REFRESH_NO_CHANGE', noChange: true },
      };
    }
  } catch (err) {
    logger.warn(`[Arena] refresh candidate build failed: ${err.message}`);
    return { tag: 2601, msgUid, data: { result: -1, code: 'ARENA_REFRESH_LIST_FAILED' } };
  }
  if (!consumeArenaItem(player, refreshCost.id, refreshCost.count)) {
    return {
      tag: 2601,
      msgUid,
      data: { result: -1, code: 'ARENA_REFRESH_COST_NOT_ENOUGH', cost: refreshCost },
    };
  }
  player.arenaRefreshAt = now + ARENA_REFRESH_SEC * 1000;
  const challengelist = decorateArenaChallengeList(session, player, refreshChoice.opponents);
  const sync = buildArenaInventoryDelta(before, player, [refreshCost.id]);
  if (options.receiptId) {
    rememberArenaLedger(player, {
      id: String(options.receiptId), createdAt: Date.now(), action: 'refresh',
      score: Math.max(0, toSafeInt(player.arenaScore, 1000)),
      dailyCount: Math.max(0, toSafeInt(player.arenaDailyCount, 0)),
      maxCount: arenaMaxCount(), challengelist: clonePlain(challengelist),
      challengeVersion: session && session._arenaChallengeSnapshot ? session._arenaChallengeSnapshot.version : '',
      refreshtime: Math.floor(player.arenaRefreshAt / 1000),
      items: clonePlain(sync.items), changed: clonePlain(sync.changed),
    });
  }
  try {
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (!saved) throw new Error('ARENA_REFRESH_SAVE_NOT_CONFIRMED');
  } catch (err) {
    runtimeBus.getWsServer()?.invalidatePlayerForMutation?.(session.userId);
    session.player = null;
    if (session) session._arenaChallengeSnapshot = snapshotBefore;
    logger.warn(`[Arena] refresh save failed: ${err.message}`);
    return { tag: 2601, msgUid, data: { result: -1, code: 'ARENA_REFRESH_SAVE_FAILED', retryable: true,
      message: 'Chưa xác nhận kết quả làm mới. Hãy đăng nhập lại để đối soát.' } };
  }
  const response = {
    tag: 2601,
    msgUid,
    data: {
      result: 0,
      score: Math.max(0, toSafeInt(player.arenaScore, 1000)),
      dailyCount: Math.max(0, toSafeInt(player.arenaDailyCount, 0)),
      maxCount: arenaMaxCount(),
      challengelist,
      challengeVersion: session && session._arenaChallengeSnapshot
        ? session._arenaChallengeSnapshot.version
        : '',
      refreshtime: Math.floor(player.arenaRefreshAt / 1000),
      items: sync.items,
      changed: sync.changed,
    },
  };
  return sync.items.length > 0 || sync.changed.length > 0
    ? [{ tag: 1202, msgUid: 0, data: { result: 0, items: sync.items, changed: sync.changed } }, response]
    : response;
}

async function handleArenaRefresh(_params, session, msgUid) {
  let player = session && session.player;
  const lockKey = `arena-refresh:${resolveArenaServerId(session, player)}:${arenaPlayerId(session, player)}`;
  return playerMutation.run(session && session.userId, () => withArenaMutationLock(
    lockKey,
    async () => {
      const canonical = runtimeBus.getWsServer()?.getPlayerForMutation?.(session && session.userId);
      if (canonical) session.player = player = canonical;
      await playerService.drainPendingSaves?.(session && session.userId);
      const receiptId = arenaReceiptId(_params, session, player, 'refresh', msgUid);
      const ledgerEntry = findArenaLedgerEntry(player, receiptId);
      if (ledgerEntry && ledgerEntry.action === 'refresh') return buildRecoveredArenaRefreshResponse(ledgerEntry, msgUid);
      const previous = await claimArenaReceipt(receiptId);
      if (previous) {
        if (previous.status === 'done') return rebindArenaResponseMsgUid(cloneArenaResponse(previous.response), msgUid);
        return { tag: 2601, msgUid, data: { result: -1, code: previous.status === 'unavailable' ? 'ARENA_RECEIPT_UNAVAILABLE' : 'ARENA_REQUEST_IN_PROGRESS', retryable: true } };
      }
      try {
        const response = normalizeArenaErrorResponse(await handleArenaRefreshUnlocked(_params, session, msgUid, { receiptId }), 2601, msgUid);
        await storeArenaReceipt(receiptId, response);
        return response;
      } catch (err) {
        await clearArenaReceiptAsync(receiptId);
        logger.warn(`[Arena] refresh failed: ${err.message}`);
        return { tag: 2601, msgUid, data: { result: -1, code: 'ARENA_REFRESH_INTERNAL_ERROR', retryable: true } };
      }
    },
  ));
}

async function performArenaFightUnlocked(params, session, msgUid, options = {}) {
  const player = session.player;
  const arenaServerId = resolveArenaServerId(session, player);
  const responseTag = Math.max(0, toSafeInt(options.responseTag, 2602)) || 2602;
  const crossArena = !!options.crossArena;
  const fightType = Math.max(1, toSafeInt(params && params.type, crossArena ? 16 : 2));
  if (!player) return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_SESSION_INVALID' } };
  if (!crossArena && ![2, 3].includes(fightType)) return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_FIGHT_TYPE_INVALID' } };

  const crossInfo = crossArena ? ensureCrossArenaInfo(player) : null;
  const arenaState = crossArena ? null : ensureArenaState(player);
  const playerAttrs = battle.calcPlayerPower(player);
  const targetIdx = Math.max(0, toSafeInt(params && (params.index ?? params.targetIndex), 0));
  const difficulty = targetIdx - 2;
  const challengelist = crossArena
    ? await buildCrossArenaChallengeList(session, player)
    : await getArenaChallengeListForFight(session, player);
  let requestedEnemyId = String((params && (params.enemyid || params.logUid)) || '').trim();
  let revengeLog = null;
  if (!crossArena && fightType === 3) {
    revengeLog = ensureArray(player.arenaLoglist).find((row) => String(row && row.uid || '') === requestedEnemyId) || null;
    if (!revengeLog && /^\d+$/.test(requestedEnemyId)) {
      const stored = await ArenaFightLog.findOne({
        attackerId: String(player.playerId || player.userId || ''),
        serverId: arenaServerId,
        logUid: Number(requestedEnemyId),
      }).lean().catch(() => null);
      if (stored) {
        revengeLog = {
          fightId: stored.fightId,
          uid: stored.logUid,
          dbid: stored.targetId,
          name: stored.targetName,
          level: stored.targetLevel,
          avatar: stored.targetAvatar,
          avatarFrame: stored.targetAvatarFrame,
          kungfuId: stored.targetKungfuId,
          revenge: stored.revenge,
          score: stored.scoreChange,
        };
      }
    }
    if (!revengeLog) return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_REVENGE_NOT_FOUND' } };
    if (Number(revengeLog.revenge || 0) > 0) {
      return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_REVENGE_ALREADY_USED', retryable: false } };
    }
    if (toSafeInt(revengeLog.score ?? revengeLog.scorechange, 0) >= 0) {
      return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_REVENGE_NOT_LOST', retryable: false } };
    }
    requestedEnemyId = String(revengeLog.dbid || '').trim();
    if (!requestedEnemyId) return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_REVENGE_TARGET_INVALID' } };
  }
  let selectedById = challengelist.find((row) => (
    requestedEnemyId
    && (String(row && row.dbid || '') === requestedEnemyId
      || String(row && row.playerId || '') === requestedEnemyId)
  ));
  if (!crossArena && fightType === 3 && revengeLog && !selectedById) {
    // A revenge log outlives the five-entry challenge list. Resolve its
    // authoritative target instead of falling back to a different opponent.
    if (/^\d{1,8}$/.test(requestedEnemyId)) {
      selectedById = generateOpponents(player).find(row => String(row.dbid) === requestedEnemyId);
    } else {
      const target = await Player.findOne(arenaReadModel.objectId24(requestedEnemyId)
        ? { _id: requestedEnemyId } : { playerId: requestedEnemyId }).select(arenaReadModel.PLAYER_PROJECTION).maxTimeMS(1500).lean();
      if (target && String(target.playerId) !== String(player.playerId)) {
        selectedById = buildArenaChallengeRowFromPlayer(target, arenaServerId);
      }
    }
  }
  if (requestedEnemyId && !selectedById) {
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_TARGET_STALE' } };
  }
  const requestedChallengeVersion = String(params && params.challengeVersion || '').trim();
  if (!crossArena && requestedChallengeVersion
    && requestedChallengeVersion !== String(selectedById && selectedById.challengeVersion || '')) {
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_CHALLENGE_VERSION_STALE' } };
  }
  const selectedChallenge = selectedById
    || challengelist[Math.max(0, targetIdx)]
    || challengelist[0]
    || null;
  if (!selectedChallenge) {
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_TARGET_NOT_FOUND' } };
  }
  const now = Date.now();
  if (!crossArena && selectedChallenge.challengeExpiresAt && selectedChallenge.challengeExpiresAt <= now) {
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_TARGET_STALE' } };
  }
  if (!crossArena && selectedChallenge.attackerId && selectedChallenge.attackerId !== arenaPlayerId(session, player)) {
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_TARGET_OWNER_MISMATCH' } };
  }
  if (!crossArena && fightType !== 3 && !selectedChallenge.isRobot
    && Math.max(0, toSafeInt(selectedChallenge.nextChallengeTime, 0)) > now) {
    return {
      tag: responseTag,
      msgUid,
      data: { result: -1, code: 'ARENA_TARGET_PROTECTED', nextChallengeTime: selectedChallenge.nextChallengeTime },
    };
  }
  const configuredOpponentAttrs = ensurePlainObject(selectedChallenge && selectedChallenge.robotAttrs);
  if (!crossArena && !selectedChallenge.isRobot && Object.keys(configuredOpponentAttrs).length <= 0) {
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_OPPONENT_SNAPSHOT_MISSING' } };
  }
  const beforeInventory = clonePlayerSnapshot(player);
  if (!crossArena) {
    const base = ensurePlainObject(config.get('ArenaBaseConfig'));
    const arenaCost = ensurePlainObject(base.arenaCost, { id: 10, count: 1 });
    if (!consumeArenaItem(player, arenaCost.id, arenaCost.count)) {
      return {
        tag: responseTag,
        msgUid,
        data: { result: -1, code: 'ARENA_TICKET_NOT_ENOUGH', cost: arenaCost },
      };
    }
    player.arenaDailyCount = arenaState.dailyCount + 1;
  } else {
    crossInfo.dailyCount += 1;
  }
  const opAttrs = Object.keys(configuredOpponentAttrs).length > 0
    ? configuredOpponentAttrs
    : battle.generateOpponentAttrs(
      Math.max(1, toSafeInt(selectedChallenge.level, player.level)),
      difficulty
    );
  let result;
  try {
    result = battle.simulateBattle(playerAttrs, opAttrs, {
      isPvp: true, mode: crossArena ? 'crossArena' : 'arena',
      formulaVersion: process.env.CUSTOM_PVP_FORMULA_ENABLED === '1' ? 'custom-pvp-v1' : 'legacy',
    });
  } catch (err) {
    Object.keys(player).forEach((key) => { delete player[key]; });
    Object.assign(player, beforeInventory);
    logger.warn(`[Arena] battle simulation failed: ${err.message}`);
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_SIMULATION_FAILED' } };
  }
  let claimedProtectUntil = 0;
  if (!crossArena && !selectedChallenge.isRobot) {
    try {
      claimedProtectUntil = await claimArenaTargetProtection(selectedChallenge, now, fightType === 3);
    } catch (err) {
      Object.keys(player).forEach((key) => { delete player[key]; });
      Object.assign(player, beforeInventory);
      logger.warn(`[Arena] target protection claim failed: ${err.message}`);
      return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_TARGET_PROTECTION_UNAVAILABLE' } };
    }
    if (claimedProtectUntil < 0) {
      Object.keys(player).forEach((key) => { delete player[key]; });
      Object.assign(player, beforeInventory);
      return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_TARGET_PROTECTED' } };
    }
  }
  const taskChanged = options.syncTask ? !!addArenaChallengeCount(player, 1) : false;
  // Keep numeric robot ids intact. The H5 settlement view parses them with
  // Number.parseInt before calling CreateRobotShowInfo; `arena_enemy_*` becomes NaN.
  const selectedEnemyId = selectedChallenge && (selectedChallenge.dbid || selectedChallenge.playerId);
  const enemyDbid = String(selectedEnemyId || (params && params.enemyid) || `arena_enemy_${Math.max(0, targetIdx)}`);
  const enemyid = revengeLog ? String(revengeLog.uid) : enemyDbid;
  const enemyScore = Math.max(0, toSafeInt(
    selectedChallenge && (selectedChallenge.score ?? selectedChallenge.point),
    1000 + Math.max(1, toSafeInt(selectedChallenge && selectedChallenge.level, player.level)) * 10
  ));

  let currentScore = crossInfo
    ? Math.max(0, toSafeInt(crossInfo.score, 1000))
    : Math.max(0, toSafeInt(player.arenaScore, 1000));
  const rewards = [];
  let scoreChange = 0;
  if (result.win) {
    scoreChange = calculateArenaScoreChange(currentScore, enemyScore, true);
    currentScore += scoreChange;
    rewards.push(...getArenaBattleRewards(currentScore));
    rewards.forEach((r) => addRewardToPlayer(player, r.id, r.count));
  } else {
    scoreChange = calculateArenaScoreChange(currentScore, enemyScore, false);
    const previousScore = currentScore;
    currentScore = Math.max(0, currentScore + scoreChange);
    scoreChange = currentScore - previousScore;
  }
  if (crossInfo) crossInfo.score = currentScore;
  else player.arenaScore = currentScore;

  const fightId = buildArenaFightId(session, player, params, msgUid);
  const defenderScoreMutation = !crossArena && !selectedChallenge.isRobot
    && selectedChallenge.playerId && scoreChange !== 0
    ? {
      fightId,
      targetPlayerId: String(selectedChallenge.playerId),
      targetServerId: arenaServerId,
      delta: -scoreChange,
    }
    : null;
  let defenderScoreResult = { status: 'skipped', scoreChange: 0 };
  let logUid = 0;
  if (!crossArena) {
    player.arenaLoglist = ensureArray(player.arenaLoglist);
    logUid = revengeLog ? Number(revengeLog.uid) : nextArenaLogUid(player);
    const logRow = {
      fightId,
      msgUid: msgUid == null ? 0 : msgUid,
      logtime: Math.floor(Date.now() / 1000),
      uid: logUid,
      dbid: enemyDbid,
      name: String(selectedChallenge && selectedChallenge.name || 'Đối thủ Võ đạo hội'),
      level: Math.max(1, toSafeInt(selectedChallenge && selectedChallenge.level, player.level)),
      avatar: Math.max(0, toSafeInt(selectedChallenge && selectedChallenge.avatar, 11300)),
      avatarFrame: Math.max(-1, toSafeInt(selectedChallenge && selectedChallenge.avatarFrame, -1)),
      kungfuId: Math.max(1, toSafeInt(selectedChallenge && selectedChallenge.kungfuId, 4)),
      win: result && result.win ? 1 : 0,
      score: scoreChange,
      scorechange: scoreChange,
      enemyscore: enemyScore,
      revenge: revengeLog ? (result && result.win ? 1 : 3) : 0,
    };
    if (revengeLog) Object.assign(revengeLog, logRow);
    else player.arenaLoglist.push(logRow);
    if (player.arenaLoglist.length > 30) player.arenaLoglist = player.arenaLoglist.slice(-30);
    if (revengeLog && revengeLog.fightId) {
      void ArenaFightLog.updateOne(
        { fightId: String(revengeLog.fightId) },
        { $set: { revenge: result && result.win ? 1 : 3 } },
        { maxTimeMS: 1500 },
      ).exec().catch((err) => logger.warn(`[Arena] revenge log update failed: ${err.message}`));
    }
  }
  const inventorySync = buildArenaInventoryDelta(
    beforeInventory,
    player,
    !crossArena
      ? [10, ...rewards.map((row) => row.id)]
      : rewards.map((row) => row.id)
  );

  const playerHpMax = Math.max(1, toSafeInt(playerAttrs && playerAttrs[1], 100));
  const enemyHpMax = Math.max(1, toSafeInt(opAttrs && opAttrs[1], 100));
  const arenaFightShowInfo = buildArenaFightSelfShowInfo(player, arenaServerId, arenaReadModel.displayPower(playerAttrs || {}));
  const arenaOpponentShowInfo = buildArenaFightOpponentShowInfo({
    ...selectedChallenge,
    dbid: enemyDbid,
  }, player.level);
  const arenaBattleFlow = {
    events: buildChapterFightEvents(
      null,
      null,
      playerAttrs,
      opAttrs,
      result,
      {
        player,
        enemyAsPlayer: !selectedChallenge.isRobot,
        enemyPlayer: {
          ...selectedChallenge,
          roleInfo: {
            kungfuId: selectedChallenge.kungfuId,
            subJob: selectedChallenge.subJob,
          },
        },
      },
    ),
  };
  if (!Array.isArray(arenaBattleFlow.events) || arenaBattleFlow.events.length <= 0) {
    arenaBattleFlow.events = buildArenaBattleEvents(
      playerHpMax,
      enemyHpMax,
      arenaOpponentShowInfo,
      !!(result && result.win),
    ).events;
  }
  const selfEntity = applyPrimaryBattlePetParts({
    id: Math.max(1, toSafeInt(arenaFightShowInfo.kungfuId, 4)),
    dbid: String(player.playerId || player.userId || 'arena_self'),
    name: String(player.name || 'Player'),
    type: 1,
    side: 1,
    camp: 1,
    pos: 1,
    posIndex: 1,
    hp: playerHpMax,
    maxhp: playerHpMax,
    maxHp: playerHpMax,
    vars: buildFightVars(playerHpMax),
    showInfo: arenaFightShowInfo,
    parts: {},
    partValues: {},
  }, player);

  const fightResult = {
    type: fightType,
    ...customCombatSummary(result),
    win: result && result.win ? 1 : 0,
    mustChangeTurn: 0,
    notChangeTurn: 1,
    atkAttr: playerAttrs || {},
    defAttr: opAttrs || {},
    damage: result.rulesVersion === 'custom-pvp-v1'
      ? { 1: intDamage(result.playerDamage), '-1': intDamage(result.monsterDamage) }
      : { 1: Math.max(0, toSafeInt(result && result.monsterDamage, 0)), '-1': Math.max(0, toSafeInt(result && result.playerDamage, 0)) },
    isBackFight: false,
    events: result.rulesVersion === 'custom-pvp-v1' || responseTag === 2300 ? arenaBattleFlow.events : (Array.isArray(result && result.rounds) ? result.rounds : []),
    entitys: [
      selfEntity,
      {
        id: Math.max(1, toSafeInt(arenaOpponentShowInfo.kungfuId, 4)),
        dbid: enemyDbid,
        name: String((selectedChallenge && selectedChallenge.name) || "Đối thủ Võ đạo hội"),
        type: 1,
        side: 2,
        camp: 2,
        pos: -1,
        posIndex: -1,
        hp: enemyHpMax,
        maxhp: enemyHpMax,
        maxHp: enemyHpMax,
        vars: buildFightVars(enemyHpMax),
        showInfo: arenaOpponentShowInfo,
        parts: {},
        partValues: {},
      },
    ],
    guildBossAllDamage: 0,
    bloodlineOffset: 0,
  };

  // Persist a compact outcome marker together with the player mutation. If a
  // worker dies after Mongo commits the player but before Redis receipt/log
  // writes, a reconnect can return this outcome instead of charging twice.
  if (!crossArena && options.receiptId) {
    rememberArenaLedger(player, {
      id: String(options.receiptId),
      createdAt: Date.now(),
      fightId,
      enemyid,
      enemyDbid,
      score: currentScore,
      scorechange: scoreChange,
      logUid,
      rewards: clonePlain(rewards),
      items: clonePlain(inventorySync.items),
      changed: clonePlain(inventorySync.changed),
      win: result && result.win ? 1 : 0,
      playerAttrs: clonePlain(playerAttrs || {}),
      opponentAttrs: clonePlain(opAttrs || {}),
      fightResult: compactArenaFightResult(fightResult),
      targetScore: defenderScoreMutation ? { ...defenderScoreMutation, status: 'pending' } : null,
    });
  }

  try {
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (!saved) throw new Error('ARENA_SAVE_NOT_CONFIRMED');
  } catch (err) {
    runtimeBus.getWsServer()?.invalidatePlayerForMutation?.(session.userId);
    session.player = null;
    logger.warn(`[Arena] fight save failed: ${err.message}`);
    return { tag: responseTag, msgUid, data: { result: -1, code: 'ARENA_SAVE_FAILED', retryable: true,
      message: 'Chưa xác nhận kết quả trận. Hãy đăng nhập lại để đối soát; không đánh lại trận mới.' } };
  }
  if (defenderScoreMutation) {
    try {
      defenderScoreResult = await applyArenaDefenderScore({
        selectedChallenge,
        scoreChange,
        fightId,
        serverId: arenaServerId,
      });
      const ledger = findArenaLedgerEntry(player, options.receiptId);
      if (ledger) {
        const { document: _doc, ...cleanDefenderResult } = defenderScoreResult || {};
        ledger.targetScore = { ...defenderScoreMutation, ...cleanDefenderResult, status: 'done' };
      }
    } catch (err) {
      // The attacker result is already durable. Keep the target mutation in
      // the receipt so reconnect/retry can finish the defender CAS; never
      // rerun the paid battle or silently report a complete transfer.
      logger.error(`[Arena] defender score pending fight=${fightId}: ${err.message}`);
      defenderScoreResult = {
        status: 'pending', scoreChange: 0,
        targetPlayerId: defenderScoreMutation.targetPlayerId,
        targetUserId: '', rankPending: true,
        errorCode: err.code || 'ARENA_TARGET_SCORE_PENDING',
      };
    }
  }
  if (crossArena) {
    await crossEvents.upsertScore({ serverId: arenaServerId, playerId: player.playerId, userId: player.userId || session.userId, name: player.name, level: player.level, score: currentScore, payload: { roleInfo: player.roleInfo || {} } }).catch((err) => logger.warn(`[CrossArena] score sync skipped: ${err.message}`));
  }
  const rankType = crossArena ? 'crossArena' : 'arena';
  try {
    await rank.updateScore(rankType, player.playerId, currentScore);
    if (!crossArena && player.arenaRankSyncPending) delete player.arenaRankSyncPending;
  } catch (err) {
    if (!crossArena) {
      player.arenaRankSyncPending = { score: currentScore, updatedAt: Date.now() };
      await playerService.savePlayer(session.userId, player, { returnSaved: false }).catch(() => undefined);
    }
    logger.error(`[Arena] rank update failed type=${rankType} player=${player.playerId}: ${err.message}`);
  }
  if (claimedProtectUntil > 0) selectedChallenge.nextChallengeTime = claimedProtectUntil;
  if (!crossArena) {
    const snapshotHash = crypto.createHash('sha256')
      .update(JSON.stringify(configuredOpponentAttrs))
      .digest('hex');
    const logDocument = {
      fightId,
      serverId: arenaServerId,
      attackerId: String(player.playerId || player.userId || ''),
      targetId: String(selectedChallenge && selectedChallenge.playerId || enemyDbid || ''),
      targetPlayerId: String(selectedChallenge && selectedChallenge.playerId || ''),
      logUid,
      targetName: String(selectedChallenge && selectedChallenge.name || 'Đối thủ Võ đạo hội'),
      targetLevel: Math.max(1, toSafeInt(selectedChallenge && selectedChallenge.level, player.level)),
      targetAvatar: Math.max(0, toSafeInt(selectedChallenge && selectedChallenge.avatar, 11300)),
      targetAvatarFrame: Math.max(-1, toSafeInt(selectedChallenge && selectedChallenge.avatarFrame, -1)),
      targetKungfuId: Math.max(1, toSafeInt(selectedChallenge && selectedChallenge.kungfuId, 4)),
      revenge: revengeLog ? (result && result.win ? 1 : 3) : 0,
      msgUid: msgUid == null ? 0 : msgUid,
      snapshotHash,
      preScore: currentScore - scoreChange,
      postScore: currentScore,
      enemyScore,
      scoreChange,
      targetPreScore: Math.max(0, toSafeInt(defenderScoreResult.scoreBefore, 0)),
      targetPostScore: Math.max(0, toSafeInt(defenderScoreResult.scoreAfter, 0)),
      targetScoreChange: toSafeInt(defenderScoreResult.scoreChange, 0),
      zeroSumVersion: defenderScoreMutation && defenderScoreResult.status !== 'pending' ? 1 : 0,
      attackerName: String(player.name || ''),
      attackerLevel: Math.max(1, toSafeInt(player.level, 1)),
      cost: [{ id: 10, count: 1 }],
      rewards,
      win: result && result.win ? 1 : 0,
    };
    try {
      await ArenaFightLog.create(logDocument);
    } catch (err) {
      if (!(err && err.code === 11000)) {
        player.arenaLogOutbox = ensureArray(player.arenaLogOutbox);
        player.arenaLogOutbox.push(logDocument);
        if (player.arenaLogOutbox.length > 30) player.arenaLogOutbox = player.arenaLogOutbox.slice(-30);
        await playerService.savePlayer(session.userId, player, { returnSaved: false }).catch(() => undefined);
        logger.warn(`[Arena] fight log queued for retry: ${err.message}`);
      }
    }
  }
  // Target refresh is a best-effort push and must not hold the initiating
  // player's FIFO queue behind a second Player.findOne query.
  void notifyArenaTargetUpdate(selectedChallenge, player, arenaServerId, crossArena ? 5003 : 2603)
    .catch((err) => logger.warn(`[Arena] target update detached: ${err.message}`));
  const myRank = player.playerId
    ? await rank.getRank(rankType, player.playerId).catch(() => -1)
    : 999;
  const authoritativeRankRows = crossArena
    ? challengelist
    : await buildArenaAuthoritativeRankRows(session, player);
  const response = {
    tag: responseTag,
    msgUid,
    data: {
      result: 0,
      enemyid,
      enemyscore: enemyScore,
      score: currentScore,
      scorechange: scoreChange,
      targetScorechange: toSafeInt(defenderScoreResult.scoreChange, 0),
      targetScorePending: defenderScoreResult.status === 'pending',
      rank: myRank > 0 ? myRank : 999,
      topList: responseTag === 2300
        ? authoritativeRankRows.slice(0, 3).map((row) => buildArenaFightOpponentShowInfo(row, player.level))
        : authoritativeRankRows.slice(0, 3),
      rankList: authoritativeRankRows,
      challengelist: responseTag === 2300
        ? buildArenaPostFightChallengeList(challengelist, selectedChallenge, targetIdx)
        : challengelist,
      rewards,
      rewardInfo: buildRewardInfo(rewards),
      fightId,
      logUid,
      items: inventorySync.items,
      changed: inventorySync.changed,
      fightResult,
      win: result.win,
      star: result.star,
      rounds: result.totalRounds,
      battleLog: result.rounds,
      playerAttrs,
      opponentAttrs: opAttrs,
      powerScore: result.powerScore,
    },
  };

  if (options.asPackets) {
    const packets = [];
    if (inventorySync.items.length > 0 || inventorySync.changed.length > 0) {
      packets.push({ tag: 1202, msgUid: 0, data: { result: 0, items: inventorySync.items, changed: inventorySync.changed } });
    }
    if (taskChanged) packets.push(...buildTaskUpdatePacketsSafe(player));
    packets.push(response);
    return packets;
  }
  return taskChanged ? [...buildTaskUpdatePacketsSafe(player), response] : response;
}

async function resolveArenaTargetUserIdForLock(params, session, player) {
  if (!player) return '';
  const fightType = Math.max(1, toSafeInt(params && params.type, 2));
  let id = String(params && (params.enemyid || params.logUid) || '').trim();
  if (fightType === 3) {
    const ownLog = ensureArray(player.arenaLoglist).find(row => String(row && row.uid || '') === id);
    if (ownLog) id = String(ownLog.dbid || '').trim();
    else if (/^\d+$/.test(id)) {
      const stored = await ArenaFightLog.findOne({
        attackerId: String(player.playerId || player.userId || ''),
        serverId: resolveArenaServerId(session, player),
        logUid: Number(id),
      }).lean().catch(() => null);
      id = String(stored && (stored.targetPlayerId || stored.targetId) || '').trim();
    }
  }
  if (!id) {
    const rows = ensureArray(session && session._arenaChallengeSnapshot && session._arenaChallengeSnapshot.rows);
    const index = Math.max(0, toSafeInt(params && (params.index ?? params.targetIndex), 0));
    const row = rows[index] || rows[0];
    id = String(row && (row.playerId || row.dbid) || '').trim();
    if (row && row.isRobot) return '';
  }
  if (!id || /^\d{1,8}$/.test(id)) return '';
  const target = await Player.findOne(arenaReadModel.objectId24(id) ? { _id: id } : { playerId: id })
    .select({ userId: 1, playerId: 1, isBot: 1, managedBot: 1 }).maxTimeMS(1500).lean();
  if (!target || target.isBot || target.managedBot || String(target.playerId) === String(player.playerId)) return '';
  return String(target.userId || '').trim();
}

async function performArenaFight(params, session, msgUid, options = {}) {
  if (options && options.crossArena) {
    return require('../services/CrossArenaService').fight(params, session, msgUid);
  }
  let player = session && session.player;
  const lockKey = `arena:${resolveArenaServerId(session, player)}:${arenaPlayerId(session, player)}`;
  let targetUserId = '';
  try {
    targetUserId = await resolveArenaTargetUserIdForLock(params, session, player);
  } catch (err) {
    logger.warn(`[Arena] target lock preflight skipped: ${err.message}`);
  }
  const lockUsers = [session && session.userId, targetUserId].filter(Boolean);
  return playerMutation.runMany(lockUsers, () => withArenaMutationLock(lockKey, async () => {
    const canonical = runtimeBus.getWsServer()?.getPlayerForMutation?.(session && session.userId);
    if (canonical) session.player = player = canonical;
    await playerService.drainPendingSaves?.(session && session.userId);
    const receiptId = arenaReceiptId(params, session, player, 'fight', msgUid);
    const ledgerEntry = findArenaLedgerEntry(player, receiptId);
    if (ledgerEntry) {
      let targetScorePending = false;
      if (ledgerEntry.targetScore) {
        try {
          const targetResult = (await retryArenaTargetScoreFromLedger(ledgerEntry)) || {};
          const { document: _doc, ...cleanTargetResult } = targetResult;
          ledgerEntry.targetScore = { ...sanitizeArenaLedgerEntry({ targetScore: ledgerEntry.targetScore }).targetScore,
            ...cleanTargetResult,
            status: cleanTargetResult.status === 'pending' ? 'pending' : 'done' };
          if (targetResult.status !== 'pending') {
            await ArenaFightLog.updateOne({ fightId: String(ledgerEntry.fightId) }, {
              $set: {
                targetPlayerId: String(ledgerEntry.targetScore.targetPlayerId || ''),
                targetPreScore: Math.max(0, toSafeInt(targetResult.scoreBefore, 0)),
                targetPostScore: Math.max(0, toSafeInt(targetResult.scoreAfter, 0)),
                targetScoreChange: toSafeInt(targetResult.scoreChange, 0),
                zeroSumVersion: 1,
              },
            }, { maxTimeMS: 1500 }).exec().catch(() => undefined);
          }
        } catch (err) {
          targetScorePending = true;
          logger.warn(`[Arena] target score replay pending fight=${ledgerEntry.fightId}: ${err.message}`);
        }
      }
      await ensureArenaFightLogFromLedger(ledgerEntry, session, player);
      const recovered = buildRecoveredArenaResponse(
        ledgerEntry,
        msgUid,
        Math.max(0, toSafeInt(options.responseTag, 2300)) || 2300,
        player,
      );
      const currentRank = await rank.getRank('arena', player.playerId).catch(() => -1);
      if (currentRank > 0) recovered.data.rank = currentRank;
      else delete recovered.data.rank;
      recovered.data.score = Math.max(0, toSafeInt(player.arenaScore, ledgerEntry.score));
      recovered.data.targetScorePending = targetScorePending;
      const sync = buildArenaInventoryDelta(player, player, [10, ...ensureArray(ledgerEntry.rewards).map(r => r.id)]);
      recovered.data.items = []; recovered.data.changed = sync.changed;
      return [{ tag: 1202, msgUid: 0, data: { result: 0, items: [], changed: sync.changed } }, recovered];
    }
    const previous = await claimArenaReceipt(receiptId);
    if (previous) {
      if (previous.status === 'done') return rebindArenaResponseMsgUid(cloneArenaResponse(previous.response), msgUid);
      return {
        tag: Math.max(0, toSafeInt(options.responseTag, 2300)) || 2300,
        msgUid,
        data: {
          result: -1,
          enemyid: '000000000000000000000000',
          retryable: true,
          code: previous.status === 'unavailable' ? 'ARENA_RECEIPT_UNAVAILABLE' : 'ARENA_REQUEST_IN_PROGRESS',
        },
      };
    }
    try {
      const response = normalizeArenaErrorResponse(
        await performArenaFightUnlocked(params, session, msgUid, { ...options, receiptId }),
        Math.max(0, toSafeInt(options.responseTag, 2300)) || 2300,
        msgUid
      );
      await storeArenaReceipt(receiptId, response);
      return response;
    } catch (err) {
      await clearArenaReceiptAsync(receiptId);
      logger.error(`[Arena] fight failed user=${session && session.userId ? session.userId : 'unknown'}: ${err.message}`);
      return {
        tag: Math.max(0, toSafeInt(options.responseTag, 2300)) || 2300,
        msgUid,
        data: { result: -1, enemyid: '000000000000000000000000', retryable: true, code: 'ARENA_INTERNAL_ERROR' },
      };
    }
  }));
}

// Latest H5 top-arena battle entry (tag:2350).
async function handleTopArenaStartFight(params, session, msgUid) {
  const player = session && session.player;
  if (!player) {
    return {
      tag: 2350,
      msgUid,
      data: {
        result: 1,
        challengeInfo: { rank: TOP_ARENA_DEFAULT_RANK, refreshtime: 0, challengeList: [], infoMap: {} },
      },
    };
  }

  const info = ensureTopArenaInfo(player);
  const beforeRank = info.rank;
  const beforeChallengeInfo = buildTopArenaChallengeInfo(player, info, false);
  const targetIndex = Math.max(0, toSafeInt(params && params.index, 0));
  const requestedEnemyId = params && params.enemyid != null ? String(params.enemyid) : '';
  const parsedEnemyRank = /^\d+$/.test(requestedEnemyId) ? Math.max(1, toSafeInt(requestedEnemyId, 0)) : 0;
  const targetRank = Math.max(
    1,
    parsedEnemyRank
      || toSafeInt(beforeChallengeInfo.challengeList[targetIndex], 0)
      || Math.max(1, beforeRank - 1),
  );
  let sharedTarget = null;
  try {
    const shared = await crossEvents.top('topArena', crossEvents.cycleFor('topArena'), 2000);
    sharedTarget = shared.filter((row) => String(row.playerId) !== String(player.playerId))[Math.max(0, targetIndex)] || null;
  } catch (err) { logger.warn(`[TopArena] shared roster unavailable: ${err.message}`); }
  const enemyid = requestedEnemyId || String(targetRank);
  const enemyShow = {
    ...(sharedTarget ? { ...buildArenaFightOpponentShowInfo({ ...sharedTarget, dbid: sharedTarget.playerId, point: sharedTarget.score }, player.level), level: sharedTarget.level, serverId: sharedTarget.serverId } : buildTopArenaRobotShowInfo(player, targetRank)),
    dbid: enemyid,
  };

  const playerAttrs = battle.calcPlayerPower(player);
  const enemyAttrs = battle.generateOpponentAttrs(
    Math.max(1, toSafeInt(enemyShow.level, player.level)),
    Math.max(-5, Math.min(10, beforeRank - targetRank)),
  );
  const fight = battle.simulateBattle(playerAttrs, enemyAttrs, { isPvp: true });
  const win = fight && fight.win ? 1 : 0;
  const rankChange = win && targetRank < beforeRank ? beforeRank - targetRank : 0;

  if (rankChange > 0) {
    info.rank = targetRank;
    info.maxRank = Math.min(info.maxRank, info.rank);
  }
  appendTopArenaLog(info, { atk: 1, rank: targetRank, logtime: Math.floor(Date.now() / 1000) });

  const rewards = [];
  if (win) {
    rewards.push({ id: 2, count: 200 + Math.max(1, toSafeInt(player.level, 1)) * 20 });
    rewards.forEach((row) => addRewardToPlayer(player, row.id, row.count));
  }

  const arenaServerId = resolveArenaServerId(session, player);
  const selfShow = buildArenaFightSelfShowInfo(player, arenaServerId, arenaReadModel.displayPower(playerAttrs || {}));
  const opponentShow = buildArenaFightOpponentShowInfo(enemyShow, player.level);
  const playerHpMax = Math.max(1, toSafeInt(playerAttrs && playerAttrs[1], 100));
  const enemyHpMax = Math.max(1, toSafeInt(enemyAttrs && enemyAttrs[1], 100));
  const flow = buildArenaBattleEvents(playerHpMax, enemyHpMax, opponentShow, !!win);
  const selfEntity = applyPrimaryBattlePetParts({
    id: Math.max(1, toSafeInt(selfShow.kungfuId, 4)),
    dbid: String(player.playerId || player.userId || 'top_arena_self'),
    name: String(player.name || 'Player'),
    type: 1,
    side: 1,
    camp: 1,
    pos: 1,
    posIndex: 1,
    hp: playerHpMax,
    maxhp: playerHpMax,
    maxHp: playerHpMax,
    vars: buildFightVars(playerHpMax),
    showInfo: selfShow,
    parts: {},
    partValues: {},
  }, player);
  const fightResult = {
    type: 2,
    win,
    mustChangeTurn: 0,
    notChangeTurn: 1,
    atkAttr: playerAttrs || {},
    defAttr: enemyAttrs || {},
    damage: {
      1: Math.max(0, toSafeInt(fight && fight.monsterDamage, 0)),
      '-1': Math.max(0, toSafeInt(fight && fight.playerDamage, 0)),
    },
    isBackFight: false,
    events: flow.events,
    entitys: [
      selfEntity,
      {
        id: Math.max(1, toSafeInt(opponentShow.kungfuId, 4)),
        dbid: enemyid,
        name: String(opponentShow.name || "Đối thủ đấu trường đỉnh cao"),
        type: 1,
        side: 2,
        camp: 2,
        pos: -1,
        posIndex: -1,
        hp: enemyHpMax,
        maxhp: enemyHpMax,
        maxHp: enemyHpMax,
        vars: buildFightVars(enemyHpMax),
        showInfo: opponentShow,
        parts: {},
        partValues: {},
      },
    ],
    guildBossAllDamage: 0,
    bloodlineOffset: 0,
  };

  const challengeInfo = buildTopArenaChallengeInfo(player, info, true);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  await crossEvents.upsertScore({ event: 'topArena', serverId: arenaServerId, playerId: player.playerId, userId: player.userId || session.userId, name: player.name, level: player.level, score: Math.max(1, TOP_ARENA_MAX_RANK - info.rank + 1), payload: { rank: info.rank, roleInfo: player.roleInfo || {} } }).catch((err) => logger.warn(`[TopArena] score sync skipped: ${err.message}`));
  return {
    tag: 2350,
    msgUid,
    data: {
      result: 0,
      enemyid,
      fightResult,
      challengeInfo,
      rank: info.rank,
      rankChange,
      rewards,
    },
  };
}

// Arena fight (tag:2602)
async function handleArenaFight(params, session, msgUid) {
  const hasFightParams = !!(params && (params.index != null || params.targetIndex != null || params.enemyid != null));
  if (!hasFightParams) {
    const player = session && session.player;
    const state = ensureArenaState(player);
    const challengelist = await buildArenaChallengeList(session, player);
    const selfRank = player && player.playerId
      ? await rank.getRank('arena', player.playerId).catch(() => -1)
      : 999;
    return {
      tag: 2602,
      msgUid,
      data: {
        result: 0,
        score: player ? Math.max(0, toSafeInt(player.arenaScore, 1000)) : 1000,
        rank: selfRank > 0 ? selfRank : 999,
        dailyCount: state.dailyCount,
        maxCount: state.maxCount,
        challengelist,
        challengeVersion: session && session._arenaChallengeSnapshot
          ? session._arenaChallengeSnapshot.version
          : '',
        refreshtime: player ? Math.floor(Math.max(0, toSafeInt(player.arenaRefreshAt, 0)) / 1000) : 0,
      },
    };
  }
  return performArenaFight(params, session, msgUid, { responseTag: 2602, syncTask: true, asPackets: false });
}

// Double tower outbound setup (tag:4500)
async function handleDoubleTowerOutbound(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4500, msgUid, data: { result: -1 } };

  const info = ensureDoubleTowerInfo(player);
  const index = Math.max(1, toSafeInt(params && params.index, 1));
  const outbound = normalizeDoubleTowerTeam(params && params.outbound, buildDefaultDoubleTowerOutbound(player));

  info.index = index;
  info.outbounds[String(index)] = outbound;
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 4500,
    msgUid,
    data: {
      result: 0,
      index,
      outbound,
      ...buildDoubleTowerData(info),
    },
  };
}

// Double tower start battle (tag:4501)
async function handleDoubleTowerBattle(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4501, msgUid, data: { result: -1 } };

  const info = ensureDoubleTowerInfo(player);
  if (!(player.systemUnlockInfo?.unlockedSystem || []).includes(313) || Number(player.level) < 85) {
    return { tag: 4501, msgUid, data: { result: -1, code: 'DOUBLE_TOWER_LOCKED' } };
  }
  const index = Math.max(1, toSafeInt(params && params.index, info.index || 1));
  const aiId = resolveDoubleTowerAIId();
  const logInfo = {
    logtime: Math.floor(Date.now() / 1000),
    type: 0,
    result: 0,
    uid: `double_tower_${aiId}`,
    index,
  };

  info.loglist.push(logInfo);
  if (info.loglist.length > 30) {
    info.loglist = info.loglist.slice(info.loglist.length - 30);
  }
  info.enemyId = String(aiId);
  const pending = doubleTowerLifecycle.begin(info, 'normal', params, { aiId, index, enemyId: String(aiId) });
  await featureMutation.save(session, player);
  return {
    tag: 4501,
    msgUid,
    data: {
      result: 0,
      id: aiId,
      battleId: pending.uid,
      logInfo,
      ...buildDoubleTowerData(info),
    },
  };
}

// Double tower battle finish (tag:4502)
async function handleDoubleTowerBattleFinish(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4502, msgUid, data: { result: -1 } };

  const info = ensureDoubleTowerInfo(player);
  const verified = doubleTowerLifecycle.verify(info, 'normal', params, msgUid);
  if (verified.response) return verified.response;
  const battleType = verified.type;
  const pendingBattle = verified.pending;
  const isWin = battleType === 0;
  const scoreChange = getDoubleTowerBattleScore(battleType);
  updateDoubleTowerPointRank(info, scoreChange);

  const baseCfg = config.get('DoubleTowerBaseConfig') || {};
  const dailyWinMax = Math.max(1, toSafeInt(baseCfg.dailyWinCountMax, 5));
  let rewardInfo = buildRewardInfo([]);
  if (isWin && info.dailyWinNum < dailyWinMax) {
    rewardInfo = grantRewardInfo(player, ensureArray(baseCfg.battleWinRewards));
    info.dailyWinNum += 1;
  }

  const log = appendDoubleTowerLog(info, {
    type: battleType,
    result: isWin ? 0 : 1,
    uid: info.enemyId || '',
    point: info.point,
    rank: info.rank,
  });
  info.enemyId = '';
  if (verified.participated) sideTasks.recordProgress(player, 54, 1, { battleUid: pendingBattle.uid });

  const responseData = {
    result: 0,
    point: info.point,
    rank: info.rank,
    log,
    rewardInfo,
    ...buildDoubleTowerData(info),
  };
  doubleTowerLifecycle.commit(info, pendingBattle, responseData);
  await featureMutation.save(session, player);
  return {
    tag: 4502,
    msgUid,
    data: {
      ...responseData,
    },
  };
}

// Double tower battle ads reward (tag:4503)
async function handleDoubleTowerBattleAdsReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4503, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const baseCfg = config.get('DoubleTowerBaseConfig') || {};
  const adsLimit = Math.max(1, toSafeInt(baseCfg.DailyWinAdsLimit, 5));
  const rawDt = ensurePlainObject(player.doubleTowerInfo);
  const winAdsNum = Math.max(0, toSafeInt(rawDt.winAdsNum, 0));
  if (winAdsNum >= adsLimit) {
    const snap = clonePlayerSnapshot(player);
    const infoSnap = ensureDoubleTowerInfo(snap);
    return {
      tag: 4503,
      msgUid,
      data: { result: 1, rewardInfo: buildRewardInfo([]), ...buildDoubleTowerData(infoSnap) },
    };
  }

  const info = ensureDoubleTowerInfo(player);
  const type = Math.max(0, toSafeInt(params && params.type, 0));

  const rewardRows = type === 1
    ? ensureArray(baseCfg.battleWinAddRewards)
    : [{ id: 71, count: 100 }];
  const rewardInfo = grantRewardInfo(player, rewardRows);
  info.winAdsNum += 1;

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 4503, msgUid, data: { result: 0, rewardInfo, ...buildDoubleTowerData(info) } };
}

// Double tower rank battle start (tag:4504)
async function handleDoubleTowerRankBattle(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4504, msgUid, data: { result: -1, info: {} } };

  const info = ensureDoubleTowerInfo(player);
  if (!(player.systemUnlockInfo?.unlockedSystem || []).includes(313) || Number(player.level) < 85) {
    return { tag: 4504, msgUid, data: { result: -1, code: 'DOUBLE_TOWER_LOCKED', info: {} } };
  }
  const enemyInfo = buildDoubleTowerEnemyInfo(player, info, params);
  info.enemyId = String(enemyInfo.dbid || '');
  const pending = doubleTowerLifecycle.begin(info, 'rank', params, { index: info.index, enemyId: info.enemyId });

  await featureMutation.save(session, player);
  return {
    tag: 4504,
    msgUid,
    data: {
      result: 0,
      info: enemyInfo,
      battleId: pending.uid,
      ...buildDoubleTowerData(info),
    },
  };
}

// Double tower rank battle finish (tag:4505)
async function handleDoubleTowerRankBattleFinish(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4505, msgUid, data: { result: -1 } };

  const info = ensureDoubleTowerInfo(player);
  const verified = doubleTowerLifecycle.verify(info, 'rank', params, msgUid);
  if (verified.response) return verified.response;
  const battleType = verified.type;
  const scoreChange = getDoubleTowerBattleScore(battleType);
  updateDoubleTowerPointRank(info, scoreChange);

  const log = appendDoubleTowerLog(info, {
    type: battleType,
    result: battleType === 0 ? 0 : 1,
    uid: info.enemyId || '',
    point: info.point,
    rank: info.rank,
  });
  info.enemyId = '';
  const responseData = { result: 0, point: info.point, rank: info.rank, log, ...buildDoubleTowerData(info) };
  doubleTowerLifecycle.commit(info, verified.pending, responseData);
  if (verified.participated) sideTasks.recordProgress(player, 54, 1, { battleUid: verified.pending.uid });

  await featureMutation.save(session, player);
  return {
    tag: 4505,
    msgUid,
    data: {
      ...responseData,
    },
  };
}

// Double tower rank battle ads reward (tag:4506)
async function handleDoubleTowerRankBattleAdsReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4506, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const baseCfg = config.get('DoubleTowerBaseConfig') || {};
  const adsLimit = Math.max(1, toSafeInt(baseCfg.DailyWinAdsLimit, 5));
  const rawDt = ensurePlainObject(player.doubleTowerInfo);
  const winAdsNum = Math.max(0, toSafeInt(rawDt.winAdsNum, 0));
  if (winAdsNum >= adsLimit) {
    const snap = clonePlayerSnapshot(player);
    const infoSnap = ensureDoubleTowerInfo(snap);
    return {
      tag: 4506,
      msgUid,
      data: { result: 1, rewardInfo: buildRewardInfo([]), ...buildDoubleTowerData(infoSnap) },
    };
  }

  const info = ensureDoubleTowerInfo(player);
  const type = Math.max(0, toSafeInt(params && params.type, 0));

  const rewardRows = type === 1
    ? [{ id: 72, count: 120 }]
    : [{ id: 71, count: 120 }];
  const rewardInfo = grantRewardInfo(player, rewardRows);
  info.winAdsNum += 1;

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 4506, msgUid, data: { result: 0, rewardInfo, ...buildDoubleTowerData(info) } };
}

// Double tower rank reward claim (tag:4507)
async function handleDoubleTowerRankReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4507, msgUid, data: { result: -1, rewards: [] } };

  const index = Math.max(1, toSafeInt(params && params.index, 1));
  const rawDt = ensurePlainObject(player.doubleTowerInfo);
  const claimed = new Set(
    ensureArray(rawDt.rankRewardList)
      .map((v) => Math.max(0, toSafeInt(v, 0)))
      .filter((v) => v > 0),
  );
  if (claimed.has(index)) {
    return { tag: 4507, msgUid, data: { result: 1, rewards: [] } };
  }

  const info = ensureDoubleTowerInfo(player);

  const rewardCfg = config.get('DoubleTowerRankRewardsConfig') || {};
  const row = rewardCfg[index] || rewardCfg[String(index)] || null;
  const rewards = normalizeRewardRows(row && row.rewards);
  rewards.forEach((reward) => addRewardToPlayer(player, reward.id, reward.count));
  claimed.add(index);
  info.rankRewardList = Array.from(claimed).sort((a, b) => a - b);

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 4507, msgUid, data: { result: 0, index, rewards } };
}

// Double tower top rank list (tag:4508)
async function handleDoubleTowerTopRank(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4508, msgUid, data: { result: -1, rankList: [] } };

  const info = ensureDoubleTowerInfo(player);
  const rankList = buildDoubleTowerRankList(player, info);
  const selfRow = rankList.find((row) => String(row.dbid) === String(player.playerId));
  if (selfRow) {
    info.rank = Math.max(1, toSafeInt(selfRow.rank, info.rank));
    info.point = Math.max(0, toSafeInt(selfRow.point, info.point));
    info.maxPoint = Math.max(toSafeInt(info.maxPoint, 0), info.point);
  }
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 4508, msgUid, data: { result: 0, rankList } };
}

// Double tower set defence index (tag:4509)
async function handleDoubleTowerSetDefence(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4509, msgUid, data: { result: -1, index: 0 } };

  const info = ensureDoubleTowerInfo(player);
  const index = Math.max(1, toSafeInt(params && params.index, 1));
  info.defence = index;
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return { tag: 4509, msgUid, data: { result: 0, ...buildDoubleTowerData(info), index } };
}

async function handleTopCombatStartFight(params, session, msgUid) {
  const player = session && session.player;
  if (!player) return { tag: 2300, msgUid, data: { result: 1 } };

  const info = ensureTopCombatInfo(player);
  const beforeChallengeInfo = buildTopCombatChallengeInfo(player, info, false);
  const beforeRank = info.rank;
  const requestedRobotId = String(params && params.enemyid || '').trim();
  const requestedRank = Math.max(0, toSafeInt(params && params.index, 0));
  const rankByRobot = ensureArray(beforeChallengeInfo.challengeList).find((rank) => {
    const row = ensurePlainObject(beforeChallengeInfo.infoMap && beforeChallengeInfo.infoMap[rank]);
    return requestedRobotId && String(row.dbid || '') === requestedRobotId;
  });
  const targetRank = Math.max(
    1,
    requestedRank
      || toSafeInt(rankByRobot, 0)
      || toSafeInt(beforeChallengeInfo.challengeList[0], 0)
      || Math.max(1, beforeRank - 1),
  );
  const enemyShow = {
    ...buildTopCombatRobotShowInfo(player, targetRank),
    ...ensurePlainObject(beforeChallengeInfo.infoMap && beforeChallengeInfo.infoMap[targetRank]),
  };
  const enemyid = String(enemyShow.dbid || getTopCombatRobotId(targetRank));

  const playerAttrs = battle.calcPlayerPower(player);
  const robotCfgMap = ensurePlainObject(config.get('TopCombatRobotConfig'));
  const robotCfg = ensurePlainObject(robotCfgMap[enemyid] || robotCfgMap[toSafeInt(enemyid, 0)]);
  const configuredEnemyAttrs = ensurePlainObject(robotCfg.robotAttrs);
  const enemyAttrs = Object.keys(configuredEnemyAttrs).length > 0
    ? configuredEnemyAttrs
    : battle.generateOpponentAttrs(
      Math.max(1, toSafeInt(enemyShow.level, player.level)),
      Math.max(-5, Math.min(10, beforeRank - targetRank)),
    );
  const fight = battle.simulateBattle(playerAttrs, enemyAttrs, { isPvp: true });
  const win = fight && fight.win ? 1 : 0;
  const rankChange = win && targetRank < beforeRank ? beforeRank - targetRank : 0;
  if (rankChange > 0) {
    info.rank = targetRank;
    info.maxRank = Math.min(info.maxRank, targetRank);
  }
  appendTopCombatLog(info, { atk: 1, rank: targetRank, logtime: Math.floor(Date.now() / 1000) });

  const rewards = win
    ? [{ id: 2, count: 200 + Math.max(1, toSafeInt(player.level, 1)) * 20 }]
    : [];
  rewards.forEach((row) => addRewardToPlayer(player, row.id, row.count));

  const arenaServerId = resolveArenaServerId(session, player);
  const selfShow = buildArenaFightSelfShowInfo(player, arenaServerId, arenaReadModel.displayPower(playerAttrs || {}));
  const opponentShow = buildArenaFightOpponentShowInfo(enemyShow, player.level);
  const playerHpMax = Math.max(1, toSafeInt(playerAttrs && playerAttrs[1], 100));
  const enemyHpMax = Math.max(1, toSafeInt(enemyAttrs && enemyAttrs[1], 100));
  const flow = buildArenaBattleEvents(playerHpMax, enemyHpMax, opponentShow, !!win);
  const selfEntity = applyPrimaryBattlePetParts({
    id: Math.max(1, toSafeInt(selfShow.kungfuId, 4)),
    dbid: toArenaDbid(player),
    name: String(player.name || 'Player'),
    type: 1,
    side: 1,
    camp: 1,
    pos: 1,
    posIndex: 1,
    hp: playerHpMax,
    maxhp: playerHpMax,
    maxHp: playerHpMax,
    vars: buildFightVars(playerHpMax),
    showInfo: selfShow,
    parts: {},
    partValues: {},
  }, player);
  const fightResult = {
    type: 10,
    win,
    mustChangeTurn: 0,
    notChangeTurn: 1,
    atkAttr: playerAttrs || {},
    defAttr: enemyAttrs || {},
    damage: {
      1: Math.max(0, toSafeInt(fight && fight.monsterDamage, 0)),
      '-1': Math.max(0, toSafeInt(fight && fight.playerDamage, 0)),
    },
    isBackFight: false,
    events: flow.events,
    entitys: [
      selfEntity,
      {
        id: Math.max(1, toSafeInt(opponentShow.kungfuId, 1)),
        dbid: enemyid,
        name: String(opponentShow.name || `天梯守擂者${targetRank}`),
        type: 1,
        side: 2,
        camp: 2,
        pos: -1,
        posIndex: -1,
        hp: enemyHpMax,
        maxhp: enemyHpMax,
        maxHp: enemyHpMax,
        vars: buildFightVars(enemyHpMax),
        showInfo: opponentShow,
        parts: {},
        partValues: {},
      },
    ],
    guildBossAllDamage: 0,
    bloodlineOffset: 0,
  };

  const challengeInfo = buildTopCombatChallengeInfo(player, info, true);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 2300,
    msgUid,
    data: {
      result: 0,
      enemyid,
      rank: info.rank,
      rankChange,
      rewards,
      rewardInfo: buildRewardInfo(rewards),
      challengeInfo,
      fightResult,
    },
  };
}

// Top combat challenge info (tag:4600)
async function handleTopCombatChallengeInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 4600,
      msgUid,
      data: {
        result: -1,
        matchStatus: 0,
        matchEndTime: 0,
        challengeInfo: { rank: getTopCombatInitialRank(), refreshtime: 0, challengeList: [], infoMap: {} },
      },
    };
  }

  const info = ensureTopCombatInfo(player);
  const challengeInfo = buildTopCombatChallengeInfo(player, info, false);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 4600,
    msgUid,
    data: {
      result: 0,
      matchStatus: info.matchStatus,
      matchEndTime: info.matchEndTime,
      challengeInfo,
      maxRank: info.maxRank,
      records: ensureArray(info.records),
      loglist: ensureArray(info.loglist),
    },
  };
}

// Top combat refresh challenge list (tag:4601)
async function handleTopCombatRefreshChallenge(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 4601,
      msgUid,
      data: {
        result: -1,
        rank: getTopCombatInitialRank(),
        challengeInfo: { rank: getTopCombatInitialRank(), refreshtime: 0, challengeList: [], infoMap: {} },
      },
    };
  }

  const info = ensureTopCombatInfo(player);
  const challengeInfo = buildTopCombatChallengeInfo(player, info, true);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 4601,
    msgUid,
    data: {
      result: 0,
      rank: info.rank,
      matchStatus: info.matchStatus,
      matchEndTime: info.matchEndTime,
      challengeInfo,
    },
  };
}

// Top combat rank info (tag:4602)
async function handleTopCombatRankInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 4602, msgUid, data: { result: -1, rank: getTopCombatInitialRank(), count: 0, topMap: {}, rankMap: {} } };
  }

  const info = ensureTopCombatInfo(player);
  const challengeInfo = buildTopCombatChallengeInfo(player, info, false);
  const rankInfo = buildTopCombatRankInfo(player, info);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 4602,
    msgUid,
    data: {
      result: 0,
      ...rankInfo,
      matchStatus: info.matchStatus,
      matchEndTime: info.matchEndTime,
      challengeInfo,
    },
  };
}

// Top combat first rank reward (tag:4603)
async function handleTopCombatFirstReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4603, msgUid, data: { result: -1, index: 0, rewardInfo: buildRewardInfo([]) } };

  const info = ensureTopCombatInfo(player);
  const index = Math.max(1, toSafeInt(params && params.index, 1));
  const claimed = new Set(ensureArray(info.records).map((row) => Math.max(0, toSafeInt(row, 0))).filter((row) => row > 0));
  const rewardRows = [];
  if (!claimed.has(index)) {
    rewardRows.push({ id: 1, count: 5 * index });
    rewardRows.push({ id: 2, count: 100 * index });
    claimed.add(index);
    info.records = Array.from(claimed).sort((a, b) => a - b);
  }

  const rewardInfo = grantRewardInfo(player, rewardRows);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 4603,
    msgUid,
    data: {
      result: 0,
      index,
      rewardInfo,
    },
  };
}

// Top combat quick sweep reward (tag:4604)
async function handleTopCombatSweepReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 4604, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const info = ensureTopCombatInfo(player);
  const count = Math.max(1, Math.min(20, toSafeInt(params && params.count, 1)));
  const rewardRows = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    rewardRows.push({ id: 2, count: 120 + Math.max(1, toSafeInt(player.level, 1)) * 10 });
    rewardRows.push({ id: 71, count: 20 });
    info.rank = Math.max(1, info.rank - 1);
    info.maxRank = Math.min(Math.max(1, toSafeInt(info.maxRank, info.rank)), info.rank);
    appendTopCombatLog(info, { atk: 1, logtime: nowSec + i, rank: info.rank });
  }

  const challengeInfo = buildTopCombatChallengeInfo(player, info, true);
  const rewardInfo = grantRewardInfo(player, rewardRows);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 4604,
    msgUid,
    data: {
      result: 0,
      count,
      rank: info.rank,
      challengeInfo,
      rewardInfo,
    },
  };
}

// Top arena challenge info (tag:6200)
async function handleTopArenaChallengeInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 6200,
      msgUid,
      data: {
        result: -1,
        matchStatus: 0,
        matchEndTime: 0,
        challengeInfo: { rank: TOP_ARENA_DEFAULT_RANK, refreshtime: 0, challengeList: [], infoMap: {} },
      },
    };
  }

  const info = ensureTopArenaInfo(player);
  const challengeInfo = buildTopArenaChallengeInfo(player, info, false);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return [{
    tag: 6200,
    msgUid,
    data: {
      result: 0,
      matchStatus: info.matchStatus,
      matchEndTime: info.matchEndTime,
      challengeInfo,
    },
  }, {
    tag: 6200,
    msgUid: 0,
    data: {
      info: require('../services/CrossEventScheduleService').topInfo(crossEvents.cycleFor('topArena')),
      playerInfo: {
        round: -1,
        passRecord: Math.max(0, toSafeInt(info.passRecord, 0)),
      },
    },
  }];
}

// Top arena refresh challenge list (tag:6201)
async function handleTopArenaRefreshChallenge(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 6201,
      msgUid,
      data: {
        result: -1,
        rank: TOP_ARENA_DEFAULT_RANK,
        challengeInfo: { rank: TOP_ARENA_DEFAULT_RANK, refreshtime: 0, challengeList: [], infoMap: {} },
      },
    };
  }

  const info = ensureTopArenaInfo(player);
  const challengeInfo = buildTopArenaChallengeInfo(player, info, true);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6201,
    msgUid,
    data: {
      result: 0,
      rank: info.rank,
      challengeInfo,
      matchStatus: info.matchStatus,
      matchEndTime: info.matchEndTime,
    },
  };
}

// Top arena sweep reward (tag:6202)
async function handleTopArenaSweepReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6202, msgUid, data: { result: -1, rewardInfo: buildRewardInfo([]) } };

  const info = ensureTopArenaInfo(player);
  const count = Math.max(1, Math.min(20, toSafeInt(params && params.count, 1)));
  const rewardRows = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    rewardRows.push({ id: 2, count: 150 + Math.max(1, toSafeInt(player.level, 1)) * 10 });
    rewardRows.push({ id: 71, count: 25 });
    info.rank = Math.max(1, info.rank - 1);
    info.maxRank = Math.max(1, Math.min(info.maxRank, info.rank));
    appendTopArenaLog(info, { atk: 1, logtime: nowSec + i, rank: info.rank });
  }

  const challengeInfo = buildTopArenaChallengeInfo(player, info, true);
  const rewardInfo = grantRewardInfo(player, rewardRows);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6202,
    msgUid,
    data: {
      result: 0,
      count,
      rank: info.rank,
      challengeInfo,
      rewardInfo,
    },
  };
}

// Top arena challenge logs (tag:6203)
async function handleTopArenaChallengeLog(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6203, msgUid, data: { result: -1, loglist: [] } };

  const info = ensureTopArenaInfo(player);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6203,
    msgUid,
    data: {
      result: 0,
      loglist: ensureArray(info.loglist),
    },
  };
}

// Top arena match room info (tag:6210)
async function handleTopArenaMatchInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 6210, msgUid, data: { result: -1, round: 1, roomInfo: { roomId: 1, step: 1, playerMap: {}, winCount: {} } } };
  }

  const info = ensureTopArenaInfo(player);
  const matchInfo = ensureTopArenaMatchInfo(player, info);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6210,
    msgUid,
    data: {
      result: 0,
      round: matchInfo.round,
      roomInfo: matchInfo.roomInfo,
    },
  };
}

// Top arena room detail (tag:6211)
async function handleTopArenaRoomData(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 6211, msgUid, data: { result: -1, roomInfo: { roomId: 1, step: 1, playerMap: {}, winCount: {} } } };
  }

  const info = ensureTopArenaInfo(player);
  const matchInfo = ensureTopArenaMatchInfo(player, info);
  const round = Math.max(1, toSafeInt(params && params.round, matchInfo.round));
  const roomId = Math.max(1, toSafeInt(params && params.roomId, matchInfo.roomInfo.roomId));
  matchInfo.round = round;
  matchInfo.roomInfo.roomId = roomId;
  if (Object.keys(ensurePlainObject(matchInfo.roomInfo.playerMap)).length === 0) {
    matchInfo.roomInfo.playerMap = buildTopArenaRoomPlayerMap(player, info, roomId);
  }

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6211,
    msgUid,
    data: {
      result: 0,
      roomInfo: matchInfo.roomInfo,
    },
  };
}

// Top arena room guess info (tag:6212)
async function handleTopArenaRoomGuessInfo(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 6212, msgUid, data: { result: -1, guessInfo: { roomGuess: {}, playerGuess: {} }, winner: '', playerMap: {} } };
  }

  const info = ensureTopArenaInfo(player);
  const matchInfo = ensureTopArenaMatchInfo(player, info);
  const round = Math.max(1, toSafeInt(params && params.round, matchInfo.round));
  const roomId = Math.max(1, toSafeInt(params && params.roomId, matchInfo.roomInfo.roomId));
  const guessInfo = getTopArenaRoomGuessStore(info, round, roomId, matchInfo.roomInfo);

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6212,
    msgUid,
    data: {
      result: 0,
      guessInfo,
      winner: '',
      playerMap: matchInfo.roomInfo.playerMap,
    },
  };
}

// Top arena guess/support (tag:6213)
async function handleTopArenaGuess(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 6213, msgUid, data: { result: -1, guessInfo: { roomGuess: {}, playerGuess: {} } } };
  }

  const info = ensureTopArenaInfo(player);
  const matchInfo = ensureTopArenaMatchInfo(player, info);
  const roomId = Math.max(1, toSafeInt(params && params.roomId, matchInfo.roomInfo.roomId));
  const round = Math.max(1, toSafeInt(matchInfo.round, 1));
  const playerId = params && params.playerId != null ? String(params.playerId) : '';
  const count = Math.max(1, toSafeInt(params && params.count, 1));
  const guessInfo = getTopArenaRoomGuessStore(info, round, roomId, matchInfo.roomInfo);

  if (playerId && Object.prototype.hasOwnProperty.call(guessInfo.roomGuess, playerId)) {
    guessInfo.roomGuess[playerId] = Math.max(0, toSafeInt(guessInfo.roomGuess[playerId], 0) + count);
    const selfId = String(player.playerId || '');
    if (selfId) {
      guessInfo.playerGuess[selfId] = playerId;
    }
  }

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6213,
    msgUid,
    data: {
      result: 0,
      guessInfo,
    },
  };
}

// Top arena room rank info (tag:6214)
async function handleTopArenaRoomRankInfo(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 6214, msgUid, data: { result: -1, type: 1, rank: TOP_ARENA_DEFAULT_RANK, value: 0, rankList: [] } };
  }

  const info = ensureTopArenaInfo(player);
  const payload = buildTopArenaRankPayload(player, info, params && params.type);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6214,
    msgUid,
    data: {
      result: 0,
      ...payload,
    },
  };
}

// Top arena show info (tag:6215)
async function handleTopArenaShowInfo(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6215, msgUid, data: { result: -1, worship: 0, showMap: {} } };

  const info = ensureTopArenaInfo(player);
  const showInfo = buildTopArenaShowInfo(player, info);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6215,
    msgUid,
    data: {
      result: 0,
      ...showInfo,
    },
  };
}

// Top arena worship reward (tag:6216)
async function handleTopArenaWorship(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6216, msgUid, data: { result: -1, worship: 0 } };

  const previewPlayer = clonePlayerSnapshot(player);
  const previewInfo = ensureTopArenaInfo(previewPlayer);
  const showPreview = buildTopArenaShowInfo(previewPlayer, previewInfo);
  if (showPreview.worship === 1) {
    return { tag: 6216, msgUid, data: { result: 1, worship: 1, rewardInfo: buildRewardInfo([]) } };
  }

  const info = ensureTopArenaInfo(player);
  const supportRewards = ensureArray((config.get('TopArenaBaseConfig') || {}).supportRewards);
  const rewardInfo = grantRewardInfo(player, supportRewards);
  info.showInfo.worship = 1;

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6216,
    msgUid,
    data: {
      result: 0,
      worship: 1,
      rewardInfo,
    },
  };
}

// Top arena get cross player detail (tag:6217)
async function handleTopArenaCrossPlayerDetail(params, session, msgUid) {
  const player = session && session.player ? session.player : null;
  if (!player) return { tag: 6217, msgUid, data: {} };

  const { buildOtherPlayerDetail } = require('./basic');
  const targetId = String(params && (params.playerId || params.dbid) || '').trim();
  const localServerId = Number(session.serverId || player.serverId || process.env.SERVER_ID || 1001);
  const requestedServerId = Number(params && params.serverId || localServerId);
  const isSelf = !targetId || targetId === String(player.playerId || '') || targetId === String(player._id || '');

  if (isSelf) {
    const detail = buildOtherPlayerDetail(player, { ...params, serverId: localServerId }, 0);
    return {
      tag: 6217,
      msgUid,
      data: {
        ...detail,
        playerId: String(player.playerId || targetId),
        dbid: String(player._id || targetId),
        serverId: localServerId,
        serverName: detail.serverName,
      },
    };
  }

  let targetPlayer = null;

  // 1. Robot opponent
  const numericId = Number(targetId);
  if (Number.isInteger(numericId) && numericId > 0 && String(numericId) === targetId && numericId < 100000) {
    const robotCfgMap = ensurePlainObject(config.get('TopCombatRobotConfig'));
    const robotCfg = ensurePlainObject(robotCfgMap[numericId] || robotCfgMap[String(numericId)]);
    const robotAttrs = ensurePlainObject(robotCfg.robotAttrs);
    const robotLevel = Math.max(1, toSafeInt(robotCfg.robotLv, 1));
    targetPlayer = {
      playerId: targetId,
      _id: targetId,
      name: getConfiguredRobotName(robotCfg.name, `Thủ Lôi Giả ${numericId}`),
      level: robotLevel,
      serverId: requestedServerId,
      serverName: requestedServerId >= 1001 ? `S${requestedServerId - 1000}` : `S${requestedServerId}`,
      roleInfo: { kungfuId: 4, stage: Math.max(1, Math.floor(robotLevel / 10) + 1), stageId: 1, subJob: 0 },
      attrs: robotAttrs,
    };
  }

  const isDbConnected = (() => {
    try {
      const mongoose = require('mongoose');
      return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
    } catch (_) {
      return false;
    }
  })();

  // 2. Cross server profile lookup
  if (!targetPlayer && requestedServerId !== localServerId && isDbConnected) {
    try {
      const crossArena = require('../services/CrossArenaService');
      targetPlayer = await crossArena.profile(requestedServerId, targetId);
    } catch (_) {}
  }

  // 3. Local DB lookup
  if (!targetPlayer && isDbConnected) {
    try {
      targetPlayer = typeof playerService.findByDbidOrPlayerId === 'function'
        ? await playerService.findByDbidOrPlayerId(targetId)
        : await playerService.findByPlayerId(targetId);
    } catch (_) {}
  }

  // 4. Try cross-server profile with current server if local lookup failed
  if (!targetPlayer && isDbConnected) {
    try {
      const crossArena = require('../services/CrossArenaService');
      targetPlayer = await crossArena.profile(requestedServerId, targetId);
    } catch (_) {}
  }

  // 5. Safe fallback
  if (!targetPlayer) {
    const fallbackId = targetId || '';
    const fallbackName = fallbackId ? `Player_${fallbackId.slice(-4)}` : 'Người chơi';
    const fallbackDetail = buildOtherPlayerDetail({
      playerId: fallbackId,
      name: fallbackName,
      level: 1,
      serverId: requestedServerId,
      serverName: requestedServerId >= 1001 ? `S${requestedServerId - 1000}` : `S${requestedServerId}`,
      roleInfo: { kungfuId: 4, stage: 1, stageId: 1, subJob: 0 },
    }, { ...params, serverId: requestedServerId }, -1);
    return {
      tag: 6217,
      msgUid,
      data: {
        ...fallbackDetail,
        playerId: fallbackId,
        dbid: fallbackId,
        serverId: requestedServerId,
        serverName: fallbackDetail.serverName,
      },
    };
  }

  const resolvedId = String(targetPlayer.playerId || targetId);
  const resolvedServerId = Number(targetPlayer.serverId || requestedServerId || localServerId);
  const detail = buildOtherPlayerDetail(targetPlayer, { ...params, serverId: resolvedServerId }, 0);

  return {
    tag: 6217,
    msgUid,
    data: {
      ...detail,
      playerId: resolvedId,
      dbid: String(targetPlayer._id || resolvedId),
      serverId: resolvedServerId,
      serverName: detail.serverName,
    },
  };
}


// Top arena lock status update (tag:6218)
async function handleTopArenaLockStatus(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6218, msgUid, data: { result: -1, lockTime: 0 } };

  const info = ensureTopArenaInfo(player);
  const nowSec = Math.floor(Date.now() / 1000);
  info.lockTime = Math.max(info.lockTime, nowSec + 3600);
  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6218,
    msgUid,
    data: {
      result: 0,
      lockTime: info.lockTime,
    },
  };
}

// Top arena pass reward (tag:6220)
async function handleTopArenaPassReward(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6220, msgUid, data: { result: -1, passRecord: 0, rewardInfo: buildRewardInfo([]) } };

  const info = ensureTopArenaInfo(player);
  const rewardRows = [{ id: 1, count: 20 }, { id: 2, count: 500 }];
  const rewardInfo = grantRewardInfo(player, rewardRows);
  info.passRecord += 1;

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6220,
    msgUid,
    data: {
      result: 0,
      passRecord: info.passRecord,
      rewardInfo,
    },
  };
}

// Top arena guess logs (tag:6221)
async function handleTopArenaGuessLog(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6221, msgUid, data: { result: -1, logs: [] } };

  const info = ensureTopArenaInfo(player);
  const round = Math.max(0, toSafeInt(params && params.round, 0));
  if (info.guessLogs.length === 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    info.guessLogs.push({
      round,
      roomId: 1,
      playerId: `ta_robot_${Math.max(1, info.rank - 1)}`,
      supportCount: 1,
      isWin: 1,
      logtime: nowSec,
    });
  }

  await playerService.savePlayer(session.userId, player, { returnSaved: false });
  return {
    tag: 6221,
    msgUid,
    data: {
      result: 0,
      logs: ensureArray(info.guessLogs),
    },
  };
}

// Cross arena initial info (tag:5000)
async function handleCrossArenaInfo(_params, session, msgUid) {
  return require('../services/CrossArenaService').info(_params, session, msgUid);
}

// Cross arena refresh challenge list (tag:5001)
async function handleCrossArenaRefresh(_params, session, msgUid) {
  return require('../services/CrossArenaService').refresh(_params, session, msgUid);
}

// Cross arena challenge list (tag:5002)
async function handleCrossArenaChallengeList(_params, session, msgUid) {
  return require('../services/CrossArenaService').list(_params, session, msgUid);
}

// Generate challenge opponent list
function generateOpponents(player, options = {}) {
  const level = player ? player.level || 1 : 1;
  const names = ["Kiếm Tu·Thanh Vân", "Pháp tu · Tử Tiêu", "Thể tu · Nắm đấm sắt", "Khí tu · Linh thợ", '丹修·妙手'];
  const robotCfgMap = getArenaRobotConfigMap(!!options.crossArena);
  const robotIds = Object.keys(robotCfgMap)
    .map((key) => Math.max(0, toSafeInt(key, 0)))
    .filter((id) => id > 0)
    .sort((a, b) => a - b);
  const list = [];
  for (let i = 0; i < 5; i++) {
    const opLv = Math.max(1, level + i - 2);
    const robotId = robotIds[i] || (1000 + i + 1);
    const robotCfg = ensurePlainObject(robotCfgMap[robotId] || robotCfgMap[String(robotId)]);
    const configuredAttrs = ensurePlainObject(robotCfg.robotAttrs);
    const attrs = Object.keys(configuredAttrs).length > 0
      ? configuredAttrs
      : battle.generateOpponentAttrs(opLv, i - 2);
    const fightPet = ensureArray(robotCfg.fightPet)
      .map((id) => Math.max(0, toSafeInt(id, 0)))
      .filter((id) => id > 0);
    const point = Math.max(0, toSafeInt(robotCfg.score, 1000 + opLv * 10));
    const roleSelection = normalizeArenaRoleSelection(
      robotCfg.kungfuId,
      toSafeInt(robotCfg.subJob, 0)
    );
    if (toSafeInt(robotCfg.kungfuId, 0) <= 0) {
      Object.assign(roleSelection, normalizeArenaRoleSelection(ARENA_ROBOT_KUNGFU_IDS[i] || 4, 0));
    }
    const powerScore = Math.max(100, toSafeInt(battle.calcPowerScore(attrs), 100));
    const power = arenaReadModel.displayPower(attrs);
    list.push({
      dbid: String(robotId),
      playerId: String(robotId),
      name: robotCfg.name || names[i],
      level: Math.max(1, toSafeInt(robotCfg.robotLv, opLv)),
      robotLv: Math.max(1, toSafeInt(robotCfg.robotLv, opLv)),
      avatar: Math.max(0, toSafeInt(robotCfg.head, 11300 + i)),
      avatarFrame: -1,
      title: -1,
      petId: fightPet[0] || 0,
      kungfuId: roleSelection.kungfuId,
      subJob: roleSelection.subJob,
      serverId: resolveArenaServerId(null, player),
      serverName: '',
      score: point,
      point,
      power,
      powerScore,
      powerUnit: 'native-weighted-point',
      robotAttrs: attrs,
      isRobot: true,
      robotSkill: ensureArray(robotCfg.robotSkill),
      fightPet,
      fightPetSkill: ensureArray(robotCfg.fightPetSkill),
    });
  }
  return list;
}

module.exports = {
  competitionHelpers: { generateOpponents, calculateArenaScoreChange, consumeArenaItem,
    buildArenaInventoryDelta, compactArenaFightResult, recoverArenaFightResult, buildCompetitionFightResult },
  ensureDoubleTowerInfo,
  buildDoubleTowerData,
  ensureArenaState,
  calculateArenaScoreChange,
  getArenaBattleRewards,
  buildArenaChallengeList,
  buildArenaAuthoritativeRankRows,
  handleArenaInfo,
  handleArenaRefresh,
  handleArenaFight,
  handleTopArenaStartFight,
  handleArenaFight2300: (params, session, msgUid) => [16, 17].includes(toSafeInt(params && params.type, 0))
    ? require('../services/CrossArenaService').fight(params, session, msgUid)
    : performArenaFight(params, session, msgUid, {
    responseTag: 2300,
    syncTask: true,
    asPackets: true,
    crossArena: [16, 17].includes(toSafeInt(params && params.type, 0)),
  }),
  handleDoubleTowerOutbound,
  handleDoubleTowerBattle: featureMutation.wrap(handleDoubleTowerBattle),
  handleDoubleTowerBattleFinish: featureMutation.wrap(handleDoubleTowerBattleFinish),
  handleDoubleTowerBattleAdsReward,
  handleDoubleTowerRankBattle: featureMutation.wrap(handleDoubleTowerRankBattle),
  handleDoubleTowerRankBattleFinish: featureMutation.wrap(handleDoubleTowerRankBattleFinish),
  handleDoubleTowerRankBattleAdsReward,
  handleDoubleTowerRankReward,
  handleDoubleTowerTopRank,
  handleDoubleTowerSetDefence,
  handleTopCombatStartFight,
  handleTopCombatChallengeInfo,
  handleTopCombatRefreshChallenge,
  handleTopCombatRankInfo,
  handleTopCombatFirstReward,
  handleTopCombatSweepReward,
  handleTopArenaChallengeInfo,
  handleTopArenaRefreshChallenge,
  handleTopArenaSweepReward,
  handleTopArenaChallengeLog,
  handleTopArenaMatchInfo,
  handleTopArenaRoomData,
  handleTopArenaRoomGuessInfo,
  handleTopArenaGuess,
  handleTopArenaRoomRankInfo,
  handleTopArenaShowInfo,
  handleTopArenaWorship,
  handleTopArenaCrossPlayerDetail,
  handleTopArenaLockStatus,
  handleTopArenaPassReward,
  handleTopArenaGuessLog,
  handleCrossArenaInfo,
  handleCrossArenaRefresh,
  handleCrossArenaChallengeList,
  buildTopCombatSelfShowInfo,
  buildTopCombatRobotShowInfo,
  buildTopArenaRobotShowInfo,
  rememberArenaLedger,
  sanitizeArenaLedgerEntry,
  sanitizeArenaLedgerList,
};
