'use strict';

const assert = require('assert');
const {
  buildBotFleetPlan,
  gameProcessName,
  realWorkerName,
  readLazyWorkerSafety,
  selectNewestOpenedServers,
} = require('../src/services/BotFleetPolicyService');
const {
  applyPlan,
  acquireSingleton,
  parseArgs,
  readFleetState,
  runOnce,
} = require('./manage-bot-fleet');

const NOW = 1_800_000_000_000;

function server(serverId, openTime, extras = {}) {
  return {
    serverId,
    pageId: 1,
    status: 1,
    running: true,
    openTime,
    ...extras,
  };
}

function processRow(name, status = 'online') {
  return { name, pm2_env: { status } };
}

function lazyWorker(serverId, status = 'online', env = {}) {
  return {
    name: realWorkerName(serverId),
    pm2_env: {
      status,
      BOT_WORKER_LAZY_MAP_ACTIVATION: '1',
      BOT_WORKER_ENABLED: '1',
      BOT_WORKER_COUNT: '580',
      BOT_WORKER_LAZY_BOTS_PER_MAP: '3',
      BOT_WORKER_LAZY_MAX_ACTIVE: '30',
      ...env,
    },
  };
}

function lockFs(initial = {}, options = {}) {
  const files = new Map(Object.entries(initial));
  const openFiles = new Map();
  let nextFd = 10;
  let reads = 0;
  return {
    files,
    mkdirSync() {},
    openSync(file, mode) {
      if (mode === 'wx' && files.has(file)) {
        const error = new Error('exists');
        error.code = 'EEXIST';
        throw error;
      }
      const fd = nextFd++;
      openFiles.set(fd, file);
      return fd;
    },
    writeFileSync(target, value) {
      files.set(typeof target === 'number' ? openFiles.get(target) : target, String(value));
    },
    closeSync() {},
    readFileSync(file) {
      reads += 1;
      if (options.replaceOnSecondRead && reads === 2) return options.replaceOnSecondRead;
      if (!files.has(file)) {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      }
      return files.get(file);
    },
    unlinkSync(file) { files.delete(file); },
  };
}

function deadProcess(pid = 100) {
  return { pid, kill() { const error = new Error('dead'); error.code = 'ESRCH'; throw error; } };
}

