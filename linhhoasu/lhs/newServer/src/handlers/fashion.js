/**
 * Fashion handlers
 * tags: 1800, 1801, 1802, 1803, 1804, 1805, 1806, 1810
 */

const playerService = require('../services/PlayerService');
const config = require('../services/ConfigService');
const transactions = require('../services/FashionTransactionService');
const {
  ensureRoleAppearance,
  grantFashionOwnership,
  hasFashionOwnership,
  purgeExpiredFashionOwnership,
} = require('../services/RoleAppearanceService');

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function toSignedInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function ensureObject(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function ensureArray(raw) {
  return Array.isArray(raw) ? raw : [];
}

function ensureFashionInfo(player = {}) {
  player.fashionInfo = ensureObject(player.fashionInfo);
  const info = player.fashionInfo;

  info.curFashion = ensureObject(info.curFashion);
  info.fashions = ensureObject(info.fashions);
  info.suits = ensureObject(info.suits);
  info.suitColors = ensureObject(info.suitColors);
  info.starUp = ensureObject(info.starUp);
  info.sets = ensureArray(info.sets);
  info.setId = Math.max(0, toSafeInt(info.setId, toSafeInt(info.curSetId, 0)));
  info.setNames = ensureObject(info.setNames);
  const emojiGroupConfig = config.get('EmojiGroupConfig') || {};
  const legacyEmojiGroups = [
    ...ensureArray(info.emojiGroups),
    ...(Array.isArray(info.emoji) ? info.emoji : []),
  ];
  info.emojiGroups = legacyEmojiGroups
    .map((value) => Math.max(0, toSafeInt(value, 0)))
    .filter((value, index, rows) => value > 0 && rows.indexOf(value) === index
      && (emojiGroupConfig[value] || emojiGroupConfig[String(value)]));
  info.emojis = ensureArray(info.emojis);
  const legacyEmojiArray = Array.isArray(info.emoji);
  if (!info.emoji || typeof info.emoji !== 'object' || legacyEmojiArray) info.emoji = {};
  if (legacyEmojiArray && info.emojiGroups.length > 0) {
    const emojiConfig = config.get('EmojiConfig') || {};
    info.emoji['2'] = Object.values(emojiConfig)
      .filter((row) => info.emojiGroups.includes(Math.max(0, toSafeInt(row && row.group, 0))))
      .map((row) => Math.max(0, toSafeInt(row && row.id, 0)))
      .filter((id) => id > 0);
  }
  Object.keys(info.emoji).forEach((key) => {
    info.emoji[key] = ensureArray(info.emoji[key])
      .map((value) => Math.max(0, toSafeInt(value, 0)))
      .filter((value, index, rows) => value > 0 && rows.indexOf(value) === index);
  });
  info.equipped = ensureObject(info.equipped);
  if (!Array.isArray(info.dress)) {
    info.dress = Object.values(ensureObject(info.dress))
      .filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  }
  info.dress = info.dress
    .map((row) => ({ id: Math.max(0, toSafeInt(row && row.id, 0)), star: Math.max(0, toSafeInt(row && row.star, 0)) }))
    .filter((row) => row.id > 0);
  info.fashion = ensureObject(info.fashion);
  info.fashionMap = ensureObject(info.fashionMap);
  info.fashionData = ensureArray(info.fashionData);
  info.activateFashion = ensureArray(info.activateFashion);
  info.updatedAt = Date.now();

  return info;
}

function ensureSetRecord(info, setId) {
  const safeSetId = Math.max(0, toSafeInt(setId, info.setId));
  let row = info.sets.find((item) => toSafeInt(item && item.id, -1) === safeSetId);
  if (!row) {
    row = { id: safeSetId, name: info.setNames[String(safeSetId)] || null };
    info.sets.push(row);
    info.sets.sort((a, b) => toSafeInt(a && a.id, 0) - toSafeInt(b && b.id, 0));
  }
  return row;
}

function validSet(id) {
  return Number.isSafeInteger(id) && id >= 0 && id < Number(config.get('FashionBaseConfig')?.planCount || 3);
}
function planTypes() { return config.get('FashionBaseConfig')?.planPart || [301, 302, 303, 309]; }
function rememberSet(info) {
  if (!validSet(info.setId)) return;
  ensureSetRecord(info, info.setId).selection = Object.fromEntries(planTypes().map(type => [type, info.fashion[type] ?? 0]));
}
function activateSet(player, info, setId) {
  rememberSet(info);
  const target = ensureSetRecord(info, setId);
  let selection = target.selection;
  // Preserve legacy suit-only presets without inventing missing ownership.
  if (!selection && info.suits[setId]) {
    const old = info.suits[setId];
    const parts = getSuitFashionIds(player, old.id, old.color);
    if (parts.length && parts.every(id => hasFashionOwnership(player, id))) {
      selection = Object.fromEntries(parts.map(id => [getConfigRow('FashionConfig', id).type, id]));
    }
  }
  if (setId !== info.setId) for (const type of planTypes()) {
    const id = selection?.[type] ?? 0;
    const row = id > 0 ? getConfigRow('FashionConfig', id) : null;
    syncFashionSelection(player, info, type, id > 0 && (!row || row.type !== type || !hasFashionOwnership(player, id)) ? 0 : id);
  }
  info.setId = setId;
  rememberSet(info);
}

function getConfigRow(tableName, id) {
  const table = config.get(tableName) || {};
  return table[id] || table[String(id)] || null;
}

function getSuitVariant(dressId, color) {
  const dress = getConfigRow('FashionDressConfig', dressId);
  if (!dress) return null;
  const isSuit = Math.max(0, toSafeInt(dress.isSuit, 0));
  let value = null;
  if (isSuit === 0) value = getConfigRow('FashionColorConfig', dressId);
  if (isSuit === 1) value = getConfigRow('FashionDressLevelConfig', dressId);
  if (isSuit === 2) value = getConfigRow('FashionChangeColorConfig', dressId);
  if (isSuit === 3) value = getConfigRow('FashionBathConfig', dressId);
  if (isSuit === 4) value = { 0: getConfigRow('FashionEndDressConfig', dressId) };
  value = ensureObject(value);
  const baseColor = isSuit === 2 && color >= 100 ? color - 100 : color;
  const variant = value[baseColor] || value[String(baseColor)] || null;
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return null;
  return { dress, isSuit, variant: isSuit === 2 && color >= 100
    ? { ...variant, fashionIds: variant.spFashionIds || [] } : variant, baseColor };
}

function getInitialRoleSuitVariant(player, color) {
  const kungfuId = Math.max(0, toSafeInt(player && player.roleInfo && player.roleInfo.kungfuId, 0));
  const subJob = Math.max(0, toSafeInt(player && player.roleInfo && player.roleInfo.subJob, 0));
  const requestedColor = Math.max(0, toSafeInt(color, 0));
  const table = config.get('FashionColorPlayerConfig') || {};
  const byKungfu = ensureObject(table[kungfuId] || table[String(kungfuId)]);
  const byJob = ensureObject(byKungfu[subJob] || byKungfu[String(subJob)]);
  const variant = byJob[requestedColor] || byJob[String(requestedColor)] || null;
  if (variant && typeof variant === 'object' && !Array.isArray(variant)) return variant;

  // 28000 is the class starter outfit.  Some classes (currently class 2)
  // intentionally have no FashionColorPlayerConfig row, while their
  // authoritative RoleGenderConfig still declares the four starter parts.
  // Only synthesize the base colour from that server-owned row.  Alternate
  // colours must remain unavailable until real variant IDs/assets exist.
  if (requestedColor !== 0) return null;
  const roleTable = config.get('RoleGenderConfig') || {};
  const roleKungfu = ensureObject(roleTable[kungfuId] || roleTable[String(kungfuId)]);
  const roleRow = ensureObject(roleKungfu[subJob] || roleKungfu[String(subJob)]);
  const fashionIds = ensureArray(roleRow.initShows)
    .map((id) => Math.max(0, toSafeInt(id, 0)))
    .filter((id) => id > 0 && !!getConfigRow('FashionConfig', id));
  if (fashionIds.length <= 0) return null;
  const baseColor = ensureObject((config.get('FashionColorConfig') || {})['28000']);
  return {
    id: kungfuId,
    subJob,
    colorId: 0,
    name: baseColor[0] && baseColor[0].name != null ? baseColor[0].name : 28000,
    icon: baseColor[0] && baseColor[0].icon ? baseColor[0].icon : '',
    banner: baseColor[0] && baseColor[0].banner ? baseColor[0].banner : '',
    fashionIds,
  };
}

function getSuitFashionIds(player, dressId, color) {
  if (dressId === 28000) {
    const initial = getInitialRoleSuitVariant(player, color);
    return ensureArray(initial && initial.fashionIds)
      .map((id) => Math.max(0, toSafeInt(id, 0))).filter((id) => id > 0);
  }
  const resolved = getSuitVariant(dressId, color);
  return ensureArray(resolved && resolved.variant && resolved.variant.fashionIds)
    .map((id) => Math.max(0, toSafeInt(id, 0))).filter((id) => id > 0);
}

function isSuitVariantOwned(player, dressId, color) {
  const ids = getSuitFashionIds(player, dressId, color);
  return ids.length > 0 && ids.every((id) => hasFashionOwnership(player, id));
}

function getPlayerItemCount(player, itemId) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  if (id === 1) return Math.max(0, toSafeInt(player && player.currencies && player.currencies.diamond, 0));
  if (id === 2) return Math.max(0, toSafeInt(player && player.currencies && player.currencies.silver, 0));
  if (id === 6) return Math.max(0, toSafeInt(player && player.currencies && player.currencies.gold, 0));
  return Math.max(0, toSafeInt(player && player.items && player.items[id], 0));
}

