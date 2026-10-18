const playerService = require('../services/PlayerService');
const messageService = require('../services/MessageService');
const runtimeBus = require('../services/RuntimeBus');
const chatBus = require('../services/ChatBus');
const logger = require('../logger');
const battleService = require('../services/BattleService');
const arenaReadModel = require('../services/ArenaReadModelService');
const botConversation = require('../services/BotConversationService');
const {
  ensureRoleAppearance,
  getPlayerFashionMap,
  getPrimaryBattlePetId,
} = require('../services/RoleAppearanceService');

const CHAT_CHANNEL_WORLD = 0;
const CHAT_CHANNEL_SYSTEM = 1;
const MAX_CHAT_HISTORY = 100;

const historyMap = new Map([
  [CHAT_CHANNEL_WORLD, []],
  [CHAT_CHANNEL_SYSTEM, []],
]);

function toSafeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function ensurePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getDbid(player = {}) {
  if (player && player._id != null) return String(player._id);
  return String((player && (player.playerId || player.userId)) || '');
}

function getPlayerPower(player = {}) {
  try {
    return Math.max(0, toSafeInt(arenaReadModel.displayPower(battleService.calcPlayerPower(player)), 0));
  } catch (_err) {
    const normalized = toSafeInt(player.displayPower, 0);
    if (normalized > 0) return normalized;
    return Math.max(0, toSafeInt(player.power, 0));
  }
}

function getPlayerPowerScore(player = {}) {
  try {
    return Math.max(0, toSafeInt(battleService.calcPowerScore(battleService.calcPlayerPower(player)), 0));
  } catch (_err) {
    return Math.max(0, toSafeInt(player.powerScore, 0));
  }
}

function ensureChannel(channel) {
  const safe = toSafeInt(channel, CHAT_CHANNEL_WORLD);
  if (!historyMap.has(safe)) historyMap.set(safe, []);
  return safe;
}

function pushHistory(channel, row) {
  const safe = ensureChannel(channel);
  const list = historyMap.get(safe);
  list.push(row);
  if (list.length > MAX_CHAT_HISTORY) {
    list.splice(0, list.length - MAX_CHAT_HISTORY);
  }
}

function getHistory(channel, maxCount = 30) {
  const safe = ensureChannel(channel);
  const list = historyMap.get(safe) || [];
  const count = Math.max(1, toSafeInt(maxCount, 30));
  return list.slice(Math.max(0, list.length - count));
}

function buildSummary(player = {}) {
  if (player && typeof player === 'object') {
    try { ensureRoleAppearance(player); } catch (_err) {}
  }
  const roleInfo = ensurePlainObject(player && player.roleInfo);
  const guildInfo = ensurePlainObject(player && player.guildInfo);
  const dbid = getDbid(player);
  const avatar = toSafeInt(roleInfo.avatar, toSafeInt(player.avatar, 0));
  const avatarFrame = toSafeInt(roleInfo.avatarFrame, toSafeInt(player.avatarFrame, 0));
  const title = toSafeInt(roleInfo.title, toSafeInt(player.title, 0));
  const power = getPlayerPower(player);
  const powerScore = getPlayerPowerScore(player);
  const stage = Math.max(1, toSafeInt(roleInfo.stage, toSafeInt(roleInfo.stageId, 1)));
  const fashionMap = getPlayerFashionMap(player);
  return {
    dbid,
    playerId: player.playerId || dbid,
    userId: player.userId || '',
    name: player.name || '',
    avatar,
    avatarFrame,
    level: toSafeInt(player.level, 1),
    avatarUrl: player.avatarUrl || '',
    guildId: toSafeInt(guildInfo.guildId, 0),
    guildName: guildInfo.guildName || guildInfo.name || '',
    power,
    powerScore,
    powerUnit: 'native-weighted-point',
    title,
    serverId: toSafeInt(player.serverId, toSafeInt(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID, 1)),
    serverName: player.serverName || process.env.SERVER_NAME || '',
    kungfuId: toSafeInt(roleInfo.kungfuId, 4),
    subJob: toSafeInt(roleInfo.subJob, 0),
    stage,
    stageId: stage,
    gender: toSafeInt(roleInfo.gender, 0),
    petId: getPrimaryBattlePetId(player),
    petSoulId: -1,
    artifactId: 0,
    fate: 0,
    foreverCard: 0,
    equipMap: ensurePlainObject(player.equipMap),
    fashionMap,
    playerInfo: {
      dbid,
      level: toSafeInt(player.level, 1),
      avatar,
      avatarUrl: player.avatarUrl || '',
      avatarFrame,
      title,
    },
  };
}

