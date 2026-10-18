'use strict';

const crypto = require('node:crypto');
const locks = require('./PlayerMutationService');
const players = require('./PlayerService');
const runtime = require('./RuntimeBus');

const VERSION = 'drop_tier_receipt_v1';
const MAX_HISTORY = 64;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function responseFor(output, tag, msgUid) {
  const packets = Array.isArray(output) ? output : [output];
  return packets.find((packet) => packet && packet.tag === tag && Number(packet.msgUid) === Number(msgUid));
}

function isSuccess(response) {
  return !!response && response.data && Number(response.data.result) === 0;
}

function invalidate(session, error) {
  try { runtime.getWsServer()?.invalidatePlayerForMutation?.(session?.userId); } catch (_err) {}
  if (session) session.player = null;
  return error;
}

function ensureReceipt(box) {
  const current = box.dropTierReceipt;
  if (current && current.version === VERSION && Array.isArray(current.history)) return current;
  const receipt = { version: VERSION, sessionId: '', history: [] };
  box.dropTierReceipt = receipt;
  return receipt;
}

/**
 * Execute one tier mutation against an isolated player draft. The supplied
 * handler is the existing compat handler and must skip its nested save when
 * `shadow._dropTierDraft` is true. This service owns the only confirmed save.
 */
async function run(tag, params, session, msgUid, handler) {
  if (!session?.userId || !session.player) {
    return { tag, msgUid, data: { result: -1, code: 'DROP_TIER_SESSION_REQUIRED' } };
  }
  if (typeof handler !== 'function') throw new Error('DROP_TIER_HANDLER_REQUIRED');
  return locks.run(session.userId, async () => {
    await players.drainPendingSaves(session.userId);
    const original = session.player;
    const box = original.boxInfo && typeof original.boxInfo === 'object' ? original.boxInfo : {};
    const receipt = box.dropTierReceipt;
    const requestId = Number(msgUid) > 0 ? String(msgUid) : '';
    const sessionId = session._dropTierSessionId || (session._dropTierSessionId = crypto.randomUUID());
    const key = requestId ? `${sessionId}:${tag}:${requestId}` : '';
    const replay = receipt && receipt.version === VERSION && receipt.history?.find((row) => row.key === key);
    if (replay) return clone(replay.output);

    const draft = clone(original);
    const shadow = { ...session, player: draft, _dropTierDraft: true };
    let output;
    try {
      output = await handler(params || {}, shadow, msgUid);
    } catch (error) {
      throw invalidate(session, error);
    }
    const response = responseFor(output, tag, msgUid);
    if (!isSuccess(response)) return output;

    const draftBox = draft.boxInfo && typeof draft.boxInfo === 'object' ? draft.boxInfo : (draft.boxInfo = {});
    const draftReceipt = ensureReceipt(draftBox);
    if (!draftReceipt.sessionId) draftReceipt.sessionId = sessionId;
    if (key) {
      draftReceipt.history.push({ key, at: Date.now(), output: clone(output) });
      if (draftReceipt.history.length > MAX_HISTORY) {
        draftReceipt.history.splice(0, draftReceipt.history.length - MAX_HISTORY);
      }
    }
    try {
      const saved = await players.savePlayer(session.userId, draft, { returnSaved: false });
      if (!saved) throw new Error('DROP_TIER_SAVE_NOT_CONFIRMED');
    } catch (error) {
      throw invalidate(session, error);
    }
    Object.assign(original, draft);
    session._itemListCache = null;
    return output;
  });
}

module.exports = { VERSION, MAX_HISTORY, run };