function setPlayerItemCount(player, itemId, count) {
  const id = Math.max(0, toSafeInt(itemId, 0));
  const value = Math.max(0, toSafeInt(count, 0));
  player.items = ensureObject(player.items);
  player.currencies = ensureObject(player.currencies);
  if (id === 1) player.currencies.diamond = value;
  else if (id === 2) player.currencies.silver = value;
  else if (id === 6) player.currencies.gold = value;
  else if (value > 0) player.items[id] = value;
  else delete player.items[id];
}

function normalizeCosts(rows) {
  const source = Array.isArray(rows) ? rows : (rows && typeof rows === 'object' ? [rows] : []);
  const merged = new Map();
  source.forEach((row) => {
    const id = Math.max(0, toSafeInt(row && row.id, 0));
    const count = Math.max(0, toSafeInt(row && row.count, 0));
    if (id > 0 && count > 0) merged.set(id, (merged.get(id) || 0) + count);
  });
  return Array.from(merged.entries()).map(([id, count]) => ({ id, count }));
}

function canConsumeCosts(player, rows) {
  return normalizeCosts(rows).every((cost) => getPlayerItemCount(player, cost.id) >= cost.count);
}

function consumeCosts(player, rows) {
  const costs = normalizeCosts(rows);
  if (!canConsumeCosts(player, costs)) return null;
  return costs.map((cost) => {
    const left = getPlayerItemCount(player, cost.id) - cost.count;
    setPlayerItemCount(player, cost.id, left);
    return { id: cost.id, count: cost.count, left };
  });
}

