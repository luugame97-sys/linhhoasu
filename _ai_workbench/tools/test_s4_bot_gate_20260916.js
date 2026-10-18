'use strict';
const assert = require('assert');
const { createGate, S4_OPEN_TIME, validateConfig } = require('../../linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s4');
const env = { BOT_WORKER_SERVER_ID: '1004', SERVER_OPEN_TIME: String(S4_OPEN_TIME), BOT_WORKER_WS_URL: 'ws://127.0.0.1:9203' };

function fixture(overrides = {}) {
  let clock = S4_OPEN_TIME - 120000;
  let starts = 0;
  let stops = 0;
  let loads = 0;
  const timers = new Map();
  let sequence = 0;
  const gate = createGate({ env, now: () => clock,
    schedule: (fn, delay) => { assert(delay > 0 && delay <= 60000); timers.set(++sequence, fn); return sequence; },
    cancel: (id) => timers.delete(id), ready: async () => true,
    makeWorker: () => { loads++; return { start: () => starts++, stop: () => stops++ }; },
    onError: (error) => { throw error; }, ...overrides,
  });
  return { gate, timers, setTime: (time) => { clock = time; },
    counts: () => ({ starts, stops, loads }),
    fire: async () => { const [id, fn] = timers.entries().next().value; timers.delete(id); await fn(); },
  };
}

(async () => {
  for (const patch of [{ SERVER_OPEN_TIME: '' }, { SERVER_OPEN_TIME: 'NaN' }, { SERVER_OPEN_TIME: '1789552800001' },
    { BOT_WORKER_SERVER_ID: '1001' }, { BOT_WORKER_SERVER_ID: '' }, { BOT_WORKER_WS_URL: '' }]) {
    assert.throws(() => validateConfig({ ...env, ...patch }));
  }
  const f = fixture();
  await f.gate.start();
  await f.gate.start();
  await f.fire();
  assert.deepStrictEqual(f.counts(), { starts: 0, stops: 0, loads: 0 });
  f.setTime(S4_OPEN_TIME - 1); await f.fire();
  assert.equal(f.counts().starts, 0);
  f.setTime(S4_OPEN_TIME); await f.fire();
  await f.gate.start();
  assert.deepStrictEqual(f.counts(), { starts: 1, stops: 0, loads: 1 });
  f.gate.stop(); f.gate.stop();
  assert.deepStrictEqual(f.counts(), { starts: 1, stops: 1, loads: 1 });
  assert.equal(f.timers.size, 0);
  const waiting = fixture(); await waiting.gate.start(); waiting.gate.stop();
  assert.equal(waiting.timers.size, 0); assert.equal(waiting.counts().loads, 0);
  const unavailable = fixture({ ready: async () => false });
  unavailable.setTime(S4_OPEN_TIME); await unavailable.gate.start();
  assert.equal(unavailable.counts().loads, 0); assert.equal(unavailable.timers.size, 1); unavailable.gate.stop();
  let resolveReady;
  const pending = fixture({ ready: () => new Promise((resolve) => { resolveReady = resolve; }) });
  pending.setTime(S4_OPEN_TIME); const pendingStart = pending.gate.start();
  pending.gate.stop(); resolveReady(true); await pendingStart;
  assert.equal(pending.counts().loads, 0); assert.equal(pending.timers.size, 0);
  const correction = fixture({ ready: async () => { correction.setTime(S4_OPEN_TIME - 1000); return true; } });
  correction.setTime(S4_OPEN_TIME); await correction.gate.start();
  assert.equal(correction.counts().loads, 0); correction.gate.stop();
  console.log('PASS S4 bot gate: strict config, no preload/pre-open starts, once at opening, readiness retry, clock correction, shutdown cancellation');
})().catch((error) => { console.error(error); process.exitCode = 1; });


