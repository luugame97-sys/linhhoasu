'use strict';

// Standalone Mongo: reserve a durable listing intent BEFORE debit. Wallet
// changes and replay markers commit together. The listing CAS commits the bid
// AND refund outbox, so restart can recover every intermediate state.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Player = require('../db/models/Player');
const Listing = require('../db/models/AuctionListing');
const Record = require('../db/models/AuctionRecord');
const GameServer = require('../db/models/GameServer');
const config = require('./ConfigService');
const players = require('./PlayerService');
const mutations = require('./PlayerMutationService');
const runtime = require('./RuntimeBus');
const logger = require('../logger');
const TOKEN = 1001;
// Deployed VN DateUtils uses -420, despite its legacy GMT8 function name.
const OFFSET = 7 * 3600000;
const MAINTENANCE = { state: 'maintenance', code: 'AUCTION_MAINTENANCE', message: 'Thiên Vận Đấu Giá đang bảo trì. Vui lòng quay lại sau.', version: '20261015_auction_guard_v1' };
let catalog;
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const array = value => Array.isArray(value) ? value : [];
const integer = value => Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const emptyReward = () => ({ items: [], equips: [], bloodline: [] });
const lean = query => query && typeof query.lean === 'function' ? query.lean() : query;
const uid = key => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 12), 16);

function getCatalog() {
  if (catalog) return catalog;
  const cfg = JSON.parse(fs.readFileSync(process.env.AUCTION_CATALOG_PATH || path.join(__dirname, '../config/auctionCatalog.v1.json'), 'utf8'));
  if (cfg.status !== 'approved' || cfg.approvalRequired !== false || cfg.scope?.mode !== 'system_only'
    || cfg.scope.payId !== TOKEN || !array(cfg.lots).length || cfg.lots.length > 5) throw Error('AUCTION_CATALOG_INVALID');
  if (!(integer(cfg.rules?.delay) > 0 && cfg.rules.delay <= 300 && integer(cfg.rules.bidLimit) > 0
    && integer(cfg.rules.royalBidAdjustValue) > 0 && cfg.rules.openTime?.[0] >= 0
    && cfg.rules.openTime[0] < cfg.rules.royalOpenTime?.[0]
    && cfg.rules.royalOpenTime[0] < cfg.rules.royalOpenTime[1] && cfg.rules.royalOpenTime[1] < 86400)) throw Error('AUCTION_CATALOG_RULES_INVALID');
  const ids = new Set();
  for (const lot of cfg.lots) {
    if (!lot.lotId || ids.has(lot.lotId) || lot.type !== 1 || lot.payId !== TOKEN || lot.item?.count !== 1
      || lot.detail?.artifact?.id !== lot.item.id || integer(lot.price) <= 0
      || integer(lot.fixedValue) < lot.price) throw Error('AUCTION_CATALOG_LOT_INVALID');
    ids.add(lot.lotId);
  }
  catalog = cfg;
  return cfg;
}
function isEnabled() { return process.env.AUCTION_SHARED_ENABLED === '1' && process.env.AUCTION_SHARED_APPROVED === '1'; }
function serverIdFor(session) { return integer(process.env.SERVER_ID) || integer(session?.serverId) || integer(session?.player?.serverId) || 1001; }
function allowedServer(serverId) {
  const scope = getCatalog().scope || {};
  if (array(scope.serverIds).includes(serverId)) return true;
  const pool = scope.serverPool || {};
  if (pool.autoInclude !== true || pool.mode !== 'page') return false;
  const pageId = Math.max(1, integer(pool.pageId) || 1);
  const min = Math.max(pageId * 1000 + 1, integer(pool.minServerId) || (pageId * 1000 + 1));
  const max = Math.min(pageId * 1000 + 999, integer(pool.maxServerId) || (pageId * 1000 + 999));
  return serverId >= min && serverId <= max;
}
async function eventWindow(serverId, now) {
  const server = await lean(GameServer.findOne({ serverId }));
  if (!server || server.rechargeArea !== getCatalog().scope.area || !server.openTime) return null;
  // Same derived openTime as native GameServer.openTime: account.js sends
  // ceil(elapsed days), then client uses today's end - runDays + 1000ms.
  const dayStart = Math.floor((now + OFFSET) / 86400000) * 86400000 - OFFSET;
  const runDays = Math.max(1, Math.ceil((now - server.openTime) / 86400000));
  const nativeOpenTime = dayStart + 86400000 - runDays * 86400000 + 999;
  for (const row of Object.values(config.get('AuctionOpenConfig') || {})) {
    if (row.area !== server.rechargeArea || row.isRoyal !== 1 || array(row.showLimit).length) continue;
    if (row.limitServerId && !row.limitServerId.some(([min, max]) => serverId >= min && serverId <= max)) continue;
    const convert = value => !value ? 0 : row.timeType === 2 ? value : row.timeType === 3 ? nativeOpenTime + (value - 1) * 86400000 : 0;
    const start = convert(row.startTime), end = convert(row.endTime);
    if (convert(row.limitStartTime) && nativeOpenTime < convert(row.limitStartTime)) continue;
    if (convert(row.limitEndTime) && nativeOpenTime > convert(row.limitEndTime)) continue;
    if (start < now && now < end) return { id: row.id, start, end };
  }
  return null;
}

