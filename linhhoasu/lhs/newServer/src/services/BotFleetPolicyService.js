'use strict';

/**
 * Pure policy for the managed real-bot fleet.
 *
 * The policy deliberately knows nothing about PM2, MongoDB, players, or
 * readiness probes.  By default it selects the newest two *opened and
 * enabled* page-1 servers.  The opt-in lazy-all mode selects every opened
 * server, but never starts an eager or unbounded worker.  A caller is
 * responsible for re-reading PM2 before mutating it.
 */

const PAGE_ID = 1;
const SERVER_ID_MIN = 1001;
const SERVER_ID_MAX = 1099;
const DEFAULT_REAL_SERVER_LIMIT = 2;
const DEFAULT_FLEET_MODE = 'newest-two';
const LAZY_FLEET_MODE = 'lazy-all';
const LAZY_MAX_ACTIVE_LIMIT = 100;
// Keep policy and worker clamps identical: at most ten real sockets per
// human-observed map, with the worker's global cap enforcing the fleet bound.
const LAZY_PER_MAP_LIMIT = 10;

const ACTIVE_PROCESS_STATUSES = new Set([
  'online',
  'launching',
  'restarting',
  'waiting restart',
]);

const RESTARTABLE_PROCESS_STATUSES = new Set([
  'stopped',
  'errored',
  'one-launch-status',
]);

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toSafeInt(value, fallback = 0) {
  const number = toFiniteNumber(value, fallback);
  return Math.floor(number);
}

function normalizeFleetMode(value) {
  const mode = String(value == null ? DEFAULT_FLEET_MODE : value).trim().toLowerCase();
  if (mode === DEFAULT_FLEET_MODE || mode === LAZY_FLEET_MODE) return mode;
  throw new Error('BOT_FLEET_MODE_INVALID');
}

function readWorkerEnv(processRow, key) {
  const env = processRow && processRow.pm2_env || {};
  return env[key] !== undefined ? env[key] : env.env && env.env[key];
}

function flagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value == null ? '' : value).trim().toLowerCase());
}

function readLazyWorkerSafety(processRow = {}) {
  if (!flagEnabled(readWorkerEnv(processRow, 'BOT_WORKER_LAZY_MAP_ACTIVATION'))) {
    return { allowed: false, reason: 'LAZY_WORKER_FLAG_REQUIRED' };
  }
  if (!flagEnabled(readWorkerEnv(processRow, 'BOT_WORKER_ENABLED'))) {
    return { allowed: false, reason: 'LAZY_WORKER_DISABLED' };
  }
  const count = Number(readWorkerEnv(processRow, 'BOT_WORKER_COUNT'));
  if (!Number.isSafeInteger(count) || count <= 0) {
    return { allowed: false, reason: 'LAZY_WORKER_COUNT_INVALID' };
  }
  const maxRaw = readWorkerEnv(processRow, 'BOT_WORKER_LAZY_MAX_ACTIVE');
  const perMapRaw = readWorkerEnv(processRow, 'BOT_WORKER_LAZY_BOTS_PER_MAP');
  // These are the worker's bounded defaults. Reject explicit invalid values
  // instead of silently relying on a worker-side fallback or starting 580
  // sockets if its environment drifted between supervisor cycles.
  const maxActive = maxRaw == null ? 60 : Number(maxRaw);
  const perMap = perMapRaw == null ? 2 : Number(perMapRaw);
  if (!Number.isSafeInteger(maxActive) || maxActive < 1 || maxActive > LAZY_MAX_ACTIVE_LIMIT
    || !Number.isSafeInteger(perMap) || perMap < 1 || perMap > LAZY_PER_MAP_LIMIT) {
    return { allowed: false, reason: 'LAZY_WORKER_LIMIT_INVALID' };
  }
  return { allowed: true, count, maxActive, perMap };
}

function normalizeServer(row = {}, now = Date.now()) {
  const serverId = toSafeInt(row.serverId, 0);
  const pageId = toSafeInt(row.pageId, 0);
  const status = toSafeInt(row.status, 1);
  const openTime = Math.max(0, toFiniteNumber(row.openTime, 0));
  const running = row.running !== false;
  const opened = openTime <= 0 || openTime <= Number(now);
  const inPolicyRange = pageId === PAGE_ID
    && serverId >= SERVER_ID_MIN
    && serverId <= SERVER_ID_MAX;
  const enabled = running && status > 0;

  let eligibilityReason = 'OPEN';
  if (!inPolicyRange) eligibilityReason = 'OUT_OF_PAGE_OR_RANGE';
  else if (!running) eligibilityReason = 'SERVER_DISABLED';
  else if (status <= 0) eligibilityReason = 'SERVER_STATUS_DISABLED';
  else if (!opened) eligibilityReason = 'SERVER_NOT_OPEN';

  return {
    serverId,
    pageId,
    status,
    running,
    openTime,
    opened,
    enabled,
    inPolicyRange,
    eligible: inPolicyRange && enabled && opened,
    eligibilityReason,
  };
}

