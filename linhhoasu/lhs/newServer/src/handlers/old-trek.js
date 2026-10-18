const playerService = require('../services/PlayerService');
const configService = require('../services/ConfigService');
const oldTrekScheduleService = require('../services/OldTrekScheduleService');
const playerMutation = require('../services/PlayerMutationService');
const oldTrekLedger = require('../services/OldTrekLedgerService');
const oldTrekEventService = require('../services/OldTrekEventService');
const oldTrekProgress = require('../services/OldTrekProgressService');
const crypto = require('node:crypto');
const oldTrekArena = require('../services/OldTrekArenaService');
const { addRewardToPlayer } = require('./raid');
const oldTrekPolicy = (() => {
  try { return require('../config/oldTrekGameplayPolicy.json'); }
  catch (_err) { return { miniGameMaxElapsedMs: 900000 }; }
})();

const FALLBACK_SAILOR_IDS = [340101, 340102, 340103];
const DEFAULT_SHIP_SKIN = 300001;

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function ensureObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };
  return value;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOldTrekChatRow(row, player = {}, generatedSummary = null) {
  const source = ensureObject(row);
  let generated = generatedSummary;
  if (!generated) {
    try {
      generated = require('./chat').buildSummary(player);
    } catch (_err) {
      generated = {};
    }
  }
  const existing = ensureObject(source.summary);
  const dbid = String(existing.dbid || source.dbid || player._id || player.playerId || '').trim();
  const name = String(existing.name || source.name || player.name || 'Player').slice(0, 64);
  const summary = {
    ...generated,
    ...existing,
    dbid,
    playerId: existing.playerId || source.playerId || dbid,
    name,
    level: Math.max(1, toSafeInt(existing.level, toSafeInt(player.level, 1))),
    avatar: toSafeInt(existing.avatar, toSafeInt(player.avatar, 0)),
    avatarFrame: toSafeInt(existing.avatarFrame, toSafeInt(player.avatarFrame, 0)),
    title: toSafeInt(existing.title, toSafeInt(player.title, 0)),
    serverId: toSafeInt(existing.serverId, toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID, 1))),
  };
  return {
    ...source,
    summary,
    dbid: source.dbid || dbid,
    name: source.name || name,
    content: source.content == null ? '' : String(source.content).slice(0, 200),
    reply: ensureObject(source.reply),
    time: toSafeInt(source.time, Date.now()),
  };
}

function getCurrencyKeyById(itemId) {
  switch (toSafeInt(itemId, 0)) {
    case 1: return 'diamond';
    case 2: return 'silver';
    case 6: return 'gold';
    default: return null;
  }
}

function getItemCount(player, itemId) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  if (id <= 0) return 0;
  const currencyKey = getCurrencyKeyById(id);
  if (currencyKey) {
    return Math.max(0, toSafeInt(player && player.currencies && player.currencies[currencyKey], 0));
  }
  return Math.max(0, toSafeInt(player && player.items && player.items[id], 0));
}

function normalizeItemRows(rows) {
  const merged = new Map();
  ensureArray(rows).forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id > 0 && count > 0) merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged.entries()).map(([id, count]) => ({ id, count }));
}

function canConsumeItems(player, rows) {
  return normalizeItemRows(rows).every((row) => getItemCount(player, row.id) >= row.count);
}

function consumeItems(player, rows) {
  const costs = normalizeItemRows(rows);
  if (!canConsumeItems(player, costs)) return false;
  player.currencies = ensureObject(player.currencies, { gold: 0, diamond: 0, silver: 0 });
  player.items = ensureObject(player.items);
  costs.forEach((row) => {
    const currencyKey = getCurrencyKeyById(row.id);
    if (currencyKey) {
      player.currencies[currencyKey] = Math.max(0, getItemCount(player, row.id) - row.count);
    } else {
      const left = Math.max(0, getItemCount(player, row.id) - row.count);
      if (left > 0) player.items[row.id] = left;
      else delete player.items[row.id];
    }
  });
  return true;
}

function buildRewardInfo(items = []) {
  return {
    items: normalizeItemRows(items),
    equips: [],
    heros: [],
    sailor: [],
    fashion: [],
    oldTrekShips: [],
  };
}

function getDefaultSailorIds(limit = 3) {
  const sailorConfig = ensureObject(configService.get('OldTrekSailorConfig'));
  const configured = Object.keys(sailorConfig)
    .map((key) => Math.max(0, toSafeInt(sailorConfig[key] && sailorConfig[key].id, toSafeInt(key, 0))))
    .filter((id, index, rows) => id > 0 && rows.indexOf(id) === index)
    .sort((a, b) => a - b)
    .slice(0, Math.max(1, toSafeInt(limit, 3)));
  return configured.length > 0 ? configured : FALLBACK_SAILOR_IDS.slice(0, limit);
}

function normalizeSailorId(id, fallbackId) {
  const safeId = Math.max(0, toSafeInt(id, 0));
  const sailorConfig = ensureObject(configService.get('OldTrekSailorConfig'));
  if (safeId > 0 && sailorConfig[String(safeId)]) return safeId;
  const defaults = getDefaultSailorIds();
  const safeFallback = Math.max(0, toSafeInt(fallbackId, defaults[0]));
  return sailorConfig[String(safeFallback)] ? safeFallback : defaults[0];
}

function buildSailor(id, overrides = {}, fallbackId) {
  const sailorId = normalizeSailorId(id, fallbackId);
  const source = ensureObject(overrides);
  const sailorConfig = ensureObject(configService.get('OldTrekSailorConfig'));
  const sailorRow = ensureObject(sailorConfig[sailorId] || sailorConfig[String(sailorId)]);
  const task = ensureObject(source.task);
  for (let taskType = 1; taskType <= 5; taskType += 1) {
    task[taskType] = Math.max(0, toSafeInt(task[taskType], 0));
  }
  return {
    id: sailorId,
    star: Math.max(0, toSafeInt(source.star, toSafeInt(sailorRow.minStar, 0))),
    dim: ensureObject(source.dim, ensureObject(sailorRow.baseDimAttrs)),
    nextDim: ensureObject(source.nextDim),
    recruitDate: Math.max(0, toSafeInt(source.recruitDate, Date.now())),
    task,
  };
}

function buildLineData(id = 0) {
  return { id, leader: -1, skill: -1, slots: [0, 0, 0, 0] };
}

function normalizeLineData(row, id = 0) {
  const source = ensureObject(row);
  const slots = ensureArray(source.slots)
    .slice(0, 4)
    .map((sailorId) => Math.max(0, toSafeInt(sailorId, 0)));
  while (slots.length < 4) slots.push(0);
  return {
    ...source,
    id: Math.max(0, toSafeInt(source.id, id)),
    leader: toSafeInt(source.leader, -1),
    skill: toSafeInt(source.skill, -1),
    slots,
  };
}

function normalizeSetLines(rows) {
  const source = ensureArray(rows);
  const result = [];
  for (let lineId = 0; lineId < 3; lineId += 1) {
    const row = source.find((item) => toSafeInt(item && item.id, -1) === lineId);
    result.push(normalizeLineData(row || buildLineData(lineId), lineId));
  }
  return result;
}

function ensureSetLines(info, setId) {
  const safeSetId = Math.max(0, toSafeInt(setId, 0));
  info.setMap = ensureObject(info.setMap);
  const key = String(safeSetId);
  info.setMap[key] = normalizeSetLines(info.setMap[key]);
  return info.setMap[key];
}

function syncLegacySetInfo(info) {
  info.setInfo = ensureSetLines(info, info.sailSetId);
}

function normalizeSailorSlots(slots) {
  const rows = ensureArray(slots);
  const out = [];
  for (let i = 0; i < 4; i += 1) {
    const row = ensureObject(rows[i]);
    out.push({
      slot: i,
      sailorId: Math.max(0, toSafeInt(row.sailorId, 0)),
      level: Math.max(1, toSafeInt(row.level, 1)),
    });
  }
  return out;
}

function normalizeDestRecords(value) {
  const source = Array.isArray(value)
    ? value
    : Object.keys(ensureObject(value)).map((key) => {
      const row = ensureObject(value[key]);
      return { ...row, id: Math.max(0, toSafeInt(row.id, toSafeInt(key, 0))) };
    });
  return source
    .map((value) => {
      const row = ensureObject(value);
      return {
        ...row,
        id: Math.max(0, toSafeInt(row.id, 0)),
        taskClaimed: ensureArray(row.taskClaimed)
          .map((id) => Math.max(0, toSafeInt(id, 0)))
          .filter((id, index, rows) => id > 0 && rows.indexOf(id) === index),
        rewardClaimed: ensureArray(row.rewardClaimed)
          .map((id) => Math.max(0, toSafeInt(id, 0)))
          .filter((id, index, rows) => id > 0 && rows.indexOf(id) === index),
      };
    })
    .filter((row, index, rows) => row.id > 0 && rows.findIndex((candidate) => candidate.id === row.id) === index);
}

function ensureDestRecord(info, destId) {
  const id = Math.max(1, toSafeInt(destId, 1));
  let dest = info.dest.find((row) => row.id === id);
  if (!dest) {
    dest = { id, taskClaimed: [], rewardClaimed: [] };
    info.dest.push(dest);
  }
  dest.taskClaimed = ensureArray(dest.taskClaimed);
  dest.rewardClaimed = ensureArray(dest.rewardClaimed);
  return dest;
}

function getTaskDestination(taskId) {
  const id = Math.max(1, toSafeInt(taskId, 1));
  const taskConfig = ensureObject(configService.get('OldTrekTaskConfig'));
  const row = ensureObject(taskConfig[id] || taskConfig[String(id)]);
  return Math.max(1, toSafeInt(row.destination, id));
}

function getConfigRow(tableName, id) {
  const table = ensureObject(configService.get(tableName));
  return ensureObject(table[id] || table[String(id)]);
}

function getDestinationConfig(destId, difficulty = 1) {
  const destinations = ensureObject(configService.get('OldTrekDestinationConfig'));
  const group = ensureObject(destinations[destId] || destinations[String(destId)]);
  return ensureObject(group[difficulty] || group[String(difficulty)]);
}

function getDestinationRecord(info, destId) {
  const id = Math.max(1, toSafeInt(destId, 1));
  return ensureArray(info && info.dest).find((row) => toSafeInt(row && row.id, 0) === id) || null;
}

function isDestinationUnlocked(info, destId, difficulty = 1) {
  const id = Math.max(1, toSafeInt(destId, 1));
  const diff = Math.max(1, toSafeInt(difficulty, 1));
  const cfg = getDestinationConfig(id, diff);
  if (toSafeInt(cfg.id, 0) <= 0) return false;
  if (id === 1 && diff === 1) return true;
  if (!getDestinationRecord(info, id)) return false;
  const unlockScore = Math.max(0, toSafeInt(cfg.unlockConds, 0));
  if (unlockScore <= 0) return true;
  // Native client uses TaskType.Score (4) for destination difficulty unlock.
  const key = 10000 * (diff - 1) + 100 * id + 4;
  return Number(info.taskRecord[key] || 0) >= unlockScore;
}

function bumpStateRevision(info) {
  info.stateRevision = Math.max(0, toSafeInt(info.stateRevision, 0)) + 1;
  return info.stateRevision;
}

function checkpointTrek(info, now = Date.now()) {
  const sailInfo = ensureSailInfo(info);
  const trekData = sailInfo.trekData;
  if (!trekData) return { trekData: null, arrived: false, elapsedMs: 0 };
  let currentMs = Math.max(0, toSafeInt(now, Date.now()));
  const previousMs = Math.max(0, toSafeInt(trekData.lastUpdateTime, currentMs));
  currentMs = Math.max(currentMs, previousMs);
  const elapsedMs = Math.max(0, currentMs - previousMs);
  const base = ensureObject(configService.get('OldTrekBaseConfig'));
  const cfg = getDestinationConfig(trekData.id, trekData.diff);
  let speed = Math.max(0, Number(base.baseSpeed) || 0);
  // Native updateSailSpeedBuff adds destination pass privilege 200 + id.
  const passes = ensureObject(configService.get('OldTrekPassShowConfig'));
  for (const row of Object.values(passes)) {
    const record = ensureArray(info.passRecords).find(p => p.id === row.id);
    const bits = toSafeInt(record && record.buyRecord, 0);
    const key = 200 + trekData.id;
    if (bits & 2) speed += Number(row.fundPrivilege && row.fundPrivilege[key]) || 0;
    if (bits & 4) speed += Number(row.advancedPrivilege && row.advancedPrivilege[key]) || 0;
  }
  speed = Math.max(0, speed);
  const maxDistance = Math.max(0, Number(cfg.distance) || 0);
  const elapsedDistance = elapsedMs * speed / 3600000;
  trekData.dist = Math.min(maxDistance || Number.MAX_SAFE_INTEGER,
    Math.max(0, Number(trekData.dist) || 0) + elapsedDistance);
  trekData.lastUpdateTime = currentMs;
  return {
    trekData,
    arrived: maxDistance > 0 && trekData.dist >= maxDistance,
    elapsedMs,
  };
}

