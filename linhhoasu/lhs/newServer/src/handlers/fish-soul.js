/** Fishing skill and fish-soul protocol (4030/4031/4060-4063/4070). */

const integrity = require('../services/FishingIntegrityService');
const fishingBalance = require('../services/FishingBalanceService');
const configService = require('../services/ConfigService');
const { addRewardToPlayer } = require('./raid');
const { ensureFishInfo } = require('./fish');

const FISH_SOUL_BAIT_ITEM_ID = 65;

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function configMap(name) {
  const value = configService.get(name);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstConfigId(name, fallback) {
  const ids = Object.keys(configMap(name)).map((key) => int(key, 0)).filter((id) => id > 0).sort((a, b) => a - b);
  return ids[0] || fallback;
}

function normalizeSkillMap(value) {
  const source = obj(value);
  const out = {};
  Object.keys(source).forEach((key) => {
    const index = Math.max(0, int(key, 0));
    const skillId = Math.max(0, int(source[key], 0));
    if (skillId > 0) out[index] = skillId;
  });
  return out;
}

function ensureFishSlot(info, type, uid = 0) {
  if (!integrity.validInt(type, 1, 10) || !integrity.validInt(uid, 1, Number.MAX_SAFE_INTEGER)) return null;
  const row = info.slots[String(type)];
  if (!row || Number(row.uid) !== Number(uid) || row.dead || int(configMap('FishConfig')[row.id]?.quality) < 9) return null;
  row.skills = arr(row.skills).map((v) => int(v, 0));
  row.tempSkills = normalizeSkillMap(row.tempSkills);
  return row;
}

function skillPool(info, slot, index) {
  if (!integrity.validInt(index, 0, 1)) return [];
  if (Number(index) === 1 && arr(info.fishSoulSlots[slot.type]).filter(row => row.slotIndex > 0).length < 3) return [];
  return Object.values(configMap(Number(index) === 0 ? 'FishAttrsConfig' : 'FishSoulAttrsConfig'))
    .map(row => int(row.id)).filter(id => !!configMap('SkillConfig')[id]);
}

function normalizeFishSoul(info, raw = {}) {
  const source = obj(raw);
  const soulConfig = configMap('FishSoulConfig');
  const requestedId = Math.max(0, int(source.id, 0));
  const id = soulConfig[requestedId] || soulConfig[String(requestedId)]
    ? requestedId
    : firstConfigId('FishSoulConfig', 1);
  const cfg = obj(soulConfig[id] || soulConfig[String(id)]);
  const asset = obj(configMap('AssetsConfig')[id] || configMap('AssetsConfig')[String(id)]);
  const type = Math.max(1, int(source.type, int(cfg.type, 1)));
  const slotIndex = Math.max(0, int(source.slotIndex, cfg.isUnusual ? int(cfg.index, 1) : 0));
  info.fishUidSeq = Math.max(1001, int(info.fishUidSeq, 1001) + 1);
  return {
    uid: Math.max(1, int(source.uid, info.fishUidSeq)),
    id,
    type,
    slotIndex,
    quality: Math.max(1, int(source.quality, int(asset.quality, 1))),
    multi: Math.max(1, int(source.multi, 10000)),
    minAddRate: arr(source.minAddRate || cfg.minAddRate),
    lock: int(source.lock, 0) ? 1 : 0,
    dead: int(source.dead, 0) ? 1 : 0,
    time: Math.max(0, int(source.time, Date.now())),
  };
}

function consumeItem(player, itemId, count) {
  const id = Math.max(1, int(itemId, 1));
  const need = Math.max(0, int(count, 0));
  if (need <= 0) return true;
  player.items = obj(player.items);
  const have = Math.max(0, int(player.items[id], 0));
  if (have < need) return false;
  player.items[id] = have - need;
  return true;
}

function buildItemSyncPacket(player, itemId, count) {
  const id = Math.max(1, int(itemId, 1));
  const used = Math.max(0, int(count, 0));
  return {
    tag: 1202,
    msgUid: 0,
    data: {
      result: 0,
      items: used > 0 ? [{ id, count: -used }] : [],
      changed: [{ id, count: Math.max(0, int(player && player.items && player.items[id], 0)) }],
    },
  };
}

function normalizeCatchResult(value) {
  const source = obj(value);
  return {
    ...source,
    time: Math.max(0, int(source.time, 0)),
    infos: arr(source.infos),
    escapes: arr(source.escapes),
    items: arr(source.items),
    sailItems: obj(source.sailItems),
  };
}

function buildFishSoulCatchResultPush(value) {
  return {
    tag: 4070,
    msgUid: 0,
    data: { catchResult: normalizeCatchResult(value) },
  };
}

function addFishingExp(info, amount) {
  info.exp = Math.max(0, int(info.exp, 0) + Math.max(0, int(amount, 0)));
  info.level = Math.max(1, int(info.level, 1));
  const levelConfig = configMap('FishLevelConfig');
  while (true) {
    const row = obj(levelConfig[info.level] || levelConfig[String(info.level)]);
    const need = Math.max(0, int(row.exp, 0));
    const next = levelConfig[info.level + 1] || levelConfig[String(info.level + 1)];
    if (need <= 0 || !next || info.exp < need) break;
    info.exp -= need;
    info.level += 1;
  }
}

function buildRewardInfo(player, rows = []) {
  const items = [];
  arr(rows).forEach((row) => {
    const id = Math.max(0, int(row && row.id, 0));
    const count = Math.max(0, int(row && row.count, 0));
    if (id <= 0 || count <= 0) return;
    addRewardToPlayer(player, id, count);
    items.push({ id, count });
  });
  return { items, equips: [], heros: [] };
}

async function save(session) {
  await integrity.save(session);
}

async function handleRefreshSkill(params, session, msgUid) {
  const fail = { tag: 4030, msgUid, data: { result: 1 } };
  if (!session?.player) return fail;
  const info = ensureFishInfo(session.player);
  const slot = ensureFishSlot(info, params?.type, params?.uid);
  const index = Number(params?.index);
  if (!slot) return fail;
  const pool = skillPool(info, slot, index);
  if (!pool.length || slot.tempSkills[index] || Number(params?.skillId || 0) !== Number(slot.skills[index] || 0)) return fail;
  const cost = configMap('FishBaseConfig').skillWashCost;
  if (!cost?.id || !cost?.count || !consumeItem(session.player, cost.id, cost.count)) return fail;
  // IDs are server-selected from the actual client skill catalog, never from input.
  const skillId = pool[Math.floor(Math.random() * pool.length)];
  slot.tempSkills[index] = skillId;
  await save(session);
  return [buildItemSyncPacket(session.player, cost.id, cost.count), { tag: 4030, msgUid, data: { result: 0, fishInfo: slot } }];
}

async function handleReplaceSkill(params, session, msgUid) {
  const fail = { tag: 4031, msgUid, data: { result: 1 } };
  if (!session?.player) return fail;
  const info = ensureFishInfo(session.player);
  const slot = ensureFishSlot(info, params?.type, params?.uid);
  const index = Number(params?.index);
  if (!slot || !integrity.validInt(params?.replace, 0, 1)) return fail;
  const replacement = Number(slot.tempSkills[index] || 0);
  if (!replacement || !skillPool(info, slot, index).includes(replacement)) return fail;
  // Native FishWashSkillPanel sends the currently equipped skill, not the preview.
  if (Number(params?.skillId || 0) !== Number(slot.skills[index] || 0)) return fail;
  while (slot.skills.length <= index) slot.skills.push(0);
  if (int(params && params.replace, 1) !== 0 && replacement > 0) slot.skills[index] = replacement;
  delete slot.tempSkills[index];
  await save(session);
  return { tag: 4031, msgUid, data: { result: 0, fishInfo: slot } };
}

async function handleFishSoulFishing(params, session, msgUid) {
  if (!session || !session.player) {
    return {
      tag: 4060,
      msgUid,
      data: {
        result: -1,
        catchResult: { time: 0, infos: [], escapes: [], items: [], sailItems: {} },
        escape: 0,
        exp: 0,
        level: 1,
        isMe: true,
        isSpeed: false,
      },
    };
  }
  const gameplay=require('../services/FishingGameplayService'),player=integrity.clone(session.player);
  const info = ensureFishInfo(player);
  const req=fishingBalance.request(info,params||{},'fish-soul-catch',String(params?.count||1));
  if(req.error)return {tag:4060,msgUid,data:{result:1,reason:req.error,balanceRevision:info.balanceRevision||0}};
  if(req.receipt)return {tag:4060,msgUid,data:{result:0,replayed:true,catchResult:info.catchResult,level:info.level,exp:info.exp,balanceRevision:info.balanceRevision}};
  if(!(player.systemUnlockInfo?.unlockedSystem||[]).includes(329))return {tag:4060,msgUid,data:{result:1,reason:'FISH_SOUL_LOCKED'}};
  if(Number(info.nextSoulCatchAt||0)>Date.now())return {tag:4060,msgUid,data:{result:1,reason:'FISH_CATCH_COOLDOWN'}};
  const count = Math.max(1, Math.min(10, int(params && params.count, 1)));
  if (info.catchResult.infos.length || !integrity.validInt(params?.count ?? 1, 1, 10)) {
    return { tag: 4060, msgUid, data: { result: 1, reason: 'FISH_SOUL_PENDING', catchResult: info.catchResult,
      exp: info.exp, level: info.level, escape: 0, isMe: true, isSpeed: false } };
  }
  const baitCost = Math.max(1, int(configMap('FishSoulBaseConfig').cost, 3)) * count;
  gameplay.recoverEnergy(player);
  if (!consumeItem(player, FISH_SOUL_BAIT_ITEM_ID, baitCost)) {
    return {
      tag: 4060,
      msgUid,
      data: {
        result: 1,
        catchResult: { time: 0, infos: [], escapes: [], items: [], sailItems: {} },
        escape: 0,
        exp: info.exp,
        level: info.level,
        isMe: true,
        isSpeed: false,
      },
    };
  }
  const soulConfig = configMap('FishSoulConfig');
  const infos = [],escapes=[],items=[];
  let gainedExp = 0;
  for (let index = 0; index < count; index += 1) {
    const chosen=gameplay.soulCatch(player);if(chosen.escape!=null){escapes.push(chosen.escape);continue;}
    const id = chosen.id;
    const cfg = obj(soulConfig[id] || soulConfig[String(id)]);
    const multi = chosen.multi;if(chosen.item)items.push(chosen.item);
    infos.push(normalizeFishSoul(info, { id, multi }));
    gainedExp += Math.max(0, int(cfg.exp, 0));
  }
  addFishingExp(info, gainedExp);
  info.catchResult = {
    time: Date.now() + 800,
    infos,
    escapes,
    items,
    sailItems: {},
  };
  const grant=integrity.grant(player,items);
  info.nextSoulCatchAt=Date.now()+gameplay.rules.soul.minIntervalMs;
  const receipt=fishingBalance.record(info,req,{result:0});session.player=player;
  await save(session);
  return [
    buildItemSyncPacket(session.player, FISH_SOUL_BAIT_ITEM_ID, baitCost),
    ...(items.length?[{tag:1202,msgUid:0,data:require('../services/RewardSync').buildRewardItemSync(player,items)}]:[]),...grant.packets,
    { tag: 4060, msgUid, data: { ...receipt, result: 0, catchResult: info.catchResult, escape: 0, exp: info.exp, level: info.level, isMe: true, isSpeed: false } },
  ];
}

async function handleFishSoulDeal(_params, session, msgUid) {
  if (!session?.player) return { tag: 4061, msgUid, data: { result: 1, infos: [], rewards: [] } };
  const info = ensureFishInfo(session.player);
  const caught = arr(info.catchResult?.infos);
  const planned = integrity.clone(info.fishSoulSlots), reserve = integrity.clone(arr(info.fishSoulReserve));
  const pics = integrity.clone(info.fishSoulPic), equipped = [], discovered = [];
  const seen = new Set(Object.values(planned).flat().concat(reserve.map(entry => entry.fish)).map(row => int(row?.uid)));
  const fail = reason => [{ tag: 4061, msgUid, data: { result: 1, reason, infos: [], rewards: [] } }, buildFishSoulCatchResultPush(info.catchResult)];
  for (const raw of caught) {
    const cfg = configMap('FishSoulConfig')[raw.id];
    const slotIndex = cfg?.isUnusual ? int(cfg.index) : 0;
    if (!cfg || !integrity.validInt(raw.uid, 1, Number.MAX_SAFE_INTEGER) || seen.has(Number(raw.uid))
        || !integrity.validInt(raw.multi, 1, Number.MAX_SAFE_INTEGER)
        || Number(raw.type) !== cfg.type || Number(raw.slotIndex) !== slotIndex) return fail('FISH_SOUL_DATA_INVALID');
    seen.add(Number(raw.uid));
    const row = integrity.clone(raw);
    const key = String(row.type);
    const slots = arr(planned[key]);
    const index = slots.findIndex(item => int(item?.slotIndex) === slotIndex);
    const old = slots[index];
    // Exact native checkIsPowerUp: quality first, then multi. Never overwrite a locked soul.
    const better = !old || (!old.lock && (row.quality > old.quality || (row.quality === old.quality && row.multi > old.multi)));
    if (better) {
      if (old) reserve.push({ fish: integrity.clone(old), reason: 'replaced', replacedBy: row.uid, time: Date.now() });
      if (index < 0) slots.push(row); else slots[index] = row;
      planned[key] = slots;
      equipped.push(row);
    } else reserve.push({ fish: row, reason: old?.lock ? 'locked-slot' : 'not-stronger', time: Date.now() });
    const pic = obj(pics[row.id]);
    pics[row.id] = { id: row.id, multi: Math.max(int(pic.multi), row.multi), reward: int(pic.reward), time: Date.now() };
    discovered.push(row);
  }
  // Bounded Mongo document size, without dropping old reserve entries to make room.
  if (reserve.length > 4096) return fail('FISH_SOUL_RESERVE_FULL');
  info.fishSoulSlots = planned;
  info.fishSoulReserve = reserve;
  info.fishSoulPic = pics;
  info.catchResult = normalizeCatchResult(info.catchResult);
  info.catchResult.time = 0;
  info.catchResult.infos = [];
  await save(session);
  return [
    { tag: 4061, msgUid, data: { result: 0, infos: equipped, discovered, pics, rewards: [],
      reserveCount: reserve.length, catchResult: info.catchResult } },
    buildFishSoulCatchResultPush(info.catchResult),
  ];
}

async function handleFishSoulIllus(_params, session, msgUid) {
  const info = ensureFishInfo(session.player);
  const soulConfig = configMap('FishSoulConfig');
  const ids = Object.keys(obj(info.fishSoulPic)).map((key) => int(key, 0)).filter((id) => (
    id > 0
    && !!(soulConfig[id] || soulConfig[String(id)])
    && int(info.fishSoulPic[id].reward, 0) === 0
  ));
  ids.forEach((id) => { info.fishSoulPic[id].reward = 1; });
  const rewardMap = new Map();
  ids.forEach((id) => {
    const row = obj(soulConfig[id] || soulConfig[String(id)]);
    arr(row.atlasReward).forEach((reward) => {
      const rewardId = Math.max(0, int(reward && reward.id, 0));
      const count = Math.max(0, int(reward && reward.count, 0));
      if (rewardId <= 0 || count <= 0) return;
      rewardMap.set(rewardId, (rewardMap.get(rewardId) || 0) + count);
    });
  });
  const reward = Array.from(rewardMap.entries()).map(([id, count]) => ({ id, count }));
  const rewardInfo = buildRewardInfo(session.player, reward);
  await save(session);
  return { tag: 4062, msgUid, data: { ids, rewards: rewardInfo.items } };
}

async function handleFishSoulOpenBox(params, session, msgUid) {
  if (!session?.player) return { tag: 4063, msgUid, data: { result: 1, reason: 'FISH_SESSION_REQUIRED' } };
  const player = session.player, info = ensureFishInfo(player);
  const itemId = params?.itemId, count = params?.count;
  const fail = reason => ({ tag: 4063, msgUid, data: { result: 1, reason,
    balanceRevision: info.balanceRevision || 0, rewardInfo: { items: [], equips: [] } } });
  if (!Number.isSafeInteger(itemId) || !Number.isSafeInteger(count) || count < 1
      || count > fishingBalance.rules.boxes.maxPerRequest || !fishingBalance.rules.boxes.pools[itemId]) return fail('FISH_BOX_INVALID');
  const req = fishingBalance.request(info, params, 'soul-box', `${itemId}:${count}`);
  if (req.error) return fail(req.error);
  if (req.receipt) return [fishingBalance.syncCounts(player, [itemId, ...req.receipt.response.rewardInfo.items.map(r => r.id)]),
    { tag: 4063, msgUid, data: { ...req.receipt.response, replayed: true, balanceRevision: info.balanceRevision || 0 } }];
  if (int(player.items?.[itemId]) < count) return fail('FISH_BOX_NOT_ENOUGH');
  let rows;
  try { rows = fishingBalance.rollBoxes(itemId, count); }
  catch (_) { return fail('FISH_BALANCE_CONFIG_INVALID'); }
  const next = integrity.clone(player);
  consumeItem(next, itemId, count);
  let granted;
  try { granted = integrity.grant(next, rows); }
  catch (_) { return fail('FISH_BOX_REWARD_UNAVAILABLE'); }
  const data = fishingBalance.record(next.fishInfo, req, { result: 0, itemId, count, rewardInfo: granted.rewardInfo });
  session.player = next;
  await save(session);
  return [{ tag: 1202, msgUid: 0, data: { result: 0,
    items: [{ id: itemId, count: -count }, ...granted.itemDeltas],
    changed: [{ id: itemId, count: int(next.items[itemId]) }, ...granted.changed] } },
    ...granted.packets, { tag: 4063, msgUid, data }];
}

module.exports = {
  buildFishSoulCatchResultPush,
  handleRefreshSkill,
  handleReplaceSkill,
  handleFishSoulFishing,
  handleFishSoulDeal,
  handleFishSoulIllus,
  handleFishSoulOpenBox,
};