function toJsonChatContent(params = {}) {
  const raw = params.content != null ? params.content : params.msg;
  const text = raw == null ? '' : String(raw).trim();
  const emoji = toSafeInt(params.emoji, 0);
  if (text.startsWith('{') && text.endsWith('}')) {
    return text;
  }
  if (!text && emoji <= 0) return '';

  const payload = { content: text };
  if (emoji > 0) payload.emoji = emoji;
  return JSON.stringify(payload);
}

function buildChatEntry(params = {}, player = {}, overrides = {}) {
  const content = overrides.content != null ? String(overrides.content) : toJsonChatContent(params);
  return {
    summary: overrides.summary || buildSummary(player),
    content,
    time: overrides.time != null ? toSafeInt(overrides.time, Date.now()) : Date.now(),
    sys: !!overrides.sys,
    chatFrame: toSafeInt(
      overrides.chatFrame != null ? overrides.chatFrame : params.chatFrame,
      overrides.sys ? 0 : -1,
    ),
    msgType: toSafeInt(overrides.msgType != null ? overrides.msgType : params.msgType, 0),
    reply: overrides.reply != null ? overrides.reply : (params.reply || null),
    reportId: overrides.reportId != null ? overrides.reportId : (params.reportId || ''),
  };
}

function buildChatInitPacket(channel, msgUid = 0, maxCount = 30) {
  return {
    tag: 1600,
    msgUid,
    data: {
      channel: ensureChannel(channel),
      list: getHistory(channel, maxCount),
      sysList: [],
    },
  };
}

async function buildChatInitPacketAsync(channel, msgUid = 0, maxCount = 30) {
  const safeChannel = ensureChannel(channel);
  const count = Math.max(1, toSafeInt(maxCount, 30));
  let list = getHistory(safeChannel, count).filter((row) => !row.sys);
  let sysList = [];
  try {
    if (chatBus.isReady()) {
      list = (await chatBus.getHistory(safeChannel, count)).filter((row) => !row.sys);
      const systemRows = [];
      for (const systemChannel of [0, 1]) {
        systemRows.push(...await chatBus.getHistory(systemChannel, count));
      }
      sysList = systemRows.filter((row) => row.sys).slice(-count);
    }
  } catch (err) {
    logger.warn(`[Chat] history read failed: ${err.message}`);
  }
  return {
    tag: 1600,
    msgUid,
    data: { channel: safeChannel, list, sysList },
  };
}

function buildWorldChatPushPacket(channel, entry, msgUid = 0) {
  return {
    tag: 1601,
    msgUid,
    data: {
      channel,
      data: entry,
    },
  };
}

function pushWorldChat(channel, entry) {
  const wsServer = runtimeBus.getWsServer();
  if (wsServer && typeof wsServer.broadcast === 'function') {
    wsServer.broadcast(1601, {
      channel,
      data: entry,
    });
  }
}

function pushChatEntry(channel, entry, options = {}) {
  if (!entry || !entry.content) return;
  pushHistory(channel, entry);
  if (options.broadcast !== false) {
    pushWorldChat(channel, entry);
  }
}

async function publishChatEntry(channel, entry, options = {}) {
  if (!entry || !entry.content) return null;
  return chatBus.publish(channel, entry, options);
}