// Event generation is intentionally deferred until its server policy is verified.

function buildTrekUpdate(trekData = {}) {
  const source = ensureObject(trekData);
  return {
    uid: Math.max(1, toSafeInt(source.uid, 1)),
    dist: Math.max(0, Number(source.dist) || 0),
    lastUpdateTime: Math.max(0, toSafeInt(source.lastUpdateTime, Date.now())),
    stable: Math.max(0, toSafeInt(source.stable, 0)),
  };
}

function ensureSailInfo(info) {
  info.sailInfo = ensureObject(info.sailInfo);
  const sailInfo = info.sailInfo;
  sailInfo.trekData = sailInfo.trekData && typeof sailInfo.trekData === 'object'
    ? ensureObject(sailInfo.trekData)
    : null;
  if (sailInfo.trekData) {
    const cfg = getDestinationConfig(sailInfo.trekData.id, sailInfo.trekData.diff);
    sailInfo.trekData = {
      ...sailInfo.trekData,
      ...buildTrekUpdate(sailInfo.trekData),
      id: Math.max(1, toSafeInt(sailInfo.trekData.id, 1)),
      diff: Math.max(1, toSafeInt(sailInfo.trekData.diff, 1)),
      stableMax: Math.max(1, toSafeInt(sailInfo.trekData.stableMax, toSafeInt(configService.get('OldTrekBaseConfig') && configService.get('OldTrekBaseConfig').baseStable, 100))),
      roundScore: Math.max(0, toSafeInt(sailInfo.trekData.roundScore, toSafeInt(cfg.baseSettleScore, 0))),
    };
  }
  sailInfo.currentEvent = sailInfo.currentEvent && typeof sailInfo.currentEvent === 'object'
    ? ensureObject(sailInfo.currentEvent)
    : null;
  sailInfo.cabin = ensureArray(sailInfo.cabin).map((row) => ensureObject(row));
  sailInfo.eventLogs = ensureArray(sailInfo.eventLogs).map((row) => ensureObject(row));
  sailInfo.effects = ensureArray(sailInfo.effects).map((row) => ensureObject(row));
  sailInfo.multi = Math.max(1, toSafeInt(sailInfo.multi, 1));
  const offlineCache = ensureObject(sailInfo.offlineCache);
  sailInfo.offlineCache = {
    reward: ensureArray(offlineCache.reward),
    event: ensureObject(offlineCache.event),
    lose: ensureArray(offlineCache.lose),
    robCount: Math.max(0, toSafeInt(offlineCache.robCount, 0)),
    stable: Math.max(0, toSafeInt(offlineCache.stable, 0)),
  };
  return sailInfo;
}

function startSailing(info, destId, difficulty) {
  const id = Math.max(1, toSafeInt(destId, 1));
  const diff = Math.max(1, toSafeInt(difficulty, 1));
  const cfg = getDestinationConfig(id, diff);
  if (toSafeInt(cfg.id, 0) <= 0) return null;
  const base = ensureObject(configService.get('OldTrekBaseConfig'));
  const sailInfo = ensureSailInfo(info);
  sailInfo.trekData = {
    uid: Math.max(1, toSafeInt(info.nextTrekUid, Date.now())),
    id,
    diff,
    dist: 0,
    lastUpdateTime: Date.now(),
    stable: Math.max(1, toSafeInt(base.baseStable, 100)),
    stableMax: Math.max(1, toSafeInt(base.baseStable, 100)),
    roundScore: Math.max(0, toSafeInt(cfg.baseSettleScore, 0)),
    passivePaidSteps: 0,
  };
  info.nextTrekUid = sailInfo.trekData.uid + 1;
  sailInfo.currentEvent = null;
  sailInfo.cabin = [];
  sailInfo.eventLogs = [];
  sailInfo.effects = [];
  info.sailing = true;
  if (process.env.OLD_TREK_EVENT_ENGINE_ENABLED === '1') oldTrekEventService.spawn(info);
  return sailInfo;
}

function getSailorConfig(id) {
  return getConfigRow('OldTrekSailorConfig', id);
}

function getSailorStarConfig(sailorId, star) {
  const sailor = getSailorConfig(sailorId);
  const starTable = ensureObject(configService.get('OldTrekSailorStarUpConfig'));
  const qualityTable = ensureObject(starTable[sailor.quality] || starTable[String(sailor.quality)]);
  return ensureObject(qualityTable[star] || qualityTable[String(star)]);
}

function getSailorStarCost(sailorId, star) {
  const sailor = getSailorConfig(sailorId);
  const element = getConfigRow('OldTrekSailorElementConfig', sailor.recruitElement);
  const starCosts = ensureObject(element.starCosts);
  const itemId = Math.max(0, toSafeInt(starCosts[sailor.quality] || starCosts[String(sailor.quality)], 0));
  const starRow = getSailorStarConfig(sailorId, star);
  const count = Math.max(0, toSafeInt(starRow.starCosts, 0));
  return itemId > 0 && count > 0 ? [{ id: itemId, count }] : [];
}

function payableStarCost(player, sailorId, star) {
  const required = getSailorStarCost(sailorId, star), exchange = ensureObject(configService.get('OldTrekBaseConfig').exchangeCount);
  const need = {};
  for (const r of required) need[r.id] = r.count;
  for (const key of Object.keys(exchange).sort((a,b)=>Number(a)-Number(b))) {
    const deficit = Math.max(0, Number(need[key] || 0) - getItemCount(player, key));
    if (!deficit) continue;
    need[key] -= deficit;
    const row = exchange[key]; need[row.id] = Number(need[row.id] || 0) + deficit * row.count;
  }
  return Object.entries(need).filter(([,count])=>count>0).map(([id,count])=>({id:Number(id),count}));
}

function taskRecordValue(info, taskRow) {
  const destination = Math.max(0, toSafeInt(taskRow.destination, 0));
  const type = Math.max(0, toSafeInt(taskRow.type, 0));
  const value2 = Math.max(0, toSafeInt(taskRow.taskValue2, 0));
  const keys = [
    10000 * value2 + 100 * destination + type,
    10000 * value2 + type,
    100 * destination + type,
    type,
  ];
  return keys.reduce((max, key) => Math.max(max, toSafeInt(info.taskRecord[key], 0)), 0);
}

function taskRowsForDestination(destId) {
  const destination = Math.max(1, toSafeInt(destId, 1));
  const table = ensureObject(configService.get('OldTrekTaskConfig'));
  return Object.keys(table)
    .map((key) => ensureObject(table[key]))
    .filter((row) => toSafeInt(row.destination, 0) === destination && toSafeInt(row.id, 0) > 0)
    .sort((left, right) => toSafeInt(left.id, 0) - toSafeInt(right.id, 0));
}

function calculateDestinationScore(dest, taskTable) {
  return ensureArray(dest && dest.taskClaimed).reduce((score, taskId) => {
    const row = ensureObject(taskTable[taskId] || taskTable[String(taskId)]);
    return score + Math.max(0, toSafeInt(row.score, 0));
  }, 0);
}

function normalizePlayerDbid(value, fallbackDigit = '1') {
  const source = String(value || '').replace(/[^a-zA-Z0-9]/g, '');
  if (source.length === 24) return source;
  return String(fallbackDigit || '1').slice(0, 1).padStart(24, '0');
}

function buildBattlePlayer(player = {}, dbid, name) {
  return {
    dbid: normalizePlayerDbid(dbid, name === '灵舟对手' ? '2' : '1'),
    name: String(name || player.name || 'Player'),
    avatar: Math.max(0, toSafeInt(player.avatar, 11301)),
    avatarFrame: Math.max(0, toSafeInt(player.avatarFrame, 0)),
    title: Math.max(0, toSafeInt(player.title, 0)),
    level: Math.max(1, toSafeInt(player.level, 1)),
    hp: 100,
    maxHp: 100,
    sailorIds: [],
    sailors: [],
    commonAttr: {},
    cabin: [],
    privilege: [],
    skill: 0,
  };
}

function pickRecruitSailorIds(info, count) {
  const table = ensureObject(configService.get('OldTrekSailorConfig'));
  const ids = Object.keys(table)
    .map((key) => Math.max(0, toSafeInt(table[key] && table[key].id, toSafeInt(key, 0))))
    .filter((id, index, rows) => id > 0 && rows.indexOf(id) === index)
    .sort((left, right) => left - right);
  if (ids.length <= 0) return getDefaultSailorIds(count);
  const selected = [];
  const weights = ensureArray(ensureObject(configService.get('OldTrekBaseConfig')).qualityWeight);
  while (selected.length < count) {
    const groups = weights.map(r => ({ weight: r.weight, ids: ids.filter(id => table[id].type === 1 && table[id].quality === r.id && !selected.includes(id)) })).filter(r => r.ids.length && r.weight > 0);
    if (!groups.length) break;
    let value = crypto.randomInt(groups.reduce((s, r) => s + r.weight, 0));
    const group = groups.find(r => (value -= r.weight) < 0);
    selected.push(group.ids[crypto.randomInt(group.ids.length)]);
  }
  info.refreshSerial = Number(info.refreshSerial || 0) + 1;
  return selected;
}

