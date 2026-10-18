'use strict';

/**
 * Server-authoritative reward contract for recharge products.
 *
 * This module only resolves a purchase.  It deliberately does not mutate a
 * player, grant items, or create an order.  The caller can therefore validate
 * the complete plan before consuming a token or touching persistent state.
 */

const configService = require('./ConfigService');

const MAX_MULTI = 99;
const MONTH_CARD_IDS = new Set([11000001, 11000002, 11000007, 11000009, 11000012]);
const ACTIVITY9_IDS = new Set([10501, 10502]);
const ACTIVATION_PASS_IDS = new Set([10301]);
const CASH_ONLY_TYPE = 14;
const CHAIN_TYPE = 16;

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.floor(number);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function objectOrEmpty(value) {
  return isPlainObject(value) ? value : {};
}

function table(name) {
  try {
    return objectOrEmpty(configService.get(name));
  } catch (_error) {
    return {};
  }
}

function row(tableValue, id) {
  const safeId = toSafeInt(id, 0);
  if (safeId <= 0) return null;
  return tableValue[safeId] || tableValue[String(safeId)] || null;
}

function normalizeRewardRows(value, times = 1) {
  const multiplier = Math.max(1, toSafeInt(times, 1));
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      id: Math.max(0, toSafeInt(entry && entry.id, 0)),
      count: Math.max(0, toSafeInt(entry && entry.count, 0)) * multiplier,
    }))
    .filter((entry) => entry.id > 0 && entry.count > 0);
}

function mergeRewardRows(rows = []) {
  const merged = new Map();
  (Array.isArray(rows) ? rows : []).forEach((entry) => {
    const id = Math.max(0, toSafeInt(entry && entry.id, 0));
    const count = Math.max(0, toSafeInt(entry && entry.count, 0));
    if (id <= 0 || count <= 0) return;
    merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => left.id - right.id);
}


function getShopPayId(shopRow, fallback = 0) {
  const source = objectOrEmpty(shopRow);
  return toSafeInt(
    source.payId != null
      ? source.payId
      : (source.payid != null ? source.payid : source.rechargeId),
    fallback
  );
}

function getRechargeRecordCount(player = {}, payId = 0) {
  const id = Math.max(0, toSafeInt(payId, 0));
  const info = objectOrEmpty(player && player.rechargeInfo);
  const records = Array.isArray(info.records) ? info.records : [];
  const found = records.find((entry) => toSafeInt(entry && entry.id, 0) === id);
  return found ? Math.max(0, toSafeInt(found.count, 0)) : 0;
}

function parseMulti(value) {
  if (value == null || value === '') return 1;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_MULTI) return 0;
  return number;
}

function resolvePackage(rawPayId) {
  const number = Number(rawPayId);
  if (!Number.isInteger(number) || number <= 0) {
    return { ok: false, reason: 'INVALID_PAY_ID', payId: 0 };
  }

  const payId = number;
  const payRow = row(table('PayConfig'), payId);
  if (!payRow) return { ok: false, reason: 'RECHARGE_CONFIG_MISSING', payId };

  const shopTable = table('ShopConfig');
  const linked = Object.values(shopTable).filter((entry) => getShopPayId(entry, 0) === payId);
  const exact = linked.filter((entry) => toSafeInt(entry && entry.id, 0) === payId);
  let shopRow = null;
  if (exact.length === 1) shopRow = exact[0];
  else if (exact.length > 1) return { ok: false, reason: 'AMBIGUOUS_SHOP_CONFIG', payId };
  else if (linked.length === 1) shopRow = linked[0];
  else if (linked.length > 1) return { ok: false, reason: 'AMBIGUOUS_SHOP_CONFIG', payId };
  if (!shopRow) return { ok: false, reason: 'SHOP_CONFIG_MISSING', payId, payRow };

  const shopId = toSafeInt(shopRow.id, 0);
  const type = toSafeInt(shopRow.type, 0);
  const privilege = !!row(table('PrivilegeConfig'), shopId);
  const isMonthCard = MONTH_CARD_IDS.has(shopId) || privilege;
  const isActivity9 = ACTIVITY9_IDS.has(payId);
  const isActivationPass = ACTIVATION_PASS_IDS.has(payId);

  return {
    ok: true,
    reason: '',
    payId,
    shopId,
    type,
    payRow,
    shopRow,
    linkedShopIds: linked.map((entry) => toSafeInt(entry && entry.id, 0)).filter((id) => id > 0),
    isMonthCard,
    isActivity9,
    isActivationPass,
  };
}

