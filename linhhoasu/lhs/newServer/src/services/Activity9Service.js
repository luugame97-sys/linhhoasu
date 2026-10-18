const configService = require('./ConfigService');

const ACTIVITY_TYPE = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY9_PRICE_R = 68;

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

function getActivity9TypeRow(activityId) {
  return getRow(getTable('Activity9TypeConfig'), activityId);
}

function getActivity9PayId(activityId) {
  const row = getActivity9TypeRow(activityId);
  return Math.max(0, toSafeInt(row && row.rechargeId, 0));
}

function isActivity9Id(activityId) {
  const row = getActivityMeta(activityId);
  return !!row && toSafeInt(row.activityType, 0) === ACTIVITY_TYPE;
}

function listActivity9Candidates(payId = 0) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  const activityConfig = getTable('ActivityConfig');
  return Object.keys(activityConfig)
    .map(function (key) {
      const meta = activityConfig[key];
      const id = Math.max(0, toSafeInt(meta && meta.id, toSafeInt(key, 0)));
      const typeRow = getActivity9TypeRow(id);
      return {
        id: id,
        meta: meta,
        typeRow: typeRow,
        payId: Math.max(0, toSafeInt(typeRow && typeRow.rechargeId, 0)),
      };
    })
    .filter(function (entry) {
      if (entry.id <= 0 || !entry.meta || !entry.typeRow) return false;
      if (toSafeInt(entry.meta.activityType, 0) !== ACTIVITY_TYPE) return false;
      return requestedPayId <= 0 || entry.payId === requestedPayId;
    });
}

function isActivity9PayId(payId) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  return requestedPayId > 0 && listActivity9Candidates(requestedPayId).length > 0;
}

function getActivity9PriceR(payId, fallback = 0) {
  return isActivity9PayId(payId)
    ? ACTIVITY9_PRICE_R
    : Math.max(0, toSafeInt(fallback, 0));
}

