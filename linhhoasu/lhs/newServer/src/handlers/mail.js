const Mail = require('../db/models/Mail');
const playerService = require('../services/PlayerService');
const messageService = require('../services/MessageService');
const logger = require('../logger');
const { grantRewardInfo } = require('./raid');
const { buildItemSyncPayload } = require('../services/PlayerGrantService');
const rewardGrant = require('../services/RewardGrantService');
const configService = require('../services/ConfigService');
const {
  grantFashionOwnership,
} = require('../services/RoleAppearanceService');

const MAIL_CLAIM_LEDGER_LIMIT = 4000;
const mailClaimQueues = new Map();

function toSafeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

function toSafeId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function enqueueMailClaim(userId, work) {
  const key = String(userId || '');
  const previous = mailClaimQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  let bookkeeping;
  bookkeeping = current.then(() => undefined, () => undefined).finally(() => {
    if (mailClaimQueues.get(key) === bookkeeping) mailClaimQueues.delete(key);
  });
  mailClaimQueues.set(key, bookkeeping);
  return current;
}

function getMailClaimLedger(player = {}) {
  const values = Array.isArray(player.mailClaimLedger) ? player.mailClaimLedger : [];
  const normalized = Array.from(new Set(values.map(toSafeId).filter(Boolean))).slice(-MAIL_CLAIM_LEDGER_LIMIT);
  player.mailClaimLedger = normalized;
  return new Set(normalized);
}

function toClientSender(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.floor(value));
  const text = String(value).trim();
  return /^-?\d+$/.test(text) ? text : '';
}

function parseMailIds(params = {}) {
  if (Array.isArray(params.ids)) {
    return params.ids.map(toSafeId).filter(Boolean);
  }
  if (Array.isArray(params.handles)) {
    return params.handles.map(toSafeId).filter(Boolean);
  }
  const single = params.id || params.mailId || params.uid || params.handle;
  const id = toSafeId(single);
  return id ? [id] : [];
}

function buildMailUpdateData(ids = [], read = 1, receive = 0) {
  return ids.map((id) => ({
    id,
    handle: id,
    read,
    receive,
  }));
}

function normalizeAttachments(val) {
  if (Array.isArray(val)) {
    return val
      .map((item) => ({
        id: toSafeInt(item && item.id),
        count: toSafeInt(item && item.count),
      }))
      .filter((item) => item.id > 0 && item.count > 0);
  }

  if (val && typeof val === 'object') {
    return Object.keys(val)
      .map((id) => ({
        id: toSafeInt(id),
        count: toSafeInt(val[id]),
      }))
      .filter((item) => item.id > 0 && item.count > 0);
  }

  return [];
}

function scheduleMailPlayerSave(session, player, reason = 'mail') {
  const userId = session && session.userId;
  if (!userId || !player) return;
  if (session._mailSaveScheduled) return;
  session._mailSaveScheduled = true;
  Promise.resolve().then(async () => {
    try {
      await playerService.savePlayer(userId, player);
    } catch (err) {
      logger.warn(`[Mail] async save failed ${reason} user=${userId}: ${err.message}`);
    } finally {
      session._mailSaveScheduled = false;
    }
  });
}

function toClientMail(row = {}) {
  const attachments = normalizeAttachments(row.attachments || row.rewardData);
  const mailId = toSafeId(row._id || row.id || row.handle);
  const text = row.text || row.content || '';
  return {
    id: mailId,
    handle: mailId,
    templateId: Math.max(0, toSafeInt(row.templateId, 0)),
    params: Array.isArray(row.params) ? row.params.map((value) => String(value)) : [],
    title: row.title || '',
    text,
    content: text,
    // MailData converts non-template senders with Number(sender); never send
    // localized text here or the client will call ConvertLanguageToText(NaN).
    sender: toClientSender(row.sender),
    attachments,
    rewardData: attachments,
    minClaimLevel: Math.max(0, toSafeInt(row.minClaimLevel, 0)),
    read: row.read ? 1 : 0,
    receive: row.claimed ? 1 : 0,
    claimed: row.claimed ? 1 : 0,
    sendtime: row.createdAt ? Math.floor(new Date(row.createdAt).getTime() / 1000) : 0,
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
    expireAt: row.expireAt ? new Date(row.expireAt).getTime() : 0,
    adCount: Math.max(0, toSafeInt(row.adCount, 0)),
  };
}

