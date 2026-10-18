'use strict';

/**
 * Managed real-bot fleet supervisor.
 *
 * This command is intentionally read-only unless --apply is supplied.  The
 * normal PM2 deployment runs it as one long-lived process with --apply; the
 * process itself uses a narrow lock so a second copy cannot stop/start the
 * same workers concurrently.  It only operates on exact worker names derived
 * from verified page-1 GameServer rows and never writes player data.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  buildBotFleetPlan,
  DEFAULT_FLEET_MODE,
  isActiveProcessStatus,
  isRestartableProcessStatus,
  normalizeFleetMode,
  readLazyWorkerSafety,
} = require('../src/services/BotFleetPolicyService');

const INTERVAL_MS = 30000;
const STATE_FILE_NAME = 'bot-fleet-policy-state.json';
const LOCK_FILE_NAME = 'bot-fleet-policy.lock';
const DEFAULT_LIMIT = 2;

class FleetError extends Error {
  constructor(code) {
    super(String(code || 'BOT_FLEET_FAILURE'));
    this.code = String(code || 'BOT_FLEET_FAILURE');
  }
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const values = new Set(Array.isArray(argv) ? argv.map(String) : []);
  const modeArgs = Array.from(values).filter((arg) => arg.startsWith('--mode='));
  if (modeArgs.length > 1) throw new FleetError('BOT_FLEET_MODE_INVALID');
  let mode;
  try {
    mode = normalizeFleetMode(modeArgs.length ? modeArgs[0].slice(7) : env.BOT_FLEET_MODE);
  } catch (_) {
    throw new FleetError('BOT_FLEET_MODE_INVALID');
  }
  return {
    once: values.has('--once'),
    dryRun: values.has('--dry-run'),
    apply: values.has('--apply') && !values.has('--dry-run'),
    limit: DEFAULT_LIMIT,
    mode,
  };
}

function locateWorkbench(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, '_ai_workbench');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(path.resolve(startDir), '_ai_workbench');
}

function resolveStatePath(env = process.env, startDir = process.cwd()) {
  const configured = String(env.BOT_FLEET_STATE_PATH || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(locateWorkbench(startDir), 'temp', STATE_FILE_NAME);
}

function resolveLockPath(env = process.env, startDir = process.cwd()) {
  const configured = String(env.BOT_FLEET_LOCK_PATH || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(locateWorkbench(startDir), 'temp', LOCK_FILE_NAME);
}

function readPm2Rows(exec = execFileSync) {
  let output;
  try {
    output = exec('pm2', ['jlist'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (_) {
    throw new FleetError('PM2_LIST_FAILED');
  }
  try {
    const rows = JSON.parse(String(output || ''));
    if (!Array.isArray(rows)) throw new Error('not_array');
    return rows;
  } catch (_) {
    throw new FleetError('PM2_LIST_INVALID');
  }
}

function readEffectiveEnv(processRow = {}) {
  const pm2Env = processRow && processRow.pm2_env && typeof processRow.pm2_env === 'object'
    ? processRow.pm2_env
    : {};
  const nested = pm2Env.env && typeof pm2Env.env === 'object' ? pm2Env.env : {};
  const result = {};
  // Read only the fields required to select the identity database.  Do not
  // copy or print the complete PM2 environment (it contains credentials).
  ['MONGO_URI', 'IDENTITY_MONGO_DB'].forEach((key) => {
    if (nested[key] !== undefined && nested[key] !== null) result[key] = String(nested[key]);
    else if (pm2Env[key] !== undefined && pm2Env[key] !== null) result[key] = String(pm2Env[key]);
  });
  return result;
}

function databaseNameFromMongoUri(uri) {
  const value = String(uri || '').trim();
  const match = value.match(/^mongodb(?:\+srv)?:\/\/[^/]*\/([^?]*)/i);
  const name = match && decodeURIComponent(match[1] || '').trim();
  return name || '';
}

function getS1EffectiveEnv(pm2Rows = []) {
  const row = (Array.isArray(pm2Rows) ? pm2Rows : []).find((item) => item && item.name === 'lhs-s1001');
  if (!row) throw new FleetError('S1_PM2_METADATA_MISSING');
  const env = readEffectiveEnv(row);
  if (!env.MONGO_URI) throw new FleetError('S1_MONGO_URI_MISSING');
  return env;
}

function readFleetState(statePath, fsApi = fs) {
  try {
    const raw = fsApi.readFileSync(statePath, 'utf8');
    if (!raw.trim()) return { version: 1, stoppedWorkers: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('state');
    const stoppedWorkers = parsed.stoppedWorkers;
    if (stoppedWorkers !== undefined
      && (!stoppedWorkers || typeof stoppedWorkers !== 'object' || Array.isArray(stoppedWorkers))) {
      throw new Error('stoppedWorkers');
    }
    return { version: 1, stoppedWorkers: stoppedWorkers || {} };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { version: 1, stoppedWorkers: {} };
    throw new FleetError('FLEET_STATE_INVALID');
  }
}

function writeFleetState(statePath, state, fsApi = fs) {
  const dir = path.dirname(statePath);
  fsApi.mkdirSync(dir, { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  const safeState = {
    version: 1,
    stoppedWorkers: state && state.stoppedWorkers && typeof state.stoppedWorkers === 'object'
      ? state.stoppedWorkers
      : {},
  };
  fsApi.writeFileSync(tempPath, `${JSON.stringify(safeState)}${os.EOL}`, { mode: 0o600 });
  fsApi.renameSync(tempPath, statePath);
}

function acquireSingleton(lockPath, fsApi = fs, processApi = process) {
  fsApi.mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd;
  let lockBytes;

  // PM2 may SIGKILL a supervisor between opening the lock and running its
  // shutdown handler.  Reclaim only a well-formed lock whose owner is
  // definitely gone; malformed, permission-denied, or live-owner locks stay
  // fail-closed.  The second read is a small CAS so a replacement owner is
  // never unlinked after the initial observation.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fd = fsApi.openSync(lockPath, 'wx', 0o600);
      lockBytes = JSON.stringify({ pid: processApi.pid });
      fsApi.writeFileSync(fd, lockBytes, 'utf8');
      break;
    } catch (error) {
      if (fd !== undefined) {
        try { fsApi.closeSync(fd); } catch (_) { /* best effort */ }
        fd = undefined;
      }
      if (!error || error.code !== 'EEXIST') throw new FleetError('FLEET_LOCK_FAILED');
      let observed;
      let owner;
      try {
        observed = fsApi.readFileSync(lockPath, 'utf8');
        owner = JSON.parse(String(observed || ''));
      } catch (_) {
        return null;
      }
      const ownerPid = Number(owner && owner.pid);
      if (!Number.isInteger(ownerPid) || ownerPid <= 0 || ownerPid === processApi.pid) return null;
      try {
        processApi.kill(ownerPid, 0);
        return null;
      } catch (probeError) {
        // EPERM means the process exists but is not probeable.  Only ESRCH
        // proves the PID is gone and permits stale-lock recovery.
        if (!probeError || probeError.code !== 'ESRCH') return null;
      }
      try {
        if (fsApi.readFileSync(lockPath, 'utf8') !== observed) return null;
        fsApi.unlinkSync(lockPath);
      } catch (unlinkError) {
        if (!unlinkError || unlinkError.code !== 'ENOENT') return null;
      }
    }
  }
  if (fd === undefined) return null;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try { fsApi.closeSync(fd); } catch (_) { /* best effort */ }
      // Never remove a lock that has been replaced by another owner.
      try {
        if (fsApi.readFileSync(lockPath, 'utf8') === lockBytes) fsApi.unlinkSync(lockPath);
      } catch (_) { /* best effort */ }
    },
  };
}

