'use strict';

const registry = require('./EventRotationRegistry');
const config = require('./ConfigService');

const DAY = 86400000;
const SUPPORTED_TYPES = new Set([21, 27, 30, 37, 43, 44, 49, 52]);
const settlementGateCache = new Map();

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isProtectedWindow(row, now = Date.now()) {
  const startTime = Math.max(0, toSafeInt(row && row.startTime, 0));
  const endTime = Math.max(0, toSafeInt(row && row.endTime, 0));
  return startTime > 0 && endTime > startTime && endTime > now;
}

function getScheduledFamilies() {
  return registry.getFamilies().filter((family) => (
    family.kind === 'activity'
    && registry.isEnabled(family)
    && SUPPORTED_TYPES.has(toSafeInt(family.activityType, 0))
    && Math.max(0, toSafeInt(family.periodDays, 0)) > 0
    && Number.isFinite(Date.parse(family.anchor))
  ));
}

function cycleForFamily(family, now = Date.now()) {
  if (!family || !registry.isEnabled(family)) return null;
  const anchor = Date.parse(family.anchor);
  const periodDays = Math.max(1, toSafeInt(family.periodDays, 0));
  const periodMs = periodDays * DAY;
  if (!Number.isFinite(anchor) || now < anchor || family.ids.length <= 0) return null;
  const index = Math.floor((now - anchor) / periodMs);
  const startTime = anchor + index * periodMs;
  const endTime = startTime + periodMs;
  const id = family.ids[index % family.ids.length];
  return {
    family: family.key,
    activityType: toSafeInt(family.activityType, 0),
    id,
    index,
    startTime,
    endTime,
    key: `${family.key}:${index}:${startTime}`,
  };
}

function createCycleRow(cycle) {
  return {
    id: cycle.id,
    module: 0,
    index: 0,
    param: 0,
    record: 0,
    status: 0,
    startTime: cycle.startTime,
    endTime: cycle.endTime,
    // Activity 44 uses score as its initial native stage/level.  A rotated
    // Kim Ma row must match the handler's normal seed row or module 0 rejects
    // the first action after rollover.
    score: cycle.activityType === 44 ? 1 : 0,
    recordList: [],
    records: {},
    buyRecords: {},
    extra: {
      eventCycle: {
        version: 1,
        family: cycle.family,
        key: cycle.key,
        index: cycle.index,
      },
    },
  };
}

function validateCycle(cycle) {
  const activityConfig = ensureObject(config.get('ActivityConfig'));
  const meta = ensureObject(activityConfig[cycle.id] || activityConfig[String(cycle.id)]);
  if (toSafeInt(meta.id, 0) !== cycle.id) throw new Error(`EVENT_ROTATION_CONFIG_MISSING:${cycle.id}`);
  if (toSafeInt(meta.activityType, 0) !== cycle.activityType) throw new Error(`EVENT_ROTATION_TYPE_MISMATCH:${cycle.id}`);
  if (!SUPPORTED_TYPES.has(cycle.activityType)) throw new Error(`EVENT_ROTATION_HANDLER_UNSUPPORTED:${cycle.activityType}`);
  return meta;
}

function syncPlayer(player = {}, now = Date.now(), options = {}) {
  player.activityInfo = ensureObject(player.activityInfo);
  const info = player.activityInfo;
  info.datas = ensureArray(info.datas);
  const before = JSON.stringify(info.datas);
  const disabled = new Set(ensureArray(info.disabledEntryIds)
    .map((value) => Math.max(0, toSafeInt(value, 0)))
    .filter((value) => value > 0));
  const added = [];
  const replaced = [];
  const preserved = [];

  for (const family of getScheduledFamilies()) {
    const cycle = cycleForFamily(family, now);
    if (!cycle || disabled.has(cycle.id)) continue;
    // Ranked Kim-Ma families may only replace data after durable mail
    // settlement, including after a restart or a long offline interval.
    // Fortune (43) and Kim Ma (44) share the native activity payload, but
    // only Kim Ma has ranked settlement that must finish before its row is
    // replaced. Keeping Fortune behind the Kim Ma receipt gate left all
    // servers without a legacy Kim Ma window permanently closed.
    if (cycle.activityType === 44 && options.kimmaSettlementReady !== true) continue;
    validateCycle(cycle);
    const familyIds = new Set(family.ids);
    const protectedRow = info.datas.find((row) => (
      familyIds.has(toSafeInt(row && row.id, 0)) && isProtectedWindow(row, now)
    ));
    if (protectedRow) {
      preserved.push({ family: family.key, id: toSafeInt(protectedRow.id, 0) });
      continue;
    }

    const nextRow = createCycleRow(cycle);
    const existingIndex = info.datas.findIndex((row) => toSafeInt(row && row.id, 0) === cycle.id);
    if (existingIndex >= 0) {
      info.datas[existingIndex] = nextRow;
      replaced.push({ family: family.key, id: cycle.id, key: cycle.key });
    } else {
      info.datas.push(nextRow);
      added.push({ family: family.key, id: cycle.id, key: cycle.key });
    }
  }

  info.datas.sort((left, right) => toSafeInt(left && left.id, 0) - toSafeInt(right && right.id, 0));
  return {
    changed: before !== JSON.stringify(info.datas),
    added,
    replaced,
    preserved,
    cycles: getScheduledFamilies().map((family) => cycleForFamily(family, now)).filter(Boolean),
  };
}