function buildCostSync(consumed) {
  if (!Array.isArray(consumed) || consumed.length <= 0) return null;
  return {
    tag: 1202,
    msgUid: 0,
    data: {
      result: 0,
      items: consumed.map((row) => ({ id: row.id, count: -row.count })),
      changed: consumed.map((row) => ({ id: row.id, count: row.left })),
    },
  };
}

function grantSuitVariant(player, dressId, color) {
  const ids = getSuitFashionIds(player, dressId, color);
  if (ids.length <= 0) return [];
  ids.forEach((id) => grantFashionOwnership(player, id, { extendTimed: true }));
  return ids;
}

function setDressStar(info, dressId, star) {
  const id = Math.max(0, toSafeInt(dressId, 0));
  const value = Math.max(0, toSafeInt(star, 0));
  const rows = ensureArray(info.dress).filter((row) => toSafeInt(row && row.id, 0) !== id);
  rows.push({ id, star: value });
  rows.sort((left, right) => toSafeInt(left && left.id, 0) - toSafeInt(right && right.id, 0));
  info.dress = rows;
  info.starUp[String(id)] = value;
}

function getDressStar(info, dressId) {
  const id = Math.max(0, toSafeInt(dressId, 0));
  const row = ensureArray(info.dress).find((entry) => toSafeInt(entry && entry.id, 0) === id);
  return Math.max(0, toSafeInt(row && row.star, toSafeInt(info.starUp[String(id)], 0)));
}

