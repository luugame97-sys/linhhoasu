/**
 * Commerce compatibility handlers.
 * tag: 1211, 1220, 1240, 1241
 */

const playerService = require('../services/PlayerService');
const configService = require('../services/ConfigService');
const { addRewardToPlayer } = require('./raid');

const DAY_MS = 24 * 60 * 60 * 1000;
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
const KNOWN_MONTH_CARD_IDS = new Set([11000001, 11000002, 11000007, 11000009, 11000012]);

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function ensureObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isConfiguredChainPackageId(value) {
  const id = Math.max(0, toSafeInt(value, 0));
  if (id <= 0) return false;
  const condConfig = ensureObject(configService.get('ShopGiftCondConfig'));
  const giftConfig = ensureObject(configService.get('ShopGiftConfig'));
  return !!(condConfig[id] || condConfig[String(id)])
    && !!(giftConfig[id] || giftConfig[String(id)]);
}

function buildRewardInfo(items = []) {
  return {
    items,
    equips: [],
    pets: [],
    bloodline: [],
  };
}

function normalizeRewardRows(rows = []) {
  return ensureArray(rows)
    .map((row) => ({
      id: Math.max(0, toSafeInt(row && row.id, 0)),
      count: Math.max(0, toSafeInt(row && row.count, 0)),
    }))
    .filter((row) => row.id > 0 && row.count > 0);
}

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function getCfgRow(table, id) {
  const source = ensureObject(table);
  const safeId = Math.max(0, toSafeInt(id, 0));
  return safeId > 0 ? (source[safeId] || source[String(safeId)] || null) : null;
}

function getGmt8DayKey(timestamp) {
  const safe = Math.max(0, Number(timestamp) || 0);
  return Math.floor((safe + GMT7_OFFSET_MS) / DAY_MS);
}

function getMonthCardDailyRewardRows(id) {
  if (!KNOWN_MONTH_CARD_IDS.has(id)) return [];
  const shopRow = getCfgRow(configService.get('ShopConfig'), id);
  return normalizeRewardRows(shopRow && shopRow.extraRewards);
}

function buildMonthCardItemSync(player, rows, replay = false) {
  const currency = { 1: 'diamond', 2: 'silver', 6: 'gold' };
  return { tag: 1202, msgUid: 0, data: { result: 0,
    items: replay ? [] : rows.map(row => ({ ...row })),
    changed: [...new Set(rows.map(row => row.id))].map(id => ({ id,
      count: Math.max(0, toSafeInt(currency[id] ? player.currencies?.[currency[id]] : player.items?.[id], 0)),
    })) } };
}

function buildCommerceFailure(tag, msgUid, data = {}) {
  return {
    tag,
    msgUid,
    data: {
      result: 1,
      rewardInfo: buildRewardInfo([]),
      ...data,
    },
  };
}

function grantRows(player, rows) {
  const normalized = normalizeRewardRows(rows);
  normalized.forEach((row) => addRewardToPlayer(player, row.id, row.count));
  return normalized;
}

function ensureRechargeInfo(player) {
  player.rechargeInfo = ensureObject(player.rechargeInfo);
  const info = player.rechargeInfo;
  info.monthCardRecords = ensureObject(info.monthCardRecords);
  return info;
}

function ensureShopInfo(player) {
  player.shopInfo = ensureObject(player.shopInfo);
  const info = player.shopInfo;
  info.triggerRecords = ensureArray(info.triggerRecords);
  info.chainPack = ensureArray(info.chainPack).filter((row) => (
    isConfiguredChainPackageId(row && row.id)
  ));
  info.chainCompleted = ensureObject(info.chainCompleted);
  return info;
}

const SHOP_GIFT_TYPE_FREE = 3;
const SHOP_GIFT_TYPE_AD = 2;
const SHOP_GIFT_TYPE_RECHARGE = 1;

function getChainSteps(packageId) {
  const root = ensureObject(configService.get('ShopGiftConfig'));
  const rows = ensureObject(root[packageId] || root[String(packageId)]);
  return Object.values(rows)
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      ...row,
      index: Math.max(0, toSafeInt(row.index, 0)),
      type: Math.max(0, toSafeInt(row.type, 0)),
      shopId: Math.max(0, toSafeInt(row.shopId, 0)),
      rewards: normalizeRewardRows(row.rewards),
    }))
    .filter((row) => row.index > 0 && row.rewards.length > 0)
    .sort((left, right) => left.index - right.index);
}

function getChainStep(packageId, index) {
  const safeIndex = Math.max(1, toSafeInt(index, 1));
  return getChainSteps(packageId).find((row) => row.index === safeIndex) || null;
}

function getFirstChainStep(packageId) {
  return getChainSteps(packageId)[0] || null;
}

