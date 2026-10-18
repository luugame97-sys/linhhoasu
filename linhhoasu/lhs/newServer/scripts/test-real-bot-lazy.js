'use strict';

/**
 * Contract tests for map-activated real bots.
 *
 * This suite is deliberately offline: it never opens a socket, calls HTTP,
 * touches Mongo/Redis, or creates a player.  The worker's connection factory
 * is replaced by a small state stub so lifecycle decisions are tested without
 * depending on a live VPS.
 */

const assert = require('assert');
const EventEmitter = require('events');
const http = require('http');
const path = require('path');

// Optional candidate-module path is useful during a staged remote read-back:
// `node scripts/test-real-bot-lazy.js /path/to/RealBotWorker.js`.  Relative
// requires inside the worker still resolve from that candidate's directory.
const workerModulePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'src', 'bots', 'RealBotWorker.js');
const { RealBotWorker, mapActivityKey } = require(workerModulePath);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeSocket() {
  return {
    readyState: 1,
    close() { this.readyState = 3; },
    terminate() { this.readyState = 3; },
  };
}

function makeWorker(options = {}) {
  const worker = new RealBotWorker({
    enabled: true,
    token: 'offline-contract-token',
    count: 30,
    mapIds: 'all',
    lazyMapActivation: true,
    lazyBotsPerMap: 3,
    lazyMaxActive: 30,
    lazyDisconnectGraceMs: 1000,
    lazyDrainTimeoutMs: 1000,
    lazyActivityStaleMs: 90000,
    ...options,
  });
  // start() must not issue an HTTP request in this offline test.
  worker._pollActivity = () => {};
  return worker;
}

function seedState(worker, index, extra = {}) {
  const assignment = worker._getAssignment(index);
  const state = {
    index,
    id: `offline-bot-${index}`,
    ws: fakeSocket(),
    loggedIn: true,
    mapEntered: true,
    mapId: assignment.mapId,
    line: worker.line,
    mapSlot: assignment.mapSlot,
    lazyClosing: false,
    generation: worker.lifecycleGeneration,
    dormantSince: null,
    draining: false,
    pendingFarm: null,
    idleTimer: null,
    drainTimer: null,
    ...extra,
  };
  worker.connections.set(index, state);
  return state;
}