function getLinkageUpgradeCosts(player, levelRow) {
  const generalRates = ensureObject(ensureObject(config.get('FashionBaseConfig')).generalLevelConsume);
  const merged = new Map();
  ensureArray(levelRow && levelRow.consumes).forEach((cost) => {
    const id = Math.max(0, toSafeInt(cost && cost.id, 0));
    const count = Math.max(0, toSafeInt(cost && cost.count, 0));
    if (id <= 0 || count <= 0) return;
    if (id === 800 || Math.max(0, toSafeInt(generalRates[String(id)], 0)) <= 0) {
      merged.set(id, (merged.get(id) || 0) + count);
      return;
    }
    const owned = getPlayerItemCount(player, id);
    const direct = Math.min(count, owned);
    if (direct > 0) merged.set(id, (merged.get(id) || 0) + direct);
    const missing = count - direct;
    if (missing > 0) {
      const rate = Math.max(0, toSafeInt(generalRates[String(id)], 0));
      merged.set(800, (merged.get(800) || 0) + missing * rate);
    }
  });
  return Array.from(merged.entries()).map(([id, count]) => ({ id, count }));
}

function syncFashionSelection(player, info, type, id) {
  const typeKey = String(type);
  info.fashion[typeKey] = id;
  info.curFashion[typeKey] = id;
  info.fashionMap[typeKey] = id;
  info.equipped[typeKey] = id;

  player.roleInfo = ensureObject(player.roleInfo);
  if (type === 101) {
    player.title = id;
    player.roleInfo.title = id;
  }
  if (type === 102) {
    player.avatar = id;
    player.roleInfo.avatar = id;
  }
  if (type === 103) {
    player.avatarFrame = id;
    player.roleInfo.avatarFrame = id;
  }
}

function buildFashionRows(info) {
  const rows = [];
  Object.keys(info.fashion || {}).forEach((typeKey) => {
    const type = Math.max(0, toSafeInt(typeKey, 0));
    const id = toSignedInt(info.fashion[typeKey], 0);
    if (type <= 0 || id < -1) return;
    rows.push({ type, id });
  });
  rows.sort((a, b) => a.type - b.type);
  return rows;
}

function buildEmojiList(info) {
  const emoji = ensureObject(info.emoji);
  Object.keys(emoji).forEach((key) => {
    emoji[key] = Array.from(new Set(ensureArray(emoji[key])
      .map((value) => Math.max(0, toSafeInt(value, 0)))
      .filter((value) => value > 0))).sort((left, right) => left - right);
  });
  info.emoji = emoji;
  return emoji;
}

function buildFashionDataPayload(info) {
  const data = ensureArray(info.fashionData)
    .map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? { ...row } : null))
    .filter((row) => row && toSafeInt(row.id, 0) > 0);
  const fashion = Array.from(new Set(
    ensureArray(info.activateFashion)
      .map((id) => Math.max(0, toSafeInt(id, 0)))
      .filter((id) => id > 0)
  )).sort((a, b) => a - b);
  info.fashionData = data;
  info.activateFashion = fashion;
  return { result: 0, data, fashion };
}

function buildFashionStatePacket(info) {
  return {
    tag: 1800,
    msgUid: 0,
    data: buildFashionDataPayload(info),
  };
}

function isFashionChangeRequest(params = {}) {
  return !!(params && typeof params === 'object' && !Array.isArray(params) && params.type != null);
}

async function persistPlayer(session, player) {
  if (session?._fashionTransaction) return;
  if (!session || !session.userId) return;
  const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
  if (!saved) throw Error('FASHION_SAVE_NOT_CONFIRMED');
  if (saved && typeof saved === 'object') {
    session.player = saved;
  }
}

async function handleFashionData(_params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1800, msgUid, data: { result: -1, data: [], fashion: [] } };
  }

  ensureRoleAppearance(player);
  purgeExpiredFashionOwnership(player);
  const info = ensureFashionInfo(player);
  return {
    tag: 1800,
    msgUid,
    data: buildFashionDataPayload(info),
  };
}