function compareNewest(left, right) {
  const byOpenTime = right.openTime - left.openTime;
  if (byOpenTime !== 0) return byOpenTime;
  return right.serverId - left.serverId;
}

function selectNewestOpenedServers(rows = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const limit = Math.max(1, toSafeInt(options.limit, DEFAULT_REAL_SERVER_LIMIT));
  const normalized = Array.isArray(rows)
    ? rows.map((row) => normalizeServer(row, now))
    : [];
  const opened = normalized
    .filter((row) => row.eligible)
    .sort(compareNewest);

  return {
    now,
    limit,
    all: normalized,
    opened,
    selected: opened.slice(0, limit),
  };
}

function realWorkerName(serverIdInput) {
  const serverId = toSafeInt(serverIdInput, 0);
  if (serverId < SERVER_ID_MIN || serverId > SERVER_ID_MAX) return '';
  return serverId === SERVER_ID_MIN
    ? 'lhs-real-bots'
    : `lhs-real-bots-s${serverId - 1000}`;
}

function gameProcessName(serverIdInput) {
  const serverId = toSafeInt(serverIdInput, 0);
  if (serverId < SERVER_ID_MIN || serverId > SERVER_ID_MAX) return '';
  return `lhs-s${serverId}`;
}

function readProcessStatus(processRow) {
  return String(
    processRow
      && processRow.pm2_env
      && processRow.pm2_env.status
      || processRow && processRow.status
      || '',
  ).trim().toLowerCase();
}

function processByName(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const name = String(row && row.name || '').trim();
    if (name) map.set(name, row);
  });
  return map;
}

function readOwnership(state = {}, serverId, workerName) {
  const stoppedWorkers = state && state.stoppedWorkers;
  if (!stoppedWorkers || typeof stoppedWorkers !== 'object') return false;
  const row = stoppedWorkers[String(serverId)];
  return !!row && String(row.workerName || row.name || '') === workerName;
}

