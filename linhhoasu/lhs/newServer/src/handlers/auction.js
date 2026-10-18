'use strict';

/**
 * Native auction RPC adapters. Economy mutations are delegated to the
 * shared, CAS-protected service; the old per-player handler is intentionally
 * not reachable from any auction tag.
 */

const service = require('../services/AuctionService');

function maintenance(tag, session, msgUid) {
  return {
    tag,
    msgUid,
    data: {
      result: session && session.player ? 9 : -1,
      code: 'AUCTION_MAINTENANCE',
      msg: 'Thiên Vận Đấu Giá đang bảo trì. Vui lòng quay lại sau.',
      auctionStatus: {
        state: 'maintenance',
        code: 'AUCTION_MAINTENANCE',
        message: 'Thiên Vận Đấu Giá đang bảo trì. Vui lòng quay lại sau.',
        version: '20261015_auction_guard_v1',
      },
      ...(tag === 5113 ? { uids: [], rewardInfo: { items: [], equips: [], bloodline: [] } } : {}),
    },
  };
}

async function handleAuctionEnter(_params, session, msgUid) {
  if (!service.isEnabled()) {
    const stored = session && session.player && session.player.auctionInfo;
    const info = { records: Array.isArray(stored?.records) ? stored.records : [],
      auctions: Array.isArray(stored?.auctions) ? stored.auctions : [],
      deals: Array.isArray(stored?.deals) ? stored.deals : [] };
    return {
      tag: 5100,
      msgUid,
      data: {
        records: info.records,
        auctions: info.auctions,
        deals: info.deals,
        auctionStatus: maintenance(5100, session, msgUid).data.auctionStatus,
        result: session && session.player ? 0 : -1,
      },
    };
  }
  return service.enter(session, msgUid);
}

async function handleAuctionOnShelf(_params, session, msgUid) {
  if (!service.isEnabled()) return maintenance(5101, session, msgUid);
  return service.unavailable(5101, session, msgUid);
}

async function handleAuctionOffer(params, session, msgUid) {
  if (!service.isEnabled()) return maintenance(5102, session, msgUid);
  return service.bid(params, session, msgUid);
}

async function handleAuctionOffShelf(_params, session, msgUid) {
  if (!service.isEnabled()) return maintenance(5103, session, msgUid);
  return service.unavailable(5103, session, msgUid);
}

async function handleAuctionRecordReward(params, session, msgUid) {
  if (!service.isEnabled()) return maintenance(5110, session, msgUid);
  return service.claim(params, session, msgUid);
}

async function handleAuctionRecycleItem(_params, session, msgUid) {
  if (!service.isEnabled()) return maintenance(5111, session, msgUid);
  return service.unavailable(5111, session, msgUid);
}

async function handleAuctionRecordRewardAll(params, session, msgUid) {
  if (!service.isEnabled()) return maintenance(5113, session, msgUid);
  return service.claimAll(params, session, msgUid);
}

module.exports = {
  ensureAuctionInfo: service.ensureAuctionInfo,
  buildAuctionPayload: service.buildAuctionPayload,
  handleAuctionEnter,
  handleAuctionOnShelf,
  handleAuctionOffer,
  handleAuctionOffShelf,
  handleAuctionRecordReward,
  handleAuctionRecycleItem,
  handleAuctionRecordRewardAll,
};