function activityConditionsMet(player, meta) {
  const conditions = ensureArray(meta && meta.conditions);
  return conditions.every(function (condition) {
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

function getMaxDay(activityId) {
  const root = ensureObject(getTable('Activity9Config')[activityId]
    || getTable('Activity9Config')[String(activityId)]);
  const days = Object.keys(root)
    .map(function (key) {
      return Math.max(0, toSafeInt(root[key] && root[key].day, toSafeInt(key, 0)));
    })
    .filter(function (day) {
      return day > 0;
    });
  return days.length > 0 ? Math.max.apply(Math, days) : 7;
}

function getRewardRows(activityId) {
  const root = ensureObject(getTable('Activity9Config')[activityId]
    || getTable('Activity9Config')[String(activityId)]);
  return Object.keys(root)
    .map(function (key) {
      return ensureObject(root[key]);
    })
    .filter(function (row) {
      return toSafeInt(row.day, 0) > 0;
    })
    .sort(function (left, right) {
      return toSafeInt(left.day, 0) - toSafeInt(right.day, 0);
    });
}

function normalizeRecordList(value) {
  return Array.from(new Set(ensureArray(value)
    .map(function (entry) {
      return Math.max(0, toSafeInt(entry, 0));
    })
    .filter(function (entry) {
      return entry > 0;
    }))).sort(function (left, right) {
    return left - right;
  });
}

function hasRechargeRecord(player, payId) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  const records = ensureArray(player && player.rechargeInfo && player.rechargeInfo.records);
  return requestedPayId > 0 && records.some(function (row) {
    return toSafeInt(row && row.id, 0) === requestedPayId
      && toSafeInt(row && row.count, 0) > 0;
  });
}

function isWindowOpen(row, now) {
  const startTime = Math.max(0, toSafeInt(row && row.startTime, 0));
  const endTime = Math.max(0, toSafeInt(row && row.endTime, 0));
  return startTime > 0 && endTime > startTime && startTime <= now && now < endTime;
}

function chooseCandidate(player, info, options) {
  const requestedPayId = Math.max(0, toSafeInt(options.payId, 0));
  const now = Math.max(0, toSafeInt(options.now, Date.now()));
  const existing = ensureArray(info.datas).filter(function (row) {
    if (!isActivity9Id(row && row.id)) return false;
    return requestedPayId <= 0 || getActivity9PayId(row.id) === requestedPayId;
  });
  const openExisting = existing.find(function (row) {
    return isWindowOpen(row, now);
  });
  if (openExisting) {
    return { row: openExisting, candidate: null, created: false };
  }
  if (existing.length > 0) {
    return { row: existing[0], candidate: null, created: false };
  }

  const area = Math.max(1, toSafeInt(player && player.rechargeInfo && player.rechargeInfo.area, 1));
  const candidates = listActivity9Candidates(requestedPayId).sort(function (left, right) {
    const leftArea = toSafeInt(left.meta && left.meta.area, 1) === area ? 0 : 1;
    const rightArea = toSafeInt(right.meta && right.meta.area, 1) === area ? 0 : 1;
    if (leftArea !== rightArea) return leftArea - rightArea;
    const leftNormal = toSafeInt(left.meta && left.meta.type, 0) === 1 ? 0 : 1;
    const rightNormal = toSafeInt(right.meta && right.meta.type, 0) === 1 ? 0 : 1;
    if (leftNormal !== rightNormal) return leftNormal - rightNormal;
    return left.id - right.id;
  });
  const exactArea = candidates.filter(function (candidate) {
    return toSafeInt(candidate.meta && candidate.meta.area, 1) === area;
  });
  const pool = exactArea.length > 0 ? exactArea : candidates;
  const candidate = pool.find(function (entry) {
    return options.force === true || activityConditionsMet(player, entry.meta);
  });
  if (!candidate) return { row: null, candidate: null, created: false };

  const disabledIds = new Set(ensureArray(info.disabledEntryIds).map(function (value) {
    return Math.max(0, toSafeInt(value, 0));
  }));
  if (disabledIds.has(candidate.id)) return { row: null, candidate: null, created: false };

  const maxDay = getMaxDay(candidate.id);
  const row = {
    id: candidate.id,
    module: 0,
    index: 0,
    param: 0,
    record: 0,
    status: 0,
    startTime: now,
    endTime: now + maxDay * DAY_MS,
    score: 1,
    recordList: [],
    records: {},
    buyRecords: {},
    extra: {
      loginPrivileges: {
        version: 1,
        seededAt: now,
      },
    },
  };
  info.datas.push(row);
  return { row: row, candidate: candidate, created: true };
}

function ensureActivity9State(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const now = Math.max(0, toSafeInt(options.now, Date.now()));
  player.activityInfo = ensureObject(player.activityInfo);
  const info = player.activityInfo;
  info.datas = ensureArray(info.datas);
  info.disabledEntryIds = ensureArray(info.disabledEntryIds);

  const selected = chooseCandidate(player, info, {
    now: now,
    payId: options.payId,
    force: options.force === true,
  });
  const row = selected.row;
  if (!row) return null;

  const before = JSON.stringify(row);
  const maxDay = getMaxDay(row.id);
  const payId = getActivity9PayId(row.id);
  row.module = 0;
  row.index = 0;
  row.param = Math.max(0, toSafeInt(row.param, 0));
  row.record = Math.max(0, toSafeInt(row.record, 0));
  row.status = Math.max(0, toSafeInt(row.status, 0));
  row.records = ensureObject(row.records);
  row.buyRecords = ensureObject(row.buyRecords);
  row.extra = ensureObject(row.extra);
  row.extra.loginPrivileges = ensureObject(row.extra.loginPrivileges);
  row.extra.loginPrivileges.version = 1;
  if (!row.extra.loginPrivileges.seededAt) {
    row.extra.loginPrivileges.seededAt = now;
  }
  row.recordList = normalizeRecordList(row.recordList);

  let startTime = Math.max(0, toSafeInt(row.startTime, 0));
  let endTime = Math.max(0, toSafeInt(row.endTime, 0));
  if (startTime <= 0) startTime = now;
  if (endTime <= startTime) endTime = startTime + maxDay * DAY_MS;
  row.startTime = startTime;
  row.endTime = endTime;

  if (isWindowOpen(row, now)) {
    const elapsedDay = Math.max(1, Math.floor((now - startTime) / DAY_MS) + 1);
    row.score = Math.min(
      maxDay,
      Math.max(elapsedDay, Math.max(0, toSafeInt(row.score, 0)))
    );
  } else {
    row.score = Math.min(maxDay, Math.max(0, toSafeInt(row.score, 0)));
  }

  if (payId > 0 && hasRechargeRecord(player, payId) && !row.recordList.includes(payId)) {
    row.recordList.push(payId);
    row.recordList.sort(function (left, right) {
      return left - right;
    });
  }

  return {
    info: info,
    row: row,
    activityId: Math.max(0, toSafeInt(row.id, 0)),
    payId: payId,
    maxDay: maxDay,
    created: selected.created,
    changed: selected.created || before !== JSON.stringify(row),
  };
}

function activateActivity9ForPayId(player, payId, now = Date.now()) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  if (!isActivity9PayId(requestedPayId)) return null;
  const state = ensureActivity9State(player, {
    now: now,
    payId: requestedPayId,
    force: true,
  });
  if (!state || !state.row) return null;
  const before = JSON.stringify(state.row.recordList);
  if (!state.row.recordList.includes(requestedPayId)) {
    state.row.recordList.push(requestedPayId);
    state.row.recordList.sort(function (left, right) {
      return left - right;
    });
  }
  state.changed = state.changed || before !== JSON.stringify(state.row.recordList);
  return state;
}

function hasActivity9Purchase(player, payId) {
  const requestedPayId = Math.max(0, toSafeInt(payId, 0));
  if (requestedPayId <= 0) return false;
  if (hasRechargeRecord(player, requestedPayId)) return true;
  const rows = ensureArray(player && player.activityInfo && player.activityInfo.datas);
  return rows.some(function (row) {
    return isActivity9Id(row && row.id)
      && getActivity9PayId(row.id) === requestedPayId
      && normalizeRecordList(row.recordList).includes(requestedPayId);
  });
}

module.exports = {
  ACTIVITY9_PRICE_R,
  DAY_MS,
  activateActivity9ForPayId,
  ensureActivity9State,
  getActivity9PayId,
  getActivity9PriceR,
  getMaxDay,
  getRewardRows,
  hasActivity9Purchase,
  hasRechargeRecord,
  isActivity9Id,
  isActivity9PayId,
  isWindowOpen,
  toSafeInt,
};
