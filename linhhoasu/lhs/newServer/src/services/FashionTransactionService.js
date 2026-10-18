'use strict';

const players = require('./PlayerService');
const locks = require('./PlayerMutationService');
const receipts = require('./FeatureReceiptService');
const runtime = require('./RuntimeBus');
const clone = value => JSON.parse(JSON.stringify(value));

function selectionPacket(player) {
  const info = player.fashionInfo || {};
  return { tag: 1800, msgUid: 0, data: {
    result: 0, fashion: info.activateFashion || [], data: info.fashionData || [],
    selection: info.fashion || {}, setId: info.setId || 0, sets: info.sets || [],
  } };
}

async function run(tag, params, session, msgUid, work) {
  return locks.run(session?.userId, async () => {
    const original = session?.player;
    if (!original || !session.userId) return { tag, msgUid, data: { result: -1, code: 'FASHION_SESSION_REQUIRED' } };
    await players.drainPendingSaves(session.userId);
    const prior = receipts.read(original, tag, params);
    if (prior) return [
      { tag: 1202, msgUid: 0, data: { items: [], changed: require('./CurrencySync').buildClientItemList(original) } },
      selectionPacket(original),
      { tag, msgUid, data: { ...prior, replayed: true, setId:original.fashionInfo?.setId || 0, selection: original.fashionInfo?.fashion || {} } },
    ];
    const draft = clone(original);
    const shadow = { ...session, player: draft, _fashionTransaction: true };
    const output = await work(params, shadow, msgUid);
    const packets = Array.isArray(output) ? output : [output];
    const response = packets.find(p => p.tag === tag && p.msgUid === msgUid);
    if (response?.data?.result !== 0) return output;
    receipts.record(draft, tag, params, response.data);
    try {
      if (!await players.savePlayer(session.userId, draft, { returnSaved: false })) throw Error('FASHION_SAVE_NOT_CONFIRMED');
    } catch (error) {
      runtime.getWsServer()?.invalidatePlayerForMutation(session.userId);
      session.player = null;
      throw error;
    }
    const previousSelection = JSON.stringify(original.fashionInfo?.fashion || {});
    Object.assign(original, draft);
    session._itemListCache = null;
    if (previousSelection !== JSON.stringify(original.fashionInfo?.fashion || {}) && session._mapSelfInfo
      && session._mapId > 0 && typeof session._broadcastMapExceptUser === 'function') {
      try {
        const next = { ...session._mapSelfInfo, showInfo: require('../handlers/basic').buildMapShowInfo(original) };
        session._mapSelfInfo = clone(next);
        session._broadcastMapExceptUser(1402, { id:next.id,mapId:session._mapId });
        session._broadcastMapExceptUser(1401, { mapId:session._mapId,mapPlayer:next });
      } catch (error) {
        // Broadcast failure must not turn a durable purchase into a retry.
        require('../logger').warn('[Fashion] committed selection broadcast failed: ' + error.message);
      }
    }
    // The client sees the committed selection before its native ACK callback.
    return [...packets.filter(p => p.tag !== tag), selectionPacket(original), { ...response, data: { ...response.data, selection: original.fashionInfo?.fashion || {} } }];
  });
}

module.exports = { run, selectionPacket };