function ensureOldTrekInfo(player = {}) {
  player.other_attr_info = ensureObject(player.other_attr_info);
  const holder = player.other_attr_info;
  holder.oldTrekInfo = ensureObject(holder.oldTrekInfo);
  const info = holder.oldTrekInfo;
  const schedule = oldTrekScheduleService.getSchedule();

  if (toSafeInt(info.season, 0) > 0 && toSafeInt(info.season, 0) !== schedule.seasonNumber) {
    oldTrekScheduleService.rolloverPlayerSeason(player, schedule);
  }

  info.lv = Math.max(1, toSafeInt(info.lv, 1));
  info.exp = Math.max(0, toSafeInt(info.exp, 0));
  info.stage = schedule.stage;
  info.matchId = schedule.matchId;
  info.season = schedule.seasonNumber;
  info.totalSeason = schedule.totalSeason;
  info.endTime = schedule.seasonEnd;
  info.job = Math.max(0, toSafeInt(info.job, 0));
  info.battleLogUid = Math.max(0, toSafeInt(info.battleLogUid, 0));
  info.arenaLogUid = Math.max(0, toSafeInt(info.arenaLogUid, 0));
  info.name = info.name == null || info.name === '' ? "Linh thuyền" : String(info.name);
  info.skin = Math.max(1, toSafeInt(info.skin, DEFAULT_SHIP_SKIN));
  info.shipSkins = ensureArray(info.shipSkins).map((id) => Math.max(0, toSafeInt(id, 0))).filter((id, idx, arr) => id > 0 && arr.indexOf(id) === idx);
  if (!info.shipSkins.includes(info.skin)) info.shipSkins.unshift(info.skin);
  info.unlockTechs = ensureArray(info.unlockTechs).map((id) => Math.max(0, toSafeInt(id, 0))).filter((id) => id > 0);
  info.unlocking = ensureArray(info.unlocking).map((row) => ensureObject(row));
  info.privilegeEffect = ensureObject(info.privilegeEffect);
  const defaultSailorIds = getDefaultSailorIds();
  info.sailorList = ensureArray(info.sailorList)
    .map((row, index) => buildSailor(row && row.id, row, defaultSailorIds[index % defaultSailorIds.length]))
    .filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index);
  info.sailorAtlas = ensureObject(info.sailorAtlas);
  info.sailorList.forEach((row) => { if (info.sailorAtlas[row.id] == null) info.sailorAtlas[row.id] = 0; });
  info.sailorSlotList = normalizeSailorSlots(info.sailorSlotList);
  const baseConfig = ensureObject(configService.get('OldTrekBaseConfig'));
  const recruitCount = Math.max(1, toSafeInt(baseConfig.recruitNum, 5));
  const hadRefreshList = Array.isArray(info.refreshId);
  info.refreshId = ensureArray(info.refreshId)
    .map((id, index) => normalizeSailorId(id, defaultSailorIds[index % defaultSailorIds.length]))
    .filter((id, idx, arr) => id > 0 && arr.indexOf(id) === idx);
  (hadRefreshList ? [] : getDefaultSailorIds(recruitCount)).forEach((id) => {
    if (info.refreshId.length < recruitCount && !info.refreshId.includes(id)) info.refreshId.push(id);
  });
  info.rewardCache = Array.isArray(info.rewardCache) || (info.rewardCache && typeof info.rewardCache === 'object')
    ? info.rewardCache
    : [];
  info.cacheCount = Math.max(0, toSafeInt(info.cacheCount, 0));
  info.dailyFreeRefresh = Math.max(0, toSafeInt(info.dailyFreeRefresh, 0));
  info.sailorPackages = ensureArray(info.sailorPackages).map((row) => ({
    ...ensureObject(row),
    id: Math.max(0, toSafeInt(row && row.id, 0)),
    expire: Math.max(0, toSafeInt(row && row.expire, 0)),
    freeClaim: Math.max(0, toSafeInt(row && row.freeClaim, 0)),
  })).filter((row) => row.id > 0);
  info.passRecords = ensureArray(info.passRecords).map((row) => ({
    ...ensureObject(row),
    id: Math.max(0, toSafeInt(row && row.id, 0)),
    buyRecord: Math.max(1, toSafeInt(row && row.buyRecord, 1)),
    claimRecord: ensureObject(row && row.claimRecord),
  })).filter((row) => row.id > 0);
  info.destRecords = ensureArray(info.destRecords);
  // Native ChatData.parseOldTrekMsg reads summary.dbid/name. Older rows
  // stored dbid/name at the top level and crash the client every chat tick.
  info.chatList = ensureArray(info.chatList);
  let chatSummary = null;
  if (info.chatList.length > 0) {
    try {
      chatSummary = require('./chat').buildSummary(player);
    } catch (_err) {
      chatSummary = {};
    }
  }
  info.chatList = info.chatList.map((row) => normalizeOldTrekChatRow(row, player, chatSummary));
  info.battleLogs = ensureArray(info.battleLogs);
  info.arenaBattleLogs = ensureArray(info.arenaBattleLogs);
  info.battleRecords = ensureObject(info.battleRecords);
  info.arenaGradeReward = Math.max(0, toSafeInt(info.arenaGradeReward, 0));
  info.totalDistance = Math.max(0, toSafeInt(info.totalDistance, 0));
  info.sailSetId = Math.max(0, toSafeInt(info.sailSetId, 0));
  info.arenaSetId = Math.max(0, toSafeInt(info.arenaSetId, 0));
  info.arenaSetInfo = normalizeSetLines(info.arenaSetInfo);

  // The client reads formations exclusively from setMap[selectedSetId].
  // Migrate the old setInfo-only shape so existing player documents remain usable.
  const legacySetInfo = ensureArray(info.setInfo);
  const sourceSetMap = ensureObject(info.setMap);
  const normalizedSetMap = {};
  Object.keys(sourceSetMap).forEach((key) => {
    const setId = toSafeInt(key, -1);
    if (setId >= 0 && Array.isArray(sourceSetMap[key])) {
      normalizedSetMap[String(setId)] = normalizeSetLines(sourceSetMap[key]);
    }
  });
  [info.sailSetId, info.arenaSetId].forEach((setId) => {
    const key = String(setId);
    if (!normalizedSetMap[key]) normalizedSetMap[key] = normalizeSetLines(legacySetInfo);
  });
  info.setMap = normalizedSetMap;
  syncLegacySetInfo(info);
  info.sailing = !!info.sailing;
  info.blessGift = ensureObject(info.blessGift);
  info.giftLevel = Math.max(0, toSafeInt(info.giftLevel, 0));
  info.giftExp = Math.max(0, toSafeInt(info.giftExp, 0));
  info.moraleSkill = ensureObject(info.moraleSkill);
  info.taskRecord = ensureObject(info.taskRecord);
  // The latest client iterates info.dest and calls .length in several task paths.
  info.dest = normalizeDestRecords(info.dest);
  if (!info.dest.some((row) => row.id === 1) && toSafeInt(getDestinationConfig(1, 1).id, 0) === 1) {
    info.dest.unshift({ id: 1, taskClaimed: [], rewardClaimed: [] });
  }
  info.pray = Math.max(0, toSafeInt(info.pray, 0));
  info.prayDate = String(info.prayDate || '');
  info.endCache = !!info.endCache;
  info.stateRevision = Math.max(0, toSafeInt(info.stateRevision, 0));
  info.eventSerial = Math.max(0, toSafeInt(info.eventSerial, 0));
  info.nextEventUid = Math.max(0, toSafeInt(info.nextEventUid, 0));
  info.lastEventUid = Math.max(0, toSafeInt(info.lastEventUid, 0));
  oldTrekLedger.ensureInfo(info);
  oldTrekProgress.mature(info);
  const sailInfo = ensureSailInfo(info);
  for (const [payId, multi] of Object.entries(ensureObject(baseConfig.multiPrivilege))) {
    if (ensureArray(player.rechargeInfo && player.rechargeInfo.records).some(r => Number(r.id) === Number(payId) && Number(r.count) > 0)) sailInfo.multi = Math.max(sailInfo.multi, Number(multi));
  }
  if (info.sailing && !sailInfo.trekData) startSailing(info, 1, 1);
  if (!info.sailing && sailInfo.trekData) info.sailing = true;
  return info;
}

async function handleOldTrekInfo(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 7000, msgUid, data: ensureOldTrekInfo({}) };
  const info = ensureOldTrekInfo(player);
  const request = ensureObject(params);
  const destId = Math.max(0, toSafeInt(request.id, 0));

  if (destId > 0) {
    const schedule = oldTrekScheduleService.getSchedule();
    if (!schedule.isDepartAllowed) {
      return {
        tag: 7000,
        msgUid,
        data: { result: 1, code: 'OLD_TREK_DEPART_CLOSED', retryable: true, revision: info.stateRevision },
      };
    }
    if (ensureSailInfo(info).trekData || info.sailing) {
      return { tag: 7000, msgUid, data: { result: 1, code: 'OLD_TREK_ALREADY_SAILING', retryable: false, revision: info.stateRevision } };
    }
    const formationCode = oldTrekProgress.validateLines(
      info, info.sailSetId, ensureSetLines(info, info.sailSetId), false,
    );
    if (formationCode) {
      return { tag: 7000, msgUid, data: { result: 1, code: formationCode, retryable: false, revision: info.stateRevision } };
    }
    const difficulty = Math.max(1, toSafeInt(request.diff, 1));
    const destination = getDestinationConfig(destId, difficulty);
    if (!isDestinationUnlocked(info, destId, difficulty)) {
      return { tag: 7000, msgUid, data: { result: 1, code: 'OLD_TREK_DESTINATION_LOCKED', retryable: false, revision: info.stateRevision } };
    }
    if (!consumeItems(player, destination.costs)) {
      return { tag: 7000, msgUid, data: { result: 1, code: 'OLD_TREK_COST_NOT_ENOUGH', retryable: false, revision: info.stateRevision } };
    }
    const sailInfo = startSailing(info, destId, difficulty);
    if (!sailInfo) {
      return { tag: 7000, msgUid, data: { result: 1, code: 'OLD_TREK_DESTINATION_INVALID', retryable: false, revision: info.stateRevision } };
    }
    bumpStateRevision(info);
    const saved = await saveOldTrek(session, { tag: 7000, msgUid, data: { result: 0, data: sailInfo.trekData, effects: sailInfo.effects, revision: info.stateRevision } });
    if (!saved) throw new Error('OLD_TREK_SAVE_NOT_CONFIRMED');
    return {
      tag: 7000,
      msgUid,
      data: {
        result: sailInfo ? 0 : 1,
        data: sailInfo ? sailInfo.trekData : null,
        effects: sailInfo ? sailInfo.effects : [],
        revision: info.stateRevision,
      },
    };
  }

  await saveOldTrek(session);
  return { tag: 7000, msgUid, data: info };
}

async function handleOldTrekRefreshSailor(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 7020, msgUid, data: { result: -1, refreshId: [], rewardCache: [], cacheCount: 0, dailyFree: 0, rewardInfo: buildRewardInfo() } };
  const info = ensureOldTrekInfo(player);
  const base = ensureObject(configService.get('OldTrekBaseConfig'));
  const requestedFree = toSafeInt(params && params.free, 0) === 1;
  const freeLimit = Math.max(0, toSafeInt(base.sailorRecruitDailyFree, 0));
  const canUseFree = requestedFree && info.dailyFreeRefresh < freeLimit;
  if (!canUseFree && !consumeItems(player, [ensureObject(base.recruitRefreshCosts)])) {
    return {
      tag: 7020,
      msgUid,
      data: {
        result: 1,
        refreshId: info.refreshId,
        rewardCache: info.rewardCache,
        cacheCount: info.cacheCount,
        dailyFree: info.dailyFreeRefresh,
        rewardInfo: buildRewardInfo(),
      },
    };
  }
  if (canUseFree) info.dailyFreeRefresh += 1;
  const cachedRewards = oldTrekRewardInfo(player, rewardRowsFromCache(info.rewardCache));
  info.refreshId = pickRecruitSailorIds(info, Math.max(1, toSafeInt(base.recruitNum, 5)));
  info.rewardCache = [];
  info.cacheCount = 0;
  info.refreshId.forEach((id) => { if (info.sailorAtlas[id] == null) info.sailorAtlas[id] = 0; });
  const reply = { tag: 7020, msgUid, data: { result: 0, refreshId: info.refreshId, rewardCache: info.rewardCache, cacheCount: info.cacheCount, dailyFree: info.dailyFreeRefresh, rewardInfo: cachedRewards } };
  await saveOldTrek(session, reply);
  return reply;
}

async function handleOldTrekHireSailor(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 7021, msgUid, data: { result: -1, rewardInfo: buildRewardInfo() } };
  const info = ensureOldTrekInfo(player);
  const sailorId = Math.max(0, toSafeInt(params && params.id, 0));
  const hire = Math.max(0, toSafeInt(params && params.hire, 0));
  if (!getSailorConfig(sailorId).id || !info.refreshId.includes(sailorId)) {
    return { tag: 7021, msgUid, data: { result: 1, rewardInfo: buildRewardInfo() } };
  }
  if (![0, 1].includes(hire)) return { tag: 7021, msgUid, data: { result: 1, code: 'OLD_TREK_HIRE_INVALID' } };
  const existing = info.sailorList.find(r => r.id === sailorId);
  if (!existing && hire === 0 && info.sailorList.filter(r => getSailorConfig(r.id).type !== 0).length >= Number(configService.get('OldTrekBaseConfig').initialSailorNum || 20) + oldTrekProgress.privilege(info, 1)) return { tag: 7021, msgUid, data: { result: 1, code: 'OLD_TREK_SAILOR_CAPACITY' } };
  const sailor = existing || buildSailor(sailorId);
  let slot = null;

  if (hire === 0 && !info.sailorList.some((row) => row.id === sailorId)) {
    info.sailorList.push(sailor);
    if (info.sailorAtlas[sailorId] == null) info.sailorAtlas[sailorId] = 0;
    slot = info.sailorSlotList.find((row) => toSafeInt(row.sailorId, 0) <= 0) || null;
    if (slot) slot.sailorId = sailorId;
  }
  info.refreshId = info.refreshId.filter((id) => id !== sailorId);
  const reply = {
    tag: 7021,
    msgUid,
    data: {
      result: 0,
      sailor,
      slot,
      rewardInfo: buildRewardInfo(),
    },
  };
  await saveOldTrek(session, reply);
  return reply;
}

function oldTrekRewardInfo(player, rows = []) {
  const items = normalizeItemRows(rows);
  const oldTrekShips = [];
  const rewardGrant = require('../services/RewardGrantService');
  items.forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id === 322) oldTrekProgress.shipExp(ensureOldTrekInfo(player), count, player);
    else if (rewardGrant.isOldTrekShipSkinId(id)) {
      const grant = rewardGrant.grantRewardRow(player, { id, count }, 1);
      oldTrekShips.push(...(grant.rewardOldTrekShips || []));
    }
    else if (getSailorConfig(id).id) {
      const info = ensureOldTrekInfo(player);
      if (!info.sailorList.some(r => r.id === id)) info.sailorList.push(buildSailor(id));
      if (info.sailorAtlas[id] == null) info.sailorAtlas[id] = 0;
    } else addRewardToPlayer(player, id, count);
  });
  return { ...buildRewardInfo(items), oldTrekShips };
}

function rewardRowsFromEvent(event) {
  const source = ensureObject(event);
  const rows = [];
  const append = (value) => {
    if (Array.isArray(value)) rows.push(...value);
    else if (value && typeof value === 'object') rows.push(value);
  };
  append(source.rewards);
  append(source.reward);
  append(source.items);
  append(source.rewardInfo && source.rewardInfo.items);
  return normalizeItemRows(rows);
}

function buildTrekUpdatePush(info, player, overrides = {}) {
  const sailInfo = ensureSailInfo(info);
  return {
    updateData: buildTrekUpdate(sailInfo.trekData),
    itemUpdate: ensureArray(overrides.itemUpdate),
    battleLog: overrides.battleLog || null,
    rewardInfo: overrides.rewardInfo || buildRewardInfo(),
  };
}

