'use strict';

const Redis = require('ioredis');
const crypto = require('node:crypto');
const logger = require('../logger');

const CHANNEL = 'lhs:chat:v1';
const HISTORY_PREFIX = 'lhs:chat:v1:history:';
const RATE_PREFIX = 'lhs:chat:v1:rate:';
const MAX_HISTORY = 100;
const RATE_WINDOW_SECONDS = 10;
const RATE_LIMIT = 5;
const CLAIM_PREFIX = 'lhs:public-notify:v1:';
const nodeId = String(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID || 'node');

let publisher = null;
let subscriber = null;
let started = false;
let sequence = 0;
let onEntry = null;
const seen = new Map();

function options() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    // Chat is cross-server. Do not inherit per-server Redis keyPrefix.
    keyPrefix: '',
    connectTimeout: 10000,
    commandTimeout: Math.max(500, Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 3000) || 3000),
    maxRetriesPerRequest: Math.max(0, Number(process.env.REDIS_MAX_RETRIES_PER_REQUEST || 2) || 2),
  };
}

function historyKey(channel) {
  return `${HISTORY_PREFIX}${Math.max(0, Number(channel) || 0)}`;
}

function markSeen(messageId) {
  if (!messageId) return false;
  if (seen.has(messageId)) return true;
  seen.set(messageId, Date.now());
  while (seen.size > 2048) {
    const oldest = seen.keys().next().value;
    seen.delete(oldest);
  }
  return false;
}

function parseEnvelope(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.type !== 'chat.entry.v1' || !value.messageId || !value.entry) return null;
    return value;
  } catch (_err) {
    return null;
  }
}

async function start(handler) {
  if (typeof handler === 'function') onEntry = handler;
  if (started) return true;
  publisher = new Redis(options());
  subscriber = new Redis(options());
  const onError = (err) => logger.warn(`[ChatBus] redis error: ${err.message}`);
  publisher.on('error', onError);
  subscriber.on('error', onError);
  try {
    await subscriber.subscribe(CHANNEL);
    subscriber.on('message', (_channel, raw) => {
      const envelope = parseEnvelope(raw);
      if (!envelope || markSeen(envelope.messageId) || typeof onEntry !== 'function') return;
      Promise.resolve(onEntry(envelope)).catch((err) => logger.warn(`[ChatBus] fanout failed: ${err.message}`));
    });
    started = true;
    logger.info(`[ChatBus] started channel=${CHANNEL} node=${nodeId}`);
    return true;
  } catch (err) {
    logger.warn(`[ChatBus] start failed: ${err.message}`);
    await stop();
    return false;
  }
}

async function publish(channel, entry, meta = {}) {
  if (!publisher || !started) throw new Error('CHAT_BUS_UNAVAILABLE');
  const messageId = `${nodeId}:${Date.now()}:${++sequence}:${crypto.randomBytes(4).toString('hex')}`;
  const envelope = {
    type: 'chat.entry.v1', messageId, originNode: nodeId,
    channel: Math.max(0, Number(channel) || 0), createdAt: Date.now(),
    source: String(meta.source || 'player'), entry,
  };
  const body = JSON.stringify(envelope);
  await publisher.multi()
    .rpush(historyKey(envelope.channel), body)
    .ltrim(historyKey(envelope.channel), -MAX_HISTORY, -1)
    .publish(CHANNEL, body)
    .exec();
  return envelope;
}

async function getHistory(channel, maxCount = 30) {
  const count = Math.max(1, Math.min(MAX_HISTORY, Number(maxCount) || 30));
  if (!publisher || !started) return [];
  const rows = await publisher.lrange(historyKey(channel), -count, -1);
  return rows.map(parseEnvelope).filter(Boolean).map((row) => ({
    ...row.entry,
    messageId: row.messageId,
    originNode: row.originNode,
  }));
}

async function allow(userId, channel) {
  if (!publisher || !started) throw new Error('CHAT_BUS_UNAVAILABLE');
  const key = `${RATE_PREFIX}${String(userId || 'unknown')}:${Math.max(0, Number(channel) || 0)}`;
  const count = Number(await publisher.incr(key));
  if (count === 1) await publisher.expire(key, RATE_WINDOW_SECONDS);
  return count <= RATE_LIMIT;
}

async function claim(eventKey, ttlSeconds = 2592000) {
  if (!publisher || !started) throw new Error('CHAT_BUS_UNAVAILABLE');
  const key = `${CLAIM_PREFIX}${String(eventKey || '').slice(0, 220)}`;
  const result = await publisher.set(key, '1', 'NX', 'EX', Math.max(60, Number(ttlSeconds) || 2592000));
  return result === 'OK';
}

async function stop() {
  started = false;
  const clients = [publisher, subscriber].filter(Boolean);
  publisher = null; subscriber = null; onEntry = null; seen.clear();
  await Promise.all(clients.map((client) => client.quit().catch(() => undefined)));
}

module.exports = { CHANNEL, MAX_HISTORY, RATE_LIMIT, start, stop, publish, getHistory, allow, claim, isReady: () => started };