function cycleInfo(now = Date.now()) {
  const rules = getCatalog().rules, shifted = new Date(now + OFFSET);
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - OFFSET;
  const cycleKey = shifted.toISOString().slice(0, 10).replace(/-/g, '');
  const openAtMs = dayStart + rules.openTime[0] * 1000;
  const royalOpenAtMs = dayStart + rules.royalOpenTime[0] * 1000;
  const closeAtMs = dayStart + rules.royalOpenTime[1] * 1000;
  const phase = now < openAtMs ? 'preopen' : now < royalOpenAtMs ? 'onshelf' : now < closeAtMs ? 'bidding' : 'settled';
  return { cycleKey, dayStart, openAtMs, royalOpenAtMs, closeAtMs, phase };
}
function statusSnapshot(info, extra = {}) {
  return { state: 'ready', code: 'AUCTION_READY', message: 'Phiên này chỉ có hàng hệ thống.',
    version: getCatalog().catalogVersion, phase: info.phase, cycleKey: info.cycleKey,
    openAt: info.openAtMs, royalOpenAt: info.royalOpenAtMs, closeAt: info.closeAtMs,
    timezone: 'Asia/Bangkok', payId: TOKEN, mode: 'system_only', ...extra };
}
function publicListing(row, userId = '') {
  return { id: row.id, type: 1, status: row.status, item: clone(row.item), detail: clone(row.detail),
    price: row.price, fixedValue: row.fixedValue, payType: 0, payId: TOKEN,
    playerId: '', playerName: '', bidderId: row.bidderId || null,
    bidderName: row.hideName ? '' : (row.bidderName || ''), hideName: row.hideName || 0, hidename: row.hideName || 0,
    hasOffer: userId && array(row.bidHistory).some(b => b.userId === userId) ? 1 : 0,
    // Native uses milliseconds. Status 1 carries publicity time; status 2
    // carries the extended deadline, not the original 22:00 cutoff.
    time: row.status === 2 ? row.closeAtMs : row.time, openAt: row.openAtMs, closeAt: row.closeAtMs };
}

