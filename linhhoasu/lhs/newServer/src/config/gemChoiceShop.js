'use strict';
const policy = require('./gemChoiceShop.json');

function rows(offer) {
  return {
    asset: { id: offer.bagId, type: 1, subType: 0, quality: offer.quality, name: offer.bagId,
      desc: 10000000 + offer.bagId, icon: offer.icon, itemWay: [], ifShow: 1, ifShowNum: 1, useType: 101 },
    use: { id: offer.bagId, type: 101, rewards: offer.gems.map(id => ({ id, count: 1 })), attrs: [], conditions: [] },
    shop: { id: offer.shopId, icon: '', tab: 10, tag: 0, payId: 0,
      cost: [{ id: 1, count: offer.price }], costAgain: [], rewards: [{ id: offer.bagId, count: 1 }],
      extraRewards: [], firstRewards: [], subsequentRewards: [], isDouble: 0, limit: 0, limitType: 0,
      showConds: [], type: 0, conditions: [], preId: -1, nextId: -1, intervalTri: [], duration: 0,
      showMultiple: 0, priority: 7 + offer.level - 6 }
  };
}

function apply(tables) {
  if (!tables || !tables.ShopConfig || !tables.AssetsConfig || !tables.AssetsUseConfig || !tables.GemLevelConfig) throw Error('GEM_CHOICE_TABLE_MISSING');
  const planned = policy.offers.map(offer => {
    if (!Number.isSafeInteger(offer.price) || offer.price <= 0 || offer.gems.some(id =>
      tables.GemLevelConfig[id]?.level !== offer.level || tables.AssetsConfig[id]?.type !== 18)) throw Error('GEM_CHOICE_GEM_CONFIG_INVALID');
    const built = rows(offer), asset = tables.AssetsConfig[offer.bagId], use = tables.AssetsUseConfig[offer.bagId], shop = tables.ShopConfig[offer.shopId];
    if (asset && (asset.type !== 1 || asset.useType !== 101 || asset.id !== offer.bagId)) throw Error('GEM_CHOICE_ASSET_CONFLICT');
    if (use && JSON.stringify(use) !== JSON.stringify(built.use)) throw Error('GEM_CHOICE_USE_CONFLICT');
    if (shop && JSON.stringify(shop) !== JSON.stringify(built.shop)) throw Error('GEM_CHOICE_SHOP_CONFLICT');
    return { offer, built };
  });
  for (const { offer, built } of planned) {
    if (!tables.AssetsConfig[offer.bagId]) tables.AssetsConfig[offer.bagId] = built.asset;
    if (!tables.AssetsUseConfig[offer.bagId]) tables.AssetsUseConfig[offer.bagId] = built.use;
    tables.ShopConfig[offer.shopId] = built.shop;
  }
}

module.exports = { apply, policy, rows };
