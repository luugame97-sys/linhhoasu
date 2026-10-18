'use strict';

// Fixed suit boxes are visible inventory until explicitly opened. Never
// infer rewards for random/selectable boxes or grant missing parts for free.
const config = require('./ConfigService');
const BOX_ID = 29040;
const COMPONENTS = [29041, 29042, 29043, 29049];
const CHOICE_BOX_IDS = new Set([99001, 99002]);
function isBox(id) {
  const a = config.get('AssetsConfig')?.[id], use = config.get('AssetsUseConfig')?.[id];
  return a?.type === 100 && a.useType === 105 && use?.type === 105 && !!config.get('FashionDressConfig')?.[id];
}
function isCandidateBox(id) {
  const a = config.get('AssetsConfig')?.[id], use = config.get('AssetsUseConfig')?.[id];
  if (CHOICE_BOX_IDS.has(Number(id))) return a?.type === 1 && a.useType === 101 && use?.type === 101;
  return a?.type === 100 && (a.useType === 105 || use?.type === 105);
}
function isUnsupportedBox(id) { return isCandidateBox(id) && !isBox(id); }
function rewardsFor(id, count) {
  if (!isBox(id) || !Number.isSafeInteger(count) || count < 1 || count > 10000) throw Error('FASHION_BOX_COUNT_INVALID');
  const use = config.get('AssetsUseConfig')[id], dress = config.get('FashionDressConfig')[id];
  const table = ['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][dress.isSuit];
  const variants = config.get(table)?.[id];
  const components = (dress.isSuit === 4 ? variants : variants?.[0])?.fashionIds;
  const openingEffect = dress.isSuit === 4 ? config.get('FashionEndDressConfig')?.[id]?.beginEffectId : 0;
  const allowed = openingEffect ? [...components, openingEffect] : components;
  if (!Array.isArray(components) || !components.length || new Set(components).size !== components.length
    || !Array.isArray(use.rewards) || use.rewards.length !== allowed.length
    || !allowed.every(part => use.rewards.filter(r => r.id === part && r.count === 1).length === 1
      && config.get('FashionConfig')?.[part]?.dressId === Number(id)
      && ([301,302,303,305,309].includes(config.get('FashionConfig')?.[part]?.type)
        || (openingEffect === part && config.get('FashionConfig')?.[part]?.type === 306)))) throw Error('FASHION_BOX_CONFIG_INVALID');
  // All current fixed boxes have no conditions or per-item use limits.
  if (use.conditions?.length || use.limit > 0) throw Error('FASHION_BOX_CONDITION_UNSUPPORTED');
  return allowed.map(part => ({ id: part, count }));
}

function openChoice(params, session, msgUid) {
  const id = Number(params.itemId || params.id || params.index), count = params.count ?? 1;
  const use = config.get('AssetsUseConfig')?.[id];
  const selects = params && params.selects;
  const keys = selects && typeof selects === 'object' && !Array.isArray(selects) ? Object.keys(selects) : [];
  if (!Number.isSafeInteger(id) || !CHOICE_BOX_IDS.has(id) || !Number.isSafeInteger(count)
    || count < 1 || count > 10000 || keys.length < 1) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_INVALID' } };
  }
  const selectedRows = [];
  let selectedTotal = 0;
  for (const key of keys) {
    const index = Number(key);
    const selectedCount = selects[key];
    const selected = Number.isSafeInteger(index) && Array.isArray(use?.rewards) ? use.rewards[index] : null;
    if (!/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(selectedCount)
      || selectedCount < 1 || !selected || (!isBox(Number(selected.id))
        && Number(config.get('AssetsConfig')?.[selected.id]?.type) !== 33)) {
      return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_INVALID' } };
    }
    selectedTotal += selectedCount;
    selectedRows.push({ rewardId: Number(selected.id), count: selectedCount });
  }
  if (selectedTotal !== count) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_INVALID' } };
  }
  let rewards = [];
  try {
    selectedRows.forEach((row) => {
      const asset = config.get('AssetsConfig')?.[row.rewardId];
      if (Number(asset?.type) === 33) {
        const selected = use.rewards.find((r) => Number(r.id) === row.rewardId);
        rewards.push({ id: row.rewardId, count: row.count * Number(selected?.count || 0) });
      } else rewards = rewards.concat(rewardsFor(row.rewardId, row.count));
    });
  } catch (_error) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_CONFIG_INVALID' } };
  }
  return require('./FashionTransactionService').run(1300, params, session, msgUid, async (_p, shadow) => {
    const player = shadow.player;
    if (Number(player.items?.[id] || 0) < count) return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_BOX_NOT_ENOUGH' } };
    player.items[id] -= count;
    const granted = require('../handlers/item').addRewardRowsToPlayer(player, rewards, 1);
    return [
      { tag: 1202, msgUid: 0, data: { result: 0, items: [{ id, count: -count }, ...granted.itemDeltas], changed: [{ id, count: player.items[id] }, ...granted.changed] } },
      ...require('./RewardGrantService').buildAppearanceSyncPackets(player, granted.rewardInfo),
      { tag: 1300, msgUid, data: { result: 0, id, count, selectedIds: selectedRows.map((row) => row.rewardId), rewardInfo: granted.rewardInfo } },
    ];
  });
}

function open(params, session, msgUid) {
  const id = Number(params.itemId || params.id || params.index), count = params.count ?? 1;
  if (CHOICE_BOX_IDS.has(id)) return openChoice(params, session, msgUid);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(count) || count < 1 || count > 10000) {
    return { tag:1300,msgUid,data:{result:-1,code:'FASHION_BOX_COUNT_INVALID'} };
  }
  try { rewardsFor(id, count); } catch (error) {
    return { tag:1300,msgUid,data:{result:-1,code:error.message==='FASHION_BOX_CONDITION_UNSUPPORTED'?error.message:'FASHION_BOX_CONFIG_INVALID'} };
  }
  return require('./FashionTransactionService').run(1300, params, session, msgUid, async (_p, shadow) => {
    const id = Number(params.itemId || params.id || params.index), count = params.count ?? 1;
    const player = shadow.player;
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000 || !Number.isSafeInteger(id)
      || Number(player.items?.[id] || 0) < count) return { tag:1300,msgUid,data:{result:-1,code:'FASHION_BOX_NOT_ENOUGH'} };
    const rewards = rewardsFor(id, count);
    // Opening is consumption, NOT a purchase or a second automatic grant.
    player.items[id] -= count;
    const granted = require('../handlers/item').addRewardRowsToPlayer(player, rewards, 1);
    return [
      { tag:1202,msgUid:0,data:{result:0,items:[{id,count:-count},...granted.itemDeltas],changed:[{id,count:player.items[id]},...granted.changed]} },
      ...require('./RewardGrantService').buildAppearanceSyncPackets(player, granted.rewardInfo),
      { tag:1300,msgUid,data:{result:0,id,count,rewardInfo:granted.rewardInfo} },
    ];
  });
}
module.exports = { BOX_ID, COMPONENTS, CHOICE_BOX_IDS, isBox, isCandidateBox, isUnsupportedBox, rewardsFor, open };