function buildBotFleetPlan({
  servers = [],
  processes = [],
  state = {},
  now = Date.now(),
  limit = DEFAULT_REAL_SERVER_LIMIT,
  mode = DEFAULT_FLEET_MODE,
} = {}) {
  const fleetMode = normalizeFleetMode(mode);
  const lazyAll = fleetMode === LAZY_FLEET_MODE;
  const selection = selectNewestOpenedServers(servers, {
    now,
    limit: lazyAll ? SERVER_ID_MAX - SERVER_ID_MIN + 1 : limit,
  });
  const byProcess = processByName(processes);
  const selectedIds = new Set(selection.selected.map((row) => row.serverId));
  const actions = [];
  const tracked = selection.all.filter((row) => row.inPolicyRange);

  // Never retire an older real worker when one of the selected newest
  // servers cannot actually be served yet.  This keeps at least the current
  // two-worker capacity during a new-server rollout if its PM2 worker has not
  // been registered, was manually stopped, or is waiting for its game node.
  const newestTwoUnavailable = !lazyAll && selection.selected.some((server) => {
    const workerName = realWorkerName(server.serverId);
    const gameName = gameProcessName(server.serverId);
    const worker = byProcess.get(workerName);
    const game = byProcess.get(gameName);
    const workerStatus = readProcessStatus(worker);
    const gameStatus = readProcessStatus(game);
    if (!worker || !game) return true;
    if (ACTIVE_PROCESS_STATUSES.has(workerStatus)) {
      return gameStatus !== 'online';
    }
    return !(RESTARTABLE_PROCESS_STATUSES.has(workerStatus)
      && readOwnership(state, server.serverId, workerName)
      && gameStatus === 'online');
  });

  tracked.forEach((server) => {
    const workerName = realWorkerName(server.serverId);
    const gameName = gameProcessName(server.serverId);
    const worker = byProcess.get(workerName);
    const game = byProcess.get(gameName);
    const workerStatus = readProcessStatus(worker);
    const gameStatus = readProcessStatus(game);
    const selected = selectedIds.has(server.serverId);

    // A missing PM2 worker is intentionally not auto-created.  It may have
    // been removed by an operator, or this server may use a separate future
    // launcher.  Existing online eligible workers are left untouched.
    if (!worker) {
      actions.push({
        action: 'skip',
        serverId: server.serverId,
        workerName,
        reason: selected ? 'WORKER_NOT_REGISTERED' : 'WORKER_NOT_REGISTERED_OUT_OF_POLICY',
      });
      return;
    }

    if (selected) {
      if (lazyAll) {
        const safety = readLazyWorkerSafety(worker);
        if (!safety.allowed) {
          // A selected eager worker is reported, not stopped during a staged
          // rollout. Operators explicitly restart it with the lazy flag; the
          // supervisor must never start it while the guard is absent.
          actions.push({
            action: 'skip',
            serverId: server.serverId,
            workerName,
            reason: safety.reason,
            status: workerStatus,
          });
          return;
        }
      }
      if (ACTIVE_PROCESS_STATUSES.has(workerStatus)) {
        actions.push({
          action: 'skip',
          serverId: server.serverId,
          workerName,
          reason: 'ELIGIBLE_WORKER_ALREADY_ACTIVE',
          status: workerStatus,
        });
        return;
      }

      if (RESTARTABLE_PROCESS_STATUSES.has(workerStatus)
        && readOwnership(state, server.serverId, workerName)) {
        // Do not launch a real worker while its game node is still booting or
        // waiting for restart.  A temporary readiness fluctuation must not
        // reorder the server selection, but it must gate a new connection.
        if (!game || gameStatus !== 'online') {
          actions.push({
            action: 'skip',
            serverId: server.serverId,
            workerName,
            reason: 'GAME_PROCESS_NOT_READY',
            status: workerStatus,
          });
          return;
        }
        actions.push({
          action: 'start',
          serverId: server.serverId,
          workerName,
          reason: 'SUPERVISOR_OWNED_STOP_AND_NOW_ELIGIBLE',
          status: workerStatus,
          ...(lazyAll ? { requireLazyConfig: true, gameName } : {}),
        });
        return;
      }

      actions.push({
        action: 'skip',
        serverId: server.serverId,
        workerName,
        reason: 'ELIGIBLE_WORKER_USER_STOPPED_OR_NOT_RECORDED',
        status: workerStatus,
      });
      return;
    }

    if (ACTIVE_PROCESS_STATUSES.has(workerStatus)) {
      actions.push({
        action: newestTwoUnavailable ? 'skip' : 'stop',
        serverId: server.serverId,
        workerName,
        reason: newestTwoUnavailable
          ? 'NEWEST_TWO_UNAVAILABLE'
          : server.eligibilityReason === 'OPEN'
          ? 'OUTSIDE_NEWEST_TWO'
          : `SERVER_${server.eligibilityReason}`,
        status: workerStatus,
      });
      return;
    }

    actions.push({
      action: 'skip',
      serverId: server.serverId,
      workerName,
      reason: 'OUT_OF_POLICY_WORKER_NOT_ACTIVE',
      status: workerStatus,
    });
  });

  const unknownWorkerNames = (Array.isArray(processes) ? processes : [])
    .map((row) => String(row && row.name || '').trim())
    .filter((name) => /^lhs-real-bots(?:-s\d+)?$/.test(name))
    .filter((name) => !tracked.some((row) => realWorkerName(row.serverId) === name));

  return {
    policy: {
      mode: fleetMode,
      pageId: PAGE_ID,
      serverIdMin: SERVER_ID_MIN,
      serverIdMax: SERVER_ID_MAX,
      newestOpenedLimit: lazyAll ? null : selection.limit,
    },
    selected: selection.selected.map((row) => ({
      serverId: row.serverId,
      openTime: row.openTime,
    })),
    openedCandidates: selection.opened.map((row) => ({
      serverId: row.serverId,
      openTime: row.openTime,
    })),
    actions,
    unknownWorkerNames,
  };
}

function isActiveProcessStatus(status) {
  return ACTIVE_PROCESS_STATUSES.has(String(status || '').trim().toLowerCase());
}

function isRestartableProcessStatus(status) {
  return RESTARTABLE_PROCESS_STATUSES.has(String(status || '').trim().toLowerCase());
}

module.exports = {
  ACTIVE_PROCESS_STATUSES,
  DEFAULT_FLEET_MODE,
  DEFAULT_REAL_SERVER_LIMIT,
  LAZY_FLEET_MODE,
  LAZY_MAX_ACTIVE_LIMIT,
  PAGE_ID,
  RESTARTABLE_PROCESS_STATUSES,
  SERVER_ID_MAX,
  SERVER_ID_MIN,
  buildBotFleetPlan,
  gameProcessName,
  isActiveProcessStatus,
  isRestartableProcessStatus,
  normalizeServer,
  normalizeFleetMode,
  readLazyWorkerSafety,
  realWorkerName,
  selectNewestOpenedServers,
};