async function handleChangeFashion(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1801, msgUid, data: { result: -1, id: 0, type: 0, setId: 0 } };
  }

  ensureRoleAppearance(player);
  const info = ensureFashionInfo(player);
  const type = Math.max(1, toSafeInt(params.type, 0));
  const id = toSignedInt(params.id, 0);
  const setRaw = params.set == null ? info.setId : toSignedInt(params.set, info.setId);

  if (!Object.values(config.get('FashionConfig') || {}).some(row => row.type === type)
    || id < -1 || (setRaw !== -1 && setRaw !== 999 && !validSet(setRaw))) {
    return { tag: 1801, msgUid, data: { result: -1, code: 'FASHION_SELECTION_INVALID' } };
  }

  if (id > 0) {
    const fashionRow = getConfigRow('FashionConfig', id);
    if (!fashionRow || Math.max(0, toSafeInt(fashionRow.type, 0)) !== type || !hasFashionOwnership(player, id)) {
      return { tag: 1801, msgUid, data: { result: -1, id: 0, type, setId: info.setId } };
    }
    const dress = getConfigRow('FashionDressConfig', fashionRow.dressId);
    // End effects are separately owned selections, not wearable suit pieces.
    // Require the parent config to explicitly register this effect before
    // allowing it through the shared preset and persistence flow below.
    const isEndEffect = type === 304 && dress?.isSuit === 4
      && getConfigRow('FashionEndDressConfig', fashionRow.dressId)?.endEffectId === id;
    if (type === 304 && !isEndEffect) {
      return { tag: 1801, msgUid, data: { result: -1, code: 'FASHION_END_EFFECT_INVALID' } };
    }
    if (type === 306) {
      syncFashionSelection(player, info, type, id);
      await persistPlayer(session, player);
      return { tag: 1801, msgUid, data: { result: 0, id, type, setId: info.setId } };
    }
    if ([1, 2, 4].includes(dress?.isSuit) && !isEndEffect) return { tag: 1801, msgUid, data: { result: -1, code: 'FASHION_WHOLE_SUIT_REQUIRED' } };
  }

  // Bath selection belongs to its isolated preset, never the ordinary outfit.
  if (setRaw === 999) {
    const bath = ensureSetRecord(info, 999);
    bath.selection = { ...(bath.selection || {}), [type]: id };
    await persistPlayer(session, player);
    return { tag: 1801, msgUid, data: { result: 0, id, type, setId: 999 } };
  }
  if (setRaw >= 0 && setRaw !== info.setId) activateSet(player, info, setRaw);
  syncFashionSelection(player, info, type, id);
  if (setRaw >= 0) {
    info.setId = Math.max(0, setRaw);
    ensureSetRecord(info, info.setId);
  }
  rememberSet(info);

  await persistPlayer(session, player);
  return {
    tag: 1801,
    msgUid,
    data: {
      result: 0,
      id,
      type,
      setId: info.setId,
    },
  };
}

async function handleChangeSuit(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1802, msgUid, data: { result: -1, fashion: [] } };
  }

  ensureRoleAppearance(player);
  const info = ensureFashionInfo(player);
  const id = Math.max(0, toSafeInt(params.id, 0));
  const color = Math.max(0, toSafeInt(params.color, 0));
  const setId = Math.max(0, toSafeInt(params.set, info.setId));
  const componentIds = getSuitFashionIds(player, id, color);
  if ((!validSet(setId) && setId !== 999) || !getConfigRow('FashionDressConfig', id) || componentIds.length <= 0
    || !componentIds.every((componentId) => hasFashionOwnership(player, componentId))) {
    return { tag: 1802, msgUid, data: { result: -1, fashion: buildFashionRows(info), setId: info.setId } };
  }

  if (setId !== 999) {
    if (setId !== info.setId) activateSet(player, info, setId);
    // Exactly the slots in the selected suit, not leftover equipment from the
    // previous one. Non-clothing display bans use native 0 = no cosmetic.
    const resolved = getSuitVariant(id, color);
    // Only clear slots explicitly banned by this suit. A suit such as 28010
    // intentionally leaves the weapon slot available; do not infer a ban
    // merely because the suit has no weapon component.
    const absent = new Set((resolved?.variant?.banTypeIds || []).filter(type => planTypes().includes(type)));
    componentIds.forEach(component => absent.delete(getConfigRow('FashionConfig', component)?.type));
    for (const type of absent) syncFashionSelection(player, info, type, [301,302,303,309].includes(type) ? -1 : 0);
    componentIds.forEach((componentId) => {
      const fashionRow = getConfigRow('FashionConfig', componentId);
      const type = Math.max(0, toSafeInt(fashionRow && fashionRow.type, 0));
      if (type > 0) syncFashionSelection(player, info, type, componentId);
    });
    info.setId = setId;
    rememberSet(info);
  } else {
    ensureSetRecord(info, 999).selection = Object.fromEntries(componentIds.map(component => [getConfigRow('FashionConfig', component).type, component]));
  }
  ensureSetRecord(info, setId);
  info.suits[String(setId)] = { id, color };

  await persistPlayer(session, player);
  return {
    tag: 1802,
    msgUid,
    data: {
      result: 0,
      fashion: buildFashionRows(info),
      setId: info.setId,
    },
  };
}