function handleChatBusEntry(envelope) {
  if (!envelope || !envelope.entry) return;
  pushChatEntry(envelope.channel, envelope.entry, { broadcast: true });
}

async function handleSendChat(params, session, msgUid, options = {}) {
  const player = session && session.player ? session.player : {};
  const adminStatus = player && player.adminStatus && typeof player.adminStatus === 'object' ? player.adminStatus : {};
  if (adminStatus.muted) {
    const muteUntil = toSafeInt(adminStatus.muteUntil, 0);
    if (muteUntil <= 0 || muteUntil > Date.now()) {
      return {
        tag: 1600,
        msgUid,
        data: {
          result: 2,
          channel: ensureChannel(params && params.channel),
          msg: adminStatus.muteReason || "Tài khoản hiện tại đã bị cấm ngôn",
        },
      };
    }
    adminStatus.muted = false;
    player.adminStatus = adminStatus;
    if (typeof player.markModified === 'function') player.markModified('adminStatus');
  }
  const channel = ensureChannel(params && params.channel);
  if (channel !== 0 && channel !== 1) {
    return { tag: 1600, msgUid, data: { result: 1, code: 'CHAT_CHANNEL_INVALID', channel } };
  }
  const entry = buildChatEntry(params, player, {
    msgType: toSafeInt(params && params.msgType, 0),
    sys: false,
  });

  const bytes = Buffer.byteLength(entry.content, 'utf8');
  if (bytes <= 0 || bytes > 1000) {
    return { tag: 1600, msgUid, data: { result: 1, code: 'CHAT_CONTENT_TOO_LONG', channel } };
  }
  try {
    if (!await chatBus.allow(session && session.userId, channel)) {
      return { tag: 1600, msgUid, data: { result: 1, code: 'CHAT_RATE_LIMITED', channel } };
    }
    await publishChatEntry(channel, entry, { source: session && session._isBot ? 'bot' : 'player' });
  } catch (err) {
    logger.warn(`[Chat] publish failed channel=${channel}: ${err.message}`);
    return { tag: 1600, msgUid, data: { result: 1, code: 'CHAT_BUS_UNAVAILABLE', channel } };
  }

  // Player chat remains authoritative and is delivered immediately. The bot
  // coordinator observes only the public text/map context afterwards; any AI
  // outage must never delay or reject the player's own message.
  if (session && session._isBot !== true && botConversation.isEnabled()) {
    try {
      botConversation.observePlayerMessage(params || {}, session);
    } catch (_err) {}
  }

  return {
    tag: 1600,
    msgUid,
    data: {
      result: 0,
      channel,
    },
  };
}

async function pushSystemBroadcast(content, options = {}) {
  const text = content == null ? '' : String(content).trim();
  if (!text) return null;
  const entry = buildChatEntry({ content: text }, {}, {
    summary: {
      dbid: 'system',
      userId: 0,
      serverId: toSafeInt(process.env.SERVER_ID, 1),
      serverName: process.env.SERVER_NAME || '',
      name: options.name || "Hệ thống",
      avatar: toSafeInt(options.avatar, 0),
      avatarFrame: -1,
      level: 0,
      avatarUrl: '',
      guildId: 0,
      guildName: '',
      power: 0,
      title: 0,
      kungfuId: 0,
      subJob: 0,
    },
    sys: true,
    msgType: toSafeInt(options.msgType, 14),
    chatFrame: toSafeInt(options.chatFrame, 0),
    time: options.time,
    content: options.rawContent ? String(options.rawContent) : text,
  });
  messageService.pushGlobalNotice({
    type: 'broadcast',
    title: options.title || "Hệ thống phát thanh",
    content: text,
    time: entry.time,
  });

  try {
    await publishChatEntry(CHAT_CHANNEL_SYSTEM, entry, { source: 'system' });
    return entry;
  } catch (err) {
    logger.warn(`[Chat] system publish failed: ${err.message}`);
    return null;
  }
}

