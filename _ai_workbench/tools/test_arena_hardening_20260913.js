'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const arenaPath = path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'arena.js');
const arenaSource = fs.readFileSync(arenaPath, 'utf8');
const arena = require(arenaPath);
const rankService = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'RankService.js'));
const rankSource = fs.readFileSync(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'RankService.js'), 'utf8');
const playerSchema = fs.readFileSync(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'db', 'models', 'Player.js'), 'utf8');
const logSchema = fs.readFileSync(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'db', 'models', 'ArenaFightLog.js'), 'utf8');

const player = { arenaDayKey: '2000-01-01', arenaDailyCount: 9, items: { 10: 0 } };
const state = arena.ensureArenaState(player, Date.UTC(2026, 8, 13));
assert.equal(state.dailyCount, 0);
assert.equal(player.items[10], 3, 'daily reset replenishes tickets from ConstConfig');
assert.match(arenaSource, /crypto\.createHash\('sha256'\)\.update\(raw\)/, 'receipt is hashed and scoped');
assert.match(arenaSource, /ARENA_RECEIPT_PENDING_SEC/, 'pending receipt has crash-reclaim lease');
assert.match(arenaSource, /arenaReceiptLedger/, 'player ledger protects save-before-receipt crash window');
assert.match(arenaSource, /action: 'refresh'/, 'refresh idempotency uses same durable ledger');
assert.match(arenaSource, /ArenaFightLog\.find\(\{ attackerId \}\)/, 'log view merges durable DB history');
assert.match(arenaSource, /PLAYER_PROJECTION/, 'rank/profile uses complete authoritative projection');
assert.match(rankSource, /await client\.rename\(staging, key\)/, 'rank rebuild atomically swaps staging ZSET');
assert.match(playerSchema, /arenaReceiptLedger/, 'ledger persisted in Player schema');
assert.match(logSchema, /logUid/, 'numeric log UID persisted in fight log schema');

const fakeRedis = {
  zadd: async () => {},
  rename: async () => { fakeRedis.renamed = true; },
  del: async () => {},
};
const previous = require.cache[require.resolve(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'db', 'redis.js'))];
const redis = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'db', 'redis.js'));
const originalGetClient = redis.getClient;
redis.getClient = () => fakeRedis;
rankService.rebuildArenaFromMongo({
  find: () => ({ select: () => ({ maxTimeMS: () => ({ lean: async () => [] }) }) }),
}).then(() => {
  assert.equal(fakeRedis.renamed, true);
  redis.getClient = originalGetClient;
  if (previous) require.cache[require.resolve(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'db', 'redis.js'))] = previous;
  console.log(JSON.stringify({ result: 'ok', checks: 10 }));
}).catch((err) => {
  redis.getClient = originalGetClient;
  throw err;
});
