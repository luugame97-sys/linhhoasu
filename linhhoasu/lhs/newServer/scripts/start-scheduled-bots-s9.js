'use strict';

// S9 only. Keep the heavy worker and all bot connections unloaded until opening.
const S9_OPEN_TIME = 1792206000000;

function validateConfig(env) {
  if (String(env.BOT_WORKER_SERVER_ID) !== '1009') throw new Error('S9_BOT_SERVER_ID_REQUIRED');
  if (String(env.SERVER_OPEN_TIME) !== String(S9_OPEN_TIME)) throw new Error('S9_BOT_OPEN_TIME_INVALID');
  const ws = new URL(env.BOT_WORKER_WS_URL || '');
  if (!['ws:', 'wss:'].includes(ws.protocol)) throw new Error('S9_BOT_WS_URL_INVALID');
  ws.protocol = ws.protocol === 'wss:' ? 'https:' : 'http:';
  ws.pathname = '/ready';
  ws.search = '';
  ws.hash = '';
  return { openTime: S9_OPEN_TIME, readyUrl: ws.toString() };
}

function checkReady(url) {
  return new Promise((resolve) => {
    const transport = require(url.startsWith('https:') ? 'https' : 'http');
    const request = transport.get(url, { timeout: 5000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16384) request.destroy(new Error('READY_BODY_TOO_LARGE'));
      });
      response.on('error', () => resolve(false));
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(response.statusCode === 200 && data.status === 'ok' && data.role === 'ws'
            && data.checks && data.checks.mongo === true && data.checks.redis === true);
        } catch (_) { resolve(false); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('READY_TIMEOUT')));
    request.on('error', () => resolve(false));
  });
}

function createGate({ env = process.env, now = Date.now, schedule = setTimeout,
  cancel = clearTimeout, ready = checkReady,
  makeWorker = () => new (require('../src/bots/RealBotWorker').RealBotWorker)(),
  onError = (error) => { console.error('[S9Bots]', error.message); process.exitCode = 1; },
} = {}) {
  const config = validateConfig(env);
  let timer = null;
  let worker = null;
  let stopped = false;
  let started = false;
  let initialized = false;
  function later(delay) {
    if (!stopped) timer = schedule(tick, Math.min(60000, Math.max(1, delay)));
  }
  async function tick() {
    timer = null;
    if (stopped || started) return;
    if (now() < config.openTime) return later(config.openTime - now());
    try {
      const healthy = await ready(config.readyUrl);
      if (stopped) return;
      // Recheck after asynchronous readiness: a clock correction must not bypass the gate.
      if (!healthy || now() < config.openTime) return later(5000);
      worker = makeWorker();
      started = true;
      worker.start();
    } catch (error) {
      stop();
      onError(error);
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) cancel(timer);
    timer = null;
    if (worker) worker.stop();
  }
  return {
    start() {
      if (initialized || stopped) return;
      initialized = true;
      return tick();
    },
    stop,
    getState: () => ({ started, stopped, waiting: timer !== null }),
  };
}

if (require.main === module) {
  try {
    const gate = createGate({ onError: (error) => {
      console.error('[S9Bots]', error.message);
      setTimeout(() => process.exit(1), 100);
    } });
    const shutdown = () => {
      gate.stop();
      // RealBotWorker has staggered connect timers; terminate after graceful stop.
      setTimeout(() => process.exit(0), 100);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    console.log(`[S9Bots] gated until ${new Date(S9_OPEN_TIME).toISOString()}`);
    gate.start();
  } catch (error) {
    console.error('[S9Bots]', error.message);
    process.exitCode = 1;
  }
}

module.exports = { S9_OPEN_TIME, validateConfig, checkReady, createGate };
