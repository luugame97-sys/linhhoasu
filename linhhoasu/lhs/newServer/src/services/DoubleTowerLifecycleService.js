'use strict';

const crypto = require('crypto');
const config = require('./ConfigService');

const int = (value) => Number.isSafeInteger(Number(value)) ? Number(value) : -1;
const MODE_TAG = { normal: 4502, rank: 4505 };

function failure(mode, msgUid, code) {
  return { tag: MODE_TAG[mode], msgUid, data: { result: -1, code, retryable: false } };
}

function begin(info, mode, request = {}, setup = {}, now = Date.now()) {
  const requestId = String(request.requestId || '');
  if (requestId.length > 160) throw new Error('DOUBLE_TOWER_REQUEST_ID_INVALID');
  const old = info.pendingBattle;
  if (old && old.mode === mode && requestId && old.requestId === requestId
    && now - old.startedAt < 3600000) return old;
  const pending = {
    uid: crypto.randomBytes(16).toString('hex'),
    mode,
    requestId,
    startedAt: now,
    aiId: Math.max(0, int(setup.aiId)),
    index: Math.max(1, int(setup.index)),
    enemyId: String(setup.enemyId || ''),
  };
  info.pendingBattle = pending;
  return pending;
}

function verify(info, mode, params = {}, msgUid, now = Date.now()) {
  const pending = info.pendingBattle;
  if (!pending || pending.mode !== mode) {
    const last = info.lastBattleReceipt;
    const requestedUid = String(params.battleId || '');
    if (last && last.mode === mode && last.uid && requestedUid === String(last.uid)
      && now - int(last.at) <= 60000) {
      return { response: { tag: MODE_TAG[mode], msgUid, data: { ...last.response, recovered: true } } };
    }
    return { response: failure(mode, msgUid, 'DOUBLE_TOWER_BATTLE_NOT_STARTED') };
  }
  const uid = String(params.battleId || pending.uid || '');
  if (!/^[0-9a-f]{32}$/.test(uid) || pending.uid !== uid) {
    return { response: failure(mode, msgUid, 'DOUBLE_TOWER_CLIENT_REFRESH_REQUIRED') };
  }
  const receiptForUid = (Array.isArray(info.battleReceipts) ? info.battleReceipts : [])
    .find((row) => row.uid === uid && row.mode === mode);
  if (receiptForUid) {
    return { response: { tag: MODE_TAG[mode], msgUid, data: { ...receiptForUid.response, recovered: true } } };
  }
  const type = int(params.type);
  const duration = int(params.duration);
  // Native GameOver emits 0 (win), 2 (loss); 1 is retained for old draw data.
  if (![0, 1, 2].includes(type)) return { response: failure(mode, msgUid, 'DOUBLE_TOWER_RESULT_INVALID') };
  const maxSeconds = Math.max(1, Math.ceil(Number(config.get('DoubleTowerBaseConfig')?.CombatTimeLimit || 108000) / 60));
  const elapsed = Math.max(0, (now - pending.startedAt) / 1000);
  if (duration < 0 || duration > maxSeconds + 2 || elapsed > 3600) {
    return { response: failure(mode, msgUid, 'DOUBLE_TOWER_DURATION_INVALID') };
  }
  return { pending, type, duration, participated: duration > 0 };
}

function commit(info, pending, response, now = Date.now()) {
  const receipts = Array.isArray(info.battleReceipts) ? info.battleReceipts : [];
  if (!receipts.some((row) => row.uid === pending.uid)) {
    receipts.push({ uid: pending.uid, mode: pending.mode, at: now, response: JSON.parse(JSON.stringify(response)) });
  }
  info.battleReceipts = receipts.slice(-32);
  info.lastBattleReceipt = {
    uid: pending.uid,
    mode: pending.mode,
    at: now,
    response: JSON.parse(JSON.stringify(response)),
  };
  info.pendingBattle = null;
}

module.exports = { begin, verify, commit };
