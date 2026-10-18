'use strict';

const playerMutation = require('./PlayerMutationService');
const playerService = require('./PlayerService');
const currencySync = require('./CurrencySync');
const runtimeBus = require('./RuntimeBus');
const { createHash } = require('node:crypto');
const clone = value => JSON.parse(JSON.stringify(value));
const fields = ['homelandInfo', 'items', 'currencies'];

function publicState(player) {
  const info = player.homelandInfo || {};
  return clone(Object.fromEntries([
    'lv', 'areaLv', 'buildingLv', 'collectMap', 'fetters', 'dailyLike',
    'prayBuff', 'prayAttrs', 'lastPrayBuff', 'lastPrayAttrs', 'prayDayKey',
    'statueTributeCount', 'statueDayKey', 'drawFreeCount', 'drawDayKey',
    'drawLuckCount', 'unlockClues', 'wishId', 'visitorMap', 'stateRevision',
  ].filter(k => info[k] !== undefined).map(k => [k, info[k]])));
}

function itemSync(before, after, absolute = false) {
  const previous = before.items || {}, current = after.items || {};
  const ids = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter(k => Number(k) > 0 && (absolute || Number(previous[k] || 0) !== Number(current[k] || 0)));
  return { tag: 1202, msgUid: 0, data: {
    result: 0,
    items: absolute ? [] : ids.map(k => ({ id: Number(k), count: Number(current[k] || 0) - Number(previous[k] || 0) })),
    changed: ids.map(k => ({ id: Number(k), count: Number(current[k] || 0) })),
  } };
}

// Clone -> validate -> one CAS save -> publish. A rejected handler cannot
// leak costs into the online player. Receipts are saved in the same document
// as costs/rewards and are usable after reconnect/uncertain acknowledgements.
function wrap(handler, tag) {
  return function homelandMutation(params, session, msgUid) {
    return playerMutation.run(session && session.userId, async () => {
      const reject = code => ({ tag, msgUid, data: { result: 1, code } });
      if (!session || !session.player) return reject('HOMELAND_SESSION_REQUIRED');
      const ws = runtimeBus.getWsServer();
      if (playerService.drainPendingSaves) await playerService.drainPendingSaves(session.userId);
      const canonical = ws && ws.getPlayerForMutation
        ? (ws.getPlayerForMutation(session.userId) || session.player) : session.player;
      const before = clone(canonical), expected = {};
      // Login normalizers may have populated defaults without persisting.
      // Read the narrow raw preimage after draining saves, rather than making
      // a CAS against synthesized fields that never existed in Mongo.
      const Player = require('../db/models/Player');
      const stored = await Player.collection.findOne({ userId: session.userId }, {
        projection: { homelandInfo: 1, items: 1, currencies: 1 }, maxTimeMS: 5000,
      });
      if (!stored) return reject('HOMELAND_SESSION_REQUIRED');
      for (const field of fields) {
        if (stored[field] !== undefined) {
          expected[field] = clone(stored[field]); before[field] = clone(stored[field]);
        } else delete before[field];
      }
      const p = params && typeof params === 'object' ? params : {};
      const requestId = p.requestId;
      if (requestId != null && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))) return reject('HOMELAND_REQUEST_INVALID');
      const body = { ...p }; delete body.requestId;
      const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const key = requestId ? `${tag}:${requestId}` : null;
      const ledger = Array.isArray(before.homelandInfo?.actionLedger) ? before.homelandInfo.actionLedger : [];
      const receipt = key && ledger.find(row => row.key === key);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) return reject('HOMELAND_REQUEST_CONFLICT');
        const packet = { tag, msgUid, data: { ...clone(receipt.data), replayed: true, homelandState: publicState(before) } };
        return [itemSync(before, before, true), packet];
      }
      const draft = { ...session, player: clone(before), homelandNeedsSave: false };
      try {
        const response = await handler(p, draft, msgUid);
        const packets = clone(Array.isArray(response) ? response : [response]);
        const ack = packets.find(row => row.tag === tag && row.msgUid === msgUid);
        const ok = ack && (ack.data.result == null || ack.data.result === 0
          || Array.isArray(ack.data.result) && ack.data.result.some(code => code === 0));
        if (!ok || !draft.homelandNeedsSave) {
          if (ack) ack.data.homelandState = publicState(draft.player);
          return packets.length === 1 ? packets[0] : packets;
        }
        const info = draft.player.homelandInfo;
        info.stateRevision = Math.max(0, Number(before.homelandInfo?.stateRevision) || 0) + 1;
        ack.data.homelandState = publicState(draft.player);
        if (key) {
          info.actionLedger = ledger.concat({ key, fingerprint, data: clone(ack.data), at: Date.now() }).slice(-64);
        }
        currencySync.syncCurrencyItems(draft.player);
        const saved = await playerService.savePlayer(session.userId, draft.player, {
          returnSaved: false, homelandCAS: expected, onlyFields: fields,
        });
        if (!saved) throw new Error('HOMELAND_SAVE_NOT_CONFIRMED');
        // Use the object marked saved by PlayerService so WSServer does not
        // enqueue a stale/duplicate automatic save after this response.
        session.player = draft.player;
        for (const field of fields) canonical[field] = draft.player[field];
        return [itemSync(before, draft.player), ...packets.filter(row => row.tag !== 1202)];
      } catch (_error) {
        // A write may have committed. Never restore or persist the old
        // snapshot on socket close. Relog loads the receipt and new balances.
        if (ws && ws.invalidatePlayerForMutation) ws.invalidatePlayerForMutation(session.userId);
        session.player = null;
        return reject('HOMELAND_SAVE_UNKNOWN');
      }
    });
  };
}

module.exports = { wrap, publicState };
