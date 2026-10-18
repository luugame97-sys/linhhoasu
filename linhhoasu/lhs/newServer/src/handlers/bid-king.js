/** Bid King / treasure collection protocol (7300-7307, 7350-7353, 7454-7455, 7471-7475). */

const playerService = require('../services/PlayerService');
const configService = require('../services/ConfigService');
const { addRewardToPlayer } = require('./raid');

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

function cfg(name) {
  const value = configService.get(name);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstId(name, fallback) {
  return Object.keys(cfg(name)).map((key) => int(key, 0)).filter((id) => id > 0).sort((a, b) => a - b)[0] || fallback;
}

function costItemId() {
  return Math.max(1, int(cfg('BidKingBaseConfig').costItemId, 339));
}

function itemCount(player, id) {
  return Math.max(0, int(player && player.items && player.items[id], 0));
}

function consumeItem(player, id, count) {
  const safeId = Math.max(1, int(id, 0));
  const safeCount = Math.max(0, int(count, 0));
  if (safeCount <= 0) return true;
  if (itemCount(player, safeId) < safeCount) return false;
  player.items = obj(player.items);
  const left = itemCount(player, safeId) - safeCount;
  if (left > 0) player.items[safeId] = left;
  else delete player.items[safeId];
  return true;
}

function actorId(session) {
  return String(session && session.player && (session.player.playerId || session.userId) || '').trim();
}

function roomPlayer(info, dbid) {
  return arr(info && info.roomInfo && info.roomInfo.players).find((row) => String(row && row.dbid) === String(dbid));
}

function applyRobotBids(room, round) {
  const robotBids = obj(cfg('BidKingBaseConfig').robotFirstBid);
  const safeRound = Math.max(1, Math.min(2, int(round, 1)));
  arr(room && room.players).forEach((player, index) => {
    if (index <= 0) return;
    const row = arr(robotBids[String(index)] || robotBids[index]);
    const bid = Math.max(0, int(row[safeRound - 1], int(row[0], 0)));
    player.bids = arr(player.bids);
    if (player.bids[safeRound - 1] == null) player.bids[safeRound - 1] = bid;
    player.currentBid = Math.max(0, int(player.bids[safeRound - 1], bid));
    player.status = 1;
  });
}

function normalizeRoom(info, session) {
  const room = obj(info.roomInfo);
  if (!info.roomInfo) return null;
  room.arch = Math.max(1, int(room.arch, 1));
  room.map = Math.max(1, int(room.map, 1));
  room.status = Math.max(0, int(room.status, 0));
  room.round = Math.max(0, Math.min(2, int(room.round, 0)));
  room.nextTime = Math.max(Date.now(), int(room.nextTime, Date.now() + 3000));
  room.effects = arr(room.effects);
  room.roundBids = obj(room.roundBids);
  room.roomKey = String(room.roomKey || `${Date.now()}_${actorId(session)}`);
  const players = arr(room.players).slice(0, 4);
  while (players.length < 4) players.push(buildPlayer(session, players.length, players.length === 0 ? 1 : 1));
  players.forEach((row, index) => {
    row.dbid = index === 0 ? actorId(session) : String(index);
    row.id = row.dbid;
    row.bids = arr(row.bids);
    row.usedItem = obj(row.usedItem);
    row.currentBid = int(row.currentBid, -1);
    row.status = Math.max(0, int(row.status, 0));
  });
  room.players = players;
  info.roomInfo = room;
  return room;
}

function rewardInfo(player, rows = []) {
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

function ensureInfo(player) {
  player.other_attr_info = obj(player.other_attr_info);
  const info = player.other_attr_info.bidKingInfo = obj(player.other_attr_info.bidKingInfo);
  info.relief = Math.max(0, int(info.relief, 1));
  info.characters = arr(info.characters).map((v) => int(v, 0)).filter((v) => v > 0);
  if (info.characters.length === 0) info.characters.push(firstId('BidKingCharacterConfig', 1));
  info.sets = arr(info.sets).map((row) => ({ id: Math.max(1, int(row && row.id, 1)), chara: Math.max(0, int(row && row.chara, info.characters[0])), items: arr(row && row.items).map((v) => int(v, -1)) }));
  while (info.sets.length < 3) info.sets.push({ id: info.sets.length + 1, chara: info.characters[0], items: [] });
  info.collectionLevel = Math.max(1, int(info.collectionLevel, 1));
  info.treasureUidSeq = Math.max(1, int(info.treasureUidSeq, Date.now() % 100000000));
  info.treasureInfos = arr(info.treasureInfos).map((row) => normalizeTreasure(row));
  info.tempList = arr(info.tempList).map((row) => normalizeTreasure({ ...row, slot: 1 }));
  info.saleList = arr(info.saleList);
  info.selfOnSaleList = arr(info.selfOnSaleList);
  info.nextRefreshTime = Math.max(0, int(info.nextRefreshTime, 0));
  info.exchangeLogs = arr(info.exchangeLogs);
  info.nextExchangeRefreshTime = Math.max(0, int(info.nextExchangeRefreshTime, 0));
  info.coolDownTime = Math.max(0, int(info.coolDownTime, 0));
  info.exchangeDailyTime = Math.max(0, int(info.exchangeDailyTime, 0));
  info.illusRewardList = arr(info.illusRewardList).map((v) => int(v, 0)).filter((v) => v > 0);
  // Client BidKingModel.isCanGetIllusReward reads the claimed-character
  // ledger separately from pending item reward IDs. Keep the field additive
  // and never alias illusRewardList: the two arrays have different contracts.
  info.characterReward = arr(info.characterReward).map((v) => int(v, 0)).filter((v) => v > 0);
  info.bidKingReceipts = arr(info.bidKingReceipts).slice(-32);
  if (info.roomInfo) normalizeRoom(info, { player: player, userId: player.userId });
  return info;
}

function normalizeTreasure(row = {}) {
  const source = obj(row);
  const treasureConfig = cfg('BidKingTreasureConfig');
  const fallbackId = firstId('BidKingTreasureConfig', 1);
  const requestedId = Math.max(0, int(source.id, 0));
  const id = treasureConfig[requestedId] || treasureConfig[String(requestedId)] ? requestedId : fallbackId;
  const treasureRow = obj(treasureConfig[id] || treasureConfig[String(id)]);
  return {
    uid: Math.max(1, int(source.uid, 1)),
    id,
    slot: Math.max(1, int(source.slot, 2)),
    x: Math.max(0, int(source.x, int(source.col, 0))),
    y: Math.max(0, int(source.y, int(source.row, 0))),
    row: Math.max(1, int(source.row, 1)),
    col: Math.max(1, int(source.col, 1)),
    stack: Math.max(1, int(source.stack, 1)),
    quality: Math.max(1, int(treasureRow.quality, int(source.quality, 1))),
    saleLock: int(source.saleLock, 0) ? 1 : 0,
  };
}

function buildPlayer(session, index, chara = 1) {
  const player = session.player;
  const dbid = String(player.playerId || session.userId || '');
  return {
    // The native controller updates robot rows using literal ids "1", "2", "3".
    dbid: index === 0 ? dbid : String(index),
    id: index === 0 ? dbid : String(index),
    name: index === 0 ? (player.name || 'Player') : `灵舟道友${index}`,
    chara,
    status: 0,
    bids: [],
    currentBid: -1,
    items: [],
    usedItem: {},
  };
}

function buildRoom(session, params = {}) {
  const arch = Math.max(1, int(params.arch, 1));
  const map = Math.max(1, int(params.map, 1));
  const base = cfg('BidKingBaseConfig');
  const robotCharacters = arr(base.robotCharacter);
  return {
    arch,
    map,
    status: 0,
    // Native Bf.onUpdate starts round 1 when round=0 reaches nextTime.
    round: 0,
    nextTime: Date.now() + 3000,
    roomKey: `${Date.now()}_${actorId(session)}`,
    maxHeight: Math.max(1, int(base.maxRowAuction, 35)),
    valueDiff: 0,
    returnValue: 0,
    roundBids: {},
    players: [
      buildPlayer(session, 0, Math.max(1, int(params.chara, 1))),
      buildPlayer(session, 1, int(robotCharacters[0], 1)),
      buildPlayer(session, 2, int(robotCharacters[1], 1)),
      buildPlayer(session, 3, int(robotCharacters[2], 1)),
    ],
    effects: [],
  };
}

function buildPayload(info) {
  return {
    ...info,
    characters: info.characters.slice(),
    characterReward: info.characterReward.slice(),
    sets: JSON.parse(JSON.stringify(info.sets)),
    treasureInfos: JSON.parse(JSON.stringify(info.treasureInfos)),
    tempList: JSON.parse(JSON.stringify(info.tempList)),
    saleList: JSON.parse(JSON.stringify(info.saleList)),
    selfOnSaleList: JSON.parse(JSON.stringify(info.selfOnSaleList)),
    exchangeLogs: JSON.parse(JSON.stringify(info.exchangeLogs)),
  };
}

async function save(session) {
  if (session && session.userId && session.player) await playerService.savePlayer(session.userId, session.player);
}

async function handleClaimRelief(_params, session, msgUid) {
  const info = ensureInfo(session.player);
  const rewards = info.relief > 0 ? rewardInfo(session.player, [{ id: 339, count: info.relief * 100 }]) : rewardInfo(session.player, []);
  info.relief = 0;
  await save(session);
  return { tag: 7300, msgUid, data: { ...buildPayload(info), relief: info.relief, rewards } };
}

async function handleSet(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const id = Math.max(1, int(params && params.id, 1));
  const chara = Math.max(0, int(params && params.chara, 0));
  const unlockPush = [];
  if (chara > 0 && !info.characters.includes(chara)) {
    const characterConfig = cfg('BidKingCharacterConfig');
    const character = obj(characterConfig[chara] || characterConfig[String(chara)]);
    // Characters without a shop entry are intrinsic/always-unlocked. Keep the
    // persistent list in sync when the client selects one for the first time.
    if (Object.keys(character).length > 0 && character.shop == null) {
      info.characters.push(chara);
      unlockPush.push({ tag: 7301, msgUid: 0, data: { characterId: chara } });
    }
  }
  let set = info.sets.find((row) => row.id === id);
  if (!set) { set = { id, chara: 0, items: [] }; info.sets.push(set); }
  set.chara = params && params.chara != null
    ? chara
    : Math.max(0, int(set.chara, 0));
  set.items = arr(params && params.items).map((v) => int(v, -1));
  await save(session);
  const response = { tag: 7301, msgUid, data: { set } };
  return unlockPush.length > 0 ? [...unlockPush, response] : response;
}

async function handleMatch(params, session, msgUid) {
  const info = ensureInfo(session.player);
  if (info.roomInfo) return { tag: 7302, msgUid, data: { roomInfo: normalizeRoom(info, session) } };
  info.roomInfo = buildRoom(session, params);
  await save(session);
  return { tag: 7302, msgUid, data: { roomInfo: info.roomInfo } };
}

async function handleUseItem(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const room = normalizeRoom(info, session);
  if (!room) return { tag: 7303, msgUid, data: { result: 1, code: 'BIDKING_ROOM_REQUIRED', retryable: false } };
  const itemId = Math.max(1, int(params && params.itemId, 0));
  if (itemCount(session.player, itemId) <= 0) return { tag: 7303, msgUid, data: { result: 1, code: 'BIDKING_ITEM_NOT_ENOUGH', retryable: false } };
  const dbid = actorId(session), self = roomPlayer(info, dbid), round = Math.max(1, Math.min(2, int(params && params.round, room.round || 1)));
  if (self && self.usedItem && self.usedItem[round]) {
    const previous = arr(room.effects).find((row) => String(row && row.dbid) === dbid && int(row.round, 0) === round && int(row.type, 0) === 1);
    return { tag: 7303, msgUid, data: { effect: previous || {}, playerUpdate: { dbid, round, item: int(self.usedItem[round], 0), usedItem: self.usedItem } } };
  }
  if (!consumeItem(session.player, itemId, 1)) return { tag: 7303, msgUid, data: { result: 1, code: 'BIDKING_ITEM_NOT_ENOUGH', retryable: false } };
  const effect = { round, type: 1, source: itemId, effectId: itemId, itemId, count: 0, treasure: [], conditions: [], result: [], resultValue: [], dbid };
  room.effects = arr(room.effects).concat([effect]);
  if (self) {
    self.usedItem = obj(self.usedItem);
    self.usedItem[round] = itemId;
  }
  await save(session);
  return { tag: 7303, msgUid, data: { effect, playerUpdate: { dbid, round, item: itemId, usedItem: self ? self.usedItem : {} } } };
}

async function handleBid(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const bid = Math.max(0, int(params && params.bid, 0));
  const room = normalizeRoom(info, session);
  const actor = actorId(session);
  if (!room) return { tag: 7304, msgUid, data: { result: 1, code: 'BIDKING_ROOM_REQUIRED', retryable: false } };
  if (bid <= 0) return { tag: 7304, msgUid, data: { result: 1, code: 'BIDKING_BID_INVALID', retryable: false } };
  const self = roomPlayer(info, actor);
  if (!self) return { tag: 7304, msgUid, data: { result: 1, code: 'BIDKING_PLAYER_NOT_IN_ROOM', retryable: false } };
  const round = Math.max(1, Math.min(2, int(params && params.round, room.round || 1)));
  const key = `${actor}:${round}`;
  if (Object.prototype.hasOwnProperty.call(room.roundBids, key)) {
    return { tag: 7304, msgUid, data: { playerUpdate: { dbid: actor, round, currentBid: room.roundBids[key], status: 1 } } };
  }
  if (itemCount(session.player, costItemId()) < bid) return { tag: 7304, msgUid, data: { result: 1, code: 'BIDKING_COST_NOT_ENOUGH', retryable: false } };
  room.round = Math.max(room.round, round);
  room.status = 1;
  room.roundBids[key] = bid;
  self.currentBid = bid;
  self.status = 1;
  self.bids = arr(self.bids);
  self.bids[round - 1] = bid;
  await save(session);
  return { tag: 7304, msgUid, data: { playerUpdate: { dbid: actor, round, currentBid: bid, status: 1 } } };
}

async function handleFinish(params, session, msgUid) {
  if (!session || !session.player) {
    return { tag: 7305, msgUid, data: { result: -1 } };
  }
  const info = ensureInfo(session.player);
  const roomInfo = normalizeRoom(info, session);
  if (!roomInfo) {
    const receipt = arr(info.bidKingReceipts).at(-1);
    return receipt ? [{ tag: 7305, msgUid: 0, data: receipt.endData }, { tag: 7305, msgUid, data: { result: 0 } }] : { tag: 7305, msgUid, data: { result: 1, code: 'BIDKING_ROOM_REQUIRED', retryable: false } };
  }
  const players = arr(roomInfo.players);
  const requestedRound = Math.max(1, Math.min(2, int(params && params.round, roomInfo.round || 1)));
  applyRobotBids(roomInfo, requestedRound);
  const winnerRow = players.slice().sort((a, b) => int(b && b.bids && b.bids[requestedRound - 1], int(b && b.currentBid, 0)) - int(a && a.bids && a.bids[requestedRound - 1], int(a && a.currentBid, 0)))[0] || {};
  const winner = String(winnerRow.dbid || session.player.playerId || session.userId || '');
  const lastBid = Math.max(0, int(winnerRow.bids && winnerRow.bids[requestedRound - 1], int(winnerRow.currentBid, 0)));
  if (lastBid <= 0) return { tag: 7305, msgUid, data: { result: 1, code: 'BIDKING_NOT_FINISHED', retryable: true } };
  if (winner === actorId(session) && !consumeItem(session.player, costItemId(), lastBid)) return { tag: 7305, msgUid, data: { result: 1, code: 'BIDKING_COST_NOT_ENOUGH', retryable: false } };
  const treasureConfig = cfg('BidKingTreasureConfig');
  const treasureIds = Object.keys(treasureConfig).map((key) => int(key, 0)).filter((id) => id > 0).sort((a, b) => a - b);
  const settled = treasureIds.slice(0, 3).map((id, index) => normalizeTreasure({
    uid: info.treasureUidSeq + index,
    id,
    x: index,
    y: 0,
    row: 1,
    col: index + 1,
    slot: 1,
  }));
  info.treasureUidSeq += settled.length;
  const wonTreasureInfos = winner === String(session.player.playerId || session.userId || '')
    ? settled.map((row) => ({ ...row, slot: 2 }))
    : [];
  info.treasureInfos.push(...wonTreasureInfos);
  info.tempList = settled.map((row) => ({ ...row, slot: 1 }));
  const endData = {
    winner,
    lastBid,
    maxHeight: Math.max(0, int(roomInfo.maxHeight, settled.length)),
    valueDiff: Math.max(0, int(roomInfo.valueDiff, 0)),
    returnValue: Math.max(0, int(roomInfo.returnValue, 0)),
    treasures: JSON.parse(JSON.stringify(settled)),
    treasureInfos: JSON.parse(JSON.stringify(wonTreasureInfos)),
    tempList: JSON.parse(JSON.stringify(info.tempList)),
  };
  info.roomInfo = null;
  info.bidKingReceipts.push({ key: String(roomInfo.roomKey), winner, lastBid, endData });
  info.bidKingReceipts = info.bidKingReceipts.slice(-32);
  await save(session);
  const packets = [
    {
      tag: 7302,
      msgUid: 0,
      data: {
        tempList: JSON.parse(JSON.stringify(info.tempList)),
        treasureList: JSON.parse(JSON.stringify(wonTreasureInfos)),
      },
    },
    { tag: 7305, msgUid: 0, data: endData },
    { tag: 7305, msgUid, data: { result: 0 } },
  ];
  const oldTrekInfo = obj(session.player.other_attr_info && session.player.other_attr_info.oldTrekInfo);
  const skill = Math.max(0, int(oldTrekInfo.skillId, 0));
  if (skill > 0) packets.splice(1, 0, { tag: 7306, msgUid: 0, data: { skill } });
  return packets;
}

async function handleRank(params, session, msgUid) {
  const info = ensureInfo(session.player);
  return { tag: 7306, msgUid, data: { type: int(params && params.type, 0), rankList: [], selfRank: 0, collectionLevel: info.collectionLevel } };
}

async function handleCollectionUpgrade(params, session, msgUid) {
  const info = ensureInfo(session.player);
  info.collectionLevel = Math.max(info.collectionLevel, int(params && params.level, info.collectionLevel + 1));
  await save(session);
  return { tag: 7307, msgUid, data: { level: info.collectionLevel } };
}

async function handleTreasureMove(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const updates = arr(params && params.od).map((row) => obj(row)).map((row) => normalizeTreasure(row));
  updates.forEach((update) => {
    const index = info.treasureInfos.findIndex((row) => row.uid === update.uid);
    if (index >= 0) info.treasureInfos[index] = { ...info.treasureInfos[index], ...update };
  });
  await save(session);
  return { tag: 7350, msgUid, data: { result: 0, treasureInfos: updates } };
}

async function handleTreasureSet(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const updates = arr(params && params.setList).map((row) => normalizeTreasure(row));
  updates.forEach((update) => {
    const index = info.treasureInfos.findIndex((row) => row.uid === update.uid);
    if (index >= 0) info.treasureInfos[index] = { ...info.treasureInfos[index], ...update };
  });
  await save(session);
  return { tag: 7351, msgUid, data: { treasureUpdates: updates } };
}

async function handleSaleTreasure(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const uids = arr(params && params.uid).map((v) => int(v, 0)).filter((v) => v > 0);
  info.treasureInfos = info.treasureInfos.filter((row) => !uids.includes(row.uid));
  const rewards = rewardInfo(session.player, [{ id: 339, count: uids.length * 10 }]);
  await save(session);
  return { tag: 7352, msgUid, data: { result: 0, uid: uids, rewards } };
}

async function handleIllusReward(_params, session, msgUid) {
  const info = ensureInfo(session.player);
  const rewardList = info.illusRewardList.length > 0 ? info.illusRewardList.splice(0) : [];
  const rewards = rewardInfo(session.player, rewardList.map((id) => ({ id, count: 1 })));
  await save(session);
  return { tag: 7353, msgUid, data: { rewardList, rewards } };
}

async function handleCollectionShow(params, session, msgUid) {
  const info = ensureInfo(session.player);
  return { tag: 7454, msgUid, data: { playerId: String((params && params.playerId) || session.player.playerId || ''), collectionLevel: info.collectionLevel, treasureInfos: info.treasureInfos } };
}

async function handleTreasureClaimTemp(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const uid = Math.max(0, int(params && params.uid, 0));
  const claimed = uid > 0 ? info.tempList.filter((row) => row.uid === uid) : info.tempList.slice();
  info.tempList = uid > 0 ? info.tempList.filter((row) => row.uid !== uid) : [];
  info.treasureInfos.push(...claimed.map((row) => ({ ...row, slot: 2 })));
  await save(session);
  return { tag: 7455, msgUid, data: { treasures: claimed, tempList: info.tempList } };
}

async function handleSaleList(params, session, msgUid) {
  const info = ensureInfo(session.player);
  if (info.nextExchangeRefreshTime <= Date.now()) info.nextExchangeRefreshTime = Date.now() + 60000;
  return { tag: 7471, msgUid, data: { saleList: info.saleList, nextRefreshTime: info.nextExchangeRefreshTime } };
}

async function handleOnSale(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const uid = Math.max(0, int(params && params.uid, 0));
  const treasure = info.treasureInfos.find((row) => row.uid === uid);
  if (!treasure) return { tag: 7472, msgUid, data: { coolDownTime: info.coolDownTime, treasureData: {} } };
  const row = { eUid: `${uid}_${Date.now()}`, uid, id: treasure.id, price: Math.max(1, int(params && params.price, 1)), count: treasure.stack || 1, state: 1 };
  info.selfOnSaleList.push(row);
  info.treasureInfos = info.treasureInfos.filter((item) => item.uid !== uid);
  info.exchangeDailyTime += 1;
  info.coolDownTime = Date.now() + 5000;
  await save(session);
  return { tag: 7472, msgUid, data: { coolDownTime: info.coolDownTime, treasureData: row } };
}

async function handleOffSale(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const eUid = String((params && params.eUid) || '');
  const row = info.selfOnSaleList.find((item) => String(item.eUid) === eUid);
  info.selfOnSaleList = info.selfOnSaleList.filter((item) => String(item.eUid) !== eUid);
  const rewardInfo = row ? rewardInfoForOffSale(session.player, row) : { items: [], equips: [], heros: [] };
  await save(session);
  return { tag: 7473, msgUid, data: { eUid, rewardInfo } };
}

function rewardInfoForOffSale(player, row) {
  return rewardInfo(player, [{ id: 339, count: Math.max(1, int(row.price, 1)) }]);
}

async function handleBuy(params, session, msgUid) {
  const info = ensureInfo(session.player);
  const id = String((params && params.id) || '');
  const price = Math.max(0, int(params && params.price, 0));
  const row = info.saleList.find((item) => String(item.id) === id);
  if (!row) return { tag: 7474, msgUid, data: { result: 1, price, saleList: info.saleList } };
  info.saleList = info.saleList.filter((item) => String(item.id) !== id);
  const rewards = rewardInfo(session.player, [{ id: row.id, count: Math.max(1, int(row.count, 1)) }]);
  await save(session);
  return { tag: 7474, msgUid, data: { result: 0, price: row.price, rewards, saleList: info.saleList, log: { id: row.id, price: row.price, time: Date.now() } } };
}

async function handleSaleTreasureListUpdate(params, session, msgUid) {
  const info = ensureInfo(session.player);
  info.nextRefreshTime = Date.now() + 60000;
  return { tag: 7475, msgUid, data: { nextRefreshTime: info.nextRefreshTime, id: int(params && params.id, 0) } };
}

function buildBidKingPayload(player) {
  return buildPayload(ensureInfo(player));
}

module.exports = {
  ensureBidKingInfo: ensureInfo,
  buildBidKingPayload,
  handleClaimRelief,
  handleSet,
  handleMatch,
  handleUseItem,
  handleBid,
  handleFinish,
  handleRank,
  handleCollectionUpgrade,
  handleTreasureMove,
  handleTreasureSet,
  handleSaleTreasure,
  handleIllusReward,
  handleCollectionShow,
  handleTreasureClaimTemp,
  handleSaleList,
  handleOnSale,
  handleOffSale,
  handleBuy,
  handleSaleTreasureListUpdate,
};