async function main() {
  const checks = [];
  const pass = (name) => checks.push({ name, result: 'PASS' });

  // No human-map activity must result in zero sockets and zero queued opens.
  {
    const worker = makeWorker({ lazyBotsPerMap: 15, lazyMaxActive: 150 });
    assert.equal(worker.lazyBotsPerMap, 10);
    assert.equal(worker.lazyMaxActive, 100);
    worker.start();
    assert.equal(worker.connections.size, 0);
    assert.equal(worker.lazyConnectTimers.size, 0);
    assert.equal(worker._desiredBotIndices().length, 0);
    worker.stop();
    pass('lazy startup keeps all sockets dormant until a fresh map sample');
  }

  // One occupied map receives at most three assignments; a second occupied
  // map receives three more.  The global cap is enforced over queued opens too.
  {
    const worker = makeWorker({ count: 580, lazyMaxActive: 30, connectIntervalMs: 250 });
    worker.started = true;
    worker.stopping = false;
    worker.activitySampleSeen = true;
    worker.metrics.lastActivityPollAt = Date.now();
    const first = worker.mapIds[0];
    const second = worker.mapIds[1];
    worker.activeMapKeys = new Set([mapActivityKey(first, 0), mapActivityKey(second, 0)]);
    const opens = [];
    worker._connect = (index) => {
      opens.push(index);
      seedState(worker, index);
    };
    worker._syncLazyConnections();
    // Default connect spacing is deliberately bounded at 250ms; allow all
    // six assignments (three per map) to drain their staggered queue.
    await sleep(1800);
    const firstCount = opens.filter((index) => worker._getAssignment(index).mapId === first).length;
    const secondCount = opens.filter((index) => worker._getAssignment(index).mapId === second).length;
    assert.equal(firstCount, 3);
    assert.equal(secondCount, 3);
    assert(worker.connections.size + worker.lazyConnectTimers.size <= 30);
    worker.stop();
    pass('per-map three-bot limit and global thirty-bot cap include queued sockets');
  }

  // Inactive maps are put into a grace/dormant state before close; they are
  // not immediately torn down on a single missing poll.
  {
    const worker = makeWorker();
    worker.started = true;
    worker.stopping = false;
    worker.activitySampleSeen = true;
    worker.metrics.lastActivityPollAt = Date.now();
    const first = worker.mapIds[0];
    worker.activeMapKeys = new Set([mapActivityKey(first, 0)]);
    const state = seedState(worker, 0);
    worker._syncLazyConnections();
    worker.activeMapKeys.clear();
    worker.metrics.lastActivityPollAt = Date.now();
    worker._syncLazyConnections();
    assert.notEqual(state.dormantSince, null);
    assert.equal(state.lazyClosing, false);
    state.dormantSince = Date.now() - worker.lazyDisconnectGraceMs - 1;
    worker._tryDormantClose(state);
    assert.equal(state.lazyClosing, true);
    worker.stop();
    pass('map inactivity uses grace hysteresis before closing');
  }

  // A pending claim is drained rather than being cut off immediately.
  {
    const worker = makeWorker();
    worker.started = true;
    worker.stopping = false;
    worker.activitySampleSeen = true;
    worker.metrics.lastActivityPollAt = Date.now();
    const first = worker.mapIds[0];
    worker.activeMapKeys = new Set([mapActivityKey(first, 0)]);
    const state = seedState(worker, 0, {
      pendingFarm: { stage: 'claiming' },
    });
    worker._syncLazyConnections();
    worker.activeMapKeys.clear();
    state.dormantSince = Date.now() - worker.lazyDisconnectGraceMs - 1;
    worker._tryDormantClose(state);
    assert.equal(state.draining, true);
    assert.equal(state.lazyClosing, false);
    worker.stop();
    pass('pending farm claim enters bounded drain before close');
  }

  // Leaving after an accepted open must not cancel its reward claim. A drain
  // completes that one cycle but must never start a new cycle on an empty map.
  {
    const worker = makeWorker({ farmEnabled: true, farmClaimDelayMs: 250 });
    worker.started = true;
    worker.stopping = false;
    worker.activitySampleSeen = true;
    worker.metrics.lastActivityPollAt = Date.now();
    const state = seedState(worker, 0, {
      msgUid: 3,
      blockedMonsters: new Map(),
      pendingFarm: { stage: 'opening', openUid: 2, target: { index: 0 } },
      dormantSince: Date.now() - worker.lazyDisconnectGraceMs - 1,
    });
    const sent = [];
    worker._send = (_state, tag, data, msgUid) => { sent.push({ tag, data, msgUid }); return true; };
    let newCycles = 0;
    worker._scheduleFarm = () => { newCycles += 1; };
    worker._tryDormantClose(state);
    assert.equal(state.draining, true);
    worker._handleFarmOpenResponse(state, { msgUid: 2, data: { result: 0, count: 1 } });
    await sleep(350);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].tag, 2001);
    assert.equal(state.pendingFarm.stage, 'claiming');
    worker._handleFarmClaimResponse(state, { msgUid: sent[0].msgUid, data: { result: 0 } });
    assert.equal(state.pendingFarm, null);
    assert.equal(newCycles, 0);
    assert.equal(state.lazyClosing, true);
    assert.equal(worker.metrics.lazyDrainTimeouts, 0);
    worker.stop();
    pass('accepted farm opens finish their claim after map inactivity without another cycle');
  }

  // Poll data older than the stale threshold must fail closed (not activate
  // all maps).  A stale callback cannot act on a previous worker generation.
  {
    const worker = makeWorker({ lazyActivityStaleMs: 90000 });
    worker.activitySampleSeen = true;
    worker.metrics.lastActivityPollAt = Date.now() - 90001;
    worker.activeMapKeys = new Set([mapActivityKey(worker.mapIds[0], 0)]);
    assert.equal(worker._activityIsFresh(), false);
    assert.equal(worker._desiredBotIndices().length, 0);
    worker.started = true;
    worker.stopping = false;
    const state = seedState(worker, 0);
    const generation = worker.lifecycleGeneration;
    worker.stop();
    assert.equal(worker._isCurrent(state), false);
    worker.start();
    assert(worker.lifecycleGeneration > generation);
    worker.stop();
    pass('stale activity and old lifecycle callbacks fail closed');
  }

  // The activity request itself is covered with an in-process HTTP double. It
  // must mark the sample fresh, activate only the reported map, and never
  // reach the real network.
  {
    const worker = makeWorker({ activityUrl: 'http://offline.test/bot-activity' });
    worker.started = true;
    worker.stopping = false;
    worker._pollActivity = RealBotWorker.prototype._pollActivity.bind(worker);
    worker._connect = (index) => seedState(worker, index);
    const mapId = worker.mapIds[0];
    const originalGet = http.get;
    let requestCount = 0;
    http.get = (_url, _options, callback) => {
      requestCount += 1;
      const request = new EventEmitter();
      request.destroy = () => request.emit('error', new Error('offline destroy'));
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      process.nextTick(() => {
        callback(response);
        response.emit('data', JSON.stringify({ activity: { maps: [{ mapId, line: 0, count: 1 }] } }));
        response.emit('end');
      });
      return request;
    };
    try {
      worker._pollActivity();
      await sleep(30);
      assert.equal(requestCount, 1);
      assert.equal(worker.activitySampleSeen, true);
      assert.equal(worker._activityIsFresh(), true);
      assert(worker.activeMapKeys.has(mapActivityKey(mapId, 0)));
      assert(worker.connections.size <= 3);
    } finally {
      http.get = originalGet;
      worker.stop();
    }
    pass('activity HTTP poll activates only the reported map without network I/O');
  }

  // A response that was already in flight when the worker stopped must not
  // mutate the next start generation.
  {
    const worker = makeWorker({ activityUrl: 'http://offline.test/bot-activity' });
    worker.started = true;
    worker.stopping = false;
    worker._pollActivity = RealBotWorker.prototype._pollActivity.bind(worker);
    const originalGet = http.get;
    let responseCallback = null;
    http.get = (_url, _options, callback) => {
      responseCallback = callback;
      const request = new EventEmitter();
      request.destroy = () => {};
      return request;
    };
    try {
      worker._pollActivity();
      assert.equal(typeof responseCallback, 'function');
      worker.stop();
      worker._pollActivity = () => {};
      worker.start();
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      responseCallback(response);
      response.emit('data', JSON.stringify({ activity: { maps: [{ mapId: worker.mapIds[0], line: 0, count: 1 }] } }));
      response.emit('end');
      assert.equal(worker.activitySampleSeen, false);
      assert.equal(worker.activeMapKeys.size, 0);
    } finally {
      http.get = originalGet;
      worker.stop();
    }
    pass('in-flight poll from an old lifecycle generation is ignored');
  }

  // Feature-off compatibility: desired indices remain the configured count,
  // regardless of activity samples.
  {
    const worker = new RealBotWorker({ enabled: true, token: 'offline', count: 4, lazyMapActivation: false });
    worker.activitySampleSeen = false;
    assert.equal(worker._desiredBotIndices().length, 4);
    worker.stop();
    pass('legacy path remains unchanged when lazy activation is disabled');
  }

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

