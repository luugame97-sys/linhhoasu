const crypto = require('crypto');
const redis = require('../db/redis');

const memoryStore = new Map();
const DEFAULT_TTL_SEC = Number.parseInt(process.env.AUTH_SESSION_TTL_SEC || '', 10) || 3600;
let sharedAuthClient = null;

function getStoreClient() {
  const baseClient = redis.getClient();
  if (!baseClient) return null;
  const authPrefix = String(process.env.AUTH_REDIS_PREFIX || '').trim();
  if (!authPrefix || String(baseClient.options && baseClient.options.keyPrefix || '') === authPrefix) {
    return baseClient;
  }
  if (!sharedAuthClient) {
    sharedAuthClient = baseClient.duplicate({ keyPrefix: authPrefix });
  }
  return sharedAuthClient;
}

function buildSessionKey(token) {
  return `auth:session:${token}`;
}

function buildAccountIndexKey(accountId) {
  return `auth:account:${String(accountId || '').trim().toLowerCase()}`;
}

function buildToken() {
  const now = Date.now().toString(36);
  const rand = crypto.randomBytes(16).toString('hex');
  return `ats_${now}_${rand}`;
}

function sanitizePayload(payload = {}) {
  return {
    accountId: String(payload.accountId || '').trim().toLowerCase(),
    roleId: String(payload.roleId || '').trim(),
    userId: String(payload.userId || '').trim(),
    serverId: Number(payload.serverId) || 0,
    serverName: String(payload.serverName || '').trim(),
    serverSwitched: payload.serverSwitched === true,
    authVersion: Math.max(1, Number(payload.authVersion) || 1),
    issuedAt: Number(payload.issuedAt) || Date.now(),
    loginTime: Number(payload.loginTime) || Date.now(),
  };
}

function memorySet(token, payload, ttlSec) {
  const expiresAt = Date.now() + ttlSec * 1000;
  memoryStore.set(token, { payload, expiresAt });
}

function memoryGet(token) {
  const row = memoryStore.get(token);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    memoryStore.delete(token);
    return null;
  }
  return row.payload;
}

async function set(token, payload, ttlSec = DEFAULT_TTL_SEC) {
  const safePayload = sanitizePayload(payload);
  const safeTtl = Number.isFinite(Number(ttlSec)) && Number(ttlSec) > 0
    ? Math.floor(Number(ttlSec))
    : DEFAULT_TTL_SEC;
  const client = getStoreClient();
  if (client) {
    const accountIndexKey = buildAccountIndexKey(safePayload.accountId);
    const pipeline = client.pipeline();
    pipeline.set(buildSessionKey(token), JSON.stringify(safePayload), 'EX', safeTtl);
    pipeline.sadd(accountIndexKey, token);
    pipeline.expire(accountIndexKey, safeTtl);
    await pipeline.exec();
  } else {
    memorySet(token, safePayload, safeTtl);
  }
  return safePayload;
}

async function create(payload, ttlSec = DEFAULT_TTL_SEC) {
  const token = buildToken();
  const session = await set(token, payload, ttlSec);
  return { token, session };
}

async function get(tokenInput) {
  const token = String(tokenInput || '').trim();
  if (!token) return null;
  const client = getStoreClient();
  if (client) {
    const raw = await client.get(buildSessionKey(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }
  return memoryGet(token);
}

async function remove(tokenInput) {
  const token = String(tokenInput || '').trim();
  if (!token) return;
  const payload = await get(token);
  const client = getStoreClient();
  if (client) {
    const pipeline = client.pipeline();
    pipeline.del(buildSessionKey(token));
    if (payload && payload.accountId) pipeline.srem(buildAccountIndexKey(payload.accountId), token);
    await pipeline.exec();
    return;
  }
  memoryStore.delete(token);
}

async function revokeAccount(accountIdInput) {
  const accountId = String(accountIdInput || '').trim().toLowerCase();
  if (!accountId) return 0;
  const client = getStoreClient();
  if (client) {
    const indexKey = buildAccountIndexKey(accountId);
    const tokens = await client.smembers(indexKey);
    const pipeline = client.pipeline();
    tokens.forEach((token) => pipeline.del(buildSessionKey(token)));
    pipeline.del(indexKey);
    await pipeline.exec();
    return tokens.length;
  }
  let removed = 0;
  for (const [token, row] of memoryStore) {
    if (row && row.payload && row.payload.accountId === accountId) {
      memoryStore.delete(token);
      removed += 1;
    }
  }
  return removed;
}

module.exports = {
  buildToken,
  create,
  set,
  get,
  remove,
  revokeAccount,
};
