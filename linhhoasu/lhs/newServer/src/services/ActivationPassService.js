'use strict';

const configService = require('./ConfigService');

const ACTIVITY_TYPE = 7;
const DEFAULT_STAGE = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_PASS_PAY_IDS = new Set([10301]);

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.floor(number);
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getTable(name) {
  try {
    return ensureObject(configService.get(name));
  } catch (_error) {
    return {};
  }
}

function getRow(table, id) {
  const safeId = Math.max(0, toSafeInt(id, 0));
  if (safeId <= 0) return null;
  return ensureObject(table)[safeId] || ensureObject(table)[String(safeId)] || null;
}

function getActivityMeta(activityId) {
  return getRow(getTable('ActivityConfig'), activityId);
}

function getActivityTypeRow(activityId, stage = DEFAULT_STAGE) {
  const stages = getRow(getTable('Activity7TypeConfig'), activityId);
  return getRow(stages, stage);
}

function getActivityPayId(activityId, stage = DEFAULT_STAGE) {
  const row = getActivityTypeRow(activityId, stage);
  return Math.max(0, toSafeInt(row && row.rechargeId, 0));
}

function getCycleDurationMs(activityId, stage = DEFAULT_STAGE) {
  const row = getActivityTypeRow(activityId, stage);
  return Math.max(1, toSafeInt(row && row.day, 7)) * DAY_MS;
}

function getMaxScore(activityId, stage = DEFAULT_STAGE) {
  const stages = getRow(getTable('Activity7Config'), activityId);
  const rewards = getRow(stages, stage);
  const values = Object.values(ensureObject(rewards))
    .map((row) => Math.max(0, toSafeInt(row && row.param, 0)));
  return values.length > 0 ? Math.max.apply(Math, values) : 600;
}

function activityConditionsMet(player, meta) {
  return ensureArray(meta && meta.conditions).every(function (condition) {
    const type = toSafeInt(condition && condition.type, 0);
    const target = toSafeInt(condition && condition.value, 0);
    const operator = toSafeInt(condition && condition.cond, 0);
    if (type !== 3) return false;
    const current = Math.max(1, toSafeInt(player && player.level, 1));
    if (operator === 0) return current === target;
    if (operator === 1) return current < target;
    if (operator === 2) return current <= target;
    if (operator === 3) return current > target;
    if (operator === 4) return current >= target;
    return false;
  });
}

function listCandidates(payId = 0) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  return Object.values(getTable('ActivityConfig'))
    .filter((meta) => meta && toSafeInt(meta.activityType, 0) === ACTIVITY_TYPE)
    .map((meta) => {
      const id = Math.max(0, toSafeInt(meta.id, 0));
      const typeRow = getActivityTypeRow(id, DEFAULT_STAGE);
      return {
        id,
        meta,
        stage: DEFAULT_STAGE,
        typeRow,
        payId: Math.max(0, toSafeInt(typeRow && typeRow.rechargeId, 0)),
      };
    })
    .filter((entry) => (
      entry.id > 0
      && entry.typeRow
      && ACTIVATION_PASS_PAY_IDS.has(entry.payId)
      && (requestedPayId <= 0 || entry.payId === requestedPayId)
    ));
}

function isActivationPassPayId(payId) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  return requestedPayId > 0 && listCandidates(requestedPayId).length > 0;
}

function normalizeRecordList(value) {
  return Array.from(new Set(ensureArray(value)
    .map((entry) => Math.max(0, toSafeInt(entry, 0)))
    .filter((entry) => entry > 0)))
    .sort((left, right) => left - right);
}

function normalizeRecords(value) {
  const source = ensureObject(value);
  const out = {};
  Object.keys(source).forEach((key) => {
    const point = Math.max(0, toSafeInt(key, 0));
    const state = Math.max(0, toSafeInt(source[key], 0));
    if (state > 0) out[point] = state;
  });
  return out;
}

function hasRechargeRecord(player, payId) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  return requestedPayId > 0 && ensureArray(player && player.rechargeInfo && player.rechargeInfo.records)
    .some((row) => (
      toSafeInt(row && row.id, 0) === requestedPayId
      && toSafeInt(row && row.count, 0) > 0
    ));
}

function chooseCandidate(player, payId = 0) {
  const area = Math.max(1, toSafeInt(player && player.rechargeInfo && player.rechargeInfo.area, 1));
  const candidates = listCandidates(payId).filter((entry) => activityConditionsMet(player, entry.meta));
  return candidates.find((entry) => toSafeInt(entry.meta && entry.meta.area, 0) === area)
    || candidates.find((entry) => toSafeInt(entry.meta && entry.meta.area, 0) === 1)
    || candidates[0]
    || null;
}