function getNextChainStep(packageId, index) {
  const safeIndex = Math.max(0, toSafeInt(index, 0));
  return getChainSteps(packageId).find((row) => row.index > safeIndex) || null;
}

function applyShopDraft(target, draft) {
  if (!target || !draft) return;
  // Keep existing references used by the socket/session and tests while
  // copying only package/economy state changed by this handler.
  target.shopInfo = draft.shopInfo;
  target.items = draft.items;
  target.currencies = draft.currencies;
  target.rechargeInfo = draft.rechargeInfo;
}

function ensureAdInfo(player) {
  player.other_attr_info = ensureObject(player.other_attr_info);
  player.other_attr_info.adInfo = ensureObject(player.other_attr_info.adInfo);
  player.rechargeInfo = ensureObject(player.rechargeInfo);
  const info = player.other_attr_info.adInfo;
  const rechargeInfo = player.rechargeInfo;

  const mergedRecords = {
    ...ensureObject(rechargeInfo.adRecords),
    ...ensureObject(info.records),
  };
  const mergedTimeRecords = {
    ...ensureObject(rechargeInfo.adTimeRecords),
    ...ensureObject(info.timeRecords),
  };

  info.records = mergedRecords;
  info.timeRecords = mergedTimeRecords;
  rechargeInfo.adRecords = mergedRecords;
  rechargeInfo.adTimeRecords = mergedTimeRecords;
  return info;
}

async function persistPlayer(session, player) {
  if (!session || !session.userId || !player) return;
  const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
  if (saved) session.player = saved;
}

async function handleMonthcardsReward(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player || !session.userId) {
    return {
      tag: 1211,
      msgUid,
      data: { result: -1, id: Math.max(0, toSafeInt(params.id, 0)), rewardInfo: buildRewardInfo([]) },
    };
  }

  const id = Number(params && params.id);
  const now = Date.now();
  const currentInfo = ensureObject(player.rechargeInfo);
  const currentCards = ensureObject(currentInfo.monthCards);
  const currentRecords = ensureObject(currentInfo.monthCardRecords);
  const key = String(id);
  const activeUntil = Math.max(0, Number(currentCards[key]) || 0);
  const lastClaimAt = Math.max(0, Number(currentRecords[key]) || 0);
  const configuredRows = getMonthCardDailyRewardRows(id);
  if (!Number.isSafeInteger(id) || !KNOWN_MONTH_CARD_IDS.has(id)) {
    return buildCommerceFailure(1211, msgUid, { id: Number.isSafeInteger(id) ? id : 0, reason: 'MONTH_CARD_INVALID' });
  }
  if (activeUntil <= now) return buildCommerceFailure(1211, msgUid, { id, reason: 'MONTH_CARD_EXPIRED' });
  const rawRows = getCfgRow(configService.get('ShopConfig'), id)?.extraRewards;
  if (!Array.isArray(rawRows) || !configuredRows.length || rawRows.length !== configuredRows.length
      || rawRows.some(row => !Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.count) || row.count <= 0
        || !(configService.get('AssetsConfig') || {})[row.id])) {
    return buildCommerceFailure(1211, msgUid, { id, reason: 'MONTH_CARD_REWARD_CONFIG_INVALID' });
  }
  if (lastClaimAt > 0 && getGmt8DayKey(lastClaimAt) >= getGmt8DayKey(now)) {
    // Resynchronize balances after a lost ACK/UI packet, never grant again.
    session._itemListCache = null;
    return [buildMonthCardItemSync(player, configuredRows, true),
      buildCommerceFailure(1211, msgUid, { id, reason: 'MONTH_CARD_ALREADY_CLAIMED', received: true, claimTime: lastClaimAt })];
  }
  // Reward and claim marker are one persisted snapshot. Never mutate the live
  // preimage or write a guessed rollback after an ambiguous database timeout.
  const next = clonePlain(player);
  const info = ensureRechargeInfo(next);
  const rows = grantRows(next, configuredRows);
  info.monthCardRecords[key] = now;
  const itemSync = buildMonthCardItemSync(next, rows);
  session.player = next;
  try {
    const saved = await playerService.savePlayer(session.userId, next, { returnSaved: false });
    if (!saved) throw new Error('MONTH_CARD_SAVE_NOT_CONFIRMED');
  } catch (error) {
    session.player = null;
    throw error;
  }
  session._itemListCache = null;
  return [itemSync, {
    tag: 1211,
    msgUid,
    data: {
      result: 0,
      id,
      received: true,
      claimTime: now,
      rewardInfo: buildRewardInfo(rows),
    },
  }];
}