function isOldTrekEventExpired(event, now = Date.now()) {
  const source = ensureObject(event);
  const deadline = Number(source.deadline || 0);
  const createdAt = Number(source.createdAt || 0);
  const maxElapsed = Math.max(1, toSafeInt(oldTrekPolicy.miniGameMaxElapsedMs, 900000));
  return (deadline > 0 && now >= deadline)
    || (deadline <= 0 && createdAt > 0 && now - createdAt >= maxElapsed);
}

// Recover only a server-authoritative stale event. This does not invent a
// success reward: timeout follows the existing failure branch, records one
// event-ledger entry, and settles the trek only when the distance is arrived.
function reconcileOldTrekPendingEvent(info, player, now = Date.now()) {
  const sailInfo = ensureSailInfo(info);
  const event = sailInfo.currentEvent;
  if (!event || !isOldTrekEventExpired(event, now)) return null;
  const resolved = oldTrekEventService.resolve(info, {
    eventUid: event.uid,
    operate: 1,
    param: 0,
  }, now, player);
  if (!resolved.ok) return { error: resolved.code, event };
  if (resolved.replayed) return { recovered: true, replayed: true, event: resolved.event || null };
  const rewardInfo = oldTrekRewardInfo(player, resolved.rewardRows);
  if (resolved.shipExp > 0) oldTrekProgress.shipExp(info, resolved.shipExp, player);
  const pushPackets = [{
    tag: 7006,
    msgUid: 0,
    data: buildEventUpdatePush(info, player, {
      event: resolved.event,
      lastLog: resolved.lastLog,
      rewardInfo,
      itemUpdate: resolved.itemUpdate,
      check: resolved.check,
      battleLog: resolved.battleLog,
      battleResult: resolved.battleResult,
    }),
  }];
  let settled = null;
  if (resolved.terminal) {
    const settlement = settleArrivedOldTrek(info, player, ensureSailInfo(info).trekData && ensureSailInfo(info).trekData.uid);
    if (settlement.status === 'settled') {
      settled = settlement.settlement;
      pushPackets.push({ tag: 7010, msgUid: 0, data: settled });
    }
  }
  return {
    recovered: true,
    event: resolved.event || null,
    rewardInfo,
    terminal: !!resolved.terminal,
    settled,
    pushPackets,
  };
}

function normalizeCabinUpdates(rows, sailInfo) {
  return ensureArray(rows).map((row) => {
    const source = ensureObject(row);
    const uid = toSafeInt(source.uid, 0);
    const current = ensureArray(sailInfo && sailInfo.cabin)
      .find((item) => toSafeInt(item && item.uid, 0) === uid) || {};
    return {
      ...source,
      uid,
      id: Math.max(0, toSafeInt(source.id, toSafeInt(current.id, 0))),
      count: Math.max(0, toSafeInt(source.count, toSafeInt(current.count, 0))),
      state: Math.max(0, toSafeInt(source.state, toSafeInt(current.state, 0))),
      targetUid: toSafeInt(source.targetUid, toSafeInt(current.targetUid, -1)),
    };
  });
}

function buildOldTrekEventLog(event, params) {
  const source = ensureObject(event);
  const id = Math.max(0, toSafeInt(source.id, toSafeInt(params && params.id, 0)));
  const requestEventUid = Math.max(0, toSafeInt(params && params.eventUid, 0));
  if (id <= 0 && !source.uid && requestEventUid <= 0) return null;
  return {
    ...source,
    uid: Math.max(0, toSafeInt(source.uid, requestEventUid || Date.now())),
    id,
    result: Math.max(0, toSafeInt(params && params.operate, 0)),
    param: toSafeInt(params && params.param, 0),
    pre: toSafeInt(source.pre, -1),
    time: Date.now(),
  };
}

function buildEventUpdatePush(info, player, overrides = {}) {
  const sailInfo = ensureSailInfo(info);
  return {
    event: Object.prototype.hasOwnProperty.call(overrides, 'event') ? overrides.event : (sailInfo.currentEvent || null),
    itemUpdate: normalizeCabinUpdates(overrides.itemUpdate, sailInfo),
    lastLog: overrides.lastLog || null,
    updateData: buildTrekUpdate(sailInfo.trekData),
    battleLog: overrides.battleLog || null,
    battleResult: overrides.battleResult || null,
    rewardInfo: overrides.rewardInfo || buildRewardInfo(),
    effects: ensureArray(overrides.effects),
    check: ensureArray(overrides.check),
  };
}

function buildBlessGiftUpdate(info, player, rewardRows = []) {
  return {
    giftLevel: Math.max(0, toSafeInt(info && info.giftLevel, 0)),
    giftExp: Math.max(0, toSafeInt(info && info.giftExp, 0)),
    rewards: oldTrekRewardInfo(player, rewardRows),
  };
}

function recordSailorSettlementTasks(info, distance) {
  const lines = ensureSetLines(info, info.sailSetId);
  const ids = new Set(lines.flatMap(line => ensureArray(line.slots)
    .map(value => toSafeInt(value, 0)).filter(id => id > 0)));
  const increment = Math.max(0, toSafeInt(distance, 0));
  ids.forEach((id) => {
    const sailor = ensureArray(info.sailorList).find(row => toSafeInt(row && row.id, 0) === id);
    if (!sailor) return;
    sailor.task = ensureObject(sailor.task);
    sailor.task[2] = Math.max(0, toSafeInt(sailor.task[2], 0)) + 1;
    sailor.task[3] = Math.max(0, toSafeInt(sailor.task[3], 0)) + increment;
  });
}

function rewardRowsFromCache(cache) {
  if (Array.isArray(cache)) return normalizeItemRows(cache);
  const source = ensureObject(cache);
  return normalizeItemRows(Object.keys(source).map((key) => {
    const value = source[key];
    if (value && typeof value === 'object') return value;
    return { id: toSafeInt(key, 0), count: toSafeInt(value, 0) };
  }));
}

function oldTrekLine(info, setId = 0, lineId = 0) {
  const lines = ensureSetLines(info, setId);
  return lines.find((row) => toSafeInt(row && row.id, -1) === lineId) || buildLineData(lineId);
}

function oldTrekBattleResult(session, enemy = {}) {
  const actor = session.player || {};
  const info = ensureOldTrekInfo(actor);
  const left = buildBattlePlayer(actor, actor.playerId || session.userId, actor.name || 'Player');
  const right = buildBattlePlayer({}, enemy && enemy.dbid, enemy && enemy.name || '灵舟对手');
  right.hp = 0;
  const validSailors = info.sailorList.map((row) => row.id).filter((id) => getSailorConfig(id).id);
  const leftId = validSailors[0] || getDefaultSailorIds(1)[0];
  const rightId = getDefaultSailorIds(1)[0];
  const results = [{
    win: 1,
    line: 1,
    entitys: [
      { side: 1, leader: leftId, ids: [leftId], maxHp: 100000 },
      { side: -1, leader: rightId, ids: [rightId], maxHp: 100000 },
    ],
    events: [
      { type: 0, index: 0, caster: 0, target: 0, args: [], values: {}, events: [] },
      {
        type: 0,
        index: 1,
        caster: 0,
        target: 0,
        args: [],
        values: {},
        events: [
          {
            type: 2,
            index: 101,
            caster: 1,
            target: 0,
            args: [],
            values: {},
            events: [
              { type: 3, index: 101, caster: 1, target: -1, args: [0], values: { 1: -100000 }, events: [] },
            ],
          },
          { type: 8888, index: 0, caster: 0, target: 0, args: [300], values: {}, events: [] },
        ],
      },
    ],
  }];
  return {
    win: 1,
    params: {},
    results,
    playerInfos: {
      1: left,
      '-1': right,
    },
  };
}

function buildOldTrekSettlement(info, player, options = {}) {
  const sailInfo = ensureSailInfo(info);
  const trekData = ensureObject(sailInfo.trekData);
  const id = Math.max(1, toSafeInt(options.id, toSafeInt(trekData.id, 1)));
  const diff = Math.max(1, toSafeInt(options.diff, toSafeInt(trekData.diff, 1)));
  const cfg = getDestinationConfig(id, diff);
  const firstKey = `${id}:${diff}`;
  info.firstRewardRecords = ensureObject(info.firstRewardRecords);
  const firstRows = info.firstRewardRecords[firstKey] ? [] : ensureArray(cfg.firstRewards);
  const cargoRewards = sailInfo.cabin.filter(r => r.state === 1 || r.state === 2).flatMap(item =>
    ensureArray(getConfigRow('OldTrekItemConfig', item.id).transRewards).map(r => ({ id: r.id, count: r.count * item.count })));
  const passiveRows = passiveTrekRewards(info);
  const rewardRows = normalizeItemRows([...ensureArray(cfg.fixRewards), ...firstRows, ...cargoRewards, ...passiveRows]);
  info.firstRewardRecords[firstKey] = 1;
  // Native onEndTrek increments the sailors in the sailing formation.  Keep
  // that progress server-authoritative so a lost packet/relog cannot discard it.
  recordSailorSettlementTasks(info, cfg.distance);
  info.totalDistance += Math.max(0, toSafeInt(cfg.distance, 0));
  info.taskRecord[100 * id + 5] = Number(info.taskRecord[100 * id + 5] || 0) + Number(cfg.distance || 0);
  info.taskRecord[10000 * diff + 100 * id] = 1;
  info.taskRecord[10000 * diff + 100 * id + 4] = Math.max(Number(info.taskRecord[10000 * diff + 100 * id + 4] || 0), Number(cfg.baseSettleScore || 0));
  info.taskRecord[100 * id + 4] = Math.max(Number(info.taskRecord[100 * id + 4] || 0), Number(cfg.baseSettleScore || 0));
  oldTrekProgress.shipExp(info, Math.floor(Number(cfg.distance || 0) / 2), player);
  const rewards = oldTrekRewardInfo(player, rewardRows);
  const settlement = {
    id,
    diff,
    lv: info.lv,
    exp: info.exp,
    roundScore: Math.max(0, toSafeInt(cfg.baseSettleScore, toSafeInt(trekData.roundScore, 0))),
    cabin: sailInfo.cabin.slice(),
    rewards,
  };
  info.lastEndCache = {
    ...settlement,
    cache: { rewards: rewards.items.slice() },
    first: normalizeItemRows(firstRows),
  };
  // Keep a durable marker until the client opens/acknowledges 7065.  If the
  // 7010 packet is lost, the native main panel can request this cache after
  // relog instead of silently losing the settlement view.
  info.endCache = true;
  info.sailing = false;
  sailInfo.trekData = null;
  sailInfo.currentEvent = null;
  sailInfo.cabin = [];
  sailInfo.eventLogs = [];
  sailInfo.effects = [];
  return settlement;
}

// A terminal event can be the final action that reaches the destination.  In
// that case settlement must happen in the same server-authoritative mutation;
// relying on a second client 7005 request leaves the journey docked forever
// when the socket closes between the event response and the retry.
function settleArrivedOldTrek(info, player, requestedUid) {
  const sailInfo = ensureSailInfo(info);
  const trekData = sailInfo.trekData;
  if (!trekData || toSafeInt(trekData.uid, 0) !== toSafeInt(requestedUid, 0)) {
    return { status: 'invalid' };
  }
  const checkpoint = checkpointTrek(info);
  if (!checkpoint.arrived) return { status: 'not_arrived', checkpoint };
  const ledgerKey = oldTrekLedger.receiptKey('settle', info.season, requestedUid);
  const ledgerReceipt = oldTrekLedger.done(info, ledgerKey);
  if (ledgerReceipt) return { status: 'replayed', settlement: ledgerReceipt.payload };
  const receipt = ensureArray(info.trekReceipts).find(row => row.uid === Number(requestedUid));
  if (receipt) return { status: 'replayed', settlement: receipt.settlement };
  const started = oldTrekLedger.begin(info, ledgerKey, {
    scope: 'settle', season: info.season, uid: requestedUid,
  });
  if (!started.created && started.existing.status !== 'failed') {
    return { status: 'in_progress' };
  }
  const settlement = buildOldTrekSettlement(info, player);
  oldTrekLedger.commit(info, ledgerKey, settlement);
  info.trekReceipts = ensureArray(info.trekReceipts);
  info.trekReceipts.push({ uid: requestedUid, season: info.season, settlement });
  info.trekReceipts = info.trekReceipts.slice(-64);
  bumpStateRevision(info);
  return { status: 'settled', settlement };
}

function buildRankPlayer(player, score, rank, dbid, name) {
  return {
    ...buildBattlePlayer(player, dbid, name),
    score: Math.max(0, toSafeInt(score, 0)),
    rank: Math.max(1, toSafeInt(rank, 1)),
    sailPower: Math.max(0, toSafeInt(player && player.power, 0)),
    kungfuId: Math.max(0, toSafeInt(player && player.kungfuId, 0)),
  };
}