function createRow(candidate, player, now) {
  const currentPoint = Math.max(0, toSafeInt(player && player.items && player.items[19], 0));
  const duration = getCycleDurationMs(candidate.id, candidate.stage);
  return {
    id: candidate.id,
    module: 0,
    index: 0,
    param: 0,
    record: candidate.stage,
    status: 0,
    startTime: now,
    endTime: now + duration,
    score: Math.min(getMaxScore(candidate.id, candidate.stage), currentPoint),
    recordList: [],
    records: {},
    buyRecords: {},
    extra: {},
  };
}

function initializeMetadata(row, candidate, player, now) {
  const currentPoint = Math.max(0, toSafeInt(player && player.items && player.items[19], 0));
  const duration = getCycleDurationMs(candidate.id, candidate.stage);
  row.extra = ensureObject(row.extra);
  row.extra.activationPass = {
    version: 1,
    cycleIndex: 0,
    cycleStartTime: now,
    cycleEndTime: now + duration,
    lastActivityPoint: currentPoint,
    migratedAt: now,
    legacyEntitlementMigratedAt: now,
  };
  if (hasRechargeRecord(player, candidate.payId) && !row.recordList.includes(candidate.payId)) {
    row.recordList.push(candidate.payId);
    row.recordList.sort((left, right) => left - right);
    row.extra.activationPass.legacyEntitlementPayId = candidate.payId;
  }
  return row.extra.activationPass;
}

function rolloverCycle(row, candidate, player, now, metadata) {
  const duration = getCycleDurationMs(candidate.id, candidate.stage);
  let startTime = Math.max(0, toSafeInt(metadata.cycleStartTime, 0));
  let endTime = Math.max(0, toSafeInt(metadata.cycleEndTime, 0));
  if (startTime <= 0 || endTime <= startTime) {
    startTime = now;
    endTime = now + duration;
  }
  if (now < endTime) return false;

  const elapsed = Math.max(1, Math.floor((now - startTime) / duration));
  const currentPoint = Math.max(0, toSafeInt(player && player.items && player.items[19], 0));
  startTime += elapsed * duration;
  endTime = startTime + duration;
  metadata.cycleIndex = Math.max(0, toSafeInt(metadata.cycleIndex, 0)) + elapsed;
  metadata.cycleStartTime = startTime;
  metadata.cycleEndTime = endTime;
  metadata.lastActivityPoint = currentPoint;
  metadata.rolledOverAt = now;
  delete metadata.entitledAt;
  delete metadata.entitledCycleIndex;
  delete metadata.entitledPayId;
  row.module = 0;
  row.index = 0;
  row.param = 0;
  row.record = candidate.stage;
  row.status = 0;
  row.score = 0;
  row.recordList = [];
  row.records = {};
  row.buyRecords = {};
  return true;
}

function syncActivityPoint(row, candidate, player, metadata) {
  const currentPoint = Math.max(0, toSafeInt(player && player.items && player.items[19], 0));
  const previousPoint = Math.max(0, toSafeInt(metadata.lastActivityPoint, currentPoint));
  const delta = currentPoint >= previousPoint ? currentPoint - previousPoint : currentPoint;
  if (delta > 0) {
    row.score = Math.min(
      getMaxScore(candidate.id, candidate.stage),
      Math.max(0, toSafeInt(row.score, 0)) + delta
    );
  }
  metadata.lastActivityPoint = currentPoint;
  return delta;
}