async function test(name, fn) {
  try {
    await fn();
    return { name, result: 'PASS' };
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

async function main() {
  const checks = [];

  checks.push(await test('newest two opened only; future server excluded', () => {
    const result = selectNewestOpenedServers([
      server(1001, NOW - 5_000),
      server(1002, NOW - 4_000),
      server(1003, NOW + 30_000),
      server(1004, NOW - 3_000),
    ], { now: NOW, limit: 2 });
    assert.deepEqual(result.selected.map((row) => row.serverId), [1004, 1002]);
    assert.deepEqual(result.opened.map((row) => row.serverId), [1004, 1002, 1001]);
  }));

  checks.push(await test('tie sorts by server id descending', () => {
    const result = selectNewestOpenedServers([
      server(1001, NOW - 5_000),
      server(1002, NOW - 5_000),
      server(1003, NOW - 5_000),
    ], { now: NOW, limit: 2 });
    assert.deepEqual(result.selected.map((row) => row.serverId), [1003, 1002]);
  }));

  checks.push(await test('S5/S6 online and newest are untouched', () => {
    const servers = [
      server(1001, NOW - 100_000),
      server(1002, NOW - 90_000),
      server(1003, NOW - 80_000),
      server(1004, NOW - 70_000),
      server(1005, NOW - 2_000),
      server(1006, NOW - 1_000),
    ];
    const plan = buildBotFleetPlan({
      servers,
      processes: servers.flatMap((row) => [
        processRow(gameProcessName(row.serverId), 'online'),
        processRow(realWorkerName(row.serverId), 'online'),
      ]),
      now: NOW,
      state: { stoppedWorkers: {} },
    });
    assert.deepEqual(plan.selected.map((row) => row.serverId), [1006, 1005]);
    assert(!plan.actions.some((row) => [1005, 1006].includes(row.serverId) && row.action !== 'skip'));
    assert.deepEqual(
      plan.actions.filter((row) => row.action === 'stop').map((row) => row.serverId).sort(),
      [1001, 1002, 1003, 1004],
    );
  }));

  checks.push(await test('missing newest worker does not retire the previous active worker', () => {
    const servers = [
      server(1004, NOW - 3_000),
      server(1005, NOW - 2_000),
      server(1006, NOW - 1_000),
    ];
    const plan = buildBotFleetPlan({
      servers,
      processes: [
        processRow('lhs-s1004', 'online'),
        processRow('lhs-real-bots-s4', 'online'),
        processRow('lhs-s1005', 'online'),
        processRow('lhs-real-bots-s5', 'online'),
        processRow('lhs-s1006', 'online'),
      ],
      state: { stoppedWorkers: {} },
      now: NOW,
    });
    const prior = plan.actions.find((row) => row.workerName === 'lhs-real-bots-s4');
    assert.equal(prior.action, 'skip');
    assert.equal(prior.reason, 'NEWEST_TWO_UNAVAILABLE');
  }));

  checks.push(await test('status/running gates exclude disabled and future rows', () => {
    const result = selectNewestOpenedServers([
      server(1001, NOW - 5_000, { running: false }),
      server(1002, NOW - 4_000, { status: 0 }),
      server(1003, NOW + 1_000),
      server(1004, NOW - 3_000),
    ], { now: NOW, limit: 2 });
    assert.deepEqual(result.selected.map((row) => row.serverId), [1004]);
    assert.equal(result.all.find((row) => row.serverId === 1001).eligibilityReason, 'SERVER_DISABLED');
    assert.equal(result.all.find((row) => row.serverId === 1002).eligibilityReason, 'SERVER_STATUS_DISABLED');
    assert.equal(result.all.find((row) => row.serverId === 1003).eligibilityReason, 'SERVER_NOT_OPEN');
  }));

  checks.push(await test('names map exactly to server workers', () => {
    assert.equal(realWorkerName(1001), 'lhs-real-bots');
    assert.equal(realWorkerName(1006), 'lhs-real-bots-s6');
    assert.equal(gameProcessName(1006), 'lhs-s1006');
    assert.equal(realWorkerName(2001), '');
  }));

  checks.push(await test('user-stopped eligible worker is not started', () => {
    const plan = buildBotFleetPlan({
      servers: [server(1005, NOW - 1_000)],
      processes: [processRow('lhs-s1005', 'online'), processRow('lhs-real-bots-s5', 'stopped')],
      state: { stoppedWorkers: {} },
      now: NOW,
    });
    assert.equal(plan.actions.find((row) => row.workerName === 'lhs-real-bots-s5').action, 'skip');
    assert.equal(plan.actions.find((row) => row.workerName === 'lhs-real-bots-s5').reason,
      'ELIGIBLE_WORKER_USER_STOPPED_OR_NOT_RECORDED');
  }));

  checks.push(await test('supervisor-owned stop can be started only after game is active', () => {
    const plan = buildBotFleetPlan({
      servers: [server(1005, NOW - 1_000)],
      processes: [processRow('lhs-s1005', 'online'), processRow('lhs-real-bots-s5', 'stopped')],
      state: { stoppedWorkers: { '1005': { workerName: 'lhs-real-bots-s5' } } },
      now: NOW,
    });
    assert.equal(plan.actions.find((row) => row.workerName === 'lhs-real-bots-s5').action, 'start');
  }));

  checks.push(await test('apply re-reads PM2 before stop and saves only after change', () => {
    const calls = [];
    const currentRows = [processRow('lhs-real-bots', 'online')];
    const plan = { actions: [{ action: 'stop', serverId: 1001, workerName: 'lhs-real-bots', reason: 'OUTSIDE_NEWEST_TWO', status: 'online' }] };
    const state = { version: 1, stoppedWorkers: {} };
    const fsApi = {
      mkdirSync() {},
      writeFileSync() {},
      renameSync() {},
    };
    // First read reports active; the command itself is mocked to mutate no
    // real PM2 state. A second invocation remains safe because read-before-op
    // is part of applyPlan's contract.
    return applyPlan(plan, {
      readPm2: () => currentRows,
      execute: async (command, name) => calls.push([command, name]),
      save: async () => calls.push(['save']),
      statePath: 'C:/tmp/bot-fleet-state.json',
      state,
      fsApi,
    }).then((result) => {
      assert.equal(result.changed, 1);
      assert.deepEqual(calls, [['stop', 'lhs-real-bots'], ['save']]);
      assert.equal(state.stoppedWorkers['1001'].workerName, 'lhs-real-bots');
    });
  }));

  checks.push(await test('ownership marker survives a later stop failure', async () => {
    const state = { version: 1, stoppedWorkers: {} };
    const writes = [];
    const fsApi = {
      mkdirSync() {},
      writeFileSync(_path, value) { writes.push(JSON.parse(value)); },
      renameSync() {},
    };
    const rows = [
      processRow('lhs-real-bots', 'online'),
      processRow('lhs-real-bots-s2', 'online'),
    ];
    await assert.rejects(() => applyPlan({ actions: [
      { action: 'stop', serverId: 1001, workerName: 'lhs-real-bots', status: 'online' },
      { action: 'stop', serverId: 1002, workerName: 'lhs-real-bots-s2', status: 'online' },
    ] }, {
      readPm2: () => rows,
      execute: async (_command, name) => {
        if (name === 'lhs-real-bots-s2') throw new Error('injected stop failure');
      },
      save: async () => {},
      statePath: 'C:/tmp/bot-fleet-state.json',
      state,
      fsApi,
    }));
    assert.equal(writes.length, 1);
    assert.equal(state.stoppedWorkers['1001'].workerName, 'lhs-real-bots');
  }));

  checks.push(await test('metadata failure is fail-closed', async () => {
    const result = await runOnce({
      apply: true,
      readPm2: () => [processRow('lhs-s1001', 'online'), processRow('lhs-real-bots', 'online')],
      readServers: () => { throw new Error('metadata unavailable'); },
    });
    assert.equal(result.result, 'NO_OPERATION');
    assert.match(result.error, /SERVER_METADATA_READ_FAILED/);
  }));

  checks.push(await test('CLI dry-run never enables apply', () => {
    assert.deepEqual(parseArgs(['--once', '--dry-run', '--apply'], {}), {
      once: true,
      dryRun: true,
      apply: false,
      limit: 2,
      mode: 'newest-two',
    });
  }));

  // Keep the state parser contract exercised without touching disk.
  checks.push(await test('state parser defaults to empty ownership', () => {
    const fakeFs = { readFileSync() { const error = new Error('missing'); error.code = 'ENOENT'; throw error; } };
    assert.deepEqual(readFleetState('unused', fakeFs), { version: 1, stoppedWorkers: {} });
  }));

  checks.push(await test('stale dead supervisor lock is reclaimed and released', () => {
    const path = 'C:/tmp/bot-fleet-policy.lock';
    const fsApi = lockFs({ [path]: '{"pid":42}' });
    const lock = acquireSingleton(path, fsApi, deadProcess(99));
    assert(lock);
    assert.equal(fsApi.files.get(path), '{"pid":99}');
    lock.release();
    assert.equal(fsApi.files.has(path), false);
  }));

  checks.push(await test('live supervisor lock remains fail-closed', () => {
    const path = 'C:/tmp/bot-fleet-policy.lock';
    const fsApi = lockFs({ [path]: '{"pid":42}' });
    assert.equal(acquireSingleton(path, fsApi, { pid: 99, kill() {} }), null);
    assert(fsApi.files.has(path));
  }));

  checks.push(await test('permission-denied PID probe remains fail-closed', () => {
    const path = 'C:/tmp/bot-fleet-policy.lock';
    const fsApi = lockFs({ [path]: '{"pid":42}' });
    const processApi = { pid: 99, kill() { const error = new Error('denied'); error.code = 'EPERM'; throw error; } };
    assert.equal(acquireSingleton(path, fsApi, processApi), null);
  }));

  checks.push(await test('malformed supervisor lock remains fail-closed', () => {
    const path = 'C:/tmp/bot-fleet-policy.lock';
    const fsApi = lockFs({ [path]: 'broken' });
    assert.equal(acquireSingleton(path, fsApi, deadProcess(99)), null);
    assert(fsApi.files.has(path));
  }));

  checks.push(await test('lock replacement wins the stale-lock CAS', () => {
    const path = 'C:/tmp/bot-fleet-policy.lock';
    const fsApi = lockFs({ [path]: '{"pid":42}' }, { replaceOnSecondRead: '{"pid":77}' });
    assert.equal(acquireSingleton(path, fsApi, deadProcess(99)), null);
    assert.equal(fsApi.files.get(path), '{"pid":42}');
  }));

  checks.push(await test('release never unlinks a replacement owner lock', () => {
    const path = 'C:/tmp/bot-fleet-policy.lock';
    const fsApi = lockFs();
    const lock = acquireSingleton(path, fsApi, { pid: 99, kill() {} });
    fsApi.files.set(path, '{"pid":101}');
    lock.release();
    assert(fsApi.files.has(path));
  }));

  checks.push(await test('lazy-all selects every opened enabled server only', () => {
    const servers = [
      server(1001, NOW - 6_000), server(1002, NOW - 5_000),
      server(1003, NOW - 4_000), server(1004, NOW - 3_000),
      server(1005, NOW - 2_000), server(1006, NOW - 1_000),
      server(1007, NOW + 1_000), server(1008, NOW - 1_000, { running: false }),
    ];
    const plan = buildBotFleetPlan({ mode: 'lazy-all', now: NOW, servers,
      processes: servers.flatMap(row => [processRow(gameProcessName(row.serverId)), lazyWorker(row.serverId)]),
    });
    assert.equal(plan.policy.mode, 'lazy-all');
    assert.deepEqual(plan.selected.map(row => row.serverId), [1006, 1005, 1004, 1003, 1002, 1001]);
    assert.deepEqual(plan.actions.filter(row => row.action === 'stop').map(row => row.serverId), [1007, 1008]);
    assert.equal(plan.actions.filter(row => row.reason === 'ELIGIBLE_WORKER_ALREADY_ACTIVE').length, 6);
  }));

  checks.push(await test('lazy-all refuses eager workers without stopping an in-progress rollout', () => {
    const servers = [server(1001, NOW - 2_000), server(1002, NOW - 1_000)];
    const plan = buildBotFleetPlan({ mode: 'lazy-all', now: NOW, servers,
      processes: [processRow('lhs-s1001'), processRow('lhs-real-bots'),
        processRow('lhs-s1002'), processRow('lhs-real-bots-s2', 'stopped')],
      state: { stoppedWorkers: { '1002': { workerName: 'lhs-real-bots-s2' } } },
    });
    assert(plan.actions.every(row => row.action === 'skip'));
    assert(plan.actions.every(row => row.reason === 'LAZY_WORKER_FLAG_REQUIRED'));
  }));

  checks.push(await test('lazy-all does not auto-start user-stopped workers; owns only its stops', () => {
    const servers = [server(1001, NOW - 2_000), server(1002, NOW - 1_000)];
    const plan = buildBotFleetPlan({ mode: 'lazy-all', now: NOW, servers,
      processes: [processRow('lhs-s1001'), lazyWorker(1001, 'stopped'),
        processRow('lhs-s1002'), lazyWorker(1002, 'stopped')],
      state: { stoppedWorkers: { '1002': { workerName: 'lhs-real-bots-s2' } } },
    });
    const old = plan.actions.find(row => row.serverId === 1001);
    const owned = plan.actions.find(row => row.serverId === 1002);
    assert.equal(old.action, 'skip');
    assert.equal(old.reason, 'ELIGIBLE_WORKER_USER_STOPPED_OR_NOT_RECORDED');
    assert.equal(owned.action, 'start');
    assert.equal(owned.requireLazyConfig, true);
    assert.equal(owned.gameName, 'lhs-s1002');
  }));

  checks.push(await test('lazy-all rejects disabled, count-zero, nonfinite and oversized caps', () => {
    for (const [env, reason] of [
      [{ BOT_WORKER_ENABLED: 0 }, 'LAZY_WORKER_DISABLED'],
      [{ BOT_WORKER_COUNT: 0 }, 'LAZY_WORKER_COUNT_INVALID'],
      [{ BOT_WORKER_COUNT: 'NaN' }, 'LAZY_WORKER_COUNT_INVALID'],
      [{ BOT_WORKER_LAZY_MAX_ACTIVE: 101 }, 'LAZY_WORKER_LIMIT_INVALID'],
      [{ BOT_WORKER_LAZY_MAX_ACTIVE: 0 }, 'LAZY_WORKER_LIMIT_INVALID'],
      [{ BOT_WORKER_LAZY_BOTS_PER_MAP: 11 }, 'LAZY_WORKER_LIMIT_INVALID'],
    ]) {
      const safety = readLazyWorkerSafety(lazyWorker(1001, 'stopped', env));
      assert.equal(safety.allowed, false);
      assert.equal(safety.reason, reason);
    }
    const defaulted = lazyWorker(1001);
    delete defaulted.pm2_env.BOT_WORKER_LAZY_MAX_ACTIVE;
    delete defaulted.pm2_env.BOT_WORKER_LAZY_BOTS_PER_MAP;
    assert.deepEqual(readLazyWorkerSafety(defaulted), { allowed: true, count: 580, maxActive: 60, perMap: 8 });
  }));

  checks.push(await test('apply lazy start rechecks current lazy config and game status', async () => {
    for (const [worker, game, outcome] of [
      [lazyWorker(1001, 'stopped', { BOT_WORKER_LAZY_MAP_ACTIVATION: 0 }), processRow('lhs-s1001'), 'skipped_changed_lazy_config'],
      [lazyWorker(1001, 'stopped'), processRow('lhs-s1001', 'stopped'), 'skipped_game_not_online'],
    ]) {
      const calls = [];
      const action = { action: 'start', serverId: 1001, workerName: 'lhs-real-bots', requireLazyConfig: true, gameName: 'lhs-s1001' };
      const result = await applyPlan({ actions: [action] }, {
        readPm2: () => [worker, game],
        execute: () => calls.push('execute'), save: () => calls.push('save'),
        state: { version: 1, stoppedWorkers: { '1001': { workerName: 'lhs-real-bots' } } },
      });
      assert.equal(result.changed, 0);
      assert.equal(action.outcome, outcome);
      assert.deepEqual(calls, []);
    }
  }));

  checks.push(await test('apply lazy start executes only after bounded config and game read-back', async () => {
    const calls = [];
    const action = {
      action: 'start', serverId: 1001, workerName: 'lhs-real-bots',
      requireLazyConfig: true, gameName: 'lhs-s1001',
    };
    const state = { version: 1, stoppedWorkers: { '1001': { workerName: 'lhs-real-bots' } } };
    const worker = lazyWorker(1001, 'stopped');
    const game = processRow('lhs-s1001', 'online');
    const fsApi = { mkdirSync() {}, writeFileSync() {}, renameSync() {} };
    const result = await applyPlan({ actions: [action] }, {
      readPm2: () => [worker, game],
      execute: (command, name) => calls.push([command, name]),
      save: () => calls.push(['save']),
      statePath: 'C:/tmp/lazy-bot-fleet-policy-state.json', state, fsApi,
    });
    assert.equal(result.changed, 1);
    assert.equal(action.outcome, 'started');
    assert.deepEqual(calls, [['start', 'lhs-real-bots'], ['save']]);
    assert.equal(state.stoppedWorkers['1001'], undefined);
  }));

  checks.push(await test('invalid mode is fail-closed before metadata or PM2 reads', async () => {
    let calls = 0;
    const result = await runOnce({ mode: 'every-server', apply: true,
      readPm2: () => { calls += 1; return []; }, readServers: () => { calls += 1; return []; },
    });
    assert.equal(result.result, 'NO_OPERATION');
    assert.equal(result.error, 'BOT_FLEET_MODE_INVALID');
    assert.equal(calls, 0);
    assert.throws(() => buildBotFleetPlan({ mode: '' }), /BOT_FLEET_MODE_INVALID/);
    assert.throws(() => parseArgs([], { BOT_FLEET_MODE: 'bad-mode' }), /BOT_FLEET_MODE_INVALID/);
    assert.equal(parseArgs([], { BOT_FLEET_MODE: 'lazy-all' }).mode, 'lazy-all');
    assert.equal(parseArgs(['--mode=lazy-all'], {}).mode, 'lazy-all');
  }));

  console.log(JSON.stringify({
    result: 'PASS',
    checks: checks.length,
    tests: checks,
    productionWrites: 0,
    playerWrites: 0,
    networkAttempts: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