function findProcess(rows = [], name = '') {
  return (Array.isArray(rows) ? rows : []).find((row) => row && row.name === name) || null;
}

function pm2Command(command, name, exec = execFileSync) {
  try {
    exec('pm2', [command, name], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (_) {
    throw new FleetError(`PM2_${String(command).toUpperCase()}_FAILED`);
  }
}

function savePm2(exec = execFileSync) {
  try {
    exec('pm2', ['save'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (_) {
    throw new FleetError('PM2_SAVE_FAILED');
  }
}

function publicAction(action) {
  const output = {
    action: action.action,
    serverId: action.serverId,
    workerName: action.workerName,
    reason: action.reason,
  };
  if (action.status) output.status = action.status;
  if (action.outcome) output.outcome = action.outcome;
  return output;
}

function publicPlan(plan, context = {}) {
  const result = {
    result: context.result || 'DRY_RUN',
    mode: context.apply ? 'apply' : 'dry-run',
    fleetMode: plan.policy && plan.policy.mode || DEFAULT_FLEET_MODE,
    selectedServerIds: (plan.selected || []).map((row) => row.serverId),
    openedCandidateServerIds: (plan.openedCandidates || []).map((row) => row.serverId),
    actions: (plan.actions || []).map(publicAction),
    unknownWorkerNames: Array.isArray(plan.unknownWorkerNames) ? plan.unknownWorkerNames.slice() : [],
    changed: Number(context.changed || 0),
    pm2Saved: !!context.pm2Saved,
  };
  if (context.error) result.error = String(context.error);
  return result;
}

async function applyPlan(plan, options = {}) {
  const readPm2 = options.readPm2;
  const execute = options.execute || pm2Command;
  const save = options.save || savePm2;
  const statePath = options.statePath;
  const fsApi = options.fsApi || fs;
  const state = options.state || { version: 1, stoppedWorkers: {} };
  let changed = 0;
  const successfulStops = [];
  const successfulStarts = [];

  // Always stop first, then start.  This prevents a temporary over-allocation
  // when a newly eligible worker is being restored in the same cycle.
  const stopActions = (plan.actions || []).filter((action) => action.action === 'stop');
  const startActions = (plan.actions || []).filter((action) => action.action === 'start');

  for (const action of stopActions) {
    const latestRows = await Promise.resolve(readPm2());
    const current = findProcess(latestRows, action.workerName);
    if (!current || !isActiveProcessStatus(current.pm2_env && current.pm2_env.status)) {
      action.outcome = 'skipped_changed_state';
      continue;
    }
    await Promise.resolve(execute('stop', action.workerName));
    successfulStops.push(action);
    changed += 1;
    state.stoppedWorkers[String(action.serverId)] = {
      workerName: action.workerName,
      stoppedBy: 'bot-fleet-supervisor',
      stoppedAt: new Date().toISOString(),
    };
    // Persist ownership immediately after each successful stop.  If a later
    // worker command fails, the already-stopped worker can still be restored
    // only by this supervisor; a retry must not treat it as user-stopped.
    writeFleetState(statePath, state, fsApi);
    action.outcome = 'stopped';
  }

  for (const action of startActions) {
    const latestRows = await Promise.resolve(readPm2());
    const current = findProcess(latestRows, action.workerName);
    if (!current || !isRestartableProcessStatus(current.pm2_env && current.pm2_env.status)) {
      action.outcome = 'skipped_changed_state';
      continue;
    }
    if (action.requireLazyConfig) {
      const safety = readLazyWorkerSafety(current);
      const game = findProcess(latestRows, action.gameName);
      if (!safety.allowed) {
        action.outcome = 'skipped_changed_lazy_config';
        continue;
      }
      if (!game || !game.pm2_env || game.pm2_env.status !== 'online') {
        action.outcome = 'skipped_game_not_online';
        continue;
      }
    }
    await Promise.resolve(execute('start', action.workerName));
    successfulStarts.push(action);
    changed += 1;
    delete state.stoppedWorkers[String(action.serverId)];
    // Persist the ownership transition before moving to the next worker.
    writeFleetState(statePath, state, fsApi);
    action.outcome = 'started';
  }

  if (changed > 0) {
    await Promise.resolve(save());
  }

  return {
    changed,
    pm2Saved: changed > 0,
    successfulStops,
    successfulStarts,
    state,
  };
}

async function runOnce(options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const apply = options.apply === true && options.dryRun !== true;
  let fleetMode;
  try {
    fleetMode = normalizeFleetMode(options.mode !== undefined ? options.mode : process.env.BOT_FLEET_MODE);
  } catch (_) {
    return { result: 'NO_OPERATION', error: 'BOT_FLEET_MODE_INVALID', mode: apply ? 'apply' : 'dry-run' };
  }
  const statePath = options.statePath || resolveStatePath();
  const readPm2 = options.readPm2 || (() => readPm2Rows());
  let pm2Rows;
  try {
    pm2Rows = await Promise.resolve(readPm2());
    if (!Array.isArray(pm2Rows)) throw new FleetError('PM2_LIST_INVALID');
  } catch (error) {
    const code = error instanceof FleetError ? error.code : 'PM2_LIST_FAILED';
    return { result: 'NO_OPERATION', error: code, mode: apply ? 'apply' : 'dry-run' };
  }

  let servers;
  try {
    if (typeof options.readServers !== 'function') throw new FleetError('SERVER_METADATA_READER_MISSING');
    servers = await Promise.resolve(options.readServers(pm2Rows));
    if (!Array.isArray(servers)) throw new FleetError('SERVER_METADATA_INVALID');
  } catch (error) {
    const code = error instanceof FleetError ? error.code : 'SERVER_METADATA_READ_FAILED';
    return { result: 'NO_OPERATION', error: code, mode: apply ? 'apply' : 'dry-run' };
  }

  let state;
  try {
    state = readFleetState(statePath, options.fsApi || fs);
  } catch (error) {
    return { result: 'NO_OPERATION', error: error.code || 'FLEET_STATE_INVALID', mode: apply ? 'apply' : 'dry-run' };
  }

  const plan = buildBotFleetPlan({
    servers,
    processes: pm2Rows,
    state,
    now,
    limit: Number.isFinite(Number(options.limit)) ? Number(options.limit) : DEFAULT_LIMIT,
    mode: fleetMode,
  });

  if (!apply) return publicPlan(plan, { apply: false });

  try {
    const result = await applyPlan(plan, {
      readPm2,
      execute: options.execute || ((command, name) => pm2Command(command, name, options.exec || execFileSync)),
      save: options.save || (() => savePm2(options.exec || execFileSync)),
      statePath,
      state,
      fsApi: options.fsApi || fs,
    });
    return publicPlan(plan, {
      apply: true,
      result: 'PASS',
      changed: result.changed,
      pm2Saved: result.pm2Saved,
    });
  } catch (error) {
    const code = error instanceof FleetError ? error.code : 'BOT_FLEET_APPLY_FAILED';
    return publicPlan(plan, { apply: true, result: 'PARTIAL_FAILURE', changed: 0, pm2Saved: false, error: code });
  }
}

function extractMongoMetadataLoader(pm2Rows) {
  const env = getS1EffectiveEnv(pm2Rows);
  const uri = env.MONGO_URI;
  const identityDb = String(env.IDENTITY_MONGO_DB || databaseNameFromMongoUri(uri)).trim();
  if (!identityDb) throw new FleetError('IDENTITY_DB_NAME_MISSING');

  // Set only the two model-selection variables before loading GameServer.  The
  // URI itself is never included in a result, log, or thrown message.
  process.env.MONGO_URI = uri;
  process.env.IDENTITY_MONGO_DB = identityDb;
  const mongoose = require('mongoose');
  const GameServer = require('../src/db/models/GameServer');
  const connection = mongoose.connection;

  if (!GameServer || !GameServer.db || String(GameServer.db.name) !== identityDb) {
    throw new FleetError('IDENTITY_DB_MODEL_MISMATCH');
  }

  let connected = false;
  async function ensureConnected() {
    if (connection.readyState === 1) {
      connected = true;
      return;
    }
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 10000,
      });
      connected = true;
    } catch (_) {
      throw new FleetError('MONGO_CONNECT_FAILED');
    }
    if (!GameServer.db || String(GameServer.db.name) !== identityDb) {
      throw new FleetError('IDENTITY_DB_MODEL_MISMATCH');
    }
  }

  return {
    async readServers() {
      await ensureConnected();
      try {
        return GameServer.find({
          pageId: 1,
          serverId: { $gte: 1001, $lte: 1099 },
        }).lean();
      } catch (_) {
        throw new FleetError('SERVER_METADATA_QUERY_FAILED');
      }
    },
    async close() {
      if (connected && mongoose.connection.readyState !== 0) {
        try { await mongoose.disconnect(); } catch (_) { /* best effort */ }
      }
    },
  };
}

function safePrint(value) {
  // All caller-visible data has already been reduced to allow-listed fields.
  process.stdout.write(`${JSON.stringify(value)}${os.EOL}`);
}

async function runSupervisor(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const shouldLock = args.apply && !args.dryRun;
  const lock = shouldLock ? acquireSingleton(resolveLockPath()) : null;
  if (shouldLock && !lock) {
    safePrint({ result: 'NO_OPERATION', error: 'SUPERVISOR_ALREADY_RUNNING', mode: 'apply' });
    return;
  }

  let loader;
  let stopped = false;
  const shutdown = async () => {
    if (stopped) return;
    stopped = true;
    // Release synchronously before awaiting Mongo shutdown.  This prevents a
    // slow connection close from leaving a stale lock during PM2 restarts.
    if (lock) lock.release();
    if (loader && typeof loader.close === 'function') await loader.close();
  };

  try {
    const initialRows = readPm2Rows();
    loader = extractMongoMetadataLoader(initialRows);
    const tick = async () => {
      const result = await runOnce({
        apply: args.apply,
        dryRun: args.dryRun,
        limit: args.limit,
        mode: args.mode,
        readPm2: () => readPm2Rows(),
        readServers: () => loader.readServers(),
        statePath: resolveStatePath(),
      });
      safePrint(result);
      return result;
    };
    await tick();
    if (!args.once) {
      const timer = setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);
      process.once('SIGINT', async () => { clearInterval(timer); await shutdown(); process.exit(0); });
      process.once('SIGTERM', async () => { clearInterval(timer); await shutdown(); process.exit(0); });
      return;
    }
  } catch (error) {
    const code = error instanceof FleetError ? error.code : 'BOT_FLEET_START_FAILED';
    safePrint({ result: 'NO_OPERATION', error: code, mode: args.apply ? 'apply' : 'dry-run' });
  } finally {
    if (args.once) await shutdown();
  }
}

if (require.main === module) {
  runSupervisor().catch((error) => {
    safePrint({ result: 'NO_OPERATION', error: error instanceof FleetError ? error.code : 'BOT_FLEET_START_FAILED', mode: 'dry-run' });
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_LIMIT,
  INTERVAL_MS,
  acquireSingleton,
  applyPlan,
  databaseNameFromMongoUri,
  extractMongoMetadataLoader,
  getS1EffectiveEnv,
  parseArgs,
  publicPlan,
  readEffectiveEnv,
  readFleetState,
  readPm2Rows,
  resolveLockPath,
  resolveStatePath,
  runOnce,
  runSupervisor,
  writeFleetState,
};
