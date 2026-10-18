'use strict';

// Durable-in-player-document receipts for the native-compatible OldTrek
// approximation. The ledger is intentionally small and deterministic; the
// next settlement phase can move it to a dedicated collection without changing
// keys or replay semantics.
const MAX_RECEIPTS = 256;

function asInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function ensureInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return {};
  if (!Array.isArray(info.rewardLedger)) info.rewardLedger = [];
  if (!Array.isArray(info.eventLedger)) info.eventLedger = [];
  if (!Array.isArray(info.trekReceipts)) info.trekReceipts = [];
  return info;
}

function receiptKey(scope, season, uid) {
  return `${String(scope || 'oldtrek')}:${Math.max(0, asInt(season, 0))}:${Math.max(0, asInt(uid, 0))}`;
}

function find(rows, key) {
  return (Array.isArray(rows) ? rows : []).find((row) => row && row.key === key) || null;
}

function trim(rows) {
  while (rows.length > MAX_RECEIPTS) {
    const old = rows.findIndex(r => r.status === 'done' || r.status === 'failed');
    if (old < 0) throw Error('OLD_TREK_PENDING_LEDGER_CAPACITY');
    rows.splice(old, 1);
  }
  return rows;
}

function begin(info, key, meta = {}) {
  ensureInfo(info);
  const existing = find(info.rewardLedger, key);
  if (existing && existing.status !== 'failed') return { existing, created: false };
  if (existing && existing.status === 'failed') {
    existing.status = 'pending';
    existing.updatedAt = Date.now();
    delete existing.code;
    return { existing, created: true };
  }
  const now = Date.now();
  const row = { key, status: 'pending', createdAt: now, updatedAt: now, ...meta };
  info.rewardLedger.push(row);
  trim(info.rewardLedger);
  return { existing: row, created: true };
}

function commit(info, key, payload = {}) {
  ensureInfo(info);
  const row = find(info.rewardLedger, key) || { key, createdAt: Date.now() };
  row.status = 'done';
  row.updatedAt = Date.now();
  row.payload = payload;
  if (!find(info.rewardLedger, key)) info.rewardLedger.push(row);
  trim(info.rewardLedger);
  return row;
}

function abandon(info, key, code) {
  ensureInfo(info);
  const row = find(info.rewardLedger, key);
  if (!row) return null;
  row.status = 'failed';
  row.code = String(code || 'OLD_TREK_MUTATION_FAILED');
  row.updatedAt = Date.now();
  return row;
}

function done(info, key) {
  ensureInfo(info);
  const row = find(info.rewardLedger, key);
  return row && row.status === 'done' ? row : null;
}

module.exports = { MAX_RECEIPTS, ensureInfo, receiptKey, find, begin, commit, abandon, done };
