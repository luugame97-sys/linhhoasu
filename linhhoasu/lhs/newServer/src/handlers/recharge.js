/**
 * 充值处理器
 * 处理充值成功回调，发放元宝、更新VIP、记录交易、通知分销系统
 */

const Transaction = require('../db/models/Transaction');
const Player = require('../db/models/Player');
const Mail = require('../db/models/Mail');
const config = require('../services/ConfigService');
const distClient = require('../services/DistClient');
const { buildItemSyncPayload } = require('../services/PlayerGrantService');
const {
  addRewardRowsToPlayer,
  buildGemInfoSyncPacket,
  buildGemUpdatePackets,
} = require('./item');
const {
  applyRechargeBenefits,
  buildMonthCardUpdatePackets,
  toSafeInt,
} = require('../services/RechargeBenefitService');
const rechargeConfigService = require('../services/RechargeConfigService');
const {
  applyPeriodPurchaseLedger,
  resolveRechargeRewards,
} = require('../services/RechargeRewardResolver');
const {
  getActivity9PriceR,
  isActivity9PayId,
} = require('../services/Activity9Service');
const {
  ensureActivationPassState,
  hasActivationPassEntitlement,
  isActivationPassPayId,
} = require('../services/ActivationPassService');
const { toClientMail } = require('./mail');
const logger = require('../logger');
const rewardGrant = require('../services/RewardGrantService');
const crypto = require('node:crypto');
const playerService = require('../services/PlayerService');
const playerMutation = require('../services/PlayerMutationService');

const RECHARGE_PLAYER_FIELDS = Object.freeze([
  'currencies', 'items', 'rechargeInfo', 'shopInfo', 'fashionInfo',
  'equipInfo', 'swordInfo', 'petInfo', 'other_attr_info', 'artifactInfo',
  'activityInfo', 'roleInfo', 'valhallaInfo', 'bloodlineInfo',
  'formationInfo', 'spiritInfo', 'exp', 'level',
]);

function syncCommittedPlayer(wsServer, userId, player) {
  if (wsServer && typeof wsServer.syncSessionPlayer === 'function') {
    const livePlayer = typeof wsServer.getPlayerForMutation === 'function'
      ? wsServer.getPlayerForMutation(userId) : null;
    if (livePlayer) {
      require('../services/SessionPlayerSyncService').syncSessionPlayerFields(livePlayer,
        player.toObject ? player.toObject() : player, { fields: RECHARGE_PLAYER_FIELDS });
      return;
    }
    wsServer.syncSessionPlayer(userId, player.toObject ? player.toObject() : player,
      { fields: RECHARGE_PLAYER_FIELDS });
  }
}

function fulfillmentKey(orderId) {
  return crypto.createHash('sha256').update(String(orderId)).digest('hex');
}

async function finalizeFulfillmentMail(userId, orderId, payload) {
  if (!payload || !payload.attachments?.length) return null;
  const eventKey = `recharge:${fulfillmentKey(orderId)}`;
  return Mail.findOneAndUpdate({ userId, eventKey }, { $setOnInsert: { userId, eventKey, ...payload } }, { upsert: true, new: true });
}

const rechargeLocks = new Map();

async function withRechargeLock(key, work) {
  const previous = rechargeLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const current = previous.catch(() => {}).then(() => gate);
  rechargeLocks.set(key, current);
  await previous.catch(() => {});
  try {
    return await work();
  } finally {
    release();
    if (rechargeLocks.get(key) === current) rechargeLocks.delete(key);
  }
}

function withRechargeLocks(keys, work) {
  const ordered = Array.from(new Set(keys.filter(Boolean))).sort();
  function runAt(index) {
    if (index >= ordered.length) return work();
    return withRechargeLock(ordered[index], () => runAt(index + 1));
  }
  return runAt(0);
}

function buildRewardInfo(items = []) {
  return {
    items,
    equips: [],
    swords: [],
    pets: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    elves: [],
    sailor: [],
    petSouls: [],
    extraReward: {},
  };
}

function clonePlain(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; }
}

