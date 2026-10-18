'use strict';
const mutation = require('./PlayerMutationService');
const players = require('./PlayerService');
const runtime = require('./RuntimeBus');
const { AsyncLocalStorage } = require('node:async_hooks');
const transactions = new AsyncLocalStorage();
const receipts = require('./FeatureReceiptService');
const recovery = require('./FarmRecoveryService');

function isFarmTag(tag) { return Number(tag) >= 2400 && Number(tag) <= 2429; }
async function withLocks(tag, params, session, work) {
  if (!session?.userId || !session.player) return work();
  if (mutation.holds(session.userId)) return work();
  const dbids = new Set();
  if ([2402, 2404, 2406, 2408, 2412, 2415, 2426].includes(Number(tag)) && params?.dbid) dbids.add(String(params.dbid));
  if (Number(tag) === 2405) {
    (session.player.farmInfo?.roblist || []).forEach(row => { if (row.playerinfo?.dbid) dbids.add(String(row.playerinfo.dbid)); });
    (session.player.farmInfo?.blockInfo || []).forEach(row => { if (row.robber?.dbid) dbids.add(String(row.robber.dbid)); });
  }
  if (dbids.size > 100) throw new Error('FARM_TARGET_LIMIT');
  const keys = [String(session.userId)];
  for (const dbid of dbids) {
    const row = await players.findByPlayerId(dbid);
    if (row?.userId) keys.push(String(row.userId));
  }
  return mutation.runMany(keys, async () => {
    // Drain snapshots queued before the locks were acquired. Runtime objects
    // remain authoritative for online players; never save an offline clone
    // over a live inventory.
    for (const key of new Set(keys)) await players.drainPendingSaves(key);
    return work();
  });
}
async function load(dbid) {
  const row = await players.findByPlayerId(String(dbid));
  if (!row) return null;
  if (!mutation.holds(row.userId)) throw new Error('FARM_TARGET_NOT_LOCKED');
  return runtime.getWsServer()?.getPlayerForMutation(row.userId) || row;
}
function invalidate(userId, session) {
  runtime.getWsServer()?.invalidatePlayerForMutation(userId);
  if (session?.userId === userId) session.player = null;
}
async function save(player, session) {
  if (!player?.userId) throw new Error('FARM_USER_REQUIRED');
  if (!mutation.holds(player.userId)) throw new Error('FARM_WRITER_NOT_LOCKED');
  const tx = transactions.getStore();
  if (tx && tx.session.userId === player.userId) { tx.dirty = true; return; }
  try {
    const saved = await players.savePlayer(player.userId, player, { returnSaved: false });
    if (!saved) throw new Error('FARM_SAVE_NOT_CONFIRMED');
  } catch (error) { invalidate(player.userId, session); throw error; }
  if (session) session._itemListCache = null;
  const ws = runtime.getWsServer();
  if (ws) for (const { session: target } of ws.clients.values()) {
    if (target.userId === player.userId) {
      target._itemListCache = null;
      if (target.player && target.player !== player) target.player.farmInfo = JSON.parse(JSON.stringify(player.farmInfo));
    }
  }
}
function run(tag, params, session, msgUid, handler) {
  if (params && (typeof params !== 'object' || Array.isArray(params))) return Promise.resolve({ tag, msgUid, data: { result: 1, code: 'INVALID_FARM_REQUEST' } });
  for (const field of ['index', 'seed', 'itemId', 'count', 'ad', 'id']) {
    if (params?.[field] != null && (!Number.isSafeInteger(params[field]) || params[field] < 0 || params[field] > 10000000)) {
      return Promise.resolve({ tag, msgUid, data: { result: 1, code: 'INVALID_FARM_REQUEST' } });
    }
  }
  if (tag === 2406 && !(params?.count > 0)) return Promise.resolve({ tag, msgUid, data: { result: 1, code: 'INVALID_FARM_COUNT' } });
  return withLocks(tag, params, session, async () => {
    if (!session?.player) return handler(params, session, msgUid);
    const dayPackets = await require('./FarmDayService').synchronize(session);
    const prior = receipts.read(session.player, tag, params);
    if (prior) return [
      ...dayPackets,
      { tag: 1202, msgUid: 0, data: { items: [], changed: require('./CurrencySync').buildClientItemList(session.player) } },
      { tag: 2400, msgUid: 0, data: require('../handlers/farm').buildFarmInfoData(session.player) },
      { tag, msgUid, data: replayData(session.player, tag, params, prior) },
    ];
    const tx = { session, dirty: recovery.settle(session.player), pushes: [], afterCommit: [] };
    let result;
    try {
      result = await transactions.run(tx, () => handler(params, session, msgUid));
      tx.dirty = recovery.settle(session.player) || tx.dirty;
      if (tx.dirty && session.player) {
        const packets = Array.isArray(result) ? result : [result];
        const response = packets.find(p => p.tag === tag && p.msgUid === msgUid);
        if (response) receipts.record(session.player, tag, params, response.data);
        await save(session.player, session);
        for (const cleanup of tx.afterCommit) {
          try { await cleanup(); } catch (error) { require('../logger').warn('[Farm] durable settlement retained for retry: ' + error.message); }
        }
        for (const send of tx.pushes) send();
      }
    } catch (error) { invalidate(session.userId, session); throw error; }
    return [...dayPackets, ...recovery.packets(session.player), ...(Array.isArray(result) ? result : [result])];
  });
}
function replayData(player, tag, params, prior) {
  const farm = player.farmInfo || {};
  if (tag === 2416 || tag === 2428) {
    const slot = farm.cookInfo?.[params.index || 0] || {};
    return { ...prior, cookFinishTime: slot.finishTime || 0, cookReward: slot.reward || 0, cookTime: slot.time || 0 };
  }
  if (tag === 2410) return { ...prior, time: farm.buildUpgrade?.[params.index] || 0 };
  if (tag === 2413) return { ...prior, buildLv: farm.buildLv || {}, buildUpgrade: farm.buildUpgrade || {} };
  return prior;
}
function push(dbid, packet, session) {
  const tx = transactions.getStore();
  if (tx) { tx.pushes.push(() => push(dbid, packet, session)); return; }
  const ws = runtime.getWsServer();
  if (!ws) return;
  for (const { session: target, ws: socket } of ws.clients.values()) {
    if (target !== session && target.player?.playerId === dbid) ws.sendResponse(socket, packet);
  }
}
function afterCommit(work) {
  const tx = transactions.getStore();
  if (!tx) throw new Error('FARM_TRANSACTION_REQUIRED');
  tx.afterCommit.push(work);
}
module.exports = { isFarmTag, withLocks, load, save, invalidate, push, run, afterCommit };