async function handleAdReward(params = {}, session = {}, msgUid) {
  if ([1, 2, 5].includes(Number(params.adId))) {
    return require('../services/PlayerMutationService').run(session.userId, async () => {
      if (!session.player || Number(params.adId) === 5) return { tag: 1220, msgUid, data: { result: 1, code: 'USE_FARM_BUILD_AD' } };
      const receipts = require('../services/FeatureReceiptService');
      const prior = receipts.read(session.player, 1220, params);
      if (prior) return { tag: 1220, msgUid, data: prior };
      await playerService.drainPendingSaves(session.userId);
      const draft = clonePlain(session.player);
      const plan = require('../services/FarmAdService').claim(draft, Number(params.adId));
      if (!plan.ok) return { tag: 1220, msgUid, data: { result: 1, code: plan.code, adId: Number(params.adId), rewardInfo: buildRewardInfo([]) } };
      const rows = grantRows(draft, plan.rewards);
      const data = { result: 0, adId: Number(params.adId), time: Date.now(), rewardInfo: buildRewardInfo(rows) };
      receipts.record(draft, 1220, params, data);
      try {
        const saved = await playerService.savePlayer(session.userId, draft, { returnSaved: false });
        if (!saved) throw new Error('FARM_AD_SAVE_NOT_CONFIRMED');
      } catch (e) { require('../services/RuntimeBus').getWsServer()?.invalidatePlayerForMutation(session.userId); session.player = null; throw e; }
      Object.assign(session.player, draft); session._itemListCache = null;
      return [{ tag: 1202, msgUid: 0, data: { items: rows, changed: rows.map(row => ({ id: row.id, count: draft.items[row.id] || 0 })) } }, { tag: 1220, msgUid, data }];
    });
  }
  const player = session.player;
  if (!player) {
    return {
      tag: 1220,
      msgUid,
      data: {
        result: -1,
        adId: Math.max(0, toSafeInt(params.adId, 0)),
        itemId: Math.max(0, toSafeInt(params.adId, 0)),
        time: 0,
        rewardInfo: buildRewardInfo([]),
      },
    };
  }

  const adId = Math.max(0, toSafeInt(params.adId, 0));
  const now = Date.now();
  const adInfo = ensureAdInfo(player);
  const key = String(adId);
  adInfo.records[key] = Math.max(0, toSafeInt(adInfo.records[key], 0)) + 1;
  adInfo.timeRecords[key] = now;

  const rows = grantRows(player, [{ id: 3, count: 20 + adId }]);
  await persistPlayer(session, player);

  return {
    tag: 1220,
    msgUid,
    data: {
      result: 0,
      adId,
      itemId: adId,
      time: now,
      rewardInfo: buildRewardInfo(rows),
    },
  };
}

async function handleTriggerPackage(params = {}, session = {}, msgUid) {
  return require('../services/PlayerMutationService').run(session.userId, async () => {
    const player = session.player;
    if (!player) return { tag: 1240, msgUid, data: { result: -1 } };
    const sourcePlayer = session._chainPackageSource || player;
    session._chainPackageSource = sourcePlayer;

    const working = clonePlain(player);
    const info = ensureShopInfo(working);
    const trigger = Math.max(0, toSafeInt(params.trigger, 0));
    const param = Math.max(0, toSafeInt(params.param, 0));
    const packageId = param > 0 ? param : trigger;
    const first = getFirstChainStep(packageId);
    const response = {
      tag: 1240,
      msgUid,
      data: { result: first ? 0 : 1, trigger, param, id: packageId },
    };
    if (!first) return response;

    const now = Date.now();
    const completedAt = Math.max(0, toSafeInt(info.chainCompleted[String(packageId)], 0));
    if (completedAt > 0) {
      return { ...response, data: { ...response.data, result: 1, code: 'CHAIN_PACKAGE_COMPLETED' } };
    }
    let chainPack = info.chainPack.find((row) => toSafeInt(row && row.id, 0) === packageId) || null;
    if (chainPack && Math.max(0, toSafeInt(chainPack.expireTime, 0)) > now) {
      // Repair the old index=0 shape in-place without resetting an active
      // chain or granting anything.
      if (toSafeInt(chainPack.index, 0) <= 0) {
        const draft = clonePlain(player);
        const draftInfo = ensureShopInfo(draft);
        const draftRow = draftInfo.chainPack.find((row) => toSafeInt(row && row.id, 0) === packageId);
        draftRow.index = first.index;
        const saved = await playerService.savePlayer(session.userId, draft, { returnSaved: false });
        if (!saved) throw new Error('CHAIN_PACKAGE_INDEX_SAVE_NOT_CONFIRMED');
        applyShopDraft(player, draft);
        applyShopDraft(sourcePlayer, draft);
        session.player = saved && typeof saved === 'object' ? saved : draft;
        chainPack = draftRow;
      }
      return [{ tag: 1231, msgUid: 0, data: chainPack }, response];
    }

    const draft = clonePlain(player);
    const draftInfo = ensureShopInfo(draft);
    const oldIndex = draftInfo.chainPack.findIndex((row) => toSafeInt(row && row.id, 0) === packageId);
    chainPack = {
      id: packageId,
      index: first.index,
      expireTime: now + Math.max(1, toSafeInt((configService.get('ShopGiftCondConfig') || {})[packageId]?.duration, 1440)) * 60 * 1000,
      trigger,
    };
    if (oldIndex >= 0) draftInfo.chainPack[oldIndex] = chainPack;
    else draftInfo.chainPack.push(chainPack);
    draftInfo.triggerRecords.push({ trigger, param, time: now });
    const saved = await playerService.savePlayer(session.userId, draft, { returnSaved: false });
    if (!saved) throw new Error('CHAIN_PACKAGE_TRIGGER_SAVE_NOT_CONFIRMED');
    applyShopDraft(player, draft);
    applyShopDraft(sourcePlayer, draft);
    session.player = saved && typeof saved === 'object' ? saved : draft;
    return [{ tag: 1231, msgUid: 0, data: chainPack }, response];
  });
}