async function seedCycle(serverId, info, now) {
  if (!allowedServer(serverId) || !['onshelf', 'bidding'].includes(info.phase)) return;
  if (!await eventWindow(serverId, now)) return;
  for (const lot of getCatalog().lots) {
    const _id = `${serverId}:${info.cycleKey}:${lot.lotId}`;
    const document = { _id, serverId, cycleKey: info.cycleKey, lotId: lot.lotId,
      id: Number(info.cycleKey) * 100 + lot.id, version: 1, bidCount: 0, status: 1, type: 1,
      item: clone(lot.item), detail: clone(lot.detail), price: lot.price, fixedValue: lot.fixedValue,
      payId: TOKEN, payType: 0, playerId: '', bidderId: '', bidderUserId: '', bidderName: '', hideName: 0,
      openAtMs: info.openAtMs, closeAtMs: info.closeAtMs, time: info.royalOpenAtMs,
      pendingBid: null, bidHistory: [], refunds: [], needsReconcile: false, createdAt: new Date(now) };
    try { await Listing.updateOne({ _id }, { $setOnInsert: document }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
}
async function drain(userId) { if (players.drainPendingSaves) await players.drainPendingSaves(userId); }
function syncPlayer(userId, saved, fields = ['items', 'auctionInfo']) {
  if (!saved) return;
  const ws = runtime.getWsServer();
  const canonical = ws?.getPlayerForMutation?.(userId);
  if (canonical) for (const field of fields) if (saved[field] !== undefined) canonical[field] = clone(saved[field]);
  if (ws?.syncSessionPlayer) ws.syncSessionPlayer(userId, saved, { fields });
  if (fields.includes('items') && ws?.pushToUser) {
    const { buildItemSyncPayload } = require('./PlayerGrantService');
    ws.pushToUser(userId, 1202, buildItemSyncPayload(saved, [TOKEN]));
  }
}
function ledgerHas(player, name, key) { return array(player?.auctionInfo?.[name]).includes(key); }
function invalidate(userId) { runtime.getWsServer()?.invalidatePlayerForMutation?.(userId); }

// Caller holds the role mutation lock and has drained deferred saves.
async function walletOnce(userId, amount, key, debit) {
  const ledger = debit ? 'debitLedger' : 'refundLedger', ledgerPath = `auctionInfo.${ledger}`;
  const filter = { userId, [ledgerPath]: { $ne: key } };
  if (debit) filter[`items.${TOKEN}`] = { $gte: amount };
  try {
    const saved = await lean(Player.findOneAndUpdate(filter,
      { $inc: { [`items.${TOKEN}`]: debit ? -amount : amount }, $addToSet: { [ledgerPath]: key } },
      { new: true, maxTimeMS: 5000 }));
    if (saved) { syncPlayer(userId, saved); return saved; }
    const current = await lean(Player.findOne({ userId }));
    syncPlayer(userId, current);
    return ledgerHas(current, ledger, key) ? current : null;
  } catch (error) {
    // Unknown write outcome: a stale live snapshot must not overwrite a
    // possible committed debit. Recovery reads the durable marker.
    invalidate(userId);
    throw error;
  }
}
function broadcast(row) { runtime.getWsServer()?.broadcastPlayers?.(5104, { list: [publicListing(row)] }); }

async function resumeBid(listingId, key) {
  let row = await lean(Listing.findOne({ _id: listingId }));
  if (!row?.pendingBid || row.pendingBid.key !== key) return row;
  const intent = row.pendingBid;
  return mutations.run(intent.userId, async () => {
    await drain(intent.userId);
    row = await lean(Listing.findOne({ _id: listingId }));
    if (row?.pendingBid?.key !== key) return row;
    const saved = await walletOnce(intent.userId, intent.debit, key, true);
    if (!saved) {
      await Listing.updateOne({ _id: listingId, 'pendingBid.key': key }, { $set: { pendingBid: null } });
      return null;
    }
    const refunds = clone(array(row.refunds));
    if (row.bidderUserId && row.bidderUserId !== intent.userId) refunds.push({
      key: `refund:${key}`, userId: row.bidderUserId, playerId: row.bidderId, amount: row.price,
    });
    const buyNow = intent.price === row.fixedValue;
    const history = [...array(row.bidHistory), { key, userId: intent.userId, price: intent.price, at: intent.at }];
    const updated = await lean(Listing.findOneAndUpdate({ _id: listingId, 'pendingBid.key': key, version: row.version }, {
      $set: { price: intent.price, bidderId: intent.playerId, bidderUserId: intent.userId,
        bidderName: intent.name, hideName: intent.hideName, status: buyNow ? 3 : intent.status,
        closeAtMs: intent.closeAtMs, time: intent.status === 2 ? intent.closeAtMs : row.time,
        settledAtMs: buyNow ? Date.now() : 0, pendingBid: null, bidHistory: history, refunds, needsReconcile: true },
      $inc: { version: 1, bidCount: 1 },
    }, { new: true }));
    if (updated) broadcast(updated);
    // Never rollback speculatively after an ambiguous listing write.
    return updated || await lean(Listing.findOne({ _id: listingId }));
  });
}
async function ensureRecord(data) {
  try { await Record.updateOne({ _id: data._id }, { $setOnInsert: data }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const confirmed = await lean(Record.findOne({ _id: data._id }));
  if (!confirmed || confirmed.userId !== data.userId || confirmed.price !== data.price) throw Error('AUCTION_RECORD_NOT_CONFIRMED');
}
async function reconcile(row) {
  const common = { serverId: row.serverId, cycleKey: row.cycleKey, listingId: row._id,
    type: 1, receive: 0, deliveryState: 'pending', payId: TOKEN, item: clone(row.item), price: row.price };
  for (const refund of array(row.refunds)) {
    await ensureRecord({ ...common, _id: refund.key, uid: uid(refund.key), eventKey: refund.key,
      userId: refund.userId, playerId: refund.playerId, operation: 'outbid', price: refund.amount,
      detail: null, rewardInfo: { items: [{ id: TOKEN, count: refund.amount }], equips: [], bloodline: [] } });
  }
  if (row.status === 3 && row.bidderUserId) {
    const key = `winner:${row._id}`;
    await ensureRecord({ ...common, _id: key, uid: uid(key), eventKey: key, userId: row.bidderUserId,
      playerId: row.bidderId, operation: 'winner', detail: clone(row.detail), rewardInfo: emptyReward() });
  }
  await Listing.updateOne({ _id: row._id, version: row.version }, { $set: { needsReconcile: false } });
}
function publicRecord(row) {
  return { uid: row.uid, type: 1, receive: row.receive, auctionId: row.listingId,
    price: row.price, payId: TOKEN, time: new Date(row.createdAt || Date.now()).getTime(),
    item: clone(row.item), detail: clone(row.detail), rewardInfo: clone(row.rewardInfo || emptyReward()) };
}
async function deliverRecord(record) {
  return mutations.run(record.userId, async () => {
    await drain(record.userId);
    if (record.operation !== 'winner') {
      if (!await walletOnce(record.userId, record.price, record.eventKey, false)) throw Error('AUCTION_REFUND_PLAYER_MISSING');
    } else {
      const before = await lean(Player.findOne({ userId: record.userId }));
      if (!before) throw Error('AUCTION_WINNER_PLAYER_MISSING');
      if (!ledgerHas(before, 'deliveryLedger', record.eventKey)) {
        const draft = clone(before);
        const artifact = require('../handlers/artifact').grantArtifactSnapshotToPlayer(draft, record.detail?.artifact);
        if (!artifact) throw Error('AUCTION_ARTIFACT_INVALID');
        const fields = ['artifactInfo', 'taskInfo'];
        const conditions = fields.map(field => ({ [field]: Object.prototype.hasOwnProperty.call(before, field)
          ? { $eq: before[field] } : { $exists: false } }));
        let saved;
        try {
          saved = await lean(Player.findOneAndUpdate({ userId: record.userId,
            'auctionInfo.deliveryLedger': { $ne: record.eventKey }, $and: conditions }, {
            $set: Object.fromEntries(fields.map(field => [field, draft[field]]).filter(([, value]) => value !== undefined)),
            $addToSet: { 'auctionInfo.deliveryLedger': record.eventKey },
          }, { new: true, maxTimeMS: 5000 }));
        } catch (error) { invalidate(record.userId); throw error; }
        if (!saved) throw Error('AUCTION_DELIVERY_CAS_RETRY');
        syncPlayer(record.userId, saved, [...fields, 'auctionInfo']);
        runtime.getWsServer()?.pushToUser?.(record.userId, 3500, { result: 0, artifact });
      } else syncPlayer(record.userId, before, ['artifactInfo', 'taskInfo', 'auctionInfo']);
    }
    const done = await lean(Record.findOneAndUpdate({ _id: record._id, deliveryState: 'pending' },
      { $set: { receive: 1, deliveryState: 'delivered', error: '' } }, { new: true }));
    if (done) runtime.getWsServer()?.pushToUser?.(record.userId, 5101, { record: publicRecord(done) });
  });
}

async function settleDue(serverId, _info, now = Date.now(), currentUserId = null) {
  // RPCs already hold a role lock: only scheduler may lock OTHER players.
  const pendingFilter = { serverId, 'pendingBid.key': { $exists: true } };
  if (currentUserId) pendingFilter['pendingBid.userId'] = currentUserId;
  for (const row of await lean(Listing.find(pendingFilter).limit(100))) await resumeBid(row._id, row.pendingBid.key);
  const due = await lean(Listing.find({ serverId, status: { $in: [1, 2] }, pendingBid: null, closeAtMs: { $lte: now } }).limit(100));
  for (const row of due) {
    const updated = await lean(Listing.findOneAndUpdate({ _id: row._id, version: row.version, pendingBid: null, status: row.status }, {
      $set: { status: row.bidderUserId ? 3 : 4, settledAtMs: now, needsReconcile: true }, $inc: { version: 1 },
    }, { new: true }));
    if (updated) broadcast(updated);
  }
  for (const row of await lean(Listing.find({ serverId, needsReconcile: true }).limit(100))) await reconcile(row);
  const recordFilter = { serverId, deliveryState: 'pending' };
  if (currentUserId) recordFilter.userId = currentUserId;
  for (const record of await lean(Record.find(recordFilter).limit(200))) {
    try { await deliverRecord(record); }
    catch (error) {
      await Record.updateOne({ _id: record._id }, { $set: { error: String(error.message).slice(0, 200) } });
      logger.warn(`[Auction] receipt pending ${record._id}: ${error.message}`);
    }
  }
}
async function recordsFor(serverId, userId) {
  return (await lean(Record.find({ serverId, userId }).sort({ createdAt: -1 }).limit(100))).map(publicRecord);
}
async function enter(session, msgUid) {
  if (!session?.player || !session.userId) return { tag: 5100, msgUid, data: { result: -1, records: [], auctions: [], deals: [] } };
  const serverId = serverIdFor(session), now = Date.now(), info = cycleInfo(now);
  if (!allowedServer(serverId)) return unavailable(5100, session, msgUid, 'AUCTION_SERVER_DISABLED');
  await settleDue(serverId, info, now, session.userId);
  await seedCycle(serverId, info, now);
  const auctions = await lean(Listing.find({ serverId, cycleKey: info.cycleKey, status: { $in: [1, 2] }, closeAtMs: { $gt: now } }).sort({ id: 1 }));
  const deals = await lean(Listing.find({ serverId, cycleKey: info.cycleKey, status: 3 }).sort({ id: 1 }));
  return { tag: 5100, msgUid, data: { result: 0, records: await recordsFor(serverId, session.userId),
    auctions: auctions.map(row => publicListing(row, session.userId)), deals: deals.map(row => publicListing(row, session.userId)),
    auctionStatus: statusSnapshot(info, auctions.some(row => row.status === 2) ? { phase: 'extended' } : {}) } };
}
async function bid(params, session, msgUid) {
  const response = data => ({ tag: 5102, msgUid, data });
  if (!session?.player || !session.userId) return response({ result: -1 });
  const serverId = serverIdFor(session), now = Date.now(), info = cycleInfo(now), userId = String(session.userId);
  const id = integer(params?.id), price = integer(params?.price);
  if (!allowedServer(serverId)) return response({ result: 9, code: 'AUCTION_SERVER_DISABLED' });
  if (!id || price <= 0) return response({ result: 2, code: 'AUCTION_PRICE_INVALID' });
  return mutations.run(userId, async () => {
    await settleDue(serverId, info, now, userId);
    if (!['bidding', 'settled'].includes(info.phase)) return response({ result: 4, code: 'AUCTION_NOT_BIDDING' });
    const row = await lean(Listing.findOne({ serverId, cycleKey: info.cycleKey, id }));
    if (!row || ![1, 2].includes(row.status) || row.closeAtMs <= now) return response({ result: 1, code: 'AUCTION_CLOSED' });
    if (row.pendingBid) return response({ result: 2, code: 'AUCTION_CONFLICT_RETRY' });
    if (row.status !== 2 && !await eventWindow(serverId, now)) return response({ result: 4, code: 'AUCTION_EVENT_CLOSED' });
    if (row.bidderUserId === userId && row.price === price) return response({ result: 0, id, price, replayed: true });
    const minimum = row.bidderUserId ? Math.ceil(row.price * (10000 + getCatalog().rules.royalBidAdjustValue) / 10000) : row.price;
    if (price > row.fixedValue || (price < minimum && price !== row.fixedValue)) return response({ result: 2, code: 'AUCTION_BID_STEP_INVALID', minimum });
    // Limit simultaneous lots per participant, not everyone's number of bids.
    const active = await lean(Listing.find({ serverId, cycleKey: info.cycleKey, status: { $in: [1, 2] }, bidderUserId: userId }));
    if (row.bidderUserId !== userId && active.length >= getCatalog().rules.bidLimit) return response({ result: 3, code: 'AUCTION_BID_LIMIT' });
    const delay = getCatalog().rules.delay * 1000, extending = row.closeAtMs - now <= delay;
    const intent = { key: `bid:${row._id}:${row.version}:${userId}:${price}`, userId,
      playerId: String(session.player.playerId), name: String(session.player.name || ''), hideName: params.hidename ? 1 : 0,
      price, debit: row.bidderUserId === userId ? price - row.price : price, at: now,
      status: extending ? 2 : row.status, closeAtMs: extending ? now + delay : row.closeAtMs };
    const reserved = await lean(Listing.findOneAndUpdate({ _id: row._id, version: row.version, status: row.status,
      pendingBid: null, closeAtMs: { $gt: now } }, { $set: { pendingBid: intent } }, { new: true }));
    if (!reserved) return response({ result: 2, code: 'AUCTION_CONFLICT_RETRY' });
    const updated = await resumeBid(row._id, intent.key);
    if (!updated) return response({ result: 1, code: 'AUCTION_TOKEN_INSUFFICIENT' });
    if (!array(updated.bidHistory).some(b => b.key === intent.key)) return response({ result: 2, code: 'AUCTION_RECOVERY_PENDING' });
    await settleDue(serverId, info, now, userId);
    return response({ result: 0, id, price, item: publicListing(updated, userId) });
  });
}
function unavailable(tag, session, msgUid, code = 'AUCTION_SYSTEM_ONLY') {
  return { tag, msgUid, data: { result: session?.player ? 9 : -1, code,
    msg: 'Phiên này chỉ có hàng hệ thống; không hỗ trợ ký gửi hoặc thu hồi.',
    ...(tag === 5113 ? { uids: [], rewardInfo: emptyReward() } : {}) } };
}
async function claim(_params, session, msgUid) { return unavailable(5110, session, msgUid, 'AUCTION_NO_MANUAL_REWARD'); }
async function claimAll(_params, session, msgUid) { return unavailable(5113, session, msgUid, 'AUCTION_NO_MANUAL_REWARD'); }
function startScheduler(options = {}) {
  if (!isEnabled()) return { enabled: false, stop() {} };
  getCatalog();
  const serverId = integer(options.serverId) || integer(process.env.SERVER_ID) || 1001;
  if (!allowedServer(serverId)) return { enabled: false, stop() {} };
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { const now = Date.now(), info = cycleInfo(now); await settleDue(serverId, info, now); await seedCycle(serverId, info, now); }
    catch (error) { logger.warn(`[Auction] scheduler failed server=${serverId}: ${error.message}`); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 30000);
  timer.unref?.();
  void tick();
  return { enabled: true, tick, stop: () => clearInterval(timer) };
}
function ensureAuctionInfo(player) {
  if (!player || typeof player !== 'object') return { records: [], auctions: [], deals: [], nextAuctionUid: 1, nextRecordUid: 1 };
  if (!player.auctionInfo || typeof player.auctionInfo !== 'object') player.auctionInfo = {};
  for (const field of ['records', 'auctions', 'deals']) player.auctionInfo[field] = array(player.auctionInfo[field]);
  return player.auctionInfo;
}
function buildAuctionPayload(info) {
  return { records: array(info?.records), auctions: array(info?.auctions), deals: array(info?.deals),
    auctionStatus: isEnabled() ? statusSnapshot(cycleInfo()) : { ...MAINTENANCE } };
}
module.exports = { isEnabled, getCatalog, cycleInfo, eventWindow, startScheduler, ensureAuctionInfo, buildAuctionPayload, enter, bid, unavailable, claim, claimAll, settleDue };