function mergeRewardInfo(primary = {}, bonus = null) {
  const categories = [
    'items', 'equips', 'swords', 'pets', 'artifacts', 'gems', 'valhalla',
    'bloodline', 'fashion', 'formations', 'spirits', 'elves', 'sailor', 'petSouls',
  ];
  const info = { ...primary };
  categories.forEach((key) => { info[key] = Array.isArray(primary[key]) ? primary[key].slice() : []; });
  info.extraReward = primary.extraReward && typeof primary.extraReward === 'object'
    ? { ...primary.extraReward } : {};
  if (bonus) {
    info.extraReward[1] = {
      items: Array.isArray(bonus.items) ? bonus.items.slice() : [],
      equips: Array.isArray(bonus.equips) ? bonus.equips.slice() : [],
      swords: Array.isArray(bonus.swords) ? bonus.swords.slice() : [],
      pets: Array.isArray(bonus.pets) ? bonus.pets.slice() : [],
      artifacts: Array.isArray(bonus.artifacts) ? bonus.artifacts.slice() : [],
      gems: Array.isArray(bonus.gems) ? bonus.gems.slice() : [],
      valhalla: Array.isArray(bonus.valhalla) ? bonus.valhalla.slice() : [],
      bloodline: Array.isArray(bonus.bloodline) ? bonus.bloodline.slice() : [],
      fashion: Array.isArray(bonus.fashion) ? bonus.fashion.slice() : [],
      formations: Array.isArray(bonus.formations) ? bonus.formations.slice() : [],
      spirits: Array.isArray(bonus.spirits) ? bonus.spirits.slice() : [],
      petSouls: Array.isArray(bonus.petSouls) ? bonus.petSouls.slice() : [],
    };
  }
  return info;
}

function normalizeRewardSnapshot(rewardInfo = {}) {
  const snapshot = {};
  [
    'items', 'equips', 'swords', 'pets', 'artifacts', 'gems', 'valhalla',
    'bloodline', 'fashion', 'formations', 'spirits', 'elves', 'sailor', 'petSouls',
  ].forEach((key) => {
    snapshot[key] = clonePlain(Array.isArray(rewardInfo[key]) ? rewardInfo[key] : []);
  });
  snapshot.extraReward = clonePlain(rewardInfo.extraReward || {});
  return snapshot;
}

function getCatalogPayId(productId) {
  const text = String(productId || '').trim();
  if (!/^\d+$/.test(text)) return 0;
  const id = Number(text);
  if (!Number.isSafeInteger(id) || id <= 0) return 0;
  const payConfig = config.get('PayConfig') || {};
  return payConfig[id] || payConfig[String(id)] ? id : 0;
}

function buildNativeRewardNotifications(player, rewardInfo) {
  const packets = [];
  const root = rewardInfo || {};
  const sources = [root];
  Object.values(root.extraReward && typeof root.extraReward === 'object' ? root.extraReward : {})
    .forEach((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) sources.push(row);
    });
  const info = {};
  ['gems', 'fashion', 'formations', 'spirits', 'pets', 'swords', 'valhalla', 'bloodline', 'artifacts', 'petSouls']
    .forEach((key) => { info[key] = sources.flatMap((source) => (Array.isArray(source[key]) ? source[key] : [])); });
  if (Array.isArray(info.gems) && info.gems.length > 0) {
    const gemSync = buildGemInfoSyncPacket(player);
    if (gemSync) packets.push(gemSync);
    packets.push(...buildGemUpdatePackets(info.gems));
  }
  packets.push(...rewardGrant.buildAppearanceSyncPackets(player, root));
  if (Array.isArray(info.pets) && info.pets.length > 0) {
    packets.push({ tag: 3300, data: { result: 0, data: info.pets } });
  }
  if (Array.isArray(info.swords) && info.swords.length > 0) {
    packets.push({ tag: 3201, data: { result: 0, data: info.swords } });
    const mount = require('./mount');
    const mountInfo = mount && typeof mount.ensureMountInfo === 'function' ? mount.ensureMountInfo(player) : player.swordInfo;
    const payload = mount && typeof mount.buildMountInfoUpdatePayload === 'function' ? mount.buildMountInfoUpdatePayload(mountInfo) : mountInfo;
    packets.push({ tag: 3200, data: { result: 0, uid: payload && payload.equippedUid, info: payload } });
  }
  if (Array.isArray(info.valhalla) && info.valhalla.length > 0) {
    const valhalla = require('./valhalla');
    if (valhalla && typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
      packets.push({ tag: 4100, data: { result: 0, ...valhalla.buildValhallaPayload(valhalla.ensureValhallaInfo(player)) } });
    }
  }
  if (Array.isArray(info.bloodline) && info.bloodline.length > 0) {
    const bloodline = require('./bloodline');
    if (bloodline && typeof bloodline.ensureBloodlineInfo === 'function' && typeof bloodline.buildBloodlinePayload === 'function') {
      packets.push({ tag: 4701, data: { result: 0, ...bloodline.buildBloodlinePayload(bloodline.ensureBloodlineInfo(player)) } });
    }
  }
  if (Array.isArray(info.artifacts) && info.artifacts.length > 0) {
    packets.push(...info.artifacts.map((artifact) => ({ tag: 3500, data: { result: 0, artifact } })));
  }
  if (Array.isArray(info.petSouls) && info.petSouls.length > 0) {
    packets.push(...info.petSouls.map((soul) => ({ tag: 6901, data: { result: 0, data: soul } })));
  }
  return packets;
}

