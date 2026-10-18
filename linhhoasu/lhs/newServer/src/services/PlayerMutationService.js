'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const scope = new AsyncLocalStorage();
const queues = new Map();

// One authoritative mutation at a time per role in this game process. Never
// release a timed-out operation while its asynchronous work is still running.
function run(userId, work) {
  return runMany([userId], work);
}

function runMany(userIds, work) {
  const keys = [...new Set(userIds.map(id => String(id || '')).filter(Boolean))].sort();
  if (!keys.length) return Promise.resolve().then(work);
  const inherited = scope.getStore();
  if (inherited?.active) {
    if (keys.every(key => inherited.keys.includes(key))) return Promise.resolve().then(work);
    return Promise.reject(new Error('PLAYER_LOCK_UPGRADE_DENIED'));
  }
  // Reserve all queues synchronously before awaiting any of them. A->B and
  // B->A requests therefore cannot deadlock by holding one lock each.
  const previous = keys.map(key => queues.get(key) || Promise.resolve());
  const current = Promise.all(previous.map(p => p.catch(() => undefined))).then(() => {
    const token = { keys, active: true };
    return scope.run(token, async () => {
      try { return await work(); } finally { token.active = false; }
    });
  });
  const tracked = current.then(() => undefined, () => undefined).finally(() => {
    keys.forEach(key => { if (queues.get(key) === tracked) queues.delete(key); });
  });
  keys.forEach(key => queues.set(key, tracked));
  return current;
}

function holds(userId) {
  const token = scope.getStore();
  return !!(token?.active && token.keys.includes(String(userId)));
}
module.exports = { run, runMany, holds };