function getArenaScore(player) {
  const source = player && player.oldTrekArenaScore != null
    ? player.oldTrekArenaScore : player && player.arenaScore;
  return Math.max(0, toSafeInt(source, 1000));
}

function arenaGradeForScore(score) {
  const table = ensureObject(configService.get('OldTrekArenaScoreConfig'));
  let grade = 1;
  Object.keys(table).forEach((key) => {
    const row = ensureObject(table[key]);
    const left = Math.max(0, toSafeInt(row.scoreLeft, 0));
    const right = toSafeInt(row.scoreRight, -1);
    if (score >= left && (right < 0 || score < right)) grade = Math.max(1, toSafeInt(row.id, grade));
  });
  return grade;
}

function passiveTrekRewards(info) {
  const trek = info.sailInfo && info.sailInfo.trekData;
  if (!trek) return [];
  const base = ensureObject(configService.get('OldTrekBaseConfig'));
  const step = Number(base.fixSettleDis);
  if (!Number.isFinite(step) || step <= 0) return [];
  const current = Math.floor(Math.max(0, Number(trek.dist || 0)) / step);
  // Never backpay unknown legacy distance; only accrue after adoption.
  if (!Number.isSafeInteger(trek.passivePaidSteps)) { trek.passivePaidSteps = current; return []; }
  const unpaid = Math.max(0, Math.min(1000, current - trek.passivePaidSteps));
  trek.passivePaidSteps += unpaid;
  return ensureArray(base.fixSettleRewards).map(r => ({ id: r.id, count: r.count * unpaid }));
}