function kimmaSettlementEvents(serverId, cycle, family) {
  const policy = require('../config/eventRewardSettlement.json');
  const legacy = policy.newYearWindows[String(serverId)];
  const events = legacy
    ? [44001, 44002, 44051, 44052].map(id => ({ kind: 'kimma', id, ...legacy }))
    : [];
  const anchor = Date.parse(family.anchor), periodMs = family.periodDays * DAY;
  for (let index = 0; index < cycle.index; index++) {
    const startTime = anchor + index * periodMs;
    events.push({ kind: 'kimma', id: family.ids[index % family.ids.length],
      key: `${family.key}:${index}:${startTime}`, startTime, endTime: startTime + periodMs, includeLegacyWindows: false });
  }
  return events;
}

async function syncPlayerAfterSettlement(player = {}, now = Date.now(), options = {}) {
  const family = registry.getFamily('new_year_monster');
  const cycle = cycleForFamily(family, now);
  const serverId = Number(player.serverId || process.env.SERVER_ID);
  let ready = false;
  if (cycle) {
    const key = `${serverId}:${cycle.key}`;
    const cached = options.readReceipts ? null : settlementGateCache.get(key);
    if (cached && (cached.ready || cached.until > now)) ready = cached.ready;
    else {
      const events = kimmaSettlementEvents(serverId, cycle, family);
      if (events) {
        // A newly opened server may start after a global Kim Ma cycle has
        // already ended. That pre-opening cycle has no player state on the
        // server and must not block the first live cycle forever.
        const settlementPolicy = require('../config/eventRewardSettlement.json');
        const activationAt = Number(process.env.EVENT_SETTLEMENT_ACTIVATION_AT || settlementPolicy.activationAt || 0);
        const dueEvents = events.filter(event => Number(event.endTime || 0) >= activationAt);
        const { settlementId } = require('./EventRewardSettlementService');
        const ids = dueEvents.map(event => settlementId(serverId, event));
        const docs = options.readReceipts ? await options.readReceipts(ids)
          : await require('../db/models/EventRewardSettlement').find({ _id: { $in: ids }, state: 'done' })
            .select({ _id: 1, state: 1 }).maxTimeMS(5000).lean();
        const done = new Set(docs.filter(doc => doc.state === 'done').map(doc => String(doc._id)));
        ready = ids.every(id => done.has(id));
      }
      if (!options.readReceipts) settlementGateCache.set(key, { ready, until: now + 15000 });
    }
  }
  const state = syncPlayer(player, now, { kimmaSettlementReady: ready });
  // Reopen only expired legacy rows within the already configured common
  // event window. Preserve their score, claims, start time and inventory.
  const legacy = require('../config/eventRewardSettlement.json').newYearWindows[String(serverId)];
  if (!cycle && family && registry.isEnabled(family) && legacy && legacy.startTime <= now && now < legacy.endTime) {
    for (const row of player.activityInfo.datas) {
      if (![43001, 44001].includes(Number(row.id)) || (player.activityInfo.disabledEntryIds || []).includes(Number(row.id))) continue;
      if (Number(row.startTime) >= legacy.startTime && Number(row.endTime) > Number(row.startTime) && Number(row.endTime) <= now) {
        row.endTime = legacy.endTime;
        state.changed = true;
      }
    }
  }
  return state;
}

async function heartbeat(session = {}) {
  const now = Date.now();
  if (session._isBot === true || !session.player || !session.userId || Math.max(0, toSafeInt(session._activityCycleNextSync, 0)) > now) return [];
  session._activityCycleNextSync = now + 15000;
  return require('./PlayerMutationService').run(session.userId, async () => {
  if (!session.player) return [];
  const next = JSON.parse(JSON.stringify(session.player));
  const state = await syncPlayerAfterSettlement(next, now);
  if (!state.changed) return [];
  const saved = await require('./PlayerService').savePlayer(session.userId, next, { returnSaved: false });
  if (!saved) throw new Error('EVENT_ROTATION_SAVE_NOT_CONFIRMED');
  session.player = saved && typeof saved === 'object' ? saved : next;
  const payload = require('../handlers/activity').buildActivityPayload(session.player.activityInfo);
  return [{ tag: 1700, msgUid: 0, data: payload }];
  });
}

module.exports = {
  DAY,
  SUPPORTED_TYPES,
  createCycleRow,
  cycleForFamily,
  getScheduledFamilies,
  heartbeat,
  isProtectedWindow,
  syncPlayer,
  syncPlayerAfterSettlement,
  kimmaSettlementEvents,
  validateCycle,
};