function ensureActivationPassState(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const now = Math.max(0, toSafeInt(options.now, Date.now()));
  const payId = Math.max(0, toSafeInt(options.payId, 0));
  const candidate = chooseCandidate(player, payId);
  if (!candidate) return null;

  player.activityInfo = ensureObject(player.activityInfo);
  const info = player.activityInfo;
  info.datas = ensureArray(info.datas);
  info.disabledEntryIds = ensureArray(info.disabledEntryIds);
  const disabled = new Set(info.disabledEntryIds.map((value) => Math.max(0, toSafeInt(value, 0))));
  if (disabled.has(candidate.id)) return null;

  const candidateIds = new Set(listCandidates().map((entry) => entry.id));
  info.datas = info.datas.filter((entry) => {
    const id = Math.max(0, toSafeInt(entry && entry.id, 0));
    return !candidateIds.has(id) || id === candidate.id;
  });
  let row = info.datas.find((entry) => toSafeInt(entry && entry.id, 0) === candidate.id);
  const created = !row;
  if (!row) {
    row = createRow(candidate, player, now);
    info.datas.push(row);
  }

  const before = JSON.stringify(row);
  row.id = candidate.id;
  row.module = Math.max(0, toSafeInt(row.module, 0));
  row.index = Math.max(0, toSafeInt(row.index, 0));
  row.param = toSafeInt(row.param, 0);
  row.record = candidate.stage;
  row.status = Math.max(0, toSafeInt(row.status, 0));
  row.score = Math.min(
    getMaxScore(candidate.id, candidate.stage),
    Math.max(0, toSafeInt(row.score, 0))
  );
  row.recordList = normalizeRecordList(row.recordList);
  row.records = normalizeRecords(row.records);
  row.buyRecords = ensureObject(row.buyRecords);
  row.extra = ensureObject(row.extra);

  let metadata = ensureObject(row.extra.activationPass);
  const migrated = toSafeInt(metadata.version, 0) !== 1;
  if (migrated) metadata = initializeMetadata(row, candidate, player, now);
  const rolledOver = migrated ? false : rolloverCycle(row, candidate, player, now, metadata);
  const scoreDelta = migrated || rolledOver ? 0 : syncActivityPoint(row, candidate, player, metadata);
  metadata.version = 1;
  row.extra.activationPass = metadata;
  row.startTime = Math.max(0, toSafeInt(metadata.cycleStartTime, now));
  row.endTime = Math.max(row.startTime + 1, toSafeInt(metadata.cycleEndTime, now + DAY_MS));

  info.datas.sort((left, right) => toSafeInt(left && left.id, 0) - toSafeInt(right && right.id, 0));
  return {
    info,
    row,
    activityId: candidate.id,
    payId: candidate.payId,
    stage: candidate.stage,
    created,
    migrated,
    rolledOver,
    scoreDelta,
    changed: created || before !== JSON.stringify(row),
  };
}

function hasActivationPassEntitlement(player, payId, now = Date.now()) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  if (!isActivationPassPayId(requestedPayId)) return false;
  const rows = ensureArray(player && player.activityInfo && player.activityInfo.datas);
  return rows.some((row) => {
    const stage = Math.max(DEFAULT_STAGE, toSafeInt(row && row.record, DEFAULT_STAGE));
    if (getActivityPayId(row && row.id, stage) !== requestedPayId) return false;
    const startTime = Math.max(0, toSafeInt(row && row.startTime, 0));
    const endTime = Math.max(0, toSafeInt(row && row.endTime, 0));
    return startTime <= now
      && now < endTime
      && normalizeRecordList(row && row.recordList).includes(requestedPayId);
  });
}

function activateActivationPassForPayId(player, payId, now = Date.now()) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  if (!isActivationPassPayId(requestedPayId)) return null;
  const state = ensureActivationPassState(player, { payId: requestedPayId, now });
  if (!state || !state.row) return null;
  const alreadyActive = state.row.recordList.includes(requestedPayId);
  const before = JSON.stringify(state.row);
  if (!alreadyActive) {
    state.row.recordList.push(requestedPayId);
    state.row.recordList.sort((left, right) => left - right);
  }
  const metadata = ensureObject(ensureObject(state.row.extra).activationPass);
  metadata.entitledAt = Math.max(0, toSafeInt(metadata.entitledAt, now)) || now;
  metadata.entitledCycleIndex = Math.max(0, toSafeInt(metadata.cycleIndex, 0));
  metadata.entitledPayId = requestedPayId;
  state.row.extra.activationPass = metadata;
  state.changed = state.changed || before !== JSON.stringify(state.row);
  state.alreadyActive = alreadyActive;
  return state;
}

function buildActivationPassUpdatePacket(update) {
  const row = update && update.row;
  if (!row) return null;
  return {
    tag: 1701,
    msgUid: 0,
    data: { data: row },
  };
}

module.exports = {
  ACTIVATION_PASS_PAY_IDS,
  ACTIVITY_TYPE,
  DAY_MS,
  activateActivationPassForPayId,
  buildActivationPassUpdatePacket,
  ensureActivationPassState,
  getActivityPayId,
  getActivityTypeRow,
  getCycleDurationMs,
  getMaxScore,
  hasActivationPassEntitlement,
  hasRechargeRecord,
  isActivationPassPayId,
  listCandidates,
  normalizeRecordList,
  toSafeInt,
};