async function handleOldTrekAction(tag, params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag, msgUid, data: { result: -1 } };
  const info = ensureOldTrekInfo(player);
  const p = ensureObject(params);
  if (p.oldTrekPuzzleVersion === '20260921_v1') info.puzzleClientVersion = p.oldTrekPuzzleVersion;
  let data = { result: 0 };
  const pushPackets = [];
  const validation = oldTrekProgress.validateAction(info, tag, p);
  if (validation) return { tag, msgUid, data: { result: 1, code: validation, revision: info.stateRevision } };
  switch (tag) {
    case 7001: {
      const sailInfo = ensureSailInfo(info);
      const recovered = reconcileOldTrekPendingEvent(info, player);
      if (recovered && recovered.error) {
        data = { result: 1, code: recovered.error, retryable: false, event: recovered.event, revision: info.stateRevision };
        break;
      }
      if (recovered && recovered.recovered) {
        data = { result: 0, recovered: true, replayed: !!recovered.replayed,
          event: recovered.event, rewards: recovered.rewardInfo || buildRewardInfo(),
          revision: info.stateRevision, settled: !!recovered.settled };
        pushPackets.push(...ensureArray(recovered.pushPackets));
        break;
      }
      const checkpoint = checkpointTrek(info);
      if (!checkpoint.trekData) {
        data = { result: 1, code: 'OLD_TREK_NOT_SAILING', retryable: false, revision: info.stateRevision };
        break;
      }
      if (sailInfo.currentEvent) {
        data = { result: 1, code: 'OLD_TREK_EVENT_PENDING', retryable: false, event: sailInfo.currentEvent, updateData: buildTrekUpdate(checkpoint.trekData), revision: info.stateRevision };
        break;
      }
      if (checkpoint.arrived) {
        data = { result: 1, code: 'OLD_TREK_ARRIVED', retryable: false, updateData: buildTrekUpdate(checkpoint.trekData), revision: info.stateRevision };
        break;
      }
      const multi = p.multi == null ? 1 : Number(p.multi);
      if (!Number.isSafeInteger(multi) || multi < 1 || multi > sailInfo.multi) {
        data = { result: 1, code: 'OLD_TREK_MULTI_INVALID', updateData: buildTrekUpdate(checkpoint.trekData), event: null, revision: info.stateRevision };
        break;
      }
      const base = ensureObject(configService.get('OldTrekBaseConfig'));
      const accelerateCost = ensureObject(base.baseAccelerateCosts);
      const costs = toSafeInt(accelerateCost.id, 0) > 0
        ? [{ id: accelerateCost.id, count: Math.max(1, toSafeInt(accelerateCost.count, 1)) * multi }]
        : [];
      const paid = consumeItems(player, costs);
      const trekData = ensureSailInfo(info).trekData;
      if (paid && trekData) {
        const cfg = getDestinationConfig(trekData.id, trekData.diff);
        const stableRatio = trekData.stable / trekData.stableMax * 10000;
        const stableRow = Object.values(ensureObject(configService.get('OldTrekStableConfig')))
          .find(row => row.max >= stableRatio && stableRatio > row.min);
        const gain = Math.max(0, Number(base.equalDis) || 0) * (1 + Number(stableRow && stableRow.disDebuff || 0) / 10000);
        trekData.dist = Math.min(
          Math.max(0, Number(cfg.distance) || Number.MAX_SAFE_INTEGER),
          Math.max(0, Number(trekData.dist) || 0) + gain * multi
        );
        trekData.lastUpdateTime = Math.max(trekData.lastUpdateTime, Date.now());
        bumpStateRevision(info);
      }
      const event = paid && process.env.OLD_TREK_EVENT_ENGINE_ENABLED === '1'
        ? oldTrekEventService.spawn(info, Date.now(), player) : null;
      data = {
        result: paid ? 0 : 1,
        code: paid ? undefined : 'OLD_TREK_ACCELERATE_COST_NOT_ENOUGH',
        critical: 0,
        event,
        updateData: buildTrekUpdate(trekData),
        revision: info.stateRevision,
      };
      break;
    }
    case 7002: {
      const previousEvent = info.sailInfo && info.sailInfo.currentEvent;
      if (process.env.OLD_TREK_EVENT_ENGINE_ENABLED !== '1') {
        const code = !previousEvent ? 'OLD_TREK_EVENT_NOT_FOUND'
          : Number(p.eventUid) !== Number(previousEvent.uid) ? 'OLD_TREK_EVENT_UID_INVALID' : 'OLD_TREK_EVENT_POLICY_REQUIRED';
        return { tag, msgUid, data: { result: 1, code, event: previousEvent || null, revision: info.stateRevision } };
      }
      // Sea encounters use the sailing formation.  Validate it before the
      // event service calls combat; otherwise combat throws and the guarded
      // save path invalidates the whole session with SAVE_UNKNOWN.
      if (previousEvent && previousEvent.enemySnapshot
        && oldTrekArena.teams(player, false).length !== 3) {
        return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_FORMATION_EMPTY', event: previousEvent, revision: info.stateRevision } };
      }
      const resolved = oldTrekEventService.resolve(info, p, Date.now(), player);
      if (!resolved.ok) return { tag, msgUid, data: { result: 1, code: resolved.code, retryable: false, event: previousEvent || null, revision: info.stateRevision } };
      if (resolved.replayed) return { tag, msgUid, data: { result: 0, replayed: true, event: previousEvent || null, revision: info.stateRevision } };
      const rewardInfo = oldTrekRewardInfo(player, resolved.rewardRows);
      if (resolved.shipExp > 0) oldTrekProgress.shipExp(info, resolved.shipExp, player);
      data = { result: 0, event: resolved.event, rewards: rewardInfo, itemUpdate: resolved.itemUpdate, check: resolved.check, revision: info.stateRevision };
      pushPackets.push({ tag: 7006, msgUid: 0, data: buildEventUpdatePush(info, player, { event: resolved.event, lastLog: resolved.lastLog, rewardInfo, itemUpdate: resolved.itemUpdate, check: resolved.check, battleLog: resolved.battleLog, battleResult: resolved.battleResult }) });
      pushPackets.push({ tag: 7001, msgUid: 0, data: { lv: info.lv, exp: info.exp } });
      if (resolved.terminal) {
        const settlement = settleArrivedOldTrek(info, player, ensureSailInfo(info).trekData && ensureSailInfo(info).trekData.uid);
        if (settlement.status === 'settled') {
          data.settled = true;
          data.revision = info.stateRevision;
          pushPackets.push({ tag: 7010, msgUid: 0, data: settlement.settlement });
        } else if (settlement.status === 'in_progress') {
          data.settlementPending = true;
        }
      }
      break;
    }
    case 7003: {
      const sailInfo = ensureSailInfo(info);
      const itemUid = toSafeInt(p.itemUid, 0);
      const item = sailInfo.cabin.find((row) => toSafeInt(row.uid, 0) === itemUid);
      const itemUpdate = [];
      if (item) {
        if (![1, 2].includes(Number(p.state))) { data = { result: 1, code: 'OLD_TREK_CABIN_STATE_INVALID' }; break; }
        if (Number(p.state) === 2 && item.state !== 2 && sailInfo.cabin.filter(r => r.state === 2).length >= Number(configService.get('OldTrekBaseConfig').baseSafeGrid || 3) + oldTrekProgress.privilege(info, 2)) { data = { result: 1, code: 'OLD_TREK_CABIN_SAFE_FULL' }; break; }
        item.state = toSafeInt(p.state, toSafeInt(item.state, 0));
        item.targetUid = toSafeInt(p.targetUid, -1);
        itemUpdate.push({ ...item });
      }
      data = { itemUpdate };
      // Destination task progress is delivered on the push channel.  Send a
      // complete object because the client merges it with taskRecord.
      pushPackets.push({
        tag: 7003,
        msgUid: 0,
        data: { taskUpdate: { ...info.taskRecord } },
      });
      break;
    }
    case 7004: {
      const sailInfo = ensureSailInfo(info);
      const trekData = checkpointTrek(info).trekData;
      const base = ensureObject(configService.get('OldTrekBaseConfig'));
      const paid = !!trekData && consumeItems(player, [ensureObject(base.stableFixCosts)]);
      if (paid) {
        trekData.stable = Math.max(1, toSafeInt(trekData.stableMax, toSafeInt(base.baseStable, 100)));
        trekData.lastUpdateTime = Date.now();
      }
      data = { result: paid ? 0 : 1, updateData: buildTrekUpdate(trekData) };
      break;
    }
    case 7005: {
      const sailInfo = ensureSailInfo(info);
      const requestedUid = Math.max(0, toSafeInt(p.uid, 0));
      const ledgerKey = oldTrekLedger.receiptKey('settle', info.season, requestedUid);
      const ledgerReceipt = oldTrekLedger.done(info, ledgerKey);
      if (ledgerReceipt) {
        const replay = { tag, msgUid, data: { result: 0, replayed: true, revision: info.stateRevision } };
        return sailInfo.trekData ? replay : [replay, { tag: 7010, msgUid: 0, data: ledgerReceipt.payload }];
      }
      const receipt = ensureArray(info.trekReceipts).find(row => row.uid === Number(p.uid));
      if (receipt) {
        const replay = { tag, msgUid, data: { result: 0, replayed: true, revision: info.stateRevision } };
        return sailInfo.trekData ? replay : [replay, { tag: 7010, msgUid: 0, data: receipt.settlement }];
      }
      if (!Number.isSafeInteger(Number(p.uid)) || requestedUid <= 0 || !sailInfo.trekData || requestedUid !== toSafeInt(sailInfo.trekData.uid, 0)) {
        data = { result: 1, code: 'OLD_TREK_TREK_UID_INVALID', retryable: false, revision: info.stateRevision };
        break;
      }
      const recovered = reconcileOldTrekPendingEvent(info, player);
      if (recovered && recovered.error) {
        data = { result: 1, code: recovered.error, retryable: false, event: recovered.event, revision: info.stateRevision };
        break;
      }
      if (recovered && recovered.recovered) {
        data = { result: 0, recovered: true, replayed: !!recovered.replayed,
          event: recovered.event, rewards: recovered.rewardInfo || buildRewardInfo(),
          revision: info.stateRevision, settled: !!recovered.settled };
        pushPackets.push(...ensureArray(recovered.pushPackets));
        break;
      }
      if (sailInfo.currentEvent) {
        data = { result: 1, code: 'OLD_TREK_EVENT_PENDING', revision: info.stateRevision };
        break;
      }
      const checkpoint = checkpointTrek(info);
      if (process.env.OLD_TREK_EVENT_ENGINE_ENABLED === '1') {
        const pending = oldTrekEventService.spawn(info, Date.now(), player);
        if (pending) {
          data = { result: 0, pendingEvent: true, revision: bumpStateRevision(info) };
          pushPackets.push({ tag: 7006, msgUid: 0, data: buildEventUpdatePush(info, player, { event: pending }) });
          break;
        }
      }
      if (!checkpoint.arrived) {
        data = { result: 1, code: 'OLD_TREK_NOT_ARRIVED', retryable: true, updateData: buildTrekUpdate(checkpoint.trekData), revision: info.stateRevision };
        break;
      }
      const started = oldTrekLedger.begin(info, ledgerKey, { scope: 'settle', season: info.season, uid: requestedUid });
      if (!started.created && started.existing.status !== 'failed') {
        data = { result: 1, code: 'OLD_TREK_SETTLEMENT_IN_PROGRESS', retryable: true, revision: info.stateRevision };
        break;
      }
      const settlement = buildOldTrekSettlement(info, player);
      oldTrekLedger.commit(info, ledgerKey, settlement);
      info.trekReceipts = ensureArray(info.trekReceipts);
      info.trekReceipts.push({ uid: requestedUid, season: info.season, settlement });
      info.trekReceipts = info.trekReceipts.slice(-64);
      bumpStateRevision(info);
      data = { result: 0, revision: info.stateRevision };
      pushPackets.push({ tag: 7010, msgUid: 0, data: settlement });
      break;
    }
    case 7007:
      data = { logs: ensureArray(info.battleLogs) };
      break;
    case 7008: {
      const recovered = reconcileOldTrekPendingEvent(info, player);
      if (recovered && recovered.error) {
        data = { result: 1, code: recovered.error, retryable: false, event: recovered.event, revision: info.stateRevision };
        break;
      }
      if (recovered && recovered.recovered) pushPackets.push(...ensureArray(recovered.pushPackets));
      checkpointTrek(info);
      if (process.env.OLD_TREK_EVENT_ENGINE_ENABLED === '1') oldTrekEventService.spawn(info, Date.now(), player);
      const sailInfo = ensureSailInfo(info);
      const passive = passiveTrekRewards(info);
      if (passive.some(r => r.count > 0)) {
        oldTrekRewardInfo(player, passive);
        sailInfo.offlineCache.reward = normalizeItemRows([...sailInfo.offlineCache.reward, ...passive]);
      }
      data = {
        trekData: sailInfo.trekData,
        currentEvent: sailInfo.currentEvent,
        cabin: sailInfo.cabin,
        eventLogs: sailInfo.eventLogs,
        effects: sailInfo.effects,
        multi: sailInfo.multi,
        offlineCache: JSON.parse(JSON.stringify(sailInfo.offlineCache)),
      };
      sailInfo.offlineCache = { reward: [], event: {}, lose: [], robCount: 0, stable: 0 };
      break;
    }
    case 7009: {
      const destId = Math.max(1, toSafeInt(p.id, 1));
      const diff = Math.max(1, toSafeInt(p.diff, 1));
      const cfg = getDestinationConfig(destId, diff);
      const base = ensureObject(configService.get('OldTrekBaseConfig'));
      if (!oldTrekScheduleService.getSchedule().isDepartAllowed) {
        data = { result: 1, code: 'OLD_TREK_DEPART_CLOSED', revision: info.stateRevision };
        break;
      }
      if (info.sailing || ensureSailInfo(info).trekData) {
        data = { result: 1, code: 'OLD_TREK_ALREADY_SAILING', retryable: false, revision: info.stateRevision };
        break;
      }
      if (!isDestinationUnlocked(info, destId, diff)) {
        data = { result: 1, code: 'OLD_TREK_DESTINATION_LOCKED', retryable: false, revision: info.stateRevision };
        break;
      }
      const formationCode = oldTrekProgress.validateLines(
        info, info.sailSetId, ensureSetLines(info, info.sailSetId), false,
      );
      if (formationCode) {
        data = { result: 1, code: formationCode, revision: info.stateRevision };
        break;
      }
      const difficulties = ensureObject(ensureObject(configService.get('OldTrekDestinationConfig'))[destId]);
      if (!Object.values(difficulties).every(row => Number(info.taskRecord[10000 * row.difficulty + 100 * destId] || 0) > 0)) {
        data = { result: 1, code: 'OLD_TREK_SWEEP_FIRST_CLEAR_REQUIRED', revision: info.stateRevision };
        break;
      }
      const costs = [...ensureArray(cfg.costs)];
      if (toSafeInt(cfg.sweepCost, 0) > 0 && toSafeInt(base.baseAccelerateCosts && base.baseAccelerateCosts.id, 0) > 0) {
        costs.push({ id: base.baseAccelerateCosts.id, count: cfg.sweepCost });
      }
      if (toSafeInt(cfg.id, 0) <= 0 || !consumeItems(player, costs)) {
        data = { result: 1 };
        break;
      }
      startSailing(info, destId, diff);
      const settlement = buildOldTrekSettlement(info, player, { id: destId, diff });
      bumpStateRevision(info);
      const log = {
        logTime: Date.now(),
        id: destId,
        diff,
        result: 0,
        win: 1,
      };
      info.battleLogs.push(log);
      if (info.battleLogs.length > 100) info.battleLogs.splice(0, info.battleLogs.length - 100);
      info.battleLogUid = log.logTime;
      data = { result: 0, revision: info.stateRevision };
      pushPackets.push({ tag: 7009, msgUid: 0, data: log });
      pushPackets.push({ tag: 7010, msgUid: 0, data: settlement });
      break;
    }
    case 7010: {
      const id = Math.max(0, toSafeInt(p.id, 0));
      const cfg = getConfigRow('OldTrekTechSkillConfig', id);
      const costs = [];
      if (toSafeInt(cfg.pointCost, 0) > 0) costs.push({ id: 323, count: cfg.pointCost });
      if (cfg.cost && typeof cfg.cost === 'object') costs.push(cfg.cost);
      if (toSafeInt(cfg.id, 0) <= 0 || info.unlockTechs.includes(id) || info.unlocking.some((row) => toSafeInt(row.id, 0) === id) || !consumeItems(player, costs)) {
        data = { result: 1, data: { id, finishTime: Date.now() } };
        break;
      }
      const unlocking = { id, finishTime: Date.now() + Math.max(0, toSafeInt(cfg.unlockTime, 0)) * 1000 };
      info.unlocking.push(unlocking);
      data = { result: 0, data: unlocking };
      break;
    }
    case 7011:
      info.job = Math.max(0, toSafeInt(p.job, info.job));
      data = { result: 0 };
      break;
    case 7012: {
      const id = Math.max(0, toSafeInt(p.id, 0));
      const unlocking = info.unlocking.find((row) => toSafeInt(row.id, 0) === id);
      if (!unlocking) {
        data = { result: 1, data: { id, finishTime: Date.now() } };
        break;
      }
      const count = Math.max(1, toSafeInt(p.count, 1));
      const ad = toSafeInt(p.ad, 0) === 1;
      if (!ad && !consumeItems(player, [{ id: 1, count }])) {
        data = { result: 1, data: { ...unlocking } };
        break;
      }
      unlocking.finishTime = Math.max(Date.now(), toSafeInt(unlocking.finishTime, Date.now()) - count * 60 * 1000);
      data = { data: { ...unlocking }, result: 0 };
      break;
    }
    case 7022: {
      const setId = Math.max(0, toSafeInt(p.set, info.sailSetId));
      const lineIds = Array.isArray(p.line) ? p.line : [p.line];
      const slotIds = Array.isArray(p.slot) ? p.slot : [p.slot];
      const sailorIds = Array.isArray(p.id) ? p.id : [p.id];
      const setLines = ensureSetLines(info, setId);
      const touched = [];
      lineIds.forEach((lineValue, index) => {
        const lineId = Math.max(0, toSafeInt(lineValue, 0));
        const slotId = toSafeInt(slotIds[index], 0);
        const sailorId = Math.max(0, toSafeInt(sailorIds[index], 0));
        const line = setLines.find((row) => row.id === lineId);
        if (!line) return;
        if (slotId < 0) {
          const currentIndex = line.slots.indexOf(sailorId);
          if (currentIndex >= 0) line.slots[currentIndex] = 0;
        } else {
          const safeSlot = Math.max(0, Math.min(3, slotId));
          setLines.forEach((row) => {
            row.slots = row.slots.map((id, candidateIndex) => (
              id === sailorId && (row.id !== lineId || candidateIndex !== safeSlot) ? 0 : id
            ));
          });
          line.slots[safeSlot] = sailorId;
        }
        if (line.leader > 0 && !line.slots.includes(line.leader)) {
          line.leader = line.slots.find((id) => id > 0) || -1;
        }
        if (!touched.includes(lineId)) touched.push(lineId);
      });
      syncLegacySetInfo(info);
      data = { lineData: touched.map((lineId) => oldTrekLine(info, setId, lineId)), set: setId };
      break;
    }
    case 7023: {
      const id = Math.max(0, toSafeInt(p.id, 0));
      const sailor = info.sailorList.find((row) => row.id === id);
      const refund = [];
      if (sailor) {
        for (let star = 1; star <= sailor.star; star += 1) refund.push(...getSailorStarCost(id, star));
        info.sailorList = info.sailorList.filter((row) => row.id !== id);
        info.sailorSlotList.forEach((row) => { if (row.sailorId === id) row.sailorId = 0; });
        Object.keys(info.setMap).forEach((key) => {
          info.setMap[key].forEach((line) => {
            line.slots = line.slots.map((sailorId) => sailorId === id ? 0 : sailorId);
            if (line.leader === id) line.leader = line.slots.find((sailorId) => sailorId > 0) || -1;
          });
        });
      }
      data = { result: sailor ? 0 : 1, id, rewardInfo: oldTrekRewardInfo(player, refund) };
      break;
    }
    case 7024: {
      const slotId = Math.max(0, toSafeInt(p.slot, 0));
      const slot = info.sailorSlotList.find((row) => toSafeInt(row.slot, -1) === slotId);
      const currentLevel = slot ? Math.max(1, toSafeInt(slot.level, 1)) : 1;
      const cfg = getConfigRow('OldTrekSailorLevelUpConfig', currentLevel);
      const targetLevel = Math.max(currentLevel + 1, toSafeInt(p.level, currentLevel + 1));
      const nextCfg = getConfigRow('OldTrekSailorLevelUpConfig', targetLevel);
      const maxLevel = Math.max(1, toSafeInt(getConfigRow('OldTrekSailLevelConfig', info.lv).sailorMaxLevel, 300));
      const paid = !!slot && currentLevel < maxLevel && targetLevel === currentLevel + 1
        && toSafeInt(nextCfg.level, -1) === targetLevel
        && consumeItems(player, ensureArray(cfg.levelCosts));
      if (paid) slot.level = targetLevel;
      data = { result: paid ? 0 : 1, code: paid ? undefined : 'OLD_TREK_LEVEL_MAX', slot: slot || { slot: slotId, sailorId: 0, level: currentLevel } };
      break;
    }
    case 7025: {
      const id = Math.max(0, toSafeInt(p.id, 0));
      const sailor = info.sailorList.find((row) => row.id === id);
      const targetStar = sailor ? Math.max(0, toSafeInt(p.star, sailor.star + 1)) : 0;
      const nextCfg = sailor ? getSailorStarConfig(id, targetStar) : {};
      const paid = !!sailor
        && targetStar === sailor.star + 1
        && toSafeInt(nextCfg.star, -1) === targetStar
        && consumeItems(player, payableStarCost(player, id, targetStar));
      if (paid) sailor.star = targetStar;
      data = { result: paid ? 0 : 1, sailor: sailor || buildSailor(id) };
      break;
    }
    case 7027: {
      const sailor = info.sailorList.find((row) => row.id === toSafeInt(p.id, 0));
      const resetCfg = sailor ? getSailorStarConfig(sailor.id, sailor.star) : {};
      const resetCost = resetCfg.sailorResetCost ? [resetCfg.sailorResetCost] : [];
      const refund = [];
      if (sailor) {
        for (let star = 1; star <= sailor.star; star += 1) refund.push(...getSailorStarCost(sailor.id, star));
      }
      const paid = !!sailor && sailor.star > 0 && consumeItems(player, resetCost);
      if (paid) sailor.star = Math.max(0, toSafeInt(getSailorConfig(sailor.id).minStar, 0));
      data = {
        result: paid ? 0 : 1,
        rewardInfo: paid ? oldTrekRewardInfo(player, refund) : buildRewardInfo(),
        sailor: sailor || buildSailor(p.id),
      };
      break;
    }
    case 7028: {
      const sailLevel = getConfigRow('OldTrekSailLevelConfig', info.lv);
      const maxLevel = Math.max(1, toSafeInt(sailLevel.sailorMaxLevel, 300));
      let changed = false;
      for (let pass = 0; pass < 1000; pass += 1) {
        let passChanged = false;
        for (const slot of info.sailorSlotList) {
          const level = Math.max(1, toSafeInt(slot.level, 1));
          if (level >= maxLevel) continue;
          const cfg = getConfigRow('OldTrekSailorLevelUpConfig', level);
          if (getConfigRow('OldTrekSailorLevelUpConfig', level+1).level && consumeItems(player, ensureArray(cfg.levelCosts))) {
            slot.level = level + 1;
            passChanged = true;
            changed = true;
          }
        }
        if (!passChanged) break;
      }
      data = { result: changed ? 0 : 1, slots: info.sailorSlotList };
      break;
    }
    case 7029: {
      const setId = Math.max(0, toSafeInt(p.set, info.sailSetId));
      const lineId = Math.max(0, toSafeInt(p.line, 0));
      const lineData = oldTrekLine(info, setId, lineId);
      lineData.leader = toSafeInt(p.id, -1);
      syncLegacySetInfo(info);
      data = { lineData, set: setId };
      break;
    }
    case 7030: {
      const sailorId = Math.max(0, toSafeInt(p.sailorId, 0));
      const targetSlotId = Math.max(0, toSafeInt(p.slotId, 0));
      const sourceSlot = info.sailorSlotList.find((row) => row.sailorId === sailorId);
      const targetSlot = info.sailorSlotList.find((row) => row.slot === targetSlotId);
      if (targetSlot) {
        const displacedId = targetSlot.sailorId;
        targetSlot.sailorId = sailorId;
        if (sourceSlot && sourceSlot !== targetSlot) sourceSlot.sailorId = displacedId;
      }
      data = { result: targetSlot ? 0 : 1, slot: targetSlot || { slot: targetSlotId, sailorId, level: 1 } };
      break;
    }
    case 7031: {
      const rewards = oldTrekRewardInfo(player, rewardRowsFromCache(info.rewardCache));
      info.rewardCache = [];
      info.cacheCount = 0;
      data = { rewardInfo: rewards };
      break;
    }
    case 7032: {
      const rewards = [];
      Object.keys(info.sailorAtlas).forEach((key) => {
        const id = Math.max(0, toSafeInt(key, 0));
        if (id <= 0 || toSafeInt(info.sailorAtlas[key], -1) !== 0) return;
        rewards.push(...ensureArray(getSailorConfig(id).atlasReward));
        info.sailorAtlas[key] = 1;
      });
      data = { result: 0, rewards: oldTrekRewardInfo(player, rewards), sailorAtlas: info.sailorAtlas };
      break;
    }
    case 7033: {
      const skillId = Math.max(0, toSafeInt(p.skillId, 0));
      const currentLevel = Math.max(0, toSafeInt(info.moraleSkill[skillId], 0));
      const targetLevel = Math.max(1, toSafeInt(p.level, currentLevel + 1));
      const table = getConfigRow('OldTrekSailorMoraleSkillConfig', skillId);
      const cfg = ensureObject(table[targetLevel] || table[String(targetLevel)]);
      const paid = targetLevel === currentLevel + 1 && toSafeInt(cfg.level, -1) === targetLevel
        && consumeItems(player, ensureArray(cfg.costs));
      if (paid) info.moraleSkill[skillId] = targetLevel;
      data = { result: paid ? 0 : 1, level: Math.max(0, toSafeInt(info.moraleSkill[skillId], 0)), skillId };
      break;
    }
    case 7034: {
      const setId = Math.max(0, toSafeInt(p.set, info.sailSetId));
      const lineId = Math.max(0, toSafeInt(p.line, 0));
      const line = oldTrekLine(info, setId, lineId);
      line.skill = toSafeInt(p.skillId, -1);
      syncLegacySetInfo(info);
      data = { line, set: setId };
      break;
    }
    case 7035: {
      const id = Math.max(0, toSafeInt(p.id, 0));
      const sailorPackage = info.sailorPackages.find((row) => row.id === id);
      const sailor = info.sailorList.find(row => row.id === id), rows = Object.values(getConfigRow('OldTrekSailorGiftConfig', id));
      if (!sailor || !sailorPackage || sailorPackage.expire <= Date.now() || !rows.length) { data = { result: 1, code: 'OLD_TREK_PACKAGE_LOCKED' }; break; }
      const rewards = [];
      for (const row of rows) if (row.star <= sailor.star && row.level > 0 && row.level <= 30 && !(sailorPackage.freeClaim & (1 << row.level-1))) {
        sailorPackage.freeClaim |= 1 << row.level-1; rewards.push(...ensureArray(row.rewards));
      }
      data = { result: 0, rewardInfo: oldTrekRewardInfo(player, rewards), sailorPackage };
      if (id > 0) pushPackets.push({ tag: 7011, msgUid: 0, data: { ...sailorPackage } });
      break;
    }
    case 7036: {
      const arena = !!p.arena;
      const currentSetId = arena ? info.arenaSetId : info.sailSetId;
      const setId = Math.max(0, toSafeInt(p.set, currentSetId));
      ensureSetLines(info, setId);
      if (arena) info.arenaSetId = setId;
      else info.sailSetId = setId;
      syncLegacySetInfo(info);
      data = { arena, set: setId };
      break;
    }
    case 7037: {
      const id = Math.max(0, toSafeInt(p.id, 0));
      const cfg = getSailorConfig(id);
      const base = ensureObject(configService.get('OldTrekBaseConfig'));
      const recallTable = ensureObject(base.recallCost);
      const recallCosts = ensureArray(recallTable[cfg.quality] || recallTable[String(cfg.quality)]);
      const alreadyOwned = info.sailorList.some((row) => row.id === id);
      const capacity = Math.max(0, toSafeInt(base.initialSailorNum, 20)) + oldTrekProgress.privilege(info, 1);
      if (!alreadyOwned && info.sailorList.filter((row) => getSailorConfig(row.id).type !== 0).length >= capacity) {
        data = { result: 1, code: 'OLD_TREK_SAILOR_CAPACITY', rewardInfo: buildRewardInfo() };
        break;
      }
      const paid = toSafeInt(cfg.id, 0) > 0 && !alreadyOwned && consumeItems(player, recallCosts);
      const sailor = paid ? buildSailor(id) : null;
      let slot = null;
      if (sailor) {
        info.sailorList.push(sailor);
        if (info.sailorAtlas[id] == null) info.sailorAtlas[id] = 0;
        slot = info.sailorSlotList.find((row) => row.sailorId <= 0) || null;
        if (slot) slot.sailorId = id;
      }
      data = { result: paid ? 0 : 1, rewardInfo: buildRewardInfo(), sailor, slot };
      break;
    }
    case 7038: {
      const setId = Math.max(0, toSafeInt(p.set, info.sailSetId));
      info.setMap[String(setId)] = normalizeSetLines(p.lineData);
      syncLegacySetInfo(info);
      data = { lineData: info.setMap[String(setId)], set: setId };
      break;
    }
    case 7040: {
      const destId = Math.max(1, toSafeInt(p.id, 1));
      const dest = ensureDestRecord(info, destId);
      taskRowsForDestination(destId).forEach((taskRow) => {
        const taskId = Math.max(0, toSafeInt(taskRow.id, 0));
        if (taskId > 0
          && taskRecordValue(info, taskRow) >= Math.max(0, toSafeInt(taskRow.taskValue1, 0))
          && !dest.taskClaimed.includes(taskId)) {
          dest.taskClaimed.push(taskId);
        }
      });
      dest.taskClaimed.sort((left, right) => left - right);
      data = { claimed: dest.taskClaimed.slice() };
      break;
    }
    case 7041: {
      const destId = Math.max(1, toSafeInt(p.id, 1));
      const dest = ensureDestRecord(info, destId);
      const taskTable = ensureObject(configService.get('OldTrekTaskConfig'));
      const rewardTable = getConfigRow('OldTrekTaskRewardConfig', destId);
      const score = calculateDestinationScore(dest, taskTable);
      const rewardRows = [];
      Object.keys(rewardTable).forEach((key) => {
        const row = ensureObject(rewardTable[key]);
        const subId = Math.max(0, toSafeInt(row.subId, toSafeInt(key, 0)));
        if (subId > 0 && score >= Math.max(0, toSafeInt(row.needScore, 0)) && !dest.rewardClaimed.includes(subId)) {
          dest.rewardClaimed.push(subId);
          rewardRows.push(...ensureArray(row.rewards));
        }
      });
      dest.rewardClaimed.sort((left, right) => left - right);
      data = {
        result: rewardRows.length > 0 ? 0 : 1,
        rewardClaimed: dest.rewardClaimed.slice(),
        rewards: rewardRows.length > 0 ? oldTrekRewardInfo(player, rewardRows) : buildRewardInfo(),
      };
      break;
    }
    case 7042: {
      const skin = Math.max(1, toSafeInt(p.id, info.skin));
      const canChange = info.shipSkins.includes(skin) && toSafeInt(getConfigRow('OldTrekShipDressConfig', skin).id, 0) === skin;
      if (canChange) info.skin = skin;
      data = { result: canChange ? 0 : 1, skin: info.skin };
      break;
    }
    case 7043: {
      const destId = Math.max(1, toSafeInt(p.id, 1));
      let dest = info.dest.find((row) => row.id === destId) || null;
      const cfg = getDestinationConfig(destId, 1);
      let unlocked = !!dest;
      if (!dest && toSafeInt(cfg.id, 0) > 0) {
        const costs = cfg.unlockItem ? [cfg.unlockItem] : [];
        if (consumeItems(player, costs)) {
          dest = ensureDestRecord(info, destId);
          unlocked = true;
        }
      }
      data = { result: unlocked ? 0 : 1, dest: dest || { id: destId, taskClaimed: [], rewardClaimed: [] } };
      break;
    }
    case 7044: {
      const id = Math.max(1, toSafeInt(p.id, 1));
      let passRecord = info.passRecords.find((row) => row.id === id);
      if (!passRecord) {
        passRecord = { id, buyRecord: 1, claimRecord: {} };
        info.passRecords.push(passRecord);
      }
      passRecord.claimRecord = ensureObject(passRecord.claimRecord);
      const passTable = getConfigRow('OldTrekPassConfig', id);
      const rewardRows = [];
      Object.keys(passTable).forEach((key) => {
        const row = ensureObject(passTable[key]);
        const level = Math.max(1, toSafeInt(row.level, toSafeInt(key, 1)));
        if (Number(info.taskRecord[100 * id + 5] || 0) < Math.max(0, toSafeInt(row.mileage, 0))) return;
        const oldClaim = Math.max(0, toSafeInt(passRecord.claimRecord[level], 0));
        let nextClaim = oldClaim;
        if ((oldClaim & 1) === 0) {
          rewardRows.push(...ensureArray(row.rewards));
          nextClaim |= 1;
        }
        if ((passRecord.buyRecord & 2) !== 0 && (oldClaim & 2) === 0) {
          rewardRows.push(...ensureArray(row.eRewards1));
          nextClaim |= 2;
        }
        if ((passRecord.buyRecord & 4) !== 0 && (oldClaim & 4) === 0) {
          rewardRows.push(...ensureArray(row.eRewards2));
          nextClaim |= 4;
        }
        passRecord.claimRecord[level] = nextClaim;
      });
      data = { passRecord, result: 0, rewards: oldTrekRewardInfo(player, rewardRows) };
      break;
    }
    case 7045: {
      const content = String(p.content || '').slice(0, 200);
      const chat = normalizeOldTrekChatRow({
        dbid: normalizePlayerDbid(player.playerId || session.userId, '1'),
        name: String(player.name || 'Player'),
        content,
        reply: ensureObject(p.reply),
        time: Date.now(),
      }, player);
      if (content) {
        info.chatList.push(chat);
        if (info.chatList.length > 100) info.chatList.splice(0, info.chatList.length - 100);
        pushPackets.push({ tag: 7008, msgUid: 0, data: chat });
      }
      data = { result: content ? 0 : 1 };
      break;
    }
    case 7046:
      return { tag, msgUid, data: await oldTrekArena.rank(player, false) };
    case 7047:
      info.name = String(p.name || info.name).slice(0, 32);
      data = { name: info.name, result: 0 };
      break;
    case 7048:
      if (Number(p.privilege) !== 3 || !info.sailInfo?.currentEvent?.enemy || oldTrekProgress.privilege(info, 3) <= Number(info.privilegeEffect[3] || 0)) { data = { result: 1, code: 'OLD_TREK_PRIVILEGE_LOCKED' }; break; }
      info.privilegeEffect[3] = Number(info.privilegeEffect[3] || 0) + 1;
      data = {
        effectTime: info.privilegeEffect[String(toSafeInt(p.privilege, 0))],
        enemy: ensureSailInfo(info).currentEvent && ensureSailInfo(info).currentEvent.enemy || null,
      };
      break;
    case 7049: {
      const target = await oldTrekArena.findProfile(player, p.dbid);
      data = target ? { ...oldTrekArena.profile(target, Number(p.arena) === 1), arena: Number(p.arena) }
        : { result: 1, code: 'OLD_TREK_PROFILE_NOT_FOUND' };
      break;
    }
    case 7050: {
      if (info.stage !== 2) { data = { result: 1, code: 'OLD_TREK_ARENA_CLOSED' }; break; }
      if (oldTrekArena.teams(player).length !== 3) { data = { result: 1, code: 'OLD_TREK_FORMATION_EMPTY' }; break; }
      if (Number(info.arenaMatchAt || 0) + 3000 > Date.now()) { data = { result: 1, code: 'OLD_TREK_MATCH_COOLDOWN' }; break; }
      const snapshot = await oldTrekArena.match(player);
      if (!consumeItems(player, [ensureObject(configService.get('OldTrekBaseConfig').arenaSearchCost)])) { data = { result: 1, code: 'OLD_TREK_COST_NOT_ENOUGH' }; break; }
      info.arenaMatch = snapshot;
      info.arenaEnemy = snapshot.profile; info.arenaMatchAt = Date.now();
      data = { enemy: snapshot.profile };
      break;
    }
    case 7051: {
      const targetId = String(typeof p.enemy === 'object' ? p.enemy.dbid : p.enemy || '');
      const snapshot = info.arenaMatch;
      if (info.stage !== 2 || !snapshot || snapshot.expiresAt < Date.now() || snapshot.profile.dbid !== targetId) {
        data = { result: 1, code: 'OLD_TREK_ARENA_TARGET_STALE' }; break;
      }
      const battleResult = oldTrekArena.battle(player, snapshot.opponent);
      if (!consumeItems(player, [ensureObject(configService.get('OldTrekBaseConfig').arenaCost)])) {
        data = { result: 1, code: 'OLD_TREK_COST_NOT_ENOUGH' }; break;
      }
      const oldScore = oldTrekArena.score(player), enemyScore = oldTrekArena.score(snapshot.opponent);
      const scoreChange = oldTrekArena.ratingChange(oldScore, enemyScore, battleResult.win === 1);
      player.oldTrekArenaScore = Math.max(0, oldScore + scoreChange);
      info.arenaPlayed = Number(info.arenaPlayed || 0) + 1;
      const base = configService.get('OldTrekBaseConfig');
      const rewardInfo = oldTrekRewardInfo(player, battleResult.win ? base.arenaReward : base.arenaFailReward);
      const recordId = snapshot.uid, logTime = Math.max(Date.now(), Number(info.arenaLogUid || 0) + 1);
      info.battleRecords[recordId] = battleResult;
      for (const old of Object.keys(info.battleRecords).slice(0, -100)) delete info.battleRecords[old];
      info.arenaBattleLogs = info.arenaBattleLogs.concat({ logTime, recordId, dbid: targetId, win: battleResult.win, revenge: 0 }).slice(-100);
      info.arenaLogUid = logTime; info.arenaMatch = null; info.arenaEnemy = null;
      info.maxGrade = Math.max(Number(info.maxGrade || 1), oldTrekArena.grade(player.oldTrekArenaScore));
      const rank = (await oldTrekArena.rank(player, true)).rank;
      data = { battleResult, enemyScore, enemyScoreChange: 0, rank, rewardInfo, score: player.oldTrekArenaScore, scoreChange };
      break;
    }
    case 7052:
      return { tag, msgUid, data: await oldTrekArena.rank(player, true) };
    case 7053: {
      const grade = arenaGradeForScore(getArenaScore(player));
      const gradeTable = ensureObject(configService.get('OldTrekArenaScoreConfig'));
      const rewardRows = [];
      for (let current = 1; current <= grade; current += 1) {
        const bit = 1 << (current - 1);
        if ((info.arenaGradeReward & bit) === 0) {
          rewardRows.push(...ensureArray(ensureObject(gradeTable[current] || gradeTable[String(current)]).firstRewards));
          info.arenaGradeReward |= bit;
        }
      }
      data = { record: info.arenaGradeReward, rewardInfo: oldTrekRewardInfo(player, rewardRows) };
      break;
    }
    case 7054:
      data = { logs: ensureArray(info.arenaBattleLogs) };
      break;
    case 7059: {
      const rank = await oldTrekArena.rank(player, true), grade = oldTrekArena.grade(rank.score);
      return { tag, msgUid, data: { result: 0, arenaEnemy: info.arenaMatch?.expiresAt > Date.now() ? info.arenaEnemy : null,
        weather: 1, arenaScore: rank.score, arenaRank: rank.rank, arenaGrade: grade,
        maxGrade: Math.max(grade, Number(info.maxGrade || 1)), arenaBattleLogs: info.arenaBattleLogs, arenaGradeReward: info.arenaGradeReward } };
    }
    case 7060: {
      const target = await oldTrekArena.findProfile(player, typeof p.enemy === 'object' ? p.enemy.dbid : p.enemy);
      if (!target) { data = { result: 1, code: 'OLD_TREK_PROFILE_NOT_FOUND' }; break; }
      const recordId = crypto.randomBytes(12).toString('hex'), battleResult = oldTrekArena.battle(player, target);
      info.battleRecords[recordId] = battleResult;
      data = { result: 0, battleResult, recordId };
      break;
    }
    case 7061:
      data = { result: 0 };
      break;
    case 7062: {
      const battleResult = info.battleRecords[String(p.recordId || '')];
      return { tag, msgUid, data: battleResult ? { result: 0, battleResult } : { result: 1, code: 'OLD_TREK_RECORD_NOT_FOUND' } };
    }
    case 7063:
      data = { items: ensureArray(info.monumentItems) };
      break;
    case 7064: {
      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      if (info.prayDate !== today) {
        info.pray = 0;
        info.prayDate = today;
      }
      if (info.pray > 0) {
        data = { result: 1, pray: info.pray, rewards: buildRewardInfo() };
        break;
      }
      info.pray = 1;
      const base = ensureObject(configService.get('OldTrekBaseConfig'));
      data = { result: 0, pray: info.pray, rewards: oldTrekRewardInfo(player, [ensureObject(base.monumentRewards)]) };
      break;
    }
    case 7065: {
      const cached = ensureObject(info.lastEndCache);
      const cache = { ...cached, rewards: ensureArray(cached.cache && cached.cache.rewards) };
      delete cache.cache;
      data = {
        cabin: ensureArray(cached.cabin),
        cache,
        diff: Math.max(0, toSafeInt(cached.diff, 0)),
        exp: Math.max(0, toSafeInt(cached.exp, info.exp)),
        first: ensureArray(cached.first),
        id: Math.max(0, toSafeInt(cached.id, 0)),
        lv: Math.max(1, toSafeInt(cached.lv, info.lv)),
        roundScore: Math.max(0, toSafeInt(cached.roundScore, 0)),
      };
      info.endCache = false;
      break;
    }
    default:
      break;
  }
  const response = { tag, msgUid, data };
  if (data.result != null && data.result !== 0) return response;
  if ([7022,7029,7034,7038].includes(tag)) {
    const code = oldTrekProgress.validateLines(info, Number(p.set ?? info.sailSetId), info.setMap[p.set ?? info.sailSetId]);
    if (code) return { tag, msgUid, data: { result: 1, code } };
  }
  const packets = pushPackets.length > 0 ? [response, ...pushPackets] : response;
  await saveOldTrek(session, packets);
  return packets;
}