function getPeriodDescriptor(shopRow, now = Date.now()) {
  const type = toSafeInt(shopRow && shopRow.limitType, 0);
  if (type === 1) {
    return { type: 'day', key: String(Math.floor((now + (7 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000))) };
  }
  if (type === 2) {
    const day = new Date(now + (7 * 60 * 60 * 1000));
    const utc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const mondayOffset = (day.getUTCDay() + 6) % 7;
    return { type: 'week', key: String(Math.floor((utc - (mondayOffset * 24 * 60 * 60 * 1000)) / (7 * 24 * 60 * 60 * 1000))) };
  }
  return null;
}

function getPeriodCount(player, payId, descriptor) {
  if (!descriptor) return 0;
  const info = objectOrEmpty(player && player.rechargeInfo);
  const periods = objectOrEmpty(info.periodRecords);
  const bucket = objectOrEmpty(periods[descriptor.type]);
  return Math.max(0, toSafeInt(bucket[`${payId}:${descriptor.key}`], 0));
}

function applyPeriodPurchaseLedger(player, plan, now = Date.now()) {
  if (plan?.ok && plan.fishingShop) {
    require('./FishingEventShopService').commit(player, plan.fishingShop, plan.multi);
    return;
  }
  if (!plan || !plan.ok || !plan.period || plan.limit <= 0) return;
  const info = player.rechargeInfo && isPlainObject(player.rechargeInfo)
    ? player.rechargeInfo
    : (player.rechargeInfo = {});
  info.periodRecords = objectOrEmpty(info.periodRecords);
  const bucket = objectOrEmpty(info.periodRecords[plan.period.type]);
  const key = `${plan.payId}:${plan.period.key || getPeriodDescriptor(plan.shopRow, now).key}`;
  bucket[key] = Math.max(0, toSafeInt(bucket[key], 0)) + plan.multi;
  info.periodRecords[plan.period.type] = bucket;
}

function resolveRechargeRewards(player = {}, options = {}) {
  const route = options.route === 'cash' ? 'cash' : 'token';
  const multi = parseMulti(options.multi);
  if (multi <= 0) return { ok: false, reason: 'INVALID_MULTI', rows: [], doubleRows: [] };

  const product = resolvePackage(options.payId != null ? options.payId : options.productId);
  if (!product.ok) return { ...product, rows: [], doubleRows: [] };
  const topArenaPass = require('./TopArenaPassService').check(player, product.payId, options.now || Date.now(), multi);
  if (topArenaPass) {
    if (!topArenaPass.ok) return {...product,ok:false,reason:topArenaPass.reason,rows:[],doubleRows:[]};
    if (route === 'cash' && Number(options.amount) !== Number(product.payRow.priceR)) return {...product,ok:false,reason:'AMOUNT_MISMATCH',rows:[],doubleRows:[]};
    return {...product,ok:true,rows:[],doubleRows:[],extraRows:[],multi:1,topArenaPass,previousCount:0,limit:1,limitType:4,period:null};
  }
  const oldTrekPass = require('./OldTrekPassService').metadata(product.payId);
  if (oldTrekPass) {
    if (multi !== 1) return { ...product, ok: false, reason: 'INVALID_MULTI', rows: [], doubleRows: [] };
    const existing = player.other_attr_info?.oldTrekInfo?.passRecords?.find(r => r.id === oldTrekPass.destId);
    if (Number(existing?.buyRecord || 0) & oldTrekPass.bit) return { ...product, ok: false, reason: 'ALREADY_ACTIVE', rows: [], doubleRows: [] };
    if (route === 'cash' && (!Number.isFinite(Number(options.amount)) || Number(options.amount) !== Number(product.payRow.priceR))) return { ...product, ok: false, reason: 'AMOUNT_MISMATCH', rows: [], doubleRows: [] };
    const rows = require('./OldTrekPassService').ordinaryRewards(oldTrekPass);
    require('./RewardGrantService').assertRewardRowsSupported(rows);
    return { ...product, ok: true, rows, doubleRows: [], extraRows: [], multi: 1, oldTrekPass, previousCount: getRechargeRecordCount(player, product.payId), limit: 1, limitType: 4, period: null };
  }

  if (route === 'token' && product.type === CASH_ONLY_TYPE) {
    return { ...product, ok: false, reason: 'CASH_ONLY_PACKAGE', rows: [], doubleRows: [] };
  }
  if (product.type === CHAIN_TYPE) {
    return { ...product, ok: false, reason: 'CHAIN_PACKAGE_REQUIRES_CHAIN_RESOLVER', rows: [], doubleRows: [] };
  }
  if (product.isActivationPass) {
    if (multi !== 1) {
      return { ...product, ok: false, reason: 'INVALID_MULTI', rows: [], doubleRows: [], multi };
    }
    if (route === 'cash') {
      const catalogAmount = Number(product.payRow && product.payRow.priceR);
      const requestedAmount = Number(options.amount);
      if (!Number.isFinite(catalogAmount) || catalogAmount <= 0) {
        return { ...product, ok: false, reason: 'CATALOG_AMOUNT_MISSING', rows: [], doubleRows: [], multi };
      }
      if (!Number.isFinite(requestedAmount) || Math.abs(requestedAmount - catalogAmount) > 0.001) {
        return { ...product, ok: false, reason: 'AMOUNT_MISMATCH', rows: [], doubleRows: [], multi, catalogAmount };
      }
    }
    return {
      ...product,
      ok: options.allowActivationPass === true,
      reason: options.allowActivationPass === true ? '' : 'ACTIVATION_PASS_REQUIRES_ACTIVITY_RESOLVER',
      specialized: 'activation-pass',
      rows: [],
      doubleRows: [],
      multi,
    };
  }
  if (product.isActivity9) {
    return {
      ...product,
      ok: options.allowActivity9 === true,
      reason: options.allowActivity9 === true ? '' : 'ACTIVITY9_REQUIRES_ACTIVITY_RESOLVER',
      specialized: 'activity9',
      rows: [],
      doubleRows: [],
      multi,
    };
  }
  if (route === 'cash') {
    const catalogAmount = Number(product.payRow && product.payRow.priceR);
    const requestedAmount = Number(options.amount);
    if (!Number.isFinite(catalogAmount) || catalogAmount <= 0) {
      return { ...product, ok: false, reason: 'CATALOG_AMOUNT_MISSING', rows: [], doubleRows: [], multi };
    }
    if (!Number.isFinite(requestedAmount) || Math.abs(requestedAmount - catalogAmount) > 0.001) {
      return { ...product, ok: false, reason: 'AMOUNT_MISMATCH', rows: [], doubleRows: [], multi, catalogAmount };
    }
  }
  if (product.payId === 11000018) {
    return { ...product, ok: false, reason: 'ACTIVITY999_REQUIRES_ACTIVITY_RESOLVER', rows: [], doubleRows: [], multi };
  }
  if (product.payId === 11000008 || product.payId === 11026000) {
    return { ...product, ok: false, reason: 'SPECIALIZED_RECHARGE_REQUIRED', rows: [], doubleRows: [], multi };
  }

  const shopRow = objectOrEmpty(product.shopRow);
  // Promotional diamond amounts are carried by the deployed server/client
  // ShopConfig binary. Resolve the catalog exactly once; do not multiply here
  // or a patched binary would pay 1000x twice.
  const baseRows = normalizeRewardRows(shopRow.rewards);
  const firstRows = normalizeRewardRows(shopRow.firstRewards);
  const subsequentRows = normalizeRewardRows(shopRow.subsequentRewards);
  const extraRows = normalizeRewardRows(shopRow.extraRewards);
  try {
    require('./RewardGrantService').assertRewardRowsSupported([...baseRows, ...firstRows, ...subsequentRows, ...extraRows]);
  } catch (error) {
    return { ...product, ok: false, reason: error.code || 'REWARD_UNAVAILABLE', rows: [], doubleRows: [] };
  }
  const previousCount = Math.max(
    0,
    toSafeInt(options.previousCount, getRechargeRecordCount(player, product.payId))
  );

  // A token purchase must have an explicit purchase reward.  Empty rows are
  // activity/chain contracts and must never fall back to a synthetic reward.
  if (route === 'token' && baseRows.length <= 0) {
    return {
      ...product,
      ok: false,
      reason: 'SPECIALIZED_RECHARGE_REQUIRED',
      rows: [],
      doubleRows: [],
      extraRows,
      previousCount,
      multi,
    };
  }
  if (route === 'cash' && baseRows.length <= 0 && firstRows.length <= 0 && subsequentRows.length <= 0) {
    return {
      ...product,
      ok: false,
      reason: 'SPECIALIZED_RECHARGE_REQUIRED',
      rows: [],
      doubleRows: [],
      extraRows,
      previousCount,
      multi,
    };
  }

  const now = Math.max(0, toSafeInt(options.now, Date.now()));
  const fishingShop = require('./FishingEventShopService').policy(player, product.shopId, now);
  if (fishingShop?.error) return { ...product, ok: false, reason: fishingShop.error, rows: [], doubleRows: [], multi };
  const limit = fishingShop ? fishingShop.limit : Math.max(0, toSafeInt(shopRow.limit, 0));
  const limitType = fishingShop ? fishingShop.limitType : Math.max(0, toSafeInt(shopRow.limitType, 0));
  let period = null;
  // Type 4 and type 6 are package-local lifetime limits in the client
  // catalog (the client renders a remaining-count label and uses the same
  // buy-record counter).  Periodic day/week limits are handled below.
  if (fishingShop) {
    if (fishingShop.count + multi > limit) {
      return { ...product, ok: false, reason: 'LIMIT_REACHED', rows: [], doubleRows: [], previousCount, multi, limit, limitType };
    }
  } else if (limit > 0 && (limitType === 4 || limitType === 6)) {
    if (previousCount + multi > limit) {
      return { ...product, ok: false, reason: 'LIMIT_REACHED', rows: [], doubleRows: [], previousCount, multi, limit, limitType };
    }
  } else if (limit > 0 && (limitType === 1 || limitType === 2)) {
    period = getPeriodDescriptor(shopRow, now);
    const periodCount = getPeriodCount(player, product.payId, period);
    // Existing players created before the period ledger was introduced do
    // not have enough information to reconstruct a day/week purchase safely.
    // Fail closed when they already have a historical count; fresh players
    // can initialize the ledger on their first purchase.
    const hasLedger = periodCount > 0 || !!(objectOrEmpty(objectOrEmpty(player.rechargeInfo).periodRecords)[period.type]);
    if (!hasLedger && previousCount > 0) {
      return { ...product, ok: false, reason: 'LIMIT_LEDGER_REQUIRED', rows: [], doubleRows: [], previousCount, multi, limit, limitType, period };
    }
    if (periodCount + multi > limit) {
      return { ...product, ok: false, reason: 'LIMIT_REACHED', rows: [], doubleRows: [], previousCount, multi, limit, limitType, period };
    }
  } else if (limit > 0 && limitType !== 0) {
    return { ...product, ok: false, reason: 'LIMIT_TYPE_UNSUPPORTED', rows: [], doubleRows: [], previousCount, multi, limit, limitType };
  }

  const normal = [];
  const doubleRows = [];
  const modes = [];
  for (let index = 0; index < multi; index += 1) {
    const purchaseIndex = previousCount + index;
    let unitRows = baseRows;
    let mode = 'base';
    if (purchaseIndex === 0 && firstRows.length > 0) {
      unitRows = [...baseRows, ...firstRows];
      mode = 'first';
    } else if (purchaseIndex > 0 && subsequentRows.length > 0) {
      unitRows = [...baseRows, ...subsequentRows];
      mode = 'subsequent';
    }
    normal.push(...unitRows);
    modes.push(mode);
    // isDouble is a first-purchase copy of base rewards only.  It is not a
    // multiplier for firstRewards/subsequentRewards.
    if (index === 0 && purchaseIndex === 0 && toSafeInt(shopRow.isDouble, 0) > 0) {
      doubleRows.push(...baseRows);
    }
  }

  return {
    ...product,
    ok: true,
    reason: '',
    route,
    previousCount,
    multi,
    limit,
    limitType,
    period,
    ...(fishingShop ? { fishingShop } : {}),
    modes,
    rows: mergeRewardRows(normal),
    doubleRows: mergeRewardRows(doubleRows),
    extraRows,
    isDouble: doubleRows.length > 0,
  };
}

module.exports = {
  ACTIVATION_PASS_IDS,
  ACTIVITY9_IDS,
  CHAIN_TYPE,
  CASH_ONLY_TYPE,
  MAX_MULTI,
  applyPeriodPurchaseLedger,
  getPeriodDescriptor,
  getRechargeRecordCount,
  mergeRewardRows,
  normalizeRewardRows,
  parseMulti,
  resolvePackage,
  resolveRechargeRewards,
  toSafeInt,
};