function mergeRewardItems(items = []) {
  const merged = new Map();
  (Array.isArray(items) ? items : []).forEach((row) => {
    const id = Math.max(1, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id <= 0 || count <= 0) return;
    merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => a.id - b.id);
}

function normalizeText(value, maxLength = 0) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function buildRechargeMailPayload(product = {}, attachmentRewards = []) {
  const productName = normalizeText(product.name, 64) || normalizeText(product.productId, 64) || '充值商品';
  return {
    title: normalizeText(product.mailTitle, 120) || `${productName}到账`,
    content: normalizeText(product.mailContent, 1000) || `你购买的${productName}已到账，请领取附件奖励。`,
    attachments: mergeRewardItems(attachmentRewards),
  };
}

/**
 * 根据充值金额计算元宝数量（1元=10元宝，首充双倍）
 */
async function calcDiamond(amount, isFirstRecharge, productId = '') {
  const resolvedProductId = rechargeConfigService.normalizeProductId(productId);
  if (resolvedProductId) {
    const customRow = await rechargeConfigService.getResolvedRow(resolvedProductId);
    if (customRow && customRow.enabled !== false && customRow.amount > 0) {
      return customRow.diamond + (isFirstRecharge && customRow.firstBonus ? customRow.firstBonus : 0);
    }
  }

  const rechargeCfg = config.get('RechargeConfig');
  if (rechargeCfg) {
    // 尝试从配置表匹配
    for (const key of Object.keys(rechargeCfg)) {
      const cfg = rechargeCfg[key];
      if (cfg.price === amount) {
        return cfg.diamond + (isFirstRecharge && cfg.firstBonus ? cfg.firstBonus : 0);
      }
    }
  }
  // 默认：1元=10元宝
  const base = Math.floor(amount * 10);
  return isFirstRecharge ? base * 2 : base;
}

/**
 * 根据累计充值更新 VIP 等级
 */
function calcVipLevel(totalRecharge) {
  const vipCfg = config.get('VipConfig');
  if (vipCfg) {
    let maxLevel = 0;
    for (const key of Object.keys(vipCfg)) {
      const cfg = vipCfg[key];
      if (totalRecharge >= (cfg.rechargeNeed || 0) && Number(key) > maxLevel) {
        maxLevel = Number(key);
      }
    }
    return maxLevel;
  }
  // 默认 VIP 等级：每100元升1级
  return Math.min(15, Math.floor(totalRecharge / 100));
}

/**
 * 处理充值回调（HTTP internal API）
 * POST /api/internal/recharge
 * @param {Object} params - { userId, orderId, amount, productId, channel }
 * @param {Object} [wsServer] - WSServer 实例（用于推送）
 * @returns {Promise<Object>} 处理结果
 */
async function handleRechargeUnlocked(params, wsServer) {
  const { orderId, amount, channel } = params;
  const safeAmount = Number(amount);

  if (!orderId || !Number.isFinite(safeAmount) || safeAmount <= 0) {
    return { success: false, error: 'MISSING_PARAMS' };
  }

  const allowPendingOrder = params.allowPendingOrder === true;
  const idempotentSuccess = params.idempotentSuccess === true;
  let pendingTransaction = null;
  const existing = await Transaction.findOne({ orderId });
  if (existing) {
    if (Number(existing.amount) !== safeAmount) return { success: false, error: 'AMOUNT_MISMATCH' };
    if ((params.userId && String(existing.userId) !== String(params.userId))
      || (params.productId && String(existing.productId) !== String(params.productId))) return { success: false, error: 'ORDER_RECEIPT_MISMATCH' };
    if (existing.status === 'success' && idempotentSuccess) {
      logger.warn(`[Recharge] 重复成功订单回调: ${orderId}`);
      const rechargeMeta = existing.extra && existing.extra.recharge && typeof existing.extra.recharge === 'object'
        ? existing.extra.recharge : {};
      return {
        success: true,
        duplicate: true,
        data: {
          orderId: existing.orderId,
          amount: existing.amount,
          diamond: existing.diamond || 0,
          playerId: existing.playerId,
          payId: toSafeInt(existing.productId, 0),
          rewardInfo: rechargeMeta.rewardSnapshot || normalizeRewardSnapshot(),
          resolverVersion: rechargeMeta.resolverVersion || '',
        },
      };
    }
    if (existing.status === 'pending' && allowPendingOrder) {
      pendingTransaction = existing;
    } else {
      logger.warn(`[Recharge] 重复订单: ${orderId}`);
      return { success: false, error: 'DUPLICATE_ORDER' };
    }
  }

  const userId = params.userId || (pendingTransaction && pendingTransaction.userId);
  const productId = params.productId || (pendingTransaction && pendingTransaction.productId) || '';
  if (!userId) return { success: false, error: 'MISSING_PARAMS' };
  const payId = toSafeInt(productId, 0);
  if (isActivity9PayId(payId)
    && Math.abs(safeAmount - getActivity9PriceR(payId, safeAmount)) > 0.001) {
    return { success: false, error: 'AMOUNT_MISMATCH' };
  }
  const resolvedProductId = rechargeConfigService.normalizeProductId(productId);
  const resolvedProduct = resolvedProductId
    ? await rechargeConfigService.getResolvedRow(resolvedProductId)
    : null;
  const attachmentRewards = resolvedProduct && resolvedProduct.enabled !== false && resolvedProduct.amount > 0
    ? rechargeConfigService.normalizeRewardItems(resolvedProduct.attachments)
    : [];

  // 查找玩家
  const player = await Player.findOne({ userId });
  if (!player) {
    logger.warn(`[Recharge] 玩家不存在: ${userId}`);
    return { success: false, error: 'PLAYER_NOT_FOUND' };
  }
  // Gameplay and login use the same role lock. After queued saves are drained,
  // the live object is authoritative for unflushed progress, not the DB copy.
  const live = wsServer && typeof wsServer.getPlayerForMutation === 'function'
    ? wsServer.getPlayerForMutation(userId) : null;
  if (live) {
    const key = fulfillmentKey(orderId);
    if (player.rechargeInfo?.fulfillmentOrders?.[key] && !live.rechargeInfo?.fulfillmentOrders?.[key]) {
      wsServer.invalidatePlayerForMutation(userId);
      throw new Error('RECHARGE_STATE_RELOAD_REQUIRED');
    }
    const { _id, __v, createdAt, updatedAt, ...state } = clonePlain(live);
    Object.assign(player, state);
  }

  const receiptKey = fulfillmentKey(orderId);
  const receipt = player.rechargeInfo?.fulfillmentOrders?.[receiptKey];
  if (receipt) {
    if (String(receipt.transactionData.productId) !== String(productId) || receipt.transactionData.amount !== safeAmount) {
      return { success: false, error: 'ORDER_RECEIPT_MISMATCH' };
    }
    const recoveredMail = await finalizeFulfillmentMail(userId, orderId, receipt.mailPayload);
    const data = clonePlain(receipt.transactionData);
    if (recoveredMail) data.extra.rechargeMail = { mailId: String(recoveredMail._id), attachments: receipt.mailPayload.attachments };
    if (pendingTransaction) { Object.assign(pendingTransaction, data); await pendingTransaction.save(); }
    else await Transaction.create(data);
    if (!live) syncCommittedPlayer(wsServer, userId, player);
    if (wsServer && typeof wsServer.pushToUser === 'function') {
      wsServer.pushToUser(userId, 1202, buildItemSyncPayload(player, []));
      buildNativeRewardNotifications(player, data.extra.recharge.rewardSnapshot)
        .forEach(packet => wsServer.pushToUser(userId, packet.tag, packet.data));
      for (const update of [data.extra.recharge.activity9Update, data.extra.recharge.activationPassUpdate]) {
        if (update?.row) wsServer.pushToUser(userId, 1701, { data: update.row });
      }
      if (recoveredMail) wsServer.pushToUser(userId, 1102, { result: 0, mailData: toClientMail(recoveredMail) });
    }
    return { success: true, duplicate: true, recovered: true, data: { orderId, amount: safeAmount,
      diamond: data.diamond, playerId: player.playerId, payId: toSafeInt(productId, 0),
      rewardInfo: data.extra.recharge.rewardSnapshot, resolverVersion: data.extra.recharge.resolverVersion } };
  }

  const catalogPayId = getCatalogPayId(productId);
  const numericProductId = /^\d+$/.test(String(productId || '')) ? Number(productId) : 0;
  const customOnlyProduct = resolvedProduct && String(resolvedProduct.source || '') === 'custom';
  if (numericProductId > 0 && catalogPayId <= 0 && !customOnlyProduct) {
    return { success: false, error: 'RECHARGE_CONFIG_MISSING' };
  }
  const catalogPlan = catalogPayId > 0
    ? resolveRechargeRewards(player, {
      route: 'cash',
      payId: catalogPayId,
      multi: 1,
      amount: safeAmount,
      now: Date.now(),
      allowActivity9: true,
      allowActivationPass: true,
    })
    : null;
  if (catalogPlan && !catalogPlan.ok) {
    return { success: false, error: catalogPlan.reason };
  }
  const activationPassProduct = isActivationPassPayId(catalogPayId);
  if (activationPassProduct) {
    const activationPassState = ensureActivationPassState(player, {
      payId: catalogPayId,
      now: Date.now(),
    });
    if (!activationPassState || !activationPassState.row) {
      return { success: false, error: 'ACTIVATION_PASS_UNAVAILABLE' };
    }
    if (hasActivationPassEntitlement(player, catalogPayId, Date.now())) {
      return { success: false, error: 'ALREADY_ACTIVE' };
    }
  }

  // 计算元宝
  player.rechargeInfo = player.rechargeInfo || { vipLevel: 0, totalRecharge: 0, totalrecharge: 0 };
  const previousTotalRecharge = Math.max(
    0,
    toSafeInt(player.rechargeInfo.totalRecharge, 0),
    toSafeInt(player.rechargeInfo.totalrecharge, 0)
  );
  const isFirst = previousTotalRecharge === 0;
  player.currencies = player.currencies || { gold: 0, diamond: 0, silver: 0 };
  let rewardInfo;
  let diamond;
  let resolverVersion;
  if (catalogPlan) {
    const normalGrant = addRewardRowsToPlayer(player, catalogPlan.rows, 1);
    const bonusGrant = catalogPlan.doubleRows && catalogPlan.doubleRows.length > 0
      ? addRewardRowsToPlayer(player, catalogPlan.doubleRows, 1) : null;
    rewardInfo = mergeRewardInfo(normalGrant.rewardInfo, bonusGrant && bonusGrant.rewardInfo);
    rewardInfo.petSouls = [
      ...(normalGrant.rewardPetSouls || []),
      ...((bonusGrant && bonusGrant.rewardPetSouls) || []),
    ];
    diamond = [
      ...(normalGrant.itemDeltas || []),
      ...((bonusGrant && bonusGrant.itemDeltas) || []),
    ].filter((row) => Number(row && row.id) === 1)
      .reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0);
    applyPeriodPurchaseLedger(player, catalogPlan, Date.now());
    resolverVersion = activationPassProduct ? 'activation-pass-v1' : 'catalog-v1';
  } else {
    diamond = await calcDiamond(safeAmount, isFirst, productId);
    player.currencies.diamond = (player.currencies.diamond || 0) + diamond;
    rewardInfo = buildRewardInfo(mergeRewardItems([
      ...(diamond > 0 ? [{ id: 1, count: diamond }] : []),
    ]));
    resolverVersion = 'legacy-manual-v1';
  }

  const totalRecharge = previousTotalRecharge + safeAmount;
  player.rechargeInfo.totalRecharge = totalRecharge;
  player.rechargeInfo.totalrecharge = totalRecharge;
  if (isFirst) player.rechargeInfo.firstRecharge = safeAmount;

  const benefits = applyRechargeBenefits(player, { productId, payId: productId, now: Date.now() });
  const monthCardPackets = buildMonthCardUpdatePackets(benefits.monthCardUpdates);

  const newVipLevel = calcVipLevel(player.rechargeInfo.totalRecharge);
  player.rechargeInfo.vipLevel = newVipLevel;

  // This receipt is persisted in the SAME player write as reward + entitlement.
  // A retry after mail/transaction failure finalizes from it without regranting.
  const fulfillmentMailPayload = attachmentRewards.length > 0
    ? { ...buildRechargeMailPayload(resolvedProduct || { productId }, attachmentRewards), sender: '系统' } : null;
  const durableTransactionData = {
    orderId, userId, playerId: player.playerId, amount: safeAmount, diamond,
    productId: productId || '', channel: channel || '', status: 'success', agentId: player.agentId || null,
    extra: { ...(pendingTransaction?.extra || {}), ...(params.extra || {}), recharge: {
      resolverVersion, rewardSnapshot: normalizeRewardSnapshot(rewardInfo),
      activity9Update: benefits.activity9Update || null, activationPassUpdate: benefits.activationPassUpdate || null,
      appliedAt: new Date().toISOString(),
    } },
  };
  player.rechargeInfo.fulfillmentOrders = player.rechargeInfo.fulfillmentOrders || {};
  player.rechargeInfo.fulfillmentOrders[receiptKey] = { transactionData: durableTransactionData, mailPayload: fulfillmentMailPayload };

  RECHARGE_PLAYER_FIELDS.forEach((key) => player.markModified(key));
  try {
    await player.save();
  } catch (error) {
    // A timeout can mean committed-but-unacknowledged. Never allow a stale
    // live session or its close handler to overwrite the persisted receipt.
    if (wsServer && typeof wsServer.invalidatePlayerForMutation === 'function') {
      wsServer.invalidatePlayerForMutation(userId);
    }
    throw error;
  }
  syncCommittedPlayer(wsServer, userId, player);

  let rechargeMail = null;
  if (attachmentRewards.length > 0) {
    rechargeMail = await finalizeFulfillmentMail(userId, orderId, fulfillmentMailPayload);
  }

  // 创建交易记录
  const transactionData = {
    orderId,
    userId,
    playerId: player.playerId,
    amount: safeAmount,
    diamond,
    productId: productId || '',
    channel: channel || '',
    status: 'success',
    agentId: player.agentId || null,
    extra: {
      ...(pendingTransaction && pendingTransaction.extra && typeof pendingTransaction.extra === 'object'
        ? pendingTransaction.extra
        : {}),
      ...(params.extra && typeof params.extra === 'object' ? params.extra : {}),
      recharge: {
        resolverVersion,
        rewardSnapshot: normalizeRewardSnapshot(rewardInfo),
        activity9Update: benefits.activity9Update || null,
        activationPassUpdate: benefits.activationPassUpdate || null,
        appliedAt: new Date().toISOString(),
      },
      rechargeMail: rechargeMail ? {
        mailId: String(rechargeMail._id || ''),
        attachments: mergeRewardItems(attachmentRewards),
      } : undefined,
    },
  };

  let transaction;
  if (pendingTransaction) {
    Object.assign(pendingTransaction, transactionData);
    transaction = pendingTransaction;
    await transaction.save();
  } else {
    transaction = await Transaction.create(transactionData);
  }

  logger.info(
    `[Recharge] 充值成功: userId=${userId} orderId=${orderId} amount=${safeAmount} diamond=${diamond} vip=${newVipLevel}`
  );

  // 推送充值结果给在线玩家
  if (wsServer) {
    wsServer.pushToUser(userId, 1202, buildItemSyncPayload(player, []));
    if (benefits.oldTrekPassUpdate) wsServer.pushToUser(userId, 7000, benefits.oldTrekPassUpdate.oldTrekInfo);
    if (catalogPlan?.fishingShop) {
      require('../services/FishingEventShopService').activityPackets(player)
        .forEach(packet => wsServer.pushToUser(userId, packet.tag, packet.data));
    }
    wsServer.pushToUser(userId, 1210, {
      result: 0,
      payid: benefits.payId || toSafeInt(productId, 0),
      totalrecharge: player.rechargeInfo.totalrecharge,
      totalRecharge: player.rechargeInfo.totalRecharge,
      rewardInfo,
    });
    monthCardPackets.forEach((packet) => wsServer.pushToUser(userId, packet.tag, packet.data));
    if (benefits.activity9Update && benefits.activity9Update.row) {
      wsServer.pushToUser(userId, 1701, { data: benefits.activity9Update.row });
    }
    if (benefits.activationPassUpdate && benefits.activationPassUpdate.row) {
      wsServer.pushToUser(userId, 1701, { data: benefits.activationPassUpdate.row });
    }
    buildNativeRewardNotifications(player, rewardInfo).forEach((packet) => {
      wsServer.pushToUser(userId, packet.tag, packet.data);
    });
    if (rechargeMail) {
      wsServer.pushToUser(userId, 1102, {
        result: 0,
        mailData: toClientMail(rechargeMail),
      });
    }
  }

  // 通知分销系统（异步，不阻塞充值流程）
  if (player.inviteCode) {
    const distResult = await distClient.rechargeCallback({
      playerId: player.playerId,
      orderId,
      amount: safeAmount,
      inviteCode: player.inviteCode,
    });
    if (distResult && distResult.pendingCompensation) {
      transaction.extra = {
        ...(transaction.extra && typeof transaction.extra === 'object' ? transaction.extra : {}),
        distCallback: {
          status: 'pending',
          error: distResult.error || '',
          updatedAt: new Date().toISOString(),
        },
      };
      await transaction.save();
    }
  }

  return {
    success: true,
    data: {
      orderId: transaction.orderId,
      amount: transaction.amount,
      diamond,
      playerId: player.playerId,
      vipLevel: newVipLevel,
      payId: benefits.payId || toSafeInt(productId, 0),
      monthCardUpdates: benefits.monthCardUpdates,
      attachments: attachmentRewards,
      rewardInfo,
      resolverVersion,
    },
  };
}

async function handleRecharge(params = {}, wsServer) {
  const orderId = String(params.orderId || '').trim();
  const userId = String(params.userId || '').trim();
  return withRechargeLocks([
    orderId ? `order:${orderId}` : '',
    userId ? `user:${userId}` : '',
  ], async () => {
    const existing = !userId && orderId ? await Transaction.findOne({ orderId }) : null;
    const roleId = userId || String(existing?.userId || '');
    return playerMutation.run(roleId, async () => {
      await playerService.drainPendingSaves(roleId);
      return handleRechargeUnlocked(params, wsServer);
    });
  });
}

module.exports = { handleRecharge, calcDiamond, calcVipLevel };