async function saveOldTrek(session, response) {
  // PlayerService mirrors currencies only in its cloned DB snapshot. Mirror the
  // session too so the next exact economy CAS does not compare stale item 1/2/6.
  require('../services/CurrencySync').syncCurrencyItems(session.player);
  const info = session.player.other_attr_info.oldTrekInfo;
  // Keep the wire response separate from the durable action-ledger snapshot.
  // The ledger must not share the object later mutated with the final
  // revision/msgUid; otherwise the next retry can compare a different
  // preimage than the one committed by the CAS save.
  const ledgerResponse = response == null ? response : JSON.parse(JSON.stringify(response));
  if (ledgerResponse) {
    info.stateRevision = Math.max(Number(info.stateRevision || 0), Number(session.oldTrekCAS?.oldTrekInfo?.stateRevision || 0) + 1);
    for (const packet of Array.isArray(ledgerResponse) ? ledgerResponse : [ledgerResponse]) if (packet.msgUid) packet.data.revision = info.stateRevision;
  }
  if (session.oldTrekRequest && ledgerResponse) {
    info.actionLedger = ensureArray(info.actionLedger).concat({ ...session.oldTrekRequest, response: ledgerResponse, at: Date.now() }).slice(-128);
  }
  const saved = await playerService.savePlayer(session.userId, session.player, { returnSaved: false, oldTrekCAS: session.oldTrekCAS });
  if (!saved) throw Error('OLD_TREK_SAVE_NOT_CONFIRMED');
  session.oldTrekSaved = true;
  const before = session.oldTrekCAS?.items || {}, after = session.player.items || {};
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => Number(before[key] || 0) !== Number(after[key] || 0));
  session.oldTrekSyncPackets = ids.length ? [{ tag: 1202, msgUid: 0, data: { result: 0,
    items: ids.map(key => ({ id: Number(key), count: Number(after[key] || 0) - Number(before[key] || 0) })),
    changed: ids.map(key => ({ id: Number(key), count: Number(after[key] || 0) })),
  } }] : [];
  const beforeTasks = session.oldTrekCAS?.oldTrekInfo?.taskRecord || {};
  if (JSON.stringify(beforeTasks) !== JSON.stringify(info.taskRecord)) session.oldTrekSyncPackets.push({ tag: 7003, msgUid: 0, data: { taskUpdate: info.taskRecord } });
  const oldInfo = session.oldTrekCAS?.oldTrekInfo || {};
  if (oldInfo.lv !== info.lv || oldInfo.exp !== info.exp) session.oldTrekSyncPackets.push({ tag: 7001, msgUid: 0, data: { lv: info.lv, exp: info.exp } });
  return saved;
}