async function handleSuitColorUnlock(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1803, msgUid, data: { result: -1, id: 0, color: 0 } };
  }

  const info = ensureFashionInfo(player);
  const id = Math.max(0, toSafeInt(params.id, 0));
  const color = Math.max(0, toSafeInt(params.color, 0));
  const replace = Math.max(0, toSafeInt(params.replace, 0));
  const resolved = getSuitVariant(id, color);
  if (!resolved || resolved.isSuit === 1 || resolved.isSuit === 4) {
    return { tag: 1803, msgUid, data: { result: -1, id, color } };
  }
  if (resolved.isSuit === 0 && color <= 0) {
    return { tag: 1803, msgUid, data: { result: -1, id, color } };
  }
  const componentIds = getSuitFashionIds(player, id, color);
  if (componentIds.length <= 0) return { tag: 1803, msgUid, data: { result: -1, id, color } };
  if (isSuitVariantOwned(player, id, color)) {
    return [
      buildFashionStatePacket(info),
      { tag: 1803, msgUid, data: { result: 0, id, color } },
    ];
  }
  if ((resolved.isSuit === 0 || resolved.isSuit === 3) && color > 0 && !isSuitVariantOwned(player, id, 0)) {
    return { tag: 1803, msgUid, data: { result: -1, id, color } };
  }
  const selectedCost = replace > 0 && resolved.variant.costReplace
    ? resolved.variant.costReplace
    : resolved.variant.cost;
  const costs = normalizeCosts(selectedCost);
  if (color > 0 && costs.length <= 0) return { tag: 1803, msgUid, data: { result: -1, id, color } };
  const consumed = consumeCosts(player, costs);
  if (costs.length > 0 && !consumed) return { tag: 1803, msgUid, data: { result: -1, id, color } };
  grantSuitVariant(player, id, color);
  const key = String(id);
  const list = ensureArray(info.suitColors[key]).map((v) => Math.max(0, toSafeInt(v, 0))).filter((v) => v > 0);
  if (!list.includes(color)) {
    list.push(color);
    list.sort((left, right) => left - right);
  }
  info.suitColors[key] = list;

  await persistPlayer(session, player);
  const response = {
    tag: 1803,
    msgUid,
    data: { result: 0, id, color },
  };
  const sync = buildCostSync(consumed);
  return [
    ...(sync ? [sync] : []),
    buildFashionStatePacket(info),
    response,
  ];
}

async function handleDressStarUp(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1804, msgUid, data: { result: -1, data: { id: 0, star: 0 } } };
  }

  const info = ensureFashionInfo(player);
  const id = Math.max(0, toSafeInt(params.id, 0));
  const star = Math.max(0, toSafeInt(params.star, 0));
  const resolved = getSuitVariant(id, 0);
  const levels = ensureObject(getConfigRow('FashionDressLevelConfig', id));
  const currentStar = getDressStar(info, id);
  if (!resolved || resolved.isSuit !== 1 || !isSuitVariantOwned(player, id, 0)
    || star !== currentStar + 1 || !levels[String(star)]) {
    return { tag: 1804, msgUid, data: { result: -1, data: { id, star: currentStar } } };
  }
  const currentLevelRow = levels[String(currentStar)] || levels[currentStar];
  const costs = getLinkageUpgradeCosts(player, currentLevelRow);
  const consumed = consumeCosts(player, costs);
  if (costs.length > 0 && !consumed) {
    return { tag: 1804, msgUid, data: { result: -1, data: { id, star: currentStar } } };
  }
  grantSuitVariant(player, id, star);
  setDressStar(info, id, star);

  await persistPlayer(session, player);
  const response = {
    tag: 1804,
    msgUid,
    data: {
      result: 0,
      data: { id, star },
    },
  };
  const sync = buildCostSync(consumed);
  return sync ? [sync, response] : response;
}

async function handleFashionChangeSet(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1805, msgUid, data: { result: -1, setId: 0 } };
  }

  const info = ensureFashionInfo(player);
  const setId = Math.max(0, toSafeInt(params.setId, 0));
  if (!validSet(setId)) return { tag: 1805, msgUid, data: { result: -1, code: 'FASHION_PRESET_INVALID' } };
  ensureRoleAppearance(player);
  activateSet(player, info, setId);

  await persistPlayer(session, player);
  return {
    tag: 1805,
    msgUid,
    data: { result: 0, setId, fashion: buildFashionRows(info) },
  };
}

