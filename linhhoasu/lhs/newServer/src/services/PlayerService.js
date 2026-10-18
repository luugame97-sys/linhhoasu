/**
 * PlayerService - 玩家数据持久化服务
 * 替代原 LHS-file/src/db.js 的 JSON 文件存储
 * 提供 loadPlayer / createPlayer / savePlayer 接口
 */

const fs = require('fs');
const path = require('path');
const Player = require('../db/models/Player');
const logger = require('../logger');
const { syncCurrencyItems } = require('./CurrencySync');
const { attachTaskSyncMeta, getTaskSyncMeta } = require('./TaskDirtyService');
const oldTrekSnapshots = require('./OldTrekSnapshotService');

function readPositiveInt(name, fallback, min = 1) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

const DB_OPERATION_TIMEOUT_MS = readPositiveInt('MONGO_OPERATION_TIMEOUT_MS', 5000, 500);
// withRetry performs up to three DB attempts plus 100/200ms backoff. The
// outer queue deadline must not expire first, otherwise the next save begins
// while the previous Mongo write is still running in the background.
const MIN_PLAYER_SAVE_TIMEOUT_MS = (DB_OPERATION_TIMEOUT_MS * 3) + 1000;
const PLAYER_SAVE_TIMEOUT_MS = Math.max(
  MIN_PLAYER_SAVE_TIMEOUT_MS,
  readPositiveInt('PLAYER_SAVE_TIMEOUT_MS', 20000, 1000)
);

function createTimeoutError(label, timeoutMs) {
  const err = new Error(`${label} timeout after ${timeoutMs}ms`);
  err.name = 'OperationTimeoutError';
  err.code = 'OPERATION_TIMEOUT';
  return err;
}