function guardedTravel(handler, tag) {
  return async function (params, session, msgUid) {
    if (!session || !session.player) return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_SESSION_REQUIRED' } };
    return playerMutation.run(session.userId, async () => {
      if (!session.player) return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_SESSION_REQUIRED' } };
      const before = session.player, expected = {};
      for (const key of ['oldTrekInfo', 'items', 'currencies']) {
        const value = key === 'oldTrekInfo' ? before.other_attr_info?.oldTrekInfo : before[key];
        if (value !== undefined) expected[key] = JSON.parse(JSON.stringify(value));
      }
      const requestId = params && params.requestId;
      if (requestId != null && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))) return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_REQUEST_INVALID' } };
      const fingerprint = JSON.stringify({ tag, params: { ...params, requestId: undefined } });
      const request = requestId ? { key: `${tag}:${requestId}`, fingerprint } : null;
      const receipt = request && ensureArray(before.other_attr_info?.oldTrekInfo?.actionLedger).find(r => r.key === request.key);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_REQUEST_CONFLICT' } };
        const result = JSON.parse(JSON.stringify(receipt.response));
        for (const packet of Array.isArray(result) ? result : [result]) if (packet.msgUid) packet.msgUid = msgUid;
        return result;
      }
      if (params && params.revision != null && Number(params.revision) !== Number(before.other_attr_info?.oldTrekInfo?.stateRevision || 0)) return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_REVISION_STALE', revision: before.other_attr_info?.oldTrekInfo?.stateRevision || 0 } };
      const candidate = { ...session, player: JSON.parse(JSON.stringify(before)), oldTrekCAS: expected, oldTrekRequest: request };
      delete candidate.oldTrekSaved;
      delete candidate.oldTrekSyncPackets;
      try {
        const result = await handler(params, candidate, msgUid);
        const response = Array.isArray(result) ? result[0] : result;
        if ((response.data.result == null || response.data.result === 0) && !candidate.oldTrekSaved && JSON.stringify(candidate.player.other_attr_info?.oldTrekInfo) !== JSON.stringify(expected.oldTrekInfo)) await saveOldTrek(candidate, result);
        response.data.revision = candidate.player.other_attr_info?.oldTrekInfo?.stateRevision || 0;
        if (response.data.result == null || response.data.result === 0) session.player = candidate.player;
        return candidate.oldTrekSyncPackets?.length ? [...(Array.isArray(result) ? result : [result]), ...candidate.oldTrekSyncPackets] : result;
      } catch (error) {
        // Save may have committed before the connection failed. Require relog;
        // never allow socket-close to persist a stale rollback over the receipt.
        session.player = null;
        return { tag, msgUid, data: { result: 1, code: 'OLD_TREK_SAVE_UNKNOWN', retryable: true } };
      }
    });
  };
}
const guardedInfo = guardedTravel(handleOldTrekInfo, 7000);
async function dispatchOldTrekAction(tag, params, session, msgUid) {
  return guardedTravel((p, s, m) => handleOldTrekAction(tag, p, s, m), tag)(params, session, msgUid);
}

module.exports = {
  ensureOldTrekInfo,
  buildSailor,
  buildBlessGiftUpdate,
  buildEventUpdatePush,
  handleOldTrekInfo: guardedInfo,
  handleOldTrekRefreshSailor: guardedTravel(handleOldTrekRefreshSailor, 7020),
  handleOldTrekHireSailor: guardedTravel(handleOldTrekHireSailor, 7021),
  handleOldTrekAction: dispatchOldTrekAction,
};