async function handleFashionRenameSet(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1806, msgUid, data: { result: -1, name: '' } };
  }

  const info = ensureFashionInfo(player);
  const setId = Math.max(0, toSafeInt(params.setId, 0));
  if (!validSet(setId)) return { tag: 1806, msgUid, data: { result: -1, code: 'FASHION_PRESET_INVALID' } };
  const name = params.name == null ? '' : String(params.name).slice(0, 24);
  info.setNames[String(setId)] = name;
  ensureSetRecord(info, setId).name = name;

  await persistPlayer(session, player);
  return {
    tag: 1806,
    msgUid,
    data: { result: 0, setId, name },
  };
}

async function handlePurchaseEmojiGroup(params = {}, session = {}, msgUid) {
  const player = session.player;
  if (!player) {
    return { tag: 1810, msgUid, data: { result: -1, emoji: [] } };
  }

  const info = ensureFashionInfo(player);
  const group = Math.max(0, toSafeInt(params.group, 0));
  const groupRow = getConfigRow('EmojiGroupConfig', group);
  const now = Date.now();
  if (!groupRow || toSafeInt(groupRow.isBuy, 0) !== 1
    || (toSafeInt(groupRow.startTime, 0) > 0 && now < toSafeInt(groupRow.startTime, 0))
    || (toSafeInt(groupRow.endTime, 0) > 0 && now > toSafeInt(groupRow.endTime, 0))) {
    return { tag: 1810, msgUid, data: { result: -1, emoji: buildEmojiList(info) } };
  }
  const emojiConfig = config.get('EmojiConfig') || {};
  const emojiRows = Object.values(emojiConfig)
    .filter((row) => toSafeInt(row && row.group, 0) === group)
    .sort((left, right) => toSafeInt(left && left.id, 0) - toSafeInt(right && right.id, 0));
  if (emojiRows.length <= 0) return { tag: 1810, msgUid, data: { result: -1, emoji: buildEmojiList(info) } };
  const forever = new Set(ensureArray(info.emoji['2']).map((id) => Math.max(0, toSafeInt(id, 0))));
  const missing = emojiRows.filter((row) => !forever.has(toSafeInt(row && row.id, 0)));
  const costs = normalizeCosts(missing.flatMap((row) => ensureArray(row && row.consume)));
  const consumed = consumeCosts(player, costs);
  if (costs.length > 0 && !consumed) {
    return { tag: 1810, msgUid, data: { result: -1, emoji: buildEmojiList(info) } };
  }
  missing.forEach((row) => forever.add(Math.max(0, toSafeInt(row && row.id, 0))));
  info.emoji['2'] = Array.from(forever).filter((id) => id > 0).sort((left, right) => left - right);
  if (!info.emojiGroups.includes(group)) info.emojiGroups.push(group);
  const emoji = buildEmojiList(info);

  await persistPlayer(session, player);
  const response = {
    tag: 1810,
    msgUid,
    data: { result: 0, emoji },
  };
  const sync = buildCostSync(consumed);
  return sync ? [sync, response] : response;
}

function transactional(tag, handler) {
  return (params = {}, session, msgUid) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)
      || ['id','type','set','setId','color','star','replace'].some(key => params[key] != null && (!Number.isSafeInteger(params[key]) || params[key] < (['id','set'].includes(key) ? -1 : 0)))) {
      return { tag, msgUid, data: { result: -1, code: 'FASHION_REQUEST_INVALID' } };
    }
    return transactions.run(tag, params, session, msgUid, handler);
  };
}
module.exports = {
  ensureFashionInfo,
  isFashionChangeRequest,
  handleFashionData,
  handleChangeFashion: transactional(1801, handleChangeFashion),
  handleChangeSuit: transactional(1802, handleChangeSuit),
  handleSuitColorUnlock: transactional(1803, handleSuitColorUnlock),
  handleDressStarUp: transactional(1804, handleDressStarUp),
  handleFashionChangeSet: transactional(1805, handleFashionChangeSet),
  handleFashionRenameSet: transactional(1806, handleFashionRenameSet),
  handlePurchaseEmojiGroup,
};