async function handleWorldChat(params, session, msgUid) {
  const channel = ensureChannel(params && params.channel);
  if ((params && params.content) || (params && params.msg) || (params && params.emoji)) {
    if (session && session._isBot && String(params && params.scope || '').toLowerCase() === 'map') {
      // The centralized coordinator replaces 580 independent phrase timers.
      // Keep the worker ACK contract but suppress its legacy random line so it
      // cannot overlap the contextual player/bot conversation.
      if (botConversation.isEnabled()) {
        return { tag: 1600, msgUid, data: { result: 0, channel } };
      }
      const entry = buildChatEntry(params, session.player || {}, {
        msgType: toSafeInt(params && params.msgType, 0),
        sys: false,
      });
      const wsServer = runtimeBus.getWsServer();
      if (wsServer && typeof wsServer.broadcastMap === 'function') {
        wsServer.broadcastMap(session._mapId, session._mapLine, 1601, {
          channel,
          data: entry,
        });
      }
      return { tag: 1600, msgUid, data: { result: 0, channel } };
    }
    return handleSendChat(params, session, msgUid);
  }
  return buildChatInitPacketAsync(channel, msgUid, params && params.maxCount);
}

async function handleBlockPlayer(params, session, msgUid) {
  const playerId = toSafeInt(params && params.playerId, 0);
  if (playerId <= 0 || !session || !session.player) {
    return { tag: 1601, msgUid, data: { result: 1, code: 'CHAT_BLOCK_PLAYER_INVALID' } };
  }
  const block = params && (params.isBlock === true || Number(params.isBlock) === 1);
  const rows = Array.isArray(session.player.blockList) ? session.player.blockList.map((id) => toSafeInt(id, 0)).filter((id) => id > 0) : [];
  const set = new Set(rows);
  if (block) set.add(playerId); else set.delete(playerId);
  session.player.blockList = Array.from(set);
  try {
    const saved = await playerService.savePlayer(session.userId, session.player, { returnSaved: false, onlyFields: ['blockList'] });
    if (!saved) return { tag: 1601, msgUid, data: { result: 1, code: 'CHAT_BLOCK_SAVE_FAILED', playerId, isBlock: block } };
  } catch (err) {
    logger.warn(`[Chat] block save failed: ${err.message}`);
    return { tag: 1601, msgUid, data: { result: 1, code: 'CHAT_BLOCK_SAVE_FAILED', playerId, isBlock: block } };
  }
  return { tag: 1601, msgUid, data: { result: 0, playerId, isBlock: block } };
}

async function handleGetBlockPlayerList(params, session, msgUid) {
  const ids = Array.isArray(params && params.playerIds) ? params.playerIds : [];
  const infoList = [];

  for (const rawId of ids) {
    const dbid = String(rawId || '').trim();
    if (!dbid) continue;

    let row = null;
    try {
      if (typeof playerService.findByDbidOrPlayerId === 'function') {
        row = await playerService.findByDbidOrPlayerId(dbid);
      } else {
        row = await playerService.findByPlayerId(dbid);
      }
    } catch (_e) {
      row = null;
    }

    if (!row && session && session.player && (
      String(session.player.playerId || '') === dbid || String(session.player._id || '') === dbid
    )) {
      row = session.player;
    }

    infoList.push({ ...buildSummary(row || { playerId: dbid }), dbid });
  }

  return {
    tag: 1602,
    msgUid,
    data: {
      result: 0,
      infoList,
    },
  };
}

module.exports = {
  handleWorldChat,
  handleSendChat,
  handleBlockPlayer,
  handleGetBlockPlayerList,
  buildChatEntry,
  buildChatInitPacket,
  buildWorldChatPushPacket,
  buildSummary,
  pushChatEntry,
  publishChatEntry,
  handleChatBusEntry,
  pushSystemBroadcast,
  pushHistoryEntry: pushHistory,
  getChatHistory: getHistory,
  _debug: {
    historyMap,
    getHistory,
  },
};