function withTimeout(work, timeoutMs, label) {
  let timer = null;
  let expired = false;
  const operation = Promise.resolve().then(work);
  timer = setTimeout(() => {
    expired = true;
    logger.warn(`[Player] ${label} exceeded ${timeoutMs}ms; waiting for settlement before releasing writer`);
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  return operation.then((value) => {
    if (expired) throw createTimeoutError(label, timeoutMs);
    return value;
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * 带重试的数据库操作包装
 * @param {Function} fn - 异步操作
 * @param {number} retries - 重试次数（默认2）
 * @returns {Promise<*>}
 */
async function withRetry(fn, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await withTimeout(fn, DB_OPERATION_TIMEOUT_MS, 'MongoDB operation');
    } catch (err) {
      if (i === retries) throw err;
      const isTransient = err.name === 'MongoNetworkError'
        || err.name === 'MongoTimeoutError'
        || err.code === 'OPERATION_TIMEOUT'
        || (err.code && err.code === 112); // WriteConflict
      if (!isTransient) throw err;
      logger.warn(`[Player] DB Thao tác thử lại (${i + 1}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
}

// 加载玩家模板（完整初始数据）
const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'LHS-file', 'src', 'data', 'player_template.json');
let _template = null;
const lastSavedAt = new WeakMap();
const pendingSaveAt = new WeakMap();
const saveQueues = new Map();
const saveQueueDepths = new Map();
const deferredSaveStates = new Map();
const trackedFortuneBalances = new WeakMap();
const DEFERRED_SAVE_COALESCE_MS = Math.max(
  0,
  Number(process.env.PLAYER_DEFERRED_SAVE_COALESCE_MS || 3000) || 3000
);

function markSaveScheduled(value) {
  const at = Date.now();
  if (value && typeof value === 'object') pendingSaveAt.set(value, at);
  return at;
}

function clearSaveScheduled(value, at) {
  if (value && typeof value === 'object' && pendingSaveAt.get(value) === at) {
    pendingSaveAt.delete(value);
  }
}

function markSaved(value) {
  if (value && typeof value === 'object') lastSavedAt.set(value, Date.now());
}

function wasRecentlySaved(value, since = 0) {
  if (!value || typeof value !== 'object') return false;
  const savedAt = lastSavedAt.get(value) || 0;
  const scheduledAt = pendingSaveAt.get(value) || 0;
  return Math.max(savedAt, scheduledAt) >= Math.max(0, Number(since) || 0);
}

function cloneSaveData(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch (_err) {}
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return { ...value };
  }
}

// Arena receipts are intentionally compact outcome metadata.  Older releases
// accidentally persisted the full defender document under
// `targetScore.document`, which could recursively contain another ledger.
// Strip only that confirmed-bad path before any clone or queued save so the
// large object cannot be copied or written again.  Unknown receipt fields and
// all score/receipt values remain untouched.
function sanitizeArenaReceiptLedger(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.arenaReceiptLedger)) return false;
  let changed = false;
  value.arenaReceiptLedger.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || !entry.targetScore || typeof entry.targetScore !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(entry.targetScore, 'document')) return;
    const { document: _document, ...compactTargetScore } = entry.targetScore;
    value.arenaReceiptLedger[index] = { ...entry, targetScore: compactTargetScore };
    changed = true;
  });
  return changed;
}

function getFortuneBalanceSnapshot(player = {}) {
  const items = player && player.items && typeof player.items === 'object' ? player.items : {};
  const currencies = player && player.currencies && typeof player.currencies === 'object' ? player.currencies : {};
  return {
    4: Math.max(0, Number(items[4]) || 0),
    6: Math.max(0, Number(currencies.gold != null ? currencies.gold : items[6]) || 0),
    55: Math.max(0, Number(items[55]) || 0),
    65: Math.max(0, Number(items[65]) || 0),
  };
}

function rememberFortuneBalances(player) {
  if (player && typeof player === 'object') {
    trackedFortuneBalances.set(player, getFortuneBalanceSnapshot(player));
  }
  return player;
}

function reconcileFortuneConsumableSpend(player) {
  if (!player || typeof player !== 'object') return false;
  const before = trackedFortuneBalances.get(player);
  const current = getFortuneBalanceSnapshot(player);
  trackedFortuneBalances.set(player, current);
  if (!before) return false;

  let changed = false;
  try {
    // Lazy loading keeps PlayerService independent from the task -> payload ->
    // handler graph during bootstrap.
    // eslint-disable-next-line global-require
    const progress = require('./MainTaskProgressService');
    if (!progress || typeof progress.addItemConsume !== 'function') return false;
    [4, 55, 65].forEach((itemId) => {
      const spent = Math.max(0, (Number(before[itemId]) || 0) - (Number(current[itemId]) || 0));
      if (spent > 0) changed = !!progress.addItemConsume(player, itemId, spent) || changed;
    });
  } catch (error) {
    logger.warn(`[Player] fortune consumption tracking failed user=${player.userId || 'unknown'}: ${error.message}`);
  }
  return changed;
}

function enqueueSave(userId, work) {
  const key = String(userId || '');
  const previous = saveQueues.get(key) || Promise.resolve();
  const queuedAt = Date.now();
  const depth = (saveQueueDepths.get(key) || 0) + 1;
  saveQueueDepths.set(key, depth);
  if (depth >= 4) {
    logger.warn(`[Player] save queue backlog user=${key} depth=${depth}`);
  }
  const current = previous.catch(() => undefined).then(() => {
    const waitMs = Date.now() - queuedAt;
    if (waitMs >= DB_OPERATION_TIMEOUT_MS) {
      logger.warn(`[Player] save queue wait user=${key} depth=${depth} wait=${waitMs}ms`);
    }
    return withTimeout(work, PLAYER_SAVE_TIMEOUT_MS, `save player ${key}`);
  });
  const cleanup = () => {
    if (saveQueues.get(key) === tracked) saveQueues.delete(key);
    const nextDepth = Math.max(0, (saveQueueDepths.get(key) || 1) - 1);
    if (nextDepth > 0) saveQueueDepths.set(key, nextDepth);
    else saveQueueDepths.delete(key);
  };
  // Keep the bookkeeping promise resolved on failure; callers still receive
  // the original `current` rejection, while the queue itself cannot trigger
  // an unhandled-rejection warning.
  const tracked = current.then(
    (value) => { cleanup(); return value; },
    () => { cleanup(); return undefined; }
  );
  saveQueues.set(key, tracked);
  return current;
}

function getTemplate() {
  if (_template) return _template;
  try {
    _template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf-8'));
  } catch (_e) {
    logger.warn('[Player] player_template.json 不存在，使用内置默认值');
    _template = {};
  }
  return _template;
}

function buildFreshPlayerData(userId, name, extra = {}, options = {}) {
  const now = Date.now();
  const template = getTemplate();
  const data = JSON.parse(JSON.stringify(template));
  const playerId = options.preservePlayerId
    ? String(options.preservePlayerId)
    : `p_${userId}_${now}`;

  data.userId = userId;
  data.playerId = playerId;
  data.name = name;
  data.createTime = now;

  if (data.raidInfo) data.raidInfo.hangUpTime = now;

  if (!data.items || typeof data.items !== 'object' || Array.isArray(data.items)) {
    data.items = {};
  }
  const starterBaoziRaw = Number(process.env.STARTER_BAOZI || 1000);
  const starterBaozi = Number.isFinite(starterBaoziRaw) && starterBaoziRaw > 0
    ? Math.floor(starterBaoziRaw)
    : 1000;
  const currentBaozi = Number(data.items[4]);
  if (!Number.isFinite(currentBaozi) || currentBaozi <= 0) {
    data.items[4] = starterBaozi;
  }

  const starterSpiritStoneRaw = Number(process.env.STARTER_SPIRIT_STONE || 100);
  const starterSpiritStone = Number.isFinite(starterSpiritStoneRaw) && starterSpiritStoneRaw > 0
    ? Math.floor(starterSpiritStoneRaw)
    : 100;
  const currentSpiritStone = Number(data.items[60]);
  if (!Number.isFinite(currentSpiritStone) || currentSpiritStone < starterSpiritStone) {
    data.items[60] = starterSpiritStone;
  }

  const starterSpiritEssenceRaw = Number(process.env.STARTER_SPIRIT_ESSENCE || 10);
  const starterSpiritEssence = Number.isFinite(starterSpiritEssenceRaw) && starterSpiritEssenceRaw > 0
    ? Math.floor(starterSpiritEssenceRaw)
    : 10;
  const currentSpiritEssence = Number(data.items[61]);
  if (!Number.isFinite(currentSpiritEssence) || currentSpiritEssence < starterSpiritEssence) {
    data.items[61] = starterSpiritEssence;
  }

  // Võ Đạo Hội ticket is an authoritative server item. Preserve an existing
  // balance, but initialize only newly-created players from ConstConfig so a
  // missing legacy template entry cannot leave fresh accounts at an invalid 0.
  const constCfg = require('./ConfigService').get('ConstConfig') || {};
  const arenaTicketInit = Math.max(0, Number(constCfg.initArenaTicket) || 0);
  if (arenaTicketInit > 0 && (data.items[10] == null || !Number.isFinite(Number(data.items[10])) || Number(data.items[10]) <= 0)) {
    data.items[10] = arenaTicketInit;
  }

  Object.assign(data, extra);
  syncCurrencyItems(data);
  delete data.mail;
  return data;
}

/**
 * 加载玩家数据
 * @param {string} userId - 玩家唯一标识
 * @returns {Promise<Object|null>} 玩家文档（lean 对象），不存在返回 null
 */
async function loadPlayer(userId) {
  const player = await withRetry(() => Player.findOne({ userId }).maxTimeMS(DB_OPERATION_TIMEOUT_MS).lean());
  const mounted = await require('./MountStarProgressService').recoverLoaded(player, Player.collection);
  return rememberFortuneBalances(await require('./TowerDailyResetService').recoverLoaded(mounted, Player.collection));
}

// Raw preimage for tower CAS; rollover is applied to a draft in the same commit.
async function loadTowerPlayer(userId) {
  return withRetry(() => Player.findOne({ userId }).maxTimeMS(DB_OPERATION_TIMEOUT_MS).lean());
}

/**
 * 创建新玩家（基于 player_template.json 完整初始化）
 * @param {string} userId - 玩家唯一标识
 * @param {string} name - 玩家名称
 * @param {Object} [extra] - 额外字段（如 agentId, inviteCode）
 * @returns {Promise<Object>} 新建的玩家文档
 */
async function createPlayer(userId, name, extra = {}) {
  const data = buildFreshPlayerData(userId, name, extra);

  const player = await Player.create(data);
  logger.info(`[Player] New Player: ${name} (${userId})`);
  return rememberFortuneBalances(player.toObject());
}

/**
 * 保存玩家数据（部分更新）
 * @param {string} userId - 玩家唯一标识
 * @param {Object} data - 要更新的字段
 * @returns {Promise<Object|null>} 更新后的玩家文档
 */
async function savePlayer(userId, data, options = {}) {
  const sourceData = data;
  sanitizeArenaReceiptLedger(sourceData);
  if (!options || options.fortuneConsumptionTracked !== true) {
    reconcileFortuneConsumableSpend(sourceData);
  }
  const saveStartedAt = Date.now();
  const taskSyncMeta = getTaskSyncMeta(sourceData);
  const cloneStartedAt = Date.now();
  const snapshot = options && options.snapshotProvided === true
    ? sourceData
    : cloneSaveData(sourceData);
  const cloneMs = Date.now() - cloneStartedAt;
  const scheduledAt = markSaveScheduled(sourceData);
  return enqueueSave(userId, async () => {
    const onlyFields = Array.isArray(options && options.onlyFields)
      ? new Set(options.onlyFields.map((field) => String(field || '')).filter(Boolean))
      : null;
    let updateData;
    if (onlyFields) {
      updateData = {};
      onlyFields.forEach((field) => {
        if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, field)) {
          updateData[field] = snapshot[field];
        }
      });
    } else {
      const { _id, __v, createdAt, updatedAt, ...fullUpdateData } = snapshot || {};
      updateData = fullUpdateData;
    }
    // A partial update must not synthesize or rewrite the other half of the
    // currency/item mirror.  Equipment-sale snapshots include both fields;
    // generic onlyFields callers may intentionally include just one.
    const hasCurrencyItemPair = updateData
      && updateData.items && typeof updateData.items === 'object' && !Array.isArray(updateData.items)
      && updateData.currencies && typeof updateData.currencies === 'object' && !Array.isArray(updateData.currencies);
    if (hasCurrencyItemPair) {
      syncCurrencyItems(updateData);
    }
    // Keep the stale-level guard active for partial updates whose field list
    // intentionally omits `level` (e.g. the auto-sale save).  The snapshot
    // still carries the session's authoritative level even when it is not
    // part of the `$set` payload.
    const incomingLevel = Math.max(0, Number(
      snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'level')
        ? snapshot.level
        : updateData && updateData.level
    ) || 0);
    const allowLevelDowngrade = options && options.allowLevelDowngrade === true;
    const filter = { userId };
    // Opt-in compare-and-swap used only by OldTrek. Existing callers retain
    // their save semantics; stale OldTrek economy/state cannot overwrite a
    // newer player snapshot even across reconnects or separate processes.
    if (options.oldTrekCAS) {
      const expected = options.oldTrekCAS;
      filter.$and = ['oldTrekInfo', 'items', 'currencies'].map(key => ({
        [key === 'oldTrekInfo' ? 'other_attr_info.oldTrekInfo' : key]:
          Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      }));
    }
    // Activity52 commits only changed fields and guards the exact pre-mutation
    // values of every affected reward/economy/progress field.
    if (options.activity52CAS) {
      const { fields, expected } = options.activity52CAS;
      if (!Array.isArray(fields) || !fields.length || fields.some(key => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key))) {
        throw new Error('FULU_CAS_FIELDS_INVALID');
      }
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
    // Artifact quench: only its changed economy/state/receipt fields commit.
    if (options.artifactCAS) {
      const { fields, expected } = options.artifactCAS;
      const allowed = ['artifactInfo', 'items', 'currencies', 'other_attr_info'];
      if (!Array.isArray(fields) || !fields.length || fields.some(key => !allowed.includes(key))) {
        throw new Error('ARTIFACT_CAS_FIELDS_INVALID');
      }
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
    if (options.crossRivalCAS) {
      const { fields, expected } = options.crossRivalCAS;
      const allowed = ['items', 'currencies', 'crossRivalWallet'];
      if (!Array.isArray(fields) || fields.length !== allowed.length || allowed.some(key => !fields.includes(key))) {
        throw new Error('CROSS_RIVAL_CAS_FIELDS_INVALID');
      }
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
    if (options.towerCAS) {
      const { fields, expected } = options.towerCAS;
      const allowed = ['swordInfo', 'items', 'currencies', 'other_attr_info', 'taskInfo'];
      if (!Array.isArray(fields) || fields.length !== allowed.length || allowed.some(key => !fields.includes(key))) throw Error('TOWER_CAS_FIELDS_INVALID');
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
    if (options.mountCAS) {
      const { fields, expected } = options.mountCAS;
      const allowed = ['swordInfo', 'items', 'currencies', 'other_attr_info'];
      if (!Array.isArray(fields) || fields.length !== allowed.length || allowed.some(key => !fields.includes(key))) throw Error('MOUNT_CAS_FIELDS_INVALID');
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
    if (options.cultivationCAS) {
      const expected = options.cultivationCAS;
      filter.$and = (filter.$and || []).concat(['level', 'exp', 'roleInfo', 'items', 'currencies', 'other_attr_info', 'taskInfo'].map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
    if (!allowLevelDowngrade && incomingLevel > 0) {
      filter.$or = [
        { level: { $exists: false } },
        { level: { $lte: incomingLevel } },
      ];
    }
    if (options && options.returnSaved === false) {
      try {
        // This is a cloned lean snapshot. Native update avoids Mongoose recursively
        // casting every nested path while preserving timestamp and stale-save filter.
        updateData.updatedAt = new Date();
        const dbStartedAt = Date.now();
        const writeResult = await withRetry(() => Player.collection.updateOne(
          filter,
          { $set: updateData },
          { maxTimeMS: DB_OPERATION_TIMEOUT_MS }
        ));
        const dbMs = Date.now() - dbStartedAt;
        if (cloneMs >= 50 || dbMs >= 100) {
          logger.warn(`[Perf][PlayerSave] user=${userId} cloneMs=${cloneMs} dbMs=${dbMs} totalMs=${Date.now() - saveStartedAt}`);
        }
        const matched = Number(
          writeResult && (writeResult.matchedCount ?? writeResult.n)
        ) || 0;
        if (!matched) {
          if (!allowLevelDowngrade && incomingLevel > 0) {
            logger.warn(`[Player] skip stale save user=${userId} incomingLevel=${incomingLevel}`);
          }
          return null;
        }
        markSaved(sourceData);
        oldTrekSnapshots.rememberConfirmed(sourceData, snapshot, onlyFields ? [...onlyFields] : null);
        rememberFortuneBalances(sourceData);
        // Legacy helpers may assign a truthy save result to session.player.
        // Return the in-memory object so the fast path cannot poison the session.
        return sourceData;
      } finally {
        clearSaveScheduled(sourceData, scheduledAt);
      }
    }
    try {
      const saved = await withRetry(() =>
        Player.findOneAndUpdate(
          filter,
          { $set: updateData },
          { returnDocument: 'after', lean: true, maxTimeMS: DB_OPERATION_TIMEOUT_MS }
        )
      );
      if (!saved && !allowLevelDowngrade && incomingLevel > 0) {
        const current = await loadPlayer(userId);
        logger.warn(
          `[Player] skip stale save user=${userId} incomingLevel=${incomingLevel} `
          + `currentLevel=${current && current.level != null ? current.level : 'missing'}`
        );
        const stale = attachTaskSyncMeta(current, taskSyncMeta);
        markSaved(sourceData);
        markSaved(stale);
        return stale;
      }
      const result = attachTaskSyncMeta(saved, taskSyncMeta);
      if (saved) {
        oldTrekSnapshots.rememberConfirmed(sourceData, snapshot, onlyFields ? [...onlyFields] : null);
        oldTrekSnapshots.transfer(result, sourceData);
      }
      markSaved(sourceData);
      markSaved(result);
      rememberFortuneBalances(result);
      return result;
    } finally {
      clearSaveScheduled(sourceData, scheduledAt);
    }
  });
}

/**
 * Defer the synchronous player snapshot until after the current handler has
 * returned its protocol response. This keeps hot gameplay RPCs responsive
 * even when the in-memory player document has grown large.
 */
async function saveOldTrekScoped(userId, before, draft) {
  if (process.env.OLD_TREK_SCOPED_CAS !== '1') throw Error('OLD_TREK_SCOPED_DISABLED');
  if (!before || !draft || before.userId !== userId || draft.userId !== userId) throw Error('OLD_TREK_IDENTITY_INVALID');
  reconcileFortuneConsumableSpend(draft);
  syncCurrencyItems(draft);
  const patch = oldTrekSnapshots.patch(before, draft);
  const update = { $set: { ...patch.set, updatedAt: new Date() } };
  if (Object.keys(patch.unset).length) update.$unset = patch.unset;
  return enqueueSave(userId, async () => {
    const saved = await withRetry(() => Player.findOneAndUpdate(
      { userId, $and: patch.conditions }, update,
      { returnDocument: 'after', lean: true, maxTimeMS: DB_OPERATION_TIMEOUT_MS }
    ));
    if (!saved) {
      logger.warn('[OldTrek] scoped CAS mismatch; fields=' + Object.keys(patch.set).join(','));
      return null;
    }
    attachTaskSyncMeta(saved, getTaskSyncMeta(draft));
    oldTrekSnapshots.remember(saved);
    markSaved(saved);
    return rememberFortuneBalances(saved);
  });
}

function savePlayerDeferred(userId, data, options = {}) {
  return new Promise((resolve, reject) => {
    const key = String(userId || '');
    if (!key) {
      reject(new Error('savePlayerDeferred requires userId'));
      return;
    }
    markSaveScheduled(data);
    reconcileFortuneConsumableSpend(data);
    let state = deferredSaveStates.get(key);
    if (!state) {
      state = {
        running: false,
        timer: null,
        pending: null,
        waiters: [],
      };
      deferredSaveStates.set(key, state);
    }

    // Full player snapshots supersede older snapshots that have not started
    // writing yet. Keep every caller's promise and settle them together after
    // the newest state has been persisted.
    state.pending = { data, options: { ...options, fortuneConsumptionTracked: true } };
    state.waiters.push({ resolve, reject });
    if (!state.running && !state.timer) {
      state.timer = setTimeout(() => flushDeferredSave(key), DEFERRED_SAVE_COALESCE_MS);
    }
  });
}

function flushDeferredSave(key) {
  const state = deferredSaveStates.get(key);
  if (!state) return Promise.resolve();
  if (state.running) return state.completion || Promise.resolve();
  state.completion = flushDeferredSaveNow(key);
  return state.completion;
}

async function flushDeferredSaveNow(key) {
  const state = deferredSaveStates.get(key);
  if (!state || state.running) return;
  state.timer = null;
  state.running = true;
  try {
    while (state.pending) {
      const pending = state.pending;
      const waiters = state.waiters.splice(0);
      state.pending = null;
      try {
        // Clone once, at flush time, after the short coalescing window. The
        // save path is told not to clone the same snapshot a second time.
        reconcileFortuneConsumableSpend(pending.data);
        sanitizeArenaReceiptLedger(pending.data);
        const snapshot = cloneSaveData(pending.data);
        const result = await savePlayer(key, snapshot, {
          ...pending.options,
          returnSaved: false,
          snapshotProvided: true,
        });
        // The object queued by the caller may have been mutated while the
        // confirmed snapshot was being written. Record the durable snapshot
        // as its ancestor, never the mutable post-flush object. This lets a
        // later three-way rebase preserve the caller's newer local change.
        if (result) {
          const fields = Array.isArray(pending.options && pending.options.onlyFields)
            ? pending.options.onlyFields : null;
          oldTrekSnapshots.rememberConfirmed(pending.data, snapshot, fields);
        }
        waiters.forEach((waiter) => waiter.resolve(result));
      } catch (err) {
        waiters.forEach((waiter) => waiter.reject(err));
      }
    }
  } finally {
    state.running = false;
    if (state.pending) {
      if (!state.timer) {
        state.timer = setTimeout(() => flushDeferredSave(key), DEFERRED_SAVE_COALESCE_MS);
      }
    } else if (deferredSaveStates.get(key) === state) {
      deferredSaveStates.delete(key);
    }
  }
}

// Call while holding the role mutation lock, before an external cash writer
// reads the player. This includes snapshots already queued and delayed saves.
async function drainPendingSaves(userId) {
  const key = String(userId || '');
  for (;;) {
    const state = deferredSaveStates.get(key);
    if (state && state.timer) { clearTimeout(state.timer); state.timer = null; }
    if (state) await flushDeferredSave(key);
    const queued = saveQueues.get(key);
    if (queued) await queued;
    if (!deferredSaveStates.has(key) && !saveQueues.has(key)) return;
  }
}

async function resetPlayerForServerSwitch(userId, options = {}) {
  const player = await loadPlayer(userId);
  if (!player) return null;
  const resetRoleSelection = options.resetRoleSelection === true;
  const fresh = buildFreshPlayerData(userId, player.name || `Player_${userId}`, {
    accountId: player.accountId,
    roleId: player.roleId,
    inviteCode: player.inviteCode,
    agentId: player.agentId,
  }, { preservePlayerId: player.playerId });

  fresh._id = player._id;
  fresh.userId = player.userId || userId;
  fresh.playerId = player.playerId || fresh.playerId;
  fresh.name = player.name || fresh.name;
  fresh.accountId = player.accountId;
  fresh.roleId = player.roleId;
  fresh.serverSwitchResetAt = Date.now();

  if (resetRoleSelection) {
    fresh.roleInfo = {
      ...(fresh.roleInfo && typeof fresh.roleInfo === 'object' ? fresh.roleInfo : {}),
      kungfuId: 0,
      subJob: 0,
    };
    if (fresh.fashionInfo && typeof fresh.fashionInfo === 'object') {
      fresh.fashionInfo.curFashion = {};
      fresh.fashionInfo.fashionMap = {};
    }
  }

  return savePlayer(userId, fresh, { allowLevelDowngrade: true });
}

async function resetPlayerGameData(userId, options = {}) {
  const player = await loadPlayer(userId);
  if (!player) return null;

  const fresh = buildFreshPlayerData(userId, player.name || `Player_${userId}`, {
    accountId: player.accountId,
    inviteCode: player.inviteCode,
    agentId: player.agentId,
    adminStatus: player.adminStatus,
  }, { preservePlayerId: player.playerId });

  fresh.userId = player.userId || userId;
  fresh.playerId = player.playerId || fresh.playerId;
  fresh.name = player.name || fresh.name;
  fresh.accountId = player.accountId;
  fresh.createdAt = player.createdAt;
  fresh.clearGameDataAt = Date.now();
  fresh.clearGameDataReason = String(options.reason || 'admin_clear_game_data').slice(0, 128);

  const { _id, __v, ...replacement } = fresh;
  syncCurrencyItems(replacement);
  return withRetry(() => Player.findOneAndReplace(
    { userId },
    replacement,
    { returnDocument: 'after', lean: true, maxTimeMS: DB_OPERATION_TIMEOUT_MS }
  ));
}

/**
 * 通过 playerId 查找玩家
 * @param {string} playerId
 * @returns {Promise<Object|null>}
 */
async function findByPlayerId(playerId) {
  return withRetry(() => Player.findOne({ playerId }).maxTimeMS(DB_OPERATION_TIMEOUT_MS).lean());
}

async function findByDbidOrPlayerId(id) {
  const value = String(id || '').trim();
  if (!value) return null;
  const filters = [{ playerId: value }];
  if (/^[0-9a-fA-F]{24}$/.test(value)) {
    filters.push({ _id: value });
  }
  return withRetry(() => Player.findOne({ $or: filters }).maxTimeMS(DB_OPERATION_TIMEOUT_MS).lean());
}

async function listPlayersBasic(filter = {}, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return withRetry(() => Player.find(filter)
    .select({
      userId: 1,
      playerId: 1,
      name: 1,
      avatar: 1,
      avatarUrl: 1,
      avatarFrame: 1,
      guildInfo: 1,
      farmInfo: 1,
      roleInfo: 1,
      level: 1,
    })
    .limit(safeLimit)
    .maxTimeMS(DB_OPERATION_TIMEOUT_MS)
    .lean());
}

module.exports = {
  loadPlayer,
  loadTowerPlayer,
  createPlayer,
  savePlayer,
  saveOldTrekScoped,
  prepareOldTrekSnapshot(player) {
    if (process.env.OLD_TREK_SCOPED_CAS === '1') oldTrekSnapshots.remember(player);
    return player;
  },
  savePlayerDeferred,
  drainPendingSaves,
  wasRecentlySaved,
  resetPlayerForServerSwitch,
  resetPlayerGameData,
  findByPlayerId,
  findByDbidOrPlayerId,
  listPlayersBasic,
  sanitizeArenaReceiptLedger,
};
