'use strict';
const config = require('./ConfigService');
function metadata(payId) {
  if (!Number.isSafeInteger(Number(payId)) || payId < 11121 || payId > 11128) return null;
  for (const row of Object.values(config.get('OldTrekPassShowConfig') || {})) {
    const bit = row.payId === Number(payId) ? 2 : row.advancedPayId === Number(payId) ? 4 : 0;
    if (bit) return { destId: row.id, bit, rewards: bit === 2 ? row.fundReward : row.advancedReward };
  }
  return null;
}
function ordinaryRewards(meta) {
  const sailors = config.get('OldTrekSailorConfig') || {}, characters = config.get('BidKingCharacterConfig') || {};
  return meta.rewards.filter(r => !sailors[r.id] && !characters[r.id]).map(r => ({ id: r.id, count: r.count }));
}
function apply(player, payId) {
  const meta = metadata(payId);
  if (!meta) return null;
  const handler = require('../handlers/old-trek'), info = handler.ensureOldTrekInfo(player);
  let record = info.passRecords.find(r => r.id === meta.destId);
  if (!record) { record = { id: meta.destId, buyRecord: 1, claimRecord: {} }; info.passRecords.push(record); }
  if (record.buyRecord & meta.bit) return { oldTrekInfo: info };
  record.buyRecord |= meta.bit;
  for (const row of meta.rewards) {
    if (config.get('OldTrekSailorConfig')?.[row.id]) {
      if (!info.sailorList.some(s => s.id === row.id)) info.sailorList.push(handler.buildSailor(row.id));
      if (info.sailorAtlas[row.id] == null) info.sailorAtlas[row.id] = 0;
    } else if (config.get('BidKingCharacterConfig')?.[row.id]) {
      const bid = require('../handlers/bid-king').ensureBidKingInfo(player);
      if (!bid.characters.includes(row.id)) bid.characters.push(row.id);
    }
  }
  info.stateRevision = Number(info.stateRevision || 0) + 1;
  return { oldTrekInfo: info };
}
module.exports = { metadata, ordinaryRewards, apply };