async function handleChainPackageReward(params = {}, session = {}, msgUid) {
  return require('../services/PlayerMutationService').run(session.userId, async () => {
    const player = session.player;
    const sourcePlayer = session._chainPackageSource || player;
    session._chainPackageSource = sourcePlayer;
    const id = Math.max(0, toSafeInt(params.id, 0));
    const requestedIndex = Math.max(1, toSafeInt(params.index, 1));
    const fail = (code) => ({ tag: 1241, msgUid, data: { result: 1, id, index: requestedIndex, code, rewardInfo: buildRewardInfo([]) } });
    if (!player || !isConfiguredChainPackageId(id)) return fail('CHAIN_PACKAGE_INVALID');
    const working = clonePlain(player);
    const info = ensureShopInfo(working);
    const step = getChainStep(id, requestedIndex);
    if (!step) return fail('CHAIN_PACKAGE_STEP_INVALID');
    if (step.type === SHOP_GIFT_TYPE_RECHARGE) return fail('CHAIN_PACKAGE_RECHARGE_REQUIRED');
    if (step.type !== SHOP_GIFT_TYPE_FREE) {
      return fail(step.type === SHOP_GIFT_TYPE_AD
        ? 'CHAIN_PACKAGE_AD_REQUIRED'
        : 'CHAIN_PACKAGE_TYPE_UNSUPPORTED');
    }
    const row = info.chainPack.find((candidate) => toSafeInt(candidate && candidate.id, 0) === id);
    if (!row) return fail('CHAIN_PACKAGE_NOT_ACTIVE');
    const now = Date.now();
    if (Math.max(0, toSafeInt(row.expireTime, 0)) <= now) return fail('CHAIN_PACKAGE_EXPIRED');
    const currentIndex = Math.max(1, toSafeInt(row.index, 1));
    if (currentIndex !== requestedIndex) return fail('CHAIN_PACKAGE_STEP_OUT_OF_ORDER');

    const draft = working;
    const draftInfo = ensureShopInfo(draft);
    const draftRowIndex = draftInfo.chainPack.findIndex((candidate) => toSafeInt(candidate && candidate.id, 0) === id);
    if (draftRowIndex < 0) return fail('CHAIN_PACKAGE_NOT_ACTIVE');
    const rows = grantRows(draft, step.rewards);
    const next = getNextChainStep(id, currentIndex);
    if (next) draftInfo.chainPack[draftRowIndex].index = next.index;
    else {
      draftInfo.chainPack.splice(draftRowIndex, 1);
      draftInfo.chainCompleted[String(id)] = now;
    }
    const saved = await playerService.savePlayer(session.userId, draft, { returnSaved: false });
    if (!saved) throw new Error('CHAIN_PACKAGE_REWARD_SAVE_NOT_CONFIRMED');
    applyShopDraft(player, draft);
    applyShopDraft(sourcePlayer, draft);
    session.player = saved && typeof saved === 'object' ? saved : draft;
    const data = { result: 0, id, index: currentIndex, rewardInfo: buildRewardInfo(rows) };
    return next
      ? [{ tag: 1231, msgUid: 0, data: draftInfo.chainPack[draftRowIndex] }, { tag: 1241, msgUid, data }]
      : { tag: 1241, msgUid, data };
  });
}

module.exports = {
  isConfiguredChainPackageId,
  handleMonthcardsReward,
  handleAdReward,
  handleTriggerPackage,
  handleChainPackageReward,
};
