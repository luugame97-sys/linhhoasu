/**
 * RealBotWorker
 *
 * A small, bounded WebSocket client worker for phase 2. It speaks the native
 * game protocol, authenticates with a server-only token and marks every
 * session as a managed bot. When map farming is enabled it uses the same
 * normal-map auto-delegate RPC as the client (2000 -> 2001), so the server
 * owns the monster claim and reward; it never sends purchase, recharge, guild
 * or ranking actions.
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const WebSocket = require('ws');
const { Pack, Unpack } = require('../protocol/Codec');
const configService = require('../services/ConfigService');
const mapMonsterService = require('../services/MapMonsterService');
const preparedNames = require('../services/PreparedNameService');
const preparedChat = require('../services/PreparedChatService');
const logger = require('../logger');

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function parseFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseIdList(value, fallback) {
  const rows = String(value || '')
    .split(',')
    .map((entry) => toSafeInt(entry.trim(), 0))
    .filter((id) => id > 0);
  return rows.length > 0 ? Array.from(new Set(rows)) : fallback.slice();
}

function isAllMapSelection(value) {
  return String(value || '').trim().toLowerCase() === 'all';
}

function getConfiguredNormalMapIds() {
  const mapConfig = configService.get('MapConfig') || {};
  return Object.keys(mapConfig)
    .map((key) => Number(key))
    .filter((id) => Number.isFinite(id) && id > 0 && Number(mapConfig[id] && mapConfig[id].type) === 1)
    .sort((left, right) => left - right);
}

function getMapPoints(mapId) {
  const mapConfig = configService.get('MapConfig') || {};
  const row = mapConfig[mapId] || mapConfig[String(mapId)] || {};
  return Array.isArray(row.bornPoints)
    ? row.bornPoints
      .map((point) => ({ x: toSafeInt(point && point.x, 0), y: toSafeInt(point && point.y, 0) }))
      .filter((point) => point.x > 0 && point.y > 0)
    : [];
}

const REAL_BOT_SLOT_OFFSETS = [
  { x: 0, y: 0 },
  { x: -280, y: -180 },
  { x: 280, y: 180 },
  { x: -280, y: 180 },
  { x: 280, y: -180 },
];

function applySlotOffset(point = {}, slot = 0) {
  const offset = REAL_BOT_SLOT_OFFSETS[Math.abs(toSafeInt(slot, 0)) % REAL_BOT_SLOT_OFFSETS.length];
  return {
    x: toSafeInt(point.x, 1029) + offset.x,
    y: toSafeInt(point.y, 1374) + offset.y,
  };
}

function resolveBotAssignment(index, mapIds) {
  const ids = Array.isArray(mapIds) && mapIds.length > 0 ? mapIds : [10001];
  const safeIndex = Math.max(0, toSafeInt(index, 0));
  const mapIndex = safeIndex % ids.length;
  const mapSlot = Math.floor(safeIndex / ids.length);
  const mapId = ids[mapIndex] || 10001;
  const points = getMapPoints(mapId);
  let monsterSlots = [];
  try {
    monsterSlots = mapMonsterService.getSlots(mapId);
  } catch (err) {
    logger.warn(`[RealBots] map monster manifest failed map=${mapId}: ${err.message}`);
  }
  const spawnPoint = applySlotOffset(
    points[mapSlot % Math.max(1, points.length)] || { x: 1029, y: 1374 },
    mapSlot
  );
  const monsterSlot = monsterSlots.length > 0
    ? monsterSlots[mapSlot % monsterSlots.length]
    : null;
  return {
    mapId,
    mapIndex,
    mapSlot,
    points,
    monsterSlots,
    monsterCursor: monsterSlot ? monsterSlot.index : 0,
    x: spawnPoint.x,
    y: spawnPoint.y,
  };
}

function randomInt(min, max) {
  const lower = Math.max(0, toSafeInt(min, 0));
  const upper = Math.max(lower, toSafeInt(max, lower));
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function buildToken() {
  return crypto.randomBytes(8).toString('hex');
}

function mapActivityKey(mapId, line = 0) {
  return `${Math.max(0, toSafeInt(mapId, 0))}:${Math.max(0, toSafeInt(line, 0))}`;
}

function parseActiveMapPayload(payload = {}) {
  const activity = payload && payload.activity && typeof payload.activity === 'object'
    ? payload.activity
    : payload;
  const rows = Array.isArray(activity && activity.maps) ? activity.maps : [];
  return new Set(rows
    .filter((row) => row && toSafeInt(row.count, 0) > 0 && toSafeInt(row.mapId, 0) > 0)
    .map((row) => mapActivityKey(row.mapId, row.line)));
}

class RealBotWorker {
  constructor(options = {}) {
    configService.loadAllTables();
    this.enabled = parseFlag(options.enabled ?? process.env.BOT_WORKER_ENABLED, false);
    this.wsUrl = String(options.wsUrl || process.env.BOT_WORKER_WS_URL || 'ws://127.0.0.1:9200').trim();
    this.token = String(options.token || process.env.BOT_WORKER_TOKEN || '').trim();
    this.count = Math.max(0, toSafeInt(options.count ?? process.env.BOT_WORKER_COUNT, 0));
    this.serverId = Math.max(1, toSafeInt(options.serverId ?? process.env.BOT_WORKER_SERVER_ID, 1001));
    const mapSelection = options.mapIds ?? process.env.BOT_WORKER_MAP_IDS;
    this.allMaps = isAllMapSelection(mapSelection);
    this.mapIds = this.allMaps
      ? getConfiguredNormalMapIds()
      : parseIdList(mapSelection, [10001]);
    this.line = Math.max(0, toSafeInt(options.line ?? process.env.BOT_WORKER_MAP_LINE, 0));
    this.heartbeatMs = Math.max(10000, toSafeInt(options.heartbeatMs ?? process.env.BOT_WORKER_HEARTBEAT_MS, 20000));
    this.moveMinMs = Math.max(15000, toSafeInt(options.moveMinMs ?? process.env.BOT_WORKER_MOVE_MIN_MS, 30000));
    this.moveMaxMs = Math.max(this.moveMinMs, toSafeInt(options.moveMaxMs ?? process.env.BOT_WORKER_MOVE_MAX_MS, 60000));
    this.chatEnabled = parseFlag(options.chatEnabled ?? process.env.BOT_WORKER_CHAT_ENABLED, true);
    this.chatMinMs = Math.max(60000, toSafeInt(options.chatMinMs ?? process.env.BOT_WORKER_CHAT_MIN_MS, 120000));
    this.chatMaxMs = Math.max(this.chatMinMs, toSafeInt(options.chatMaxMs ?? process.env.BOT_WORKER_CHAT_MAX_MS, 300000));
    this.farmEnabled = parseFlag(options.farmEnabled ?? process.env.BOT_WORKER_FARM_ENABLED, false);
    // Empty maps stay deliberately slow; maps with human observers use the
    // separate active pace below so players can actually see auto-delegation.
    this.farmMinMs = Math.max(60000, toSafeInt(options.farmMinMs ?? process.env.BOT_WORKER_FARM_MIN_MS, 120000));
    this.farmMaxMs = Math.max(this.farmMinMs, toSafeInt(options.farmMaxMs ?? process.env.BOT_WORKER_FARM_MAX_MS, 180000));
    this.activeFarmMinMs = Math.max(4000, toSafeInt(
      options.activeFarmMinMs ?? process.env.BOT_WORKER_ACTIVE_FARM_MIN_MS,
      15000,
    ));
    this.activeFarmMaxMs = Math.max(this.activeFarmMinMs, toSafeInt(
      options.activeFarmMaxMs ?? process.env.BOT_WORKER_ACTIVE_FARM_MAX_MS,
      25000,
    ));
    this.farmSpeedUp = parseFlag(
      options.farmSpeedUp ?? process.env.BOT_WORKER_FARM_SPEED_UP,
      true,
    );
    this.activityUrl = String(
      options.activityUrl || process.env.BOT_WORKER_ACTIVITY_URL || 'http://127.0.0.1:9200/bot-activity',
    ).trim();
    this.activityPollMs = Math.max(2000, toSafeInt(
      options.activityPollMs ?? process.env.BOT_WORKER_ACTIVITY_POLL_MS,
      5000,
    ));
    this.activityWakeBaseMs = Math.max(500, toSafeInt(
      options.activityWakeBaseMs ?? process.env.BOT_WORKER_ACTIVITY_WAKE_BASE_MS,
      1000,
    ));
    this.activityWakeStepMs = Math.max(100, toSafeInt(
      options.activityWakeStepMs ?? process.env.BOT_WORKER_ACTIVITY_WAKE_STEP_MS,
      300,
    ));
    this.farmCount = Math.max(1, Math.min(10, toSafeInt(
      options.farmCount ?? process.env.BOT_WORKER_FARM_COUNT,
      1,
    )));
    this.farmMoveSettleMs = Math.max(250, toSafeInt(
      options.farmMoveSettleMs ?? process.env.BOT_WORKER_FARM_MOVE_SETTLE_MS,
      750,
    ));
    this.farmClaimDelayMs = Math.max(250, toSafeInt(
      options.farmClaimDelayMs ?? process.env.BOT_WORKER_FARM_CLAIM_DELAY_MS,
      1800,
    ));
    this.farmClaimTimeoutMs = Math.max(5000, toSafeInt(
      options.farmClaimTimeoutMs ?? process.env.BOT_WORKER_FARM_CLAIM_TIMEOUT_MS,
      12000,
    ));
    this.farmRespawnMs = Math.max(1000, toSafeInt(
      options.farmRespawnMs ?? process.env.BOT_WORKER_FARM_RESPAWN_MS,
      10000,
    ));
    this.farmLogEnabled = parseFlag(
      options.farmLogEnabled ?? process.env.BOT_WORKER_FARM_LOG,
      false,
    );
    this.farmLogSampleRate = Math.max(1, toSafeInt(
      options.farmLogSampleRate ?? process.env.BOT_WORKER_FARM_LOG_SAMPLE_RATE,
      10,
    ));
    this.connectIntervalMs = Math.max(250, toSafeInt(options.connectIntervalMs ?? process.env.BOT_WORKER_CONNECT_INTERVAL_MS, 750));
    // Keep managed bot sockets dormant until a real player is present on the
    // bot's assigned map.  This is deliberately opt-in so an older worker can
    // be rolled back by removing the flag without changing protocol behavior.
    this.lazyMapActivation = parseFlag(
      options.lazyMapActivation ?? process.env.BOT_WORKER_LAZY_MAP_ACTIVATION,
      false,
    );
    this.lazyDisconnectGraceMs = Math.max(1000, toSafeInt(
      options.lazyDisconnectGraceMs ?? process.env.BOT_WORKER_LAZY_DISCONNECT_GRACE_MS,
      60000,
    ));
    this.lazyBotsPerMap = Math.max(1, Math.min(10, toSafeInt(
      options.lazyBotsPerMap ?? process.env.BOT_WORKER_LAZY_BOTS_PER_MAP,
      2,
    )));
    this.lazyMaxActive = Math.max(1, Math.min(100, toSafeInt(
      options.lazyMaxActive ?? process.env.BOT_WORKER_LAZY_MAX_ACTIVE,
      60,
    )));
    this.lazyDrainTimeoutMs = Math.max(1000, toSafeInt(
      options.lazyDrainTimeoutMs ?? process.env.BOT_WORKER_LAZY_DRAIN_TIMEOUT_MS,
      30000,
    ));
    this.lazyActivityStaleMs = Math.max(this.activityPollMs * 2, toSafeInt(
      options.lazyActivityStaleMs ?? process.env.BOT_WORKER_LAZY_ACTIVITY_STALE_MS,
      90000,
    ));
    this.connections = new Map();
    // The same tracked queue is used by the legacy startup path, so stop/restart
    // cannot leave old staggered callbacks able to open a second generation.
    this.lazyConnectTimers = new Map();
    this.assignmentCache = new Map();
    this.lazyNormalMapIds = new Set(getConfiguredNormalMapIds());
    this.lifecycleGeneration = 0;
    this.activityRequest = null;
    this.activitySampleSeen = false;
    this.lastDesiredSignature = '';
    this.stopping = false;
    this.started = false;
    this.keepAliveTimer = null;
    this.activityPollTimer = null;
    this.activeMapKeys = new Set();
    this.metrics = {
      farmAttempts: 0,
      farmOpenSuccess: 0,
      farmClaimSuccess: 0,
      farmBusy: 0,
      farmInvalid: 0,
      farmTimeout: 0,
      farmErrors: 0,
      farmNoTarget: 0,
      lastFarmAt: 0,
      activityPolls: 0,
      activityPollErrors: 0,
      activityWakeups: 0,
      lastActivityPollAt: 0,
      lazyConnectScheduled: 0,
      lazyConnects: 0,
      lazyDisconnects: 0,
      lazyDrainTimeouts: 0,
    };

    if (this.farmEnabled) {
      try {
        mapMonsterService.load();
      } catch (err) {
        logger.warn(`[RealBots] map monster manifest unavailable: ${err.message}`);
      }
    }
  }

  start() {
    if (this.started) return this.getStats();
    this.stopping = false;
    this.lifecycleGeneration += 1;
    this.started = true;
    if (!this.enabled || this.count <= 0) {
      logger.info('[RealBots] worker disabled or count=0');
      return this.getStats();
    }
    if (!this.token) {
      throw new Error('BOT_WORKER_TOKEN_REQUIRED');
    }
    this.keepAliveTimer = setInterval(() => {}, 60000);
    this._pollActivity();
    this.activityPollTimer = setInterval(() => {
      this._syncLazyConnections();
      this._pollActivity();
    }, this.activityPollMs);
    if (typeof this.activityPollTimer.unref === 'function') this.activityPollTimer.unref();
    if (!this.lazyMapActivation) {
      for (let index = 0; index < this.count; index += 1) {
        this._scheduleConnect(index, index * this.connectIntervalMs);
      }
    }
    logger.warn(
      `[RealBots] worker started count=${this.count} ws=${this.wsUrl} `
      + `maps=${this.mapIds.join(',')} line=${this.line} `
      + `lazyMaps=${this.lazyMapActivation ? 1 : 0}`
    );
    return this.getStats();
  }

  stop() {
    this.stopping = true;
    this.started = false;
    this.lifecycleGeneration += 1;
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    if (this.activityPollTimer) clearInterval(this.activityPollTimer);
    this.keepAliveTimer = null;
    this.activityPollTimer = null;
    for (const timer of this.lazyConnectTimers.values()) clearTimeout(timer);
    this.lazyConnectTimers.clear();
    const poll = this.activityRequest;
    this.activityRequest = null;
    if (poll && poll.request) poll.request.destroy();
    for (const state of this.connections.values()) {
      this._clearTimers(state);
      state.pendingFarm = null;
      if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.close(1000, 'worker stop');
      else if (state.ws && state.ws.readyState === WebSocket.CONNECTING) state.ws.terminate();
    }
    this.connections.clear();
    this.activeMapKeys.clear();
    this.activitySampleSeen = false;
  }

  getStats() {
    const rows = Array.from(this.connections.values());
    return {
      enabled: this.enabled,
      count: this.count,
      connected: rows.filter((row) => row.ws && row.ws.readyState === WebSocket.OPEN).length,
      loggedIn: rows.filter((row) => row.loggedIn).length,
      mapEntered: rows.filter((row) => row.mapEntered).length,
      wsUrl: this.wsUrl,
      maps: this.mapIds.slice(),
      line: this.line,
      allMaps: this.allMaps,
      connectIntervalMs: this.connectIntervalMs,
      farmEnabled: this.farmEnabled,
      lazyMapActivation: this.lazyMapActivation,
      lazyDisconnectGraceMs: this.lazyDisconnectGraceMs,
      lazyBotsPerMap: this.lazyBotsPerMap,
      lazyMaxActive: this.lazyMaxActive,
      lazyDrainTimeoutMs: this.lazyDrainTimeoutMs,
      lazyActivityStaleMs: this.lazyActivityStaleMs,
      activityFresh: this._activityIsFresh(),
      dormant: rows.filter((row) => row.dormantSince != null && !row.lazyClosing).length,
      draining: rows.filter((row) => row.draining && !row.lazyClosing).length,
      closing: rows.filter((row) => row.lazyClosing).length,
      farmMinMs: this.farmMinMs,
      farmMaxMs: this.farmMaxMs,
      activeFarmMinMs: this.activeFarmMinMs,
      activeFarmMaxMs: this.activeFarmMaxMs,
      farmSpeedUp: this.farmSpeedUp,
      activityUrl: this.activityUrl,
      activityPollMs: this.activityPollMs,
      activityWakeBaseMs: this.activityWakeBaseMs,
      activityWakeStepMs: this.activityWakeStepMs,
      activeMaps: Array.from(this.activeMapKeys).sort(),
      desiredBotCount: this.lazyMapActivation ? this._desiredBotIndices().length : this.count,
      lazyConnectTimers: this.lazyConnectTimers.size,
      farmCount: this.farmCount,
      farmProtocol: 'map-monster-2000-2001',
      farmLogEnabled: this.farmLogEnabled,
      farmLogSampleRate: this.farmLogSampleRate,
      mapMonsterManifest: mapMonsterService.getStats(),
      farmMetrics: { ...this.metrics },
    };
  }

  _getAssignment(index) {
    const safeIndex = Math.max(0, toSafeInt(index, 0));
    if (!this.assignmentCache.has(safeIndex)) {
      this.assignmentCache.set(safeIndex, resolveBotAssignment(safeIndex, this.mapIds));
    }
    return this.assignmentCache.get(safeIndex);
  }

  _isIndexDesired(index) {
    if (!this.lazyMapActivation) return true;
    return this._desiredBotIndices().includes(index);
  }

  _activityIsFresh() {
    return this.activitySampleSeen
      && Date.now() - this.metrics.lastActivityPollAt < this.lazyActivityStaleMs;
  }

  _isCurrent(state) {
    return !this.stopping && state && !state.lazyClosing
      && this.connections.get(state.index) === state
      && state.generation === this.lifecycleGeneration;
  }

  _canAct(state) {
    return this._isCurrent(state)
      && (!this.lazyMapActivation || this._isIndexDesired(state.index));
  }

  _desiredBotIndices() {
    if (!this.lazyMapActivation) {
      return Array.from({ length: this.count }, (_unused, index) => index);
    }
    if (!this._activityIsFresh() || this.mapIds.length === 0) return [];
    const desired = [];
    // Slot-major order grants one bot per occupied map before its second/third.
    // Assignment is unchanged: an existing bot keeps its account and home map.
    for (let index = 0; index < this.count; index += 1) {
      const mapId = this.mapIds[index % this.mapIds.length];
      const slot = Math.floor(index / this.mapIds.length);
      if (slot >= this.lazyBotsPerMap) break;
      if (this.lazyNormalMapIds.has(mapId)
        && this.activeMapKeys.has(mapActivityKey(mapId, this.line))) desired.push(index);
      if (desired.length >= this.lazyMaxActive) break;
    }
    return desired;
  }

  _scheduleConnect(index, delayMs = 0) {
    const safeIndex = Math.max(0, toSafeInt(index, 0));
    if (this.stopping || !this.started || safeIndex >= this.count || !this._isIndexDesired(safeIndex)) return;
    if (this.connections.has(safeIndex) || this.lazyConnectTimers.has(safeIndex)) return;
    if (this.lazyMapActivation
      && this.connections.size + this.lazyConnectTimers.size >= this.lazyMaxActive) return;
    const generation = this.lifecycleGeneration;
    const timer = setTimeout(() => {
      if (this.lazyConnectTimers.get(safeIndex) !== timer) return;
      this.lazyConnectTimers.delete(safeIndex);
      if (!this.stopping && generation === this.lifecycleGeneration
        && this._isIndexDesired(safeIndex)) this._connect(safeIndex);
    }, Math.max(0, toSafeInt(delayMs, 0)));
    if (typeof timer.unref === 'function') timer.unref();
    this.lazyConnectTimers.set(safeIndex, timer);
    this.metrics.lazyConnectScheduled += 1;
  }

  _disconnectDormantState(state) {
    if (!state || state.lazyClosing || this.connections.get(state.index) !== state) return;
    state.lazyClosing = true;
    state.reconnects = 0;
    this._clearTimers(state);
    state.pendingFarm = null;
    state.loggedIn = false;
    state.mapEntered = false;
    this.metrics.lazyDisconnects += 1;
    logger.info(`[RealBots] dormant close id=${state.id} map=${state.mapId}`);
    if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
      state.closeTimer = setTimeout(() => {
        if (state.ws.readyState !== WebSocket.CLOSED) state.ws.terminate();
      }, 5000);
      state.closeTimer.unref?.();
      if (state.ws.readyState === WebSocket.CONNECTING) state.ws.terminate();
      else state.ws.close(1000, 'map dormant');
    } else if (this.connections.get(state.index) === state) {
      this.connections.delete(state.index);
    }
  }

  _tryDormantClose(state) {
    if (!this._isCurrent(state) || state.dormantSince == null) return;
    if (this._isIndexDesired(state.index)) return this._syncLazyConnections();
    const remaining = this.lazyDisconnectGraceMs - (Date.now() - state.dormantSince);
    if (remaining > 0) return;
    if (!state.pendingFarm) return this._disconnectDormantState(state);
    if (state.draining) return;
    state.draining = true;
    state.drainTimer = setTimeout(() => {
      if (!this._isCurrent(state) || this._isIndexDesired(state.index)) return;
      this.metrics.lazyDrainTimeouts += 1;
      logger.warn(`[RealBots] dormant drain timeout id=${state.id} stage=${state.pendingFarm?.stage || 'none'}`);
      this._disconnectDormantState(state);
    }, this.lazyDrainTimeoutMs);
    state.drainTimer.unref?.();
  }

  _syncLazyConnections() {
    if (!this.lazyMapActivation || this.stopping || !this.started) return;
    const desired = this._desiredBotIndices();
    const desiredSet = new Set(desired);
    for (const [index, timer] of this.lazyConnectTimers) {
      if (!desiredSet.has(index)) {
        clearTimeout(timer);
        this.lazyConnectTimers.delete(index);
      }
    }
    for (const state of Array.from(this.connections.values())) {
      if (state.lazyClosing) continue;
      if (desiredSet.has(state.index)) {
        if (state.dormantSince != null) {
          clearTimeout(state.idleTimer);
          clearTimeout(state.drainTimer);
          state.idleTimer = null;
          state.drainTimer = null;
          state.dormantSince = null;
          state.draining = false;
          if (state.loggedIn && state.mapEntered) {
            this._scheduleMove(state);
            if (this.chatEnabled) this._scheduleChat(state);
            if (!state.pendingFarm) this._scheduleFarm(state);
          }
        }
      } else if (state.dormantSince == null) {
        state.dormantSince = Date.now();
        for (const key of ['moveTimer', 'chatTimer', 'farmTimer']) {
          clearTimeout(state[key]);
          state[key] = null;
        }
        // A cycle not sent to the server yet needs no draining or reward claim.
        if (state.pendingFarm?.stage === 'moving') this._finishFarmCycle(state, 'map_empty_before_open');
        state.idleTimer = setTimeout(() => this._tryDormantClose(state), this.lazyDisconnectGraceMs);
        state.idleTimer.unref?.();
      }
    }
    let order = 0;
    for (const index of desired) {
      if (!this.connections.has(index) && !this.lazyConnectTimers.has(index)) {
        this._scheduleConnect(index, order++ * this.connectIntervalMs);
      }
    }
    const signature = desired.join(',');
    if (signature !== this.lastDesiredSignature) {
      this.lastDesiredSignature = signature;
      logger.info(`[RealBots] lazy target=${desired.length} sockets=${this.connections.size} queued=${this.lazyConnectTimers.size} fresh=${this._activityIsFresh() ? 1 : 0}`);
    }
  }

  _connect(index) {
    if (this.stopping || !this.started) return;
    const safeIndex = Math.max(0, toSafeInt(index, 0));
    if (this.lazyMapActivation && !this._isIndexDesired(safeIndex)) return;
    if (this.connections.has(safeIndex)) return;
    if (this.lazyMapActivation && this.connections.size >= this.lazyMaxActive) return;
    const id = `lhs_real_bot_${String(index + 1).padStart(3, '0')}`;
    const name = preparedNames.getNameByIndex(290 + index) || `Hành giả thật ${index + 1}`;
    const assignment = this._getAssignment(safeIndex);
    const state = {
      index: safeIndex,
      id,
      name,
      ws: null,
      msgUid: 1,
      loggedIn: false,
      mapEntered: false,
      mapId: assignment.mapId,
      mapIndex: assignment.mapIndex,
      mapSlot: assignment.mapSlot,
      points: assignment.points,
      monsterSlots: assignment.monsterSlots || [],
      monsterCursor: assignment.monsterCursor || 0,
      blockedMonsters: new Map(),
      waypointIndex: assignment.points.length > 0 ? (assignment.mapSlot + 1) % assignment.points.length : 0,
      x: assignment.x,
      y: assignment.y,
      levelId: 1,
      line: this.line,
      reconnectTimer: null,
      heartbeatTimer: null,
      moveTimer: null,
      chatTimer: null,
      farmTimer: null,
      farmMoveTimer: null,
      farmClaimTimer: null,
      farmTimeoutTimer: null,
      pendingFarm: null,
      mapRetryTimer: null,
      reconnects: 0,
      lazyClosing: false,
      dormantSince: null,
      draining: false,
      generation: this.lifecycleGeneration,
    };
    this.connections.set(safeIndex, state);

    const ws = new WebSocket(this.wsUrl, {
      headers: { Origin: 'http://127.0.0.1' },
      handshakeTimeout: 10000,
    });
    state.ws = ws;
    if (this.lazyMapActivation) this.metrics.lazyConnects += 1;
    ws.on('open', () => this._onOpen(state));
    ws.on('message', (raw) => this._onMessage(state, raw));
    ws.on('error', (err) => logger.warn(`[RealBots] socket error id=${id}: ${err.message}`));
    ws.on('close', () => this._onClose(state));
  }

  _onOpen(state) {
    if (!this._isCurrent(state)) return;
    if (!this._isIndexDesired(state.index)) return this._disconnectDormantState(state);
    state.reconnects = 0;
    this._send(state, 1, {
      platformuid: state.id,
      userid: state.id,
      userId: state.id,
      serverid: this.serverId,
      serverId: this.serverId,
      firstName: state.name,
      botToken: this.token,
      botWorkerId: 'phase2',
      botAutomation: this.farmEnabled ? 'map_auto_delegate' : 'map_presence',
    }, 1);
    state.msgUid = 2;
    state.heartbeatTimer = setInterval(() => this._send(state, 11, {}, 0), this.heartbeatMs);
    if (typeof state.heartbeatTimer.unref === 'function') state.heartbeatTimer.unref();
  }

  _onMessage(state, raw) {
    if (!this._isCurrent(state)) return;
    let decoded;
    try {
      decoded = Unpack(Buffer.isBuffer(raw)
        ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
        : raw);
    } catch (err) {
      logger.warn(`[RealBots] decode failed id=${state.id}: ${err.message}`);
      return;
    }
    const messages = Array.isArray(decoded) ? decoded : [decoded];
    for (const message of messages) {
      if (!message || message.tag === undefined) continue;
      if (message.err) {
        this._handleFarmError(state, message, message.err);
        continue;
      }
      if (Number(message.tag) === 1 && Number(message.msgUid) === 1 && message.data && Number(message.data.result) === 0) {
        state.loggedIn = true;
        this._enterMap(state);
      }
      if (Number(message.tag) === 1400 && state.mapRetryTimer) {
        // The first map-enter push is the authoritative ACK. Cancel the
        // defensive retry so every bot does not emit a needless duplicate
        // 1400 three seconds after login.
        clearTimeout(state.mapRetryTimer);
        state.mapRetryTimer = null;
      }
      if (Number(message.tag) === 2000) {
        this._handleFarmOpenResponse(state, message);
      } else if (Number(message.tag) === 2001) {
        this._handleFarmClaimResponse(state, message);
      } else if (Number(message.tag) === 2150) {
        this._handleOtherMonsterOpen(state, message.data || {});
      } else if (Number(message.tag) === 9) {
        this._handleFarmError(state, message, message.data || {});
      }
    }
  }

  _enterMap(state) {
    if (this.lazyMapActivation && !this._isIndexDesired(state.index)) {
      this._disconnectDormantState(state);
      return;
    }
    if (state.mapEntered) return;
    state.mapEntered = true;
    this._sendMapEnter(state);
    state.mapRetryTimer = setTimeout(() => this._sendMapEnter(state), 3000);
    if (typeof state.mapRetryTimer.unref === 'function') state.mapRetryTimer.unref();
    this._scheduleMove(state, 7000);
    if (this.chatEnabled) this._scheduleChat(state, randomInt(15000, 45000));
    if (this.farmEnabled) {
      const initialFarmDelay = this._isActiveMap(state)
        ? this.activityWakeBaseMs + (state.mapSlot * this.activityWakeStepMs) + randomInt(0, 250)
        : this._resolveFarmDelay(state);
      this._scheduleFarm(state, initialFarmDelay);
    }
    logger.info(
      `[RealBots] logged in id=${state.id} name=${state.name} map=${state.mapId} `
      + `line=${state.line} spawn=${state.x},${state.y} slot=${state.mapSlot}`
    );
  }

  _sendMapEnter(state) {
    this._send(state, 1400, {
      mapId: state.mapId,
      line: state.line,
      x: state.x,
      y: state.y,
    }, 0);
  }

  _scheduleMove(state, delay = null) {
    if (!this._canAct(state)) return;
    if (state.moveTimer) clearTimeout(state.moveTimer);
    state.moveTimer = setTimeout(() => {
      if (!this._canAct(state) || !state.loggedIn || !state.mapEntered) return;
      // Do not overwrite the position used by a pending map-monster claim.
      // The server validates managed-bot distance before tag=2000; a periodic
      // presence move racing that RPC would make a legitimate farm cycle look
      // like a forged/remote target.
      if (state.pendingFarm) {
        this._scheduleMove(state, randomInt(this.moveMinMs, this.moveMaxMs));
        return;
      }
      const basePoint = state.points.length > 0
        ? state.points[state.waypointIndex++ % state.points.length]
        : {
          x: 1029 + randomInt(-500, 1800),
          y: 1374 + randomInt(-500, 1800),
        };
      const point = applySlotOffset(basePoint, state.mapSlot);
      state.x = toSafeInt(point.x, state.x);
      state.y = toSafeInt(point.y, state.y);
      this._send(state, 1402, {
        mapId: state.mapId,
        type: 0,
        x: state.x,
        y: state.y,
      }, 0);
      this._scheduleMove(state, randomInt(this.moveMinMs, this.moveMaxMs));
    }, delay == null ? randomInt(this.moveMinMs, this.moveMaxMs) : delay);
    if (typeof state.moveTimer.unref === 'function') state.moveTimer.unref();
  }

  _scheduleChat(state, delay = null) {
    if (!this._canAct(state)) return;
    if (state.chatTimer) clearTimeout(state.chatTimer);
    state.chatTimer = setTimeout(() => {
      if (!this._canAct(state) || !state.loggedIn || !state.mapEntered) return;
      const phrases = preparedChat.getPhrasesForName(state.name);
      const fallback = [
        'Chúc mọi người chơi vui nhé!',
        'Mình vừa tới bản đồ này.',
        'Có ai đang làm nhiệm vụ ở khu này không?',
      ];
      const pool = phrases.length > 0 ? phrases : fallback;
      const content = pool[randomInt(0, pool.length - 1)];
      this._send(state, 1600, {
        channel: 0,
        content,
        scope: 'map',
      }, 0);
      this._scheduleChat(state, randomInt(this.chatMinMs, this.chatMaxMs));
    }, delay == null ? randomInt(this.chatMinMs, this.chatMaxMs) : delay);
    if (typeof state.chatTimer.unref === 'function') state.chatTimer.unref();
  }

  _scheduleFarm(state, delay = null) {
    if (!this._canAct(state) || !this.farmEnabled) return;
    if (state.farmTimer) clearTimeout(state.farmTimer);
    const waitMs = delay == null
      ? this._resolveFarmDelay(state)
      : Math.max(0, toSafeInt(delay, 0));
    state.farmTimer = setTimeout(() => this._runFarmCycle(state), waitMs);
    if (typeof state.farmTimer.unref === 'function') state.farmTimer.unref();
  }

  _isActiveMap(state) {
    return Boolean(state && this.activeMapKeys.has(mapActivityKey(state.mapId, state.line)));
  }

  _resolveFarmDelay(state, retryDelayMs = null) {
    if (retryDelayMs != null) return Math.max(5000, toSafeInt(retryDelayMs, 5000));
    return this._isActiveMap(state)
      ? randomInt(this.activeFarmMinMs, this.activeFarmMaxMs)
      : randomInt(this.farmMinMs, this.farmMaxMs);
  }

  _pollActivity() {
    if (this.stopping || !this.activityUrl || this.activityRequest) return;
    const generation = this.lifecycleGeneration;
    const isCurrentPoll = () => !this.stopping && generation === this.lifecycleGeneration;
    let target;
    try {
      target = new URL(this.activityUrl);
    } catch (_err) {
      this.metrics.activityPollErrors += 1;
      return;
    }
    const transport = target.protocol === 'https:' ? https : http;
    const request = transport.get(target, { timeout: 2000 }, (response) => {
      if (!isCurrentPoll()) {
        if (typeof response.resume === 'function') response.resume();
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (!isCurrentPoll()) return;
        if (body.length < 65536) body += chunk;
      });
      response.on('end', () => {
        if (!isCurrentPoll()) return;
        if (response.statusCode !== 200) {
          this.metrics.activityPollErrors += 1;
          if (this.activityRequest && this.activityRequest.request === request) this.activityRequest = null;
          return;
        }
        try {
          const nextKeys = parseActiveMapPayload(JSON.parse(body));
          const newlyActive = Array.from(nextKeys).filter((key) => !this.activeMapKeys.has(key));
          this.activeMapKeys = nextKeys;
          this.activitySampleSeen = true;
          this.metrics.activityPolls += 1;
          this.metrics.lastActivityPollAt = Date.now();
          this._syncLazyConnections();
          for (const key of newlyActive) this._wakeMapBots(key);
        } catch (_err) {
          this.metrics.activityPollErrors += 1;
        }
        if (this.activityRequest && this.activityRequest.request === request) this.activityRequest = null;
      });
    });
    this.activityRequest = { request };
    request.on('timeout', () => request.destroy(new Error('activity poll timeout')));
    request.on('error', () => {
      if (!isCurrentPoll()) return;
      this.metrics.activityPollErrors += 1;
      if (this.activityRequest && this.activityRequest.request === request) this.activityRequest = null;
    });
  }

  _wakeMapBots(key) {
    const states = Array.from(this.connections.values())
      .filter((state) => state.loggedIn && state.mapEntered && mapActivityKey(state.mapId, state.line) === key)
      .sort((left, right) => left.mapSlot - right.mapSlot);
    states.forEach((state, order) => {
      if (state.pendingFarm) return;
      const wakeDelay = this.activityWakeBaseMs + (order * this.activityWakeStepMs) + randomInt(0, 250);
      this._scheduleFarm(state, wakeDelay);
      this.metrics.activityWakeups += 1;
    });
    if (states.length > 0) logger.info(`[RealBots] active map wake key=${key} bots=${states.length}`);
  }

  _allocMsgUid(state) {
    const current = Math.max(2, toSafeInt(state.msgUid, 2));
    state.msgUid = current >= 0xffffffff ? 2 : current + 1;
    return current;
  }

  _pruneBlockedMonsters(state, now = Date.now()) {
    if (!state || !state.blockedMonsters) return;
    for (const [index, expiresAt] of state.blockedMonsters) {
      if (Math.max(0, toSafeInt(expiresAt, 0)) <= now) state.blockedMonsters.delete(index);
    }
  }

  _chooseMonster(state) {
    const slots = Array.isArray(state && state.monsterSlots) ? state.monsterSlots : [];
    if (slots.length <= 0) return null;
    const now = Date.now();
    this._pruneBlockedMonsters(state, now);
    const start = Math.max(0, toSafeInt(state.monsterCursor, 0)) % slots.length;
    for (let offset = 0; offset < slots.length; offset += 1) {
      const slot = slots[(start + offset) % slots.length];
      if (!slot || toSafeInt(slot.index, -1) < 0) continue;
      const blockedUntil = Math.max(0, toSafeInt(state.blockedMonsters.get(slot.index), 0));
      if (blockedUntil > now) continue;
      state.monsterCursor = (start + offset + 1) % slots.length;
      return { ...slot };
    }
    return null;
  }

  _runFarmCycle(state) {
    state.farmTimer = null;
    if (!this._canAct(state) || !this.farmEnabled || !state.loggedIn || !state.mapEntered) return;
    if (state.pendingFarm) return;

    const target = this._chooseMonster(state);
    if (!target) {
      this.metrics.farmNoTarget += 1;
      this._scheduleFarm(state, Math.max(5000, Math.min(this.farmMinMs, this.farmRespawnMs)));
      return;
    }

    const pending = {
      target,
      startedAt: Date.now(),
      stage: 'moving',
      openUid: 0,
      claimUid: 0,
    };
    state.pendingFarm = pending;
    this.metrics.farmAttempts += 1;
    this.metrics.lastFarmAt = pending.startedAt;
    state.x = target.x;
    state.y = target.y;

    // The native client walks to the selected creep before sending 2000. Send
    // the same map movement so players can actually see the bot approach the
    // monster rather than teleporting into a fight.
    this._send(state, 1402, {
      mapId: state.mapId,
      type: 0,
      x: target.x,
      y: target.y,
    }, 0);

    state.farmMoveTimer = setTimeout(() => {
      state.farmMoveTimer = null;
      if (!this._canAct(state) || !state.loggedIn || !state.mapEntered || state.pendingFarm !== pending) return;
      pending.stage = 'opening';
      pending.openUid = this._allocMsgUid(state);
      const sent = this._send(state, 2000, {
        index: target.index,
        count: this.farmCount,
        speedUp: this.farmSpeedUp,
        pos: { x: target.x, y: target.y },
      }, pending.openUid);
      if (!sent) {
        this.metrics.farmErrors += 1;
        this._finishFarmCycle(state, 'open_send_failed', 5000);
        return;
      }
      state.farmTimeoutTimer = setTimeout(() => {
        if (state.pendingFarm !== pending) return;
        this.metrics.farmTimeout += 1;
        this._finishFarmCycle(state, 'open_timeout', 5000);
      }, this.farmClaimTimeoutMs);
      if (typeof state.farmTimeoutTimer.unref === 'function') state.farmTimeoutTimer.unref();
    }, this.farmMoveSettleMs);
    if (typeof state.farmMoveTimer.unref === 'function') state.farmMoveTimer.unref();
  }

  _handleFarmOpenResponse(state, message) {
    const pending = state && state.pendingFarm;
    if (!pending || pending.stage !== 'opening') return;
    const responseUid = Math.max(0, toSafeInt(message && message.msgUid, 0));
    if (pending.openUid > 0 && responseUid > 0 && responseUid !== pending.openUid) return;

    if (state.farmTimeoutTimer) {
      clearTimeout(state.farmTimeoutTimer);
      state.farmTimeoutTimer = null;
    }
    const data = message && message.data && typeof message.data === 'object' ? message.data : {};
    const count = Math.max(0, toSafeInt(data.count, 0));
    const accepted = Number(data.result) === 0 || count > 0;
    if (!accepted || count <= 0) {
      const reason = String(data.reason || (data.busy ? 'busy' : 'open_rejected'));
      if (data.busy || reason === 'busy' || reason === 'cooldown') this.metrics.farmBusy += 1;
      else if (reason === 'invalid_target') this.metrics.farmInvalid += 1;
      else this.metrics.farmErrors += 1;
      const retry = Math.max(5000, Math.min(this.farmMinMs, toSafeInt(data.retryAfterMs, this.farmRespawnMs)));
      state.blockedMonsters.set(pending.target.index, Date.now() + retry);
      this._finishFarmCycle(state, reason, retry);
      return;
    }

    this.metrics.farmOpenSuccess += 1;
    if (this.farmLogEnabled && (this.metrics.farmOpenSuccess % this.farmLogSampleRate === 0)) {
      logger.info(
        `[RealBots] map-farm open ok id=${state.id} map=${state.mapId} line=${state.line} `
        + `index=${pending.target.index} count=${count} speedUp=${this.farmSpeedUp ? 1 : 0} `
        + `active=${this._isActiveMap(state) ? 1 : 0}`
      );
    }
    pending.stage = 'claim_wait';
    pending.openData = data;
    state.blockedMonsters.set(pending.target.index, Date.now() + this.farmRespawnMs);
    state.farmClaimTimer = setTimeout(() => {
      state.farmClaimTimer = null;
      // A previously accepted open must be claimed even after the last human
      // leaves. Lazy inactivity only forbids new farm cycles; generation and
      // closing guards still prevent a stopped worker from sending old claims.
      if (!this._isCurrent(state) || !state.loggedIn || !state.mapEntered || state.pendingFarm !== pending) return;
      pending.stage = 'claiming';
      pending.claimUid = this._allocMsgUid(state);
      const sent = this._send(state, 2001, {}, pending.claimUid);
      if (!sent) {
        this.metrics.farmErrors += 1;
        this._finishFarmCycle(state, 'claim_send_failed', 5000);
        return;
      }
      state.farmTimeoutTimer = setTimeout(() => {
        if (state.pendingFarm !== pending) return;
        this.metrics.farmTimeout += 1;
        this._finishFarmCycle(state, 'claim_timeout', 5000);
      }, this.farmClaimTimeoutMs);
      if (typeof state.farmTimeoutTimer.unref === 'function') state.farmTimeoutTimer.unref();
    }, this.farmClaimDelayMs);
    if (typeof state.farmClaimTimer.unref === 'function') state.farmClaimTimer.unref();
  }

  _handleFarmClaimResponse(state, message) {
    const pending = state && state.pendingFarm;
    if (!pending || pending.stage !== 'claiming') return;
    const responseUid = Math.max(0, toSafeInt(message && message.msgUid, 0));
    if (pending.claimUid > 0 && responseUid > 0 && responseUid !== pending.claimUid) return;

    if (state.farmTimeoutTimer) {
      clearTimeout(state.farmTimeoutTimer);
      state.farmTimeoutTimer = null;
    }
    const data = message && message.data && typeof message.data === 'object' ? message.data : {};
    const rewardInfo = data.rewardInfo && typeof data.rewardInfo === 'object' ? data.rewardInfo : null;
    if (Number(data.result) < 0 && !rewardInfo) {
      this.metrics.farmErrors += 1;
      this._finishFarmCycle(state, String(data.reason || 'claim_rejected'), 5000);
      return;
    }

    this.metrics.farmClaimSuccess += 1;
    if (this.farmLogEnabled && (this.metrics.farmClaimSuccess % this.farmLogSampleRate === 0)) {
      logger.info(
        `[RealBots] map-farm claim ok id=${state.id} map=${state.mapId} line=${state.line} `
        + `index=${pending.target.index}`
      );
    }
    this._finishFarmCycle(state, 'claimed');
  }

  _handleOtherMonsterOpen(state, data = {}) {
    if (!state || !data || data.id === state.id) return;
    const mapId = Math.max(0, toSafeInt(data.mapId, state.mapId));
    const line = Math.max(0, toSafeInt(data.line, state.line));
    const index = toSafeInt(data.index, -1);
    if (mapId !== state.mapId || line !== state.line || index < 0) return;
    state.blockedMonsters.set(index, Date.now() + this.farmRespawnMs);
    const pending = state.pendingFarm;
    if (pending && pending.target.index === index && pending.stage === 'opening') {
      // The server response remains authoritative; this only prevents an
      // unnecessary retry if another socket's broadcast arrives first.
      this.metrics.farmBusy += 1;
    }
  }

  _handleFarmError(state, message, errorData = {}) {
    if (!state || !state.pendingFarm) return;
    this.metrics.farmErrors += 1;
    const reason = errorData && (errorData.reason || errorData.msg || errorData.message)
      ? String(errorData.reason || errorData.msg || errorData.message)
      : `tag_${toSafeInt(message && message.tag, 0)}_error`;
    this._finishFarmCycle(state, reason, 5000);
  }

  _finishFarmCycle(state, _reason, retryDelayMs = null) {
    if (!state) return;
    if (state.farmMoveTimer) clearTimeout(state.farmMoveTimer);
    if (state.farmClaimTimer) clearTimeout(state.farmClaimTimer);
    if (state.farmTimeoutTimer) clearTimeout(state.farmTimeoutTimer);
    state.farmMoveTimer = null;
    state.farmClaimTimer = null;
    state.farmTimeoutTimer = null;
    state.pendingFarm = null;
    if (this._canAct(state) && this.farmEnabled && state.loggedIn && state.mapEntered) {
      this._scheduleFarm(state, this._resolveFarmDelay(state, retryDelayMs));
    } else if (this.lazyMapActivation && state.dormantSince != null) {
      // If the grace window already expired, finish draining immediately
      // instead of holding a completed cycle until the drain timeout.
      this._tryDormantClose(state);
    }
  }

  _send(state, tag, data, msgUid = 0) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
    try {
      state.ws.send(Buffer.from(Pack(tag, data, msgUid)));
      return true;
    } catch (err) {
      logger.warn(`[RealBots] send failed id=${state.id} tag=${tag}: ${err.message}`);
      return false;
    }
  }

  _onClose(state) {
    this._clearTimers(state);
    state.pendingFarm = null;
    state.loggedIn = false;
    state.mapEntered = false;
    if (this.connections.get(state.index) !== state) return;
    if (this.lazyMapActivation && (state.lazyClosing || !this._isIndexDesired(state.index))) {
      this.connections.delete(state.index);
      state.lazyClosing = false;
      this._syncLazyConnections();
      return;
    }
    if (this.stopping) return;
    state.reconnects += 1;
    // Stagger reconnects after the game server restarts. Reconnecting all
    // managed bots at once would create an unnecessary login/save spike.
    const delay = Math.min(60000, (5000 * state.reconnects) + (state.index * 250));
    state.reconnectTimer = setTimeout(() => {
      if (this.connections.get(state.index) !== state) return;
      this.connections.delete(state.index);
      this._connect(state.index);
    }, delay);
    if (typeof state.reconnectTimer.unref === 'function') state.reconnectTimer.unref();
  }

  _clearTimers(state) {
    ['heartbeatTimer', 'moveTimer', 'chatTimer', 'farmTimer', 'farmMoveTimer', 'farmClaimTimer', 'farmTimeoutTimer', 'mapRetryTimer', 'reconnectTimer', 'idleTimer', 'drainTimer', 'closeTimer'].forEach((key) => {
      if (state[key]) clearTimeout(state[key]);
      state[key] = null;
    });
  }
}

function runSelfTest() {
  const worker = new RealBotWorker({
    enabled: false,
    count: 2,
    token: buildToken(),
    mapIds: 'all',
    activeFarmMinMs: 4000,
    activeFarmMaxMs: 6000,
    activityWakeBaseMs: 1000,
    activityWakeStepMs: 300,
    farmSpeedUp: true,
  });
  const packet = Pack(1, { platformuid: 'lhs_real_bot_001', botToken: worker.token }, 1);
  if (!packet || packet.byteLength <= 12) throw new Error('BOT_PACKET_BUILD_FAILED');
  const farmOpenPacket = Pack(2000, { index: 0, count: 1, speedUp: worker.farmSpeedUp, pos: { x: 1, y: 1 } }, 2);
  const farmClaimPacket = Pack(2001, {}, 3);
  if (!farmOpenPacket || !farmClaimPacket || farmOpenPacket.byteLength <= 12 || farmClaimPacket.byteLength <= 12) {
    throw new Error('BOT_MAP_FARM_PACKET_BUILD_FAILED');
  }
  const names = [0, 1, 2].map((index) => preparedNames.getNameByIndex(290 + index));
  if (new Set(names).size !== names.length) throw new Error('BOT_NAMES_NOT_UNIQUE');
  const assignment = resolveBotAssignment(0, worker.mapIds);
  const distribution = {};
  for (let index = 0; index < worker.mapIds.length * 10; index += 1) {
    const row = resolveBotAssignment(index, worker.mapIds);
    distribution[row.mapId] = (distribution[row.mapId] || 0) + 1;
  }
  const distributionCounts = Object.values(distribution);
  if (distributionCounts.length !== worker.mapIds.length || distributionCounts.some((count) => count !== 10)) {
    throw new Error('BOT_TEN_PER_MAP_DISTRIBUTION_INVALID');
  }
  const activityKeys = parseActiveMapPayload({ activity: { maps: [{ mapId: assignment.mapId, line: 0, count: 1 }] } });
  worker.activeMapKeys = activityKeys;
  const activeDelay = worker._resolveFarmDelay({ mapId: assignment.mapId, line: 0 });
  if (activeDelay < 4000 || activeDelay > 6000) throw new Error('BOT_ACTIVE_FARM_DELAY_INVALID');
  return {
    result: 'ok',
    packetBytes: packet.byteLength,
    farmOpenPacketBytes: farmOpenPacket.byteLength,
    farmClaimPacketBytes: farmClaimPacket.byteLength,
    names,
    mapId: assignment.mapId,
    mapMonsterSlots: assignment.monsterSlots.length,
    tenPerMapDistribution: {
      bots: distributionCounts.reduce((sum, count) => sum + count, 0),
      maps: distributionCounts.length,
      min: Math.min(...distributionCounts),
      max: Math.max(...distributionCounts),
    },
    farmSpeedUp: worker.farmSpeedUp,
    activeMap: Array.from(activityKeys)[0],
    activeDelay,
    activityWakeBaseMs: worker.activityWakeBaseMs,
    activityWakeStepMs: worker.activityWakeStepMs,
    chatStats: preparedChat.getStats(),
  };
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    console.log(JSON.stringify(runSelfTest()));
  } else {
    const worker = new RealBotWorker();
    worker.start();
    const shutdown = () => {
      worker.stop();
      setTimeout(() => process.exit(0), 50).unref();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

module.exports = {
  RealBotWorker,
  applySlotOffset,
  mapActivityKey,
  parseActiveMapPayload,
  resolveBotAssignment,
  runSelfTest,
};