function buildEmptyRewardInfo() {
  return rewardGrant.buildEmptyRewardInfo();
}

function mergeRewardItem(map, id, count) {
  const safeId = toSafeInt(id);
  const safeCount = toSafeInt(count);
  if (safeId <= 0 || safeCount <= 0) return;
  map.set(safeId, (map.get(safeId) || 0) + safeCount);
}

function getMailFashionRow(itemId) {
  const id = toSafeInt(itemId);
  if (id <= 0) return null;
  const fashionConfig = configService.get('FashionConfig') || {};
  const row = fashionConfig[id] || fashionConfig[String(id)] || null;
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

function normalizeFashionSwapRows(row = {}) {
  const raw = Array.isArray(row.swaps) ? row.swaps : (row.swaps && typeof row.swaps === 'object' ? [row.swaps] : []);
  return raw
    .map((swap) => ({ id: toSafeInt(swap && swap.id), count: toSafeInt(swap && swap.count) }))
    .filter((swap) => swap.id > 0 && swap.count > 0);
}

function grantMailFashion(player = {}, item = {}) {
  const id = toSafeInt(item.id);
  const count = Math.max(0, toSafeInt(item.count));
  // Native gameplay collections always win when an ID also has FashionConfig.
  // The shared reward router grants both layers for those IDs.
  const rewardKind = rewardGrant.getRewardKind(id);
  if (rewardKind !== 'fashion' && rewardKind !== 'item') return null;
  const row = getMailFashionRow(id);
  if (!row || count <= 0) return null;

  const fashion = [];
  const swaps = [];
  let unconvertedCount = 0;
  for (let index = 0; index < count; index += 1) {
    const grant = grantFashionOwnership(player, id, { extendTimed: true });
    if (grant && grant.row && (grant.newlyOwned || grant.timed)) {
      if (!fashion.some((entry) => entry.id === id)) fashion.push(grant.row);
      continue;
    }

    const swapRows = normalizeFashionSwapRows(row);
    if (swapRows.length <= 0) {
      unconvertedCount += 1;
      continue;
    }
    swapRows.forEach((swap) => swaps.push({ id: swap.id, count: swap.count }));
  }

  return { id, fashion, swaps, unconvertedCount };
}

function hasRewardInfoContent(rewardInfo = {}) {
  return ['items', 'equips', 'swords', 'pets', 'artifacts', 'gems', 'valhalla', 'bloodline', 'fashion', 'formations', 'spirits', 'oldTrekShips', 'elves', 'sailor']
    .some((key) => Array.isArray(rewardInfo[key]) && rewardInfo[key].length > 0);
}

function buildMailItemSyncPayload(player, rewardItems = []) {
  rewardItems = rewardItems.filter(row => !require('../services/NativeItemRewardService').getKind(Number(row.id)));
  const payload = buildItemSyncPayload(player, rewardItems.map((row) => row.id));
  return {
    ...payload,
    // 1202.items is an item delta list on this client; absolute counts belong in changed.
    items: rewardItems.map((row) => ({ id: toSafeInt(row.id), count: toSafeInt(row.count) })),
  };
}

function buildMountInfoUpdate(player) {
  // Avoid a hard top-level dependency because RewardGrantService also loads mount handlers lazily.
  // eslint-disable-next-line global-require
  const mount = require('./mount');
  const info = player && player.swordInfo ? player.swordInfo : {};
  const buildInfo = mount && typeof mount.buildMountInfoUpdatePayload === 'function'
    ? mount.buildMountInfoUpdatePayload
    : (value) => value;
  return {
    result: 0,
    uid: toSafeInt(info.equippedUid, 0),
    info: buildInfo(info),
  };
}

async function handleMailInit(_params, session, msgUid) {
  const userId = session && session.userId;
  if (!userId) {
    return { tag: 1100, msgUid, data: { result: -1, mailData: [], unreadCount: 0 } };
  }

  const rows = await Mail.find({ userId }).sort({ createdAt: -1 }).lean();
  const mailData = (rows || []).map(toClientMail);
  return {
    tag: 1100,
    msgUid,
    data: {
      result: 0,
      mailData,
      unreadCount: mailData.filter((mail) => !mail.read).length,
    },
  };
}

async function handleMailRead(params, session, msgUid) {
  const userId = session && session.userId;
  if (!userId) {
    return { tag: 1101, msgUid, data: { result: -1, ids: [], handles: [], updateData: [], items: [] } };
  }

  const ids = parseMailIds(params);
  if (ids.length === 0) {
    return { tag: 1101, msgUid, data: { result: -1, ids: [], handles: [], updateData: [], items: [] } };
  }

  await Mail.updateMany(
    { userId, _id: { $in: ids } },
    { $set: { read: true } }
  );

  return {
    tag: 1101,
    msgUid,
    data: {
      result: 0,
      ids,
      handles: ids,
      updateData: buildMailUpdateData(ids, 1, 0),
      items: [],
    },
  };
}

async function handleMailClaimUnlocked(params, session, msgUid) {
  const userId = session && session.userId;
  const player = session && session.player;
  if (!userId || !player) {
    return {
      tag: 1103,
      msgUid,
      data: { result: -1, ids: [], handles: [], updateData: [], rewardInfo: buildEmptyRewardInfo() },
    };
  }

  const ids = parseMailIds(params);
  if (ids.length === 0) {
    return {
      tag: 1103,
      msgUid,
      data: { result: -1, ids: [], handles: [], updateData: [], rewardInfo: buildEmptyRewardInfo() },
    };
  }

  const rows = await Mail.find({ userId, _id: { $in: ids } }).lean();
  try {
    rewardGrant.assertRewardRowsSupported((rows || []).filter(row => !row.claimed).flatMap(row => normalizeAttachments(row.attachments || row.rewardData)));
  } catch (error) {
    return { tag: 1103, msgUid, data: { result: -1, code: error.code, rewardInfo: buildEmptyRewardInfo() } };
  }
  const rewardInfoMap = new Map();
  const rewardEquips = [];
  const rewardSwords = [];
  const rewardPets = [];
  const rewardPetSouls = [];
  const rewardArtifacts = [];
  const rewardGems = [];
  const rewardBloodlines = [];
  const rewardValhalla = [];
  const rewardFashion = [];
  const rewardFormations = [];
  const rewardSpirits = [];
  const rewardOldTrekShips = [];
  const claimLedger = getMailClaimLedger(player);
  let ledgerChanged = false;
  const finalizeIds = [];
  const blockedMail = (rows || []).find((mail) => !mail.claimed && toSafeInt(mail.minClaimLevel, 0) > toSafeInt(player.level, 1));
  if (blockedMail) {
    const needLevel = toSafeInt(blockedMail.minClaimLevel, 0);
    return {
      tag: 1103,
      msgUid,
      data: {
        result: -2,
        msg: `Nhân vật đạt${needLevel}Có thể nhận sau cấp`,
        minClaimLevel: needLevel,
        ids,
        handles: ids,
        updateData: [],
        rewardInfo: buildEmptyRewardInfo(),
      },
    };
  }

  (rows || []).forEach((mail) => {
    if (!mail || mail.claimed) return;
    const mailId = toSafeId(mail._id || mail.id || mail.handle);
    if (mailId && claimLedger.has(mailId)) {
      finalizeIds.push(mailId);
      return;
    }
    const attachments = require('../services/FishingEconomyService').expandCarp(normalizeAttachments(mail.attachments || mail.rewardData));
    attachments.forEach((item) => {
      const fashionGrant = grantMailFashion(player, item);
      if (fashionGrant) {
        rewardFashion.push(...fashionGrant.fashion);
        fashionGrant.swaps.forEach((swap) => {
          const swapGrant = grantRewardInfo(player, [swap]);
          (swapGrant.rewardInfo.items || []).forEach((rewardItem) => {
            mergeRewardItem(rewardInfoMap, rewardItem.id, rewardItem.count);
          });
          rewardEquips.push(...(swapGrant.rewardInfo.equips || []));
        });
        // A FashionConfig row without swaps has no duplicate conversion reward;
        // consume duplicate copies without re-adding them as bag items.
        return;
      }
      const kind = rewardGrant.getRewardKind(item.id);
      if (kind !== 'item' && kind !== 'fashion') {
        const grantResult = rewardGrant.grantRewardRow(player, item, 1);
        rewardSwords.push(...grantResult.rewardSwords);
        rewardPets.push(...grantResult.rewardPets);
        rewardPetSouls.push(...grantResult.rewardPetSouls);
        rewardArtifacts.push(...(grantResult.rewardArtifacts || []));
        rewardGems.push(...grantResult.rewardGems);
        rewardBloodlines.push(...grantResult.rewardBloodlines);
        rewardValhalla.push(...grantResult.rewardValhalla);
        rewardOldTrekShips.push(...(grantResult.rewardOldTrekShips || []));
        (grantResult.rewardFashion || []).forEach((fashionRow) => {
          if (!rewardFashion.some((entry) => entry.id === fashionRow.id)) rewardFashion.push(fashionRow);
        });
        (grantResult.rewardFormations || []).forEach((formationRow) => {
          if (!rewardFormations.some((entry) => entry.id === formationRow.id)) rewardFormations.push(formationRow);
        });
        (grantResult.rewardSpirits || []).forEach((spiritRow) => {
          if (!rewardSpirits.some((entry) => entry.id === spiritRow.id)) rewardSpirits.push(spiritRow);
        });
        (grantResult.rewardItems || []).forEach((rewardItem) => {
          mergeRewardItem(rewardInfoMap, rewardItem.id, rewardItem.count);
        });
        return;
      }
      const grantResult = grantRewardInfo(player, [item]);
      (grantResult.rewardInfo.items || []).forEach((rewardItem) => {
        mergeRewardItem(rewardInfoMap, rewardItem.id, rewardItem.count);
      });
      rewardEquips.push(...(grantResult.rewardInfo.equips || []));
    });
    if (mailId) {
      claimLedger.add(mailId);
      ledgerChanged = true;
      finalizeIds.push(mailId);
    }
  });

  if (ledgerChanged) {
    player.mailClaimLedger = Array.from(claimLedger).slice(-MAIL_CLAIM_LEDGER_LIMIT);
  }

  const rewardItems = Array.from(rewardInfoMap.entries())
    .map(([id, count]) => ({ id: toSafeInt(id), count: toSafeInt(count) }))
    .sort((a, b) => a.id - b.id);

  if (rewardItems.length > 0 || rewardFashion.length > 0) {
    messageService.pushPlayerNotice(player, {
      type: 'mail',
      title: "Thưởng thư",
      content: `Đã nhận${ids.length}Thưởng thư`,
    });
  }

  // Persist the granted player snapshot and durable mail-id ledger before
  // finalizing the mail claim. A retry after a crash can reconcile from the
  // ledger without granting the same mail twice.
  // If saving fails, keep mail.claimed=false so the player can retry without
  // losing a high-value reward.
  if (ledgerChanged) {
    try {
      const saved = await playerService.savePlayer(userId, player, { returnSaved: false });
      if (!saved) throw new Error('MAIL_PLAYER_SAVE_NOT_CONFIRMED');
    } catch (err) {
      // The write outcome may be uncertain after a timeout. Force a relog so
      // the next attempt reloads the persisted ledger/player snapshot rather
      // than trusting the mutated in-memory object.
      session.player = null;
      throw err;
    }
  }

  await Mail.updateMany(
    { userId, _id: { $in: finalizeIds }, claimed: false },
    { $set: { claimed: true, read: true } }
  );

  const rewardInfo = {
    ...buildEmptyRewardInfo(),
    items: rewardItems,
    equips: rewardEquips,
    swords: rewardSwords,
    pets: rewardPets,
    petSouls: rewardPetSouls,
    artifacts: rewardArtifacts,
    gems: rewardGems,
    bloodline: rewardBloodlines,
    valhalla: rewardValhalla,
    fashion: rewardFashion,
    formations: rewardFormations,
    spirits: rewardSpirits,
    oldTrekShips: rewardOldTrekShips,
  };
  const updateData = buildMailUpdateData(ids, 1, 1);
  const pushUpdate = {
    tag: 1103,
    msgUid: 0,
    data: {
      result: 0,
      ids,
      handles: ids,
      updateData,
      rewardInfo,
    },
  };
  const response = {
    tag: 1103,
    msgUid,
    data: {
      result: 0,
      ids,
      handles: ids,
      updateData,
      rewardInfo: hasRewardInfoContent(rewardInfo) ? rewardInfo : buildEmptyRewardInfo(),
    },
  };
  const packets = [];
  if (rewardItems.length > 0) {
    packets.push({
      tag: 1202,
      msgUid: 0,
      data: buildMailItemSyncPayload(player, rewardItems),
    });
  }
  if (rewardGems.length > 0) {
    const gem = require('./gem');
    const info = gem && typeof gem.ensureGemInfo === 'function' ? gem.ensureGemInfo(player) : null;
    if (info) {
      packets.push({
        tag: 3900,
        msgUid: 0,
        data: {
          equippedId: 0,
          plan: info.plan,
          gems: info.gems,
          exchangeTimes: info.exchangeTimes,
          fieldCount: info.fieldCount,
        },
      });
      rewardGems.forEach((gemRow) => packets.push({
        tag: 3901,
        msgUid: 0,
        data: { result: 0, uid: toSafeInt(gemRow.uid), id: toSafeInt(gemRow.id), shapeId: toSafeInt(gemRow.shapeId) },
      }));
    }
  }
  if (rewardSwords.length > 0) {
    packets.push({ tag: 3201, msgUid: 0, data: { result: 0, data: rewardSwords } });
    packets.push({ tag: 3200, msgUid: 0, data: buildMountInfoUpdate(player) });
  }
  if (rewardPets.length > 0) {
    packets.push({ tag: 3300, msgUid: 0, data: { result: 0, data: rewardPets } });
  }
  if (rewardArtifacts.length > 0) {
    rewardArtifacts.forEach((artifact) => packets.push({ tag: 3500, msgUid: 0, data: { result: 0, artifact } }));
  }
  rewardPetSouls.forEach((soul) => {
    packets.push({ tag: 6901, msgUid: 0, data: { result: 0, data: soul } });
  });
  packets.push(...rewardGrant.buildAppearanceSyncPackets(player, rewardInfo));
  if (rewardBloodlines.length > 0) {
    const bloodline = require('./bloodline');
    if (bloodline && typeof bloodline.ensureBloodlineInfo === 'function' && typeof bloodline.buildBloodlinePayload === 'function') {
      const info = bloodline.ensureBloodlineInfo(player);
      packets.push({ tag: 4701, msgUid: 0, data: { result: 0, ...bloodline.buildBloodlinePayload(info) } });
    }
  }
  if (rewardValhalla.length > 0) {
    const valhalla = require('./valhalla');
    if (valhalla && typeof valhalla.ensureValhallaInfo === 'function' && typeof valhalla.buildValhallaPayload === 'function') {
      const info = valhalla.ensureValhallaInfo(player);
      packets.push({ tag: 4100, msgUid: 0, data: { result: 0, ...valhalla.buildValhallaPayload(info) } });
    }
  }
  // MailModel only opens reward animation from regNetMsg(1103), not from the RPC callback.
  packets.push(pushUpdate);
  packets.push(response);
  return packets.length === 1 ? response : packets;
}

async function handleMailClaim(params, session, msgUid) {
  const userId = session && session.userId;
  if (!userId) return handleMailClaimUnlocked(params, session, msgUid);
  return enqueueMailClaim(userId, () => handleMailClaimUnlocked(params, session, msgUid));
}

async function handleMailDelete(params, session, msgUid) {
  const userId = session && session.userId;
  if (!userId) {
    return { tag: 1102, msgUid, data: { result: -1, ids: [], handles: [], updateData: [], rewardInfo: { items: [], equips: [] } } };
  }

  const ids = parseMailIds(params);
  if (ids.length === 0) {
    return { tag: 1102, msgUid, data: { result: -1, ids: [], handles: [], updateData: [], rewardInfo: { items: [], equips: [] } } };
  }

  await Mail.deleteMany({ userId, _id: { $in: ids } });
  return {
    tag: 1102,
    msgUid,
    data: {
      result: 0,
      ids,
      handles: ids,
      updateData: [],
      rewardInfo: { items: [], equips: [] },
    },
  };
}

module.exports = {
  handleMailInit,
  handleMailRead,
  handleMailClaim,
  handleMailDelete,
  parseMailIds,
  normalizeAttachments,
  toClientMail,
  grantMailFashion,
};
