'use strict';

// TopArena state contract used by the server and by RAM-only verification.
// This module deliberately does not mutate a player, database, Redis or socket.
// The existing arena handler can adopt it in a separate, reviewed change.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE_DAYS = 7;
const DEFAULT_TZ_OFFSET_MINUTES = 7 * 60;
const DEFAULT_ROUND_FIGHT_TIME = [72000, 72300, 72600];

const STAGES = Object.freeze({
  CLOSED: 0,
  AUDITION: 1,
  BRACKET_512: 2,
  BRACKET_64: 3,
  BRACKET_8_PREP: 4,
  BRACKET_8_BATTLE: 5,
  SETTLEMENT: 6,
});

const STAGE_PHASES = Object.freeze({
  [STAGES.CLOSED]: 'closed',
  [STAGES.AUDITION]: 'audition',
  [STAGES.BRACKET_512]: 'bracket512',
  [STAGES.BRACKET_64]: 'bracket64',
  [STAGES.BRACKET_8_PREP]: 'bracket8Prep',
  [STAGES.BRACKET_8_BATTLE]: 'bracket8Battle',
  [STAGES.SETTLEMENT]: 'settlement',
});

// Native client Room_Config. ConfigService does not decode this client constant
// into a server table, so keep the small protocol contract here. An injected
// roomConfig always takes precedence and is validated before use.
const DEFAULT_ROOM_CONFIG = Object.freeze({
  512: Object.freeze({ peopleNum: 512, roomCount: 64, battleCount: 9 }),
  64: Object.freeze({ peopleNum: 64, roomCount: 8, battleCount: 6 }),
  8: Object.freeze({ peopleNum: 8, roomCount: 1, battleCount: 3 }),
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(value, fallback = 0) {
  const n = finiteNumber(value, fallback);
  return Number.isSafeInteger(n) ? n : Math.trunc(n);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positiveMs(value, fallback = 0) {
  const n = finiteNumber(value, fallback);
  return n > 0 ? Math.trunc(n) : fallback;
}

function valuesOf(table) {
  if (!isObject(table)) return [];
  const source = isObject(table.data) ? table.data : table;
  return Object.values(source).filter(isObject);
}

function keyValue(table, key) {
  if (!isObject(table)) return undefined;
  const source = isObject(table.data) ? table.data : table;
  return source[key] || source[String(key)];
}

function validCycle(cycle) {
  if (!isObject(cycle)) return null;
  const startTime = positiveMs(cycle.startTime);
  const fallbackEnd = startTime + DEFAULT_CYCLE_DAYS * DAY_MS;
  const endTime = positiveMs(cycle.endTime, fallbackEnd);
  if (!startTime || endTime <= startTime) return null;
  return { ...cycle, startTime, endTime };
}

function selectOpenConfig(openConfig, cycle) {
  if (isObject(cycle?.matchConfig)) return { ...cycle.matchConfig };
  const requested = cycle?.matchId ?? cycle?.id;
  const direct = requested != null && keyValue(openConfig, requested);
  if (direct) return { ...direct };
  const rows = valuesOf(openConfig)
    .filter(row => positiveMs(row.startTime) && positiveMs(row.endTime))
    .sort((a, b) => safeInt(a.id, 0) - safeInt(b.id, 0));
  return rows.length ? { ...rows[0] } : null;
}

function translatedTime(row, key, startTime, endTime, fallbackOffset) {
  const sourceStart = positiveMs(row?.startTime, startTime);
  const sourceValue = finiteNumber(row?.[key], NaN);
  const offset = Number.isFinite(sourceValue) && Number.isFinite(sourceStart)
    ? sourceValue - sourceStart
    : fallbackOffset;
  const value = startTime + Math.max(0, Math.trunc(Number.isFinite(offset) ? offset : fallbackOffset));
  return clamp(value, startTime, endTime);
}

function normalizeRoomConfig(roomConfig) {
  const source = isObject(roomConfig?.data) ? roomConfig.data : roomConfig;
  const out = {};
  const candidateKeys = new Set([...Object.keys(DEFAULT_ROOM_CONFIG), ...Object.keys(source || {})]);
  for (const key of candidateKeys) {
    const fallback = DEFAULT_ROOM_CONFIG[key];
    const row = isObject(source?.[key]) ? source[key] : fallback;
    if (!row) continue;
    const peopleNum = safeInt(row.peopleNum, fallback?.peopleNum || 0);
    const roomCount = safeInt(row.roomCount, fallback?.roomCount || 0);
    const battleCount = safeInt(row.battleCount, fallback?.battleCount || 0);
    if (peopleNum > 0 && roomCount > 0) out[String(key)] = { peopleNum, roomCount, battleCount };
  }
  return out;
}

function roundSchedule(matchMode, roomConfig) {
  const rooms = normalizeRoomConfig(roomConfig);
  let mode = Math.max(1, safeInt(matchMode, 0));
  const rounds = [];
  let round = 0;
  while (mode >= 8 && rounds.length < 16) {
    const row = rooms[String(mode)] || {};
    rounds.push({
      round,
      matchMode: mode,
      peopleNum: Math.max(0, safeInt(row.peopleNum, mode)),
      roomCount: Math.max(0, safeInt(row.roomCount, 0)),
      battleCount: Math.max(0, safeInt(row.battleCount, 0)),
    });
    mode = Math.max(1, Math.round(mode / 8));
    round += 1;
  }
  return rounds;
}

function localDayStart(timestamp, offsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const offset = safeInt(offsetMinutes, DEFAULT_TZ_OFFSET_MINUTES) * 60 * 1000;
  return Math.floor((timestamp + offset) / DAY_MS) * DAY_MS - offset;
}

function firstFightAt(roundStart, baseConfig, offsetMinutes) {
  const fightTimes = Array.isArray(baseConfig?.roundFightTime) && baseConfig.roundFightTime.length
    ? baseConfig.roundFightTime
    : DEFAULT_ROUND_FIGHT_TIME;
  const seconds = Math.max(0, safeInt(fightTimes[0], DEFAULT_ROUND_FIGHT_TIME[0]));
  let candidate = localDayStart(roundStart, offsetMinutes) + seconds * 1000;
  // round starts are expressed as promotionStart + N days. If promotion is
  // later than the configured daily fight slot, the first battle is tomorrow,
  // not immediately at round start and not in the past.
  while (candidate < roundStart) candidate += DAY_MS;
  return candidate;
}

function passRows(passConfig, matchMode) {
  const source = isObject(passConfig?.data) ? passConfig.data : passConfig;
  const mode = source?.[matchMode] || source?.[String(matchMode)] || {};
  return Object.values(mode).filter(isObject).map(row => ({
    id: safeInt(row.id, safeInt(matchMode, 0)),
    day: Math.max(1, safeInt(row.day, 0)),
    rewards: Array.isArray(row.rewards) ? row.rewards.map(item => ({ ...item })) : [],
    eRewards: Array.isArray(row.eRewards) ? row.eRewards.map(item => ({ ...item })) : [],
  })).filter(row => row.day > 0).sort((a, b) => a.day - b.day);
}

function normalizePassRecord(value, passConfig, matchMode) {
  const rows = passRows(passConfig, matchMode);
  const knownDays = new Set(rows.map(row => String(row.day)));
  const out = {};
  const legacy = {};
  if (isObject(value)) {
    for (const [key, raw] of Object.entries(value)) {
      const day = safeInt(key, 0);
      if (day > 0 && Number.isFinite(Number(raw))) {
        const bitmask = clamp(safeInt(raw, 0), 0, 7);
        if (knownDays.has(String(day))) out[String(day)] = bitmask;
        else legacy[key] = bitmask;
      }
    }
  } else if (value != null && Number.isFinite(Number(value))) {
    // Older server responses used a scalar counter. Do not guess which pass
    // day it represented; retain it beside the native map for audit/rollback.
    legacy.scalar = Math.max(0, safeInt(value, 0));
  }
  return { record: out, legacy };
}

function normalizePlayerInfo(playerInfo, options = {}) {
  const source = isObject(playerInfo) ? playerInfo : {};
  const out = { ...source };
  const maxRound = Math.max(0, safeInt(options.maxRound, 0));
  const rawRound = source.round == null ? -1 : safeInt(source.round, -1);
  out.round = clamp(rawRound, -1, maxRound);
  out.pass = source.pass === true || safeInt(source.pass, 0) > 0 ? 1 : 0;
  const normalized = normalizePassRecord(source.passRecord, options.passConfig, options.matchMode);
  out.passRecord = normalized.record;
  if (Object.keys(normalized.legacy).length) {
    out.legacyPassRecord = { ...normalized.legacy };
  } else if (Object.prototype.hasOwnProperty.call(out, 'legacyPassRecord')) {
    delete out.legacyPassRecord;
  }
  return out;
}

function buildTimeline(options = {}) {
  const cycle = validCycle(options.cycle);
  const row = selectOpenConfig(options.openConfig, cycle) || {};
  const startTime = cycle?.startTime || positiveMs(row.startTime);
  const endTime = cycle?.endTime || positiveMs(row.endTime, startTime + DEFAULT_CYCLE_DAYS * DAY_MS);
  const normalizedCycle = cycle || { startTime, endTime, key: '', index: 0 };
  const promotionStartTime = translatedTime(row, 'promotionStartTime', startTime, endTime, 2 * DAY_MS);
  const attrsLockTime = translatedTime(row, 'attrsLockTime', startTime, endTime, 4 * DAY_MS);
  const gamePassStartTime = translatedTime(row, 'gamePassStartTime', startTime, endTime, DAY_MS);
  const settleTime = translatedTime(row, 'settleTime', startTime, endTime, 6 * DAY_MS);
  const matchMode = Math.max(1, safeInt(row.matchMode, 512));
  const rounds = roundSchedule(matchMode, options.roomConfig || DEFAULT_ROOM_CONFIG);
  const roundStarts = rounds.map(item => ({
    ...item,
    startTime: clamp(promotionStartTime + item.round * DAY_MS, startTime, endTime),
  }));
  const round2 = roundStarts.find(item => item.round === 2) || roundStarts[roundStarts.length - 1];
  const nominalBattleStart = round2 ? firstFightAt(round2.startTime, options.baseConfig, options.timezoneOffsetMinutes) : settleTime;
  const battleStartTime = clamp(Math.max(round2?.startTime || promotionStartTime, nominalBattleStart), startTime, endTime);
  const settlementStartTime = clamp(Math.max(settleTime, battleStartTime), startTime, endTime);
  const maxRound = Math.max(0, rounds.length);
  return {
    ...normalizedCycle,
    startTime,
    endTime,
    matchId: safeInt(row.id, safeInt(normalizedCycle.matchId, normalizedCycle.index + 10000)),
    matchMode,
    area: safeInt(row.area, 1),
    promotionStartTime,
    gamePassStartTime,
    attrsLockTime,
    settleTime: settlementStartTime,
    battleStartTime,
    rounds: roundStarts,
    maxRound,
    openConfig: { ...row, startTime, endTime, promotionStartTime, gamePassStartTime, attrsLockTime, settleTime: settlementStartTime },
  };
}

function stageAt(timeline, now = Date.now()) {
  if (!timeline || now < timeline.startTime || now >= timeline.endTime) {
    return { stage: STAGES.CLOSED, phase: STAGE_PHASES[STAGES.CLOSED], round: -1, active: false };
  }
  if (now < timeline.promotionStartTime) {
    return { stage: STAGES.AUDITION, phase: STAGE_PHASES[STAGES.AUDITION], round: 0, active: true };
  }
  const round1Start = timeline.rounds.find(row => row.round === 1)?.startTime || timeline.promotionStartTime;
  const round2Start = timeline.rounds.find(row => row.round === 2)?.startTime || timeline.battleStartTime;
  if (now < round1Start) {
    return { stage: STAGES.BRACKET_512, phase: STAGE_PHASES[STAGES.BRACKET_512], round: 0, active: true };
  }
  if (now < round2Start) {
    return { stage: STAGES.BRACKET_64, phase: STAGE_PHASES[STAGES.BRACKET_64], round: 1, active: true };
  }
  if (now < timeline.battleStartTime) {
    return { stage: STAGES.BRACKET_8_PREP, phase: STAGE_PHASES[STAGES.BRACKET_8_PREP], round: 2, active: true };
  }
  if (now < timeline.settleTime) {
    return { stage: STAGES.BRACKET_8_BATTLE, phase: STAGE_PHASES[STAGES.BRACKET_8_BATTLE], round: 2, active: true };
  }
  return { stage: STAGES.SETTLEMENT, phase: STAGE_PHASES[STAGES.SETTLEMENT], round: timeline.maxRound, active: true };
}

function buildTopArenaState(options = {}) {
  const timeline = buildTimeline(options);
  const phase = stageAt(timeline, options.now == null ? Date.now() : options.now);
  const playerInfo = normalizePlayerInfo(options.playerInfo, {
    // `info.round` has a terminal value after the last bracket, while the
    // native playerInfo.round is a bracket index (0=512, 1=64, 2=8).
    maxRound: Math.max(0, timeline.maxRound - 1),
    passConfig: options.passConfig,
    matchMode: timeline.matchMode,
  });
  const pass = passRows(options.passConfig, timeline.matchMode);
  return {
    result: 0,
    cycleKey: timeline.key || '',
    season: safeInt(timeline.index, 0) + 1,
    matchId: timeline.matchId,
    stage: phase.stage,
    phase: phase.phase,
    round: phase.round,
    active: phase.active,
    startTime: timeline.startTime,
    endTime: timeline.endTime,
    gamePassStartTime: timeline.gamePassStartTime,
    attrsLockTime: timeline.attrsLockTime,
    battleStartTime: timeline.battleStartTime,
    settleTime: timeline.settleTime,
    maxRound: timeline.maxRound,
    matchMode: timeline.matchMode,
    rounds: timeline.rounds,
    passDays: pass.map(row => row.day),
    playerInfo,
  };
}

function loadTopArenaTables(configService) {
  const config = configService || require('./ConfigService');
  return {
    openConfig: config.get('TopArenaOpenConfig') || {},
    passConfig: config.get('TopArenaPassConfig') || {},
    baseConfig: config.get('TopArenaBaseConfig') || {},
    roomConfig: config.get('TopArenaRoomConfig') || DEFAULT_ROOM_CONFIG,
  };
}

module.exports = {
  DAY_MS,
  STAGES,
  STAGE_PHASES,
  DEFAULT_ROOM_CONFIG,
  DEFAULT_ROUND_FIGHT_TIME,
  normalizeRoomConfig,
  roundSchedule,
  passRows,
  normalizePassRecord,
  normalizePlayerInfo,
  buildTimeline,
  stageAt,
  buildTopArenaState,
  loadTopArenaTables,
};
