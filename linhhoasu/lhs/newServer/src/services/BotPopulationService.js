/**
 * BotPopulationService
 *
 * Server-native virtual population for normal maps. Bots are display-only
 * actors kept in memory; they never become Account/Session/Player records.
 */

const crypto = require('crypto');
const configService = require('./ConfigService');
const battleService = require('./BattleService');
const arenaReadModel = require('./ArenaReadModelService');
const preparedNames = require('./PreparedNameService');
const preparedChat = require('./PreparedChatService');
const logger = require('../logger');
const {
  buildDefaultFashionMap,
  normalizeShowInfo,
} = require('./RoleAppearanceService');

const DEFAULT_MAP_IDS = [10001];
const DEFAULT_CHAT_LINES = [
  'Có ai đang làm nhiệm vụ ở khu này không?',
  'Chúc mọi người chơi vui nhé!',
  'Mình vừa tới bản đồ này.',
  'Hôm nay server khá nhộn nhịp.',
  'Có đội nào còn chỗ không?',
  'Mình đi dạo một vòng rồi quay lại.',
];
const SPREAD_OFFSETS = [
  { x: 0, y: 0 },
  { x: -320, y: -180 },
  { x: 320, y: -180 },
  { x: -320, y: 180 },
  { x: 320, y: 180 },
  { x: 0, y: -360 },
  { x: 0, y: 360 },
];

function parseFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function readPositiveInt(value, fallback, min = 1) {
  const number = toSafeInt(value, fallback);
  return number >= min ? number : fallback;
}

function parseIdList(value, fallback = []) {
  const parsed = String(value ?? '')
    .split(',')
    .map((entry) => toSafeInt(entry.trim(), 0))
    .filter((id) => id > 0);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback.slice();
}

function isAllMapSelection(value) {
  return String(value ?? '').trim().toLowerCase() === 'all';
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function lookup(table, id) {
  const source = ensureObject(table);
  return source[id] || source[String(id)] || null;
}

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return { ...ensureObject(value) };
  }
}

function randomInt(min, max) {
  const safeMin = Math.max(0, toSafeInt(min, 0));
  const safeMax = Math.max(safeMin, toSafeInt(max, safeMin));
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function buildBotChatDbid(botId) {
  // The native chat parser treats every non-24-character dbid as a built-in
  // MessageAppearanceConfig robot and ignores summary.name. A stable 96-bit
  // hex alias keeps virtual bots in the normal-player rendering branch while
  // their map entity id remains unchanged.
  return crypto.createHash('sha256').update(String(botId || ''), 'utf8').digest('hex').slice(0, 24);
}

function rowsFromTable(table) {
  return Object.keys(ensureObject(table))
    .map((key) => lookup(table, key))
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .sort((left, right) => toSafeInt(left.id, 0) - toSafeInt(right.id, 0));
}

function buildFashionMap(robotShow = []) {
  const fashionConfig = ensureObject(configService.get('FashionConfig'));
  const fashionMap = {};
  ensureArray(robotShow).forEach((fashionIdRaw) => {
    const fashionId = Math.max(0, toSafeInt(fashionIdRaw, 0));
    const row = ensureObject(lookup(fashionConfig, fashionId));
    const type = Math.max(0, toSafeInt(row.type, 0));
    if (fashionId > 0 && type > 0) fashionMap[String(type)] = fashionId;
  });
  return fashionMap;
}

function resolveLanguageText(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) return raw;
  const language = ensureObject(configService.get('LanguageConfig'));
  const row = ensureObject(lookup(language, toSafeInt(raw, 0)));
  return String(row.vi || row.vn || row.cn || row.tw || row.en || fallback);
}

function getMapPoints(mapId) {
  const mapConfig = ensureObject(configService.get('MapConfig'));
  const row = ensureObject(lookup(mapConfig, mapId));
  return ensureArray(row.bornPoints)
    .map((point) => ({
      x: toSafeInt(point && point.x, 0),
      y: toSafeInt(point && point.y, 0),
    }))
    .filter((point) => point.x > 0 && point.y > 0);
}

function buildSpreadPoint(points = [], baseIndex = 0, spreadLayer = 0) {
  const rows = ensureArray(points);
  const base = rows.length > 0
    ? rows[Math.abs(toSafeInt(baseIndex, 0)) % rows.length]
    : { x: 1029, y: 1374 };
  const offset = SPREAD_OFFSETS[Math.abs(toSafeInt(spreadLayer, 0)) % SPREAD_OFFSETS.length];
  return {
    x: toSafeInt(base && base.x, 1029) + offset.x,
    y: toSafeInt(base && base.y, 1374) + offset.y,
  };
}

class BotPopulationService {
  constructor(options = {}) {
    const hasOption = (key) => Object.prototype.hasOwnProperty.call(options, key);
    this.enabled = hasOption('enabled')
      ? parseFlag(options.enabled, false)
      : parseFlag(process.env.BOT_ENABLED, false);
    this.chatEnabled = hasOption('chatEnabled')
      ? parseFlag(options.chatEnabled, false)
      : parseFlag(process.env.BOT_CHAT_ENABLED, false);
    this.conversationManaged = hasOption('conversationManaged')
      ? parseFlag(options.conversationManaged, false)
      : parseFlag(process.env.BOT_AI_CHAT_ENABLED, false);
    this.chatScope = String(
      hasOption('chatScope') ? options.chatScope : (process.env.BOT_CHAT_SCOPE || 'world')
    ).trim().toLowerCase() === 'map' ? 'map' : 'world';
    const mapSelection = hasOption('mapIds') ? options.mapIds : process.env.BOT_MAP_IDS;
    this.allMaps = isAllMapSelection(mapSelection);
    this.mapIds = this.allMaps
      ? []
      : parseIdList(mapSelection, DEFAULT_MAP_IDS);
    this.line = Math.max(
      0,
      toSafeInt(hasOption('line') ? options.line : process.env.BOT_MAP_LINE, 0)
    );
    this.countPerMap = readPositiveInt(
      hasOption('countPerMap') ? options.countPerMap : process.env.BOT_COUNT_PER_MAP,
      5,
      1
    );
    this.maxTotal = readPositiveInt(
      hasOption('maxTotal') ? options.maxTotal : process.env.BOT_MAX_TOTAL,
      20,
      1
    );
    this.moveIntervalMs = Math.max(
      5000,
      readPositiveInt(
        hasOption('moveIntervalMs') ? options.moveIntervalMs : process.env.BOT_MOVE_INTERVAL_MS,
        10000,
        5000
      )
    );
    this.chatMinIntervalMs = Math.max(
      60000,
      readPositiveInt(
        hasOption('chatMinIntervalMs')
          ? options.chatMinIntervalMs
          : process.env.BOT_CHAT_INTERVAL_MIN_MS,
        60000,
        60000
      )
    );
    this.chatMaxIntervalMs = Math.max(
      this.chatMinIntervalMs,
      readPositiveInt(
        hasOption('chatMaxIntervalMs')
          ? options.chatMaxIntervalMs
          : process.env.BOT_CHAT_INTERVAL_MAX_MS,
        180000,
        this.chatMinIntervalMs
      )
    );
    this.namePrefix = String(
      hasOption('namePrefix') ? options.namePrefix : (process.env.BOT_NAME_PREFIX || 'Hành giả')
    ).trim() || 'Hành giả';
    this.chatLines = ensureArray(options.chatLines).length > 0
      ? options.chatLines.map(String).filter(Boolean)
      : DEFAULT_CHAT_LINES.slice();
    this.wsServer = null;
    this.timer = null;
    this.bots = [];
    this.movePacketsSent = 0;
    this.chatPacketsSent = 0;
    this.chatFailures = 0;
    this.lastMoveAt = 0;
    this.lastChatAt = 0;
  }

  start(wsServer) {
    if (this.timer || !this.enabled) return this.getStats();
    this.wsServer = wsServer || null;
    this._buildBots();
    if (this.bots.length <= 0) {
      logger.warn('[Bots] enabled but no valid type-1 map/bot profile was found');
      return this.getStats();
    }
    this.timer = setInterval(() => this._tick(), this.moveIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    logger.warn(
      `[Bots] virtual population enabled bots=${this.bots.length} `
      + `maps=${this.mapIds.join(',')} line=${this.line} `
      + `chat=${this.chatEnabled ? this.chatScope : 'off'}`
    );
    return this.getStats();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wsServer = null;
    this.bots = [];
  }

  getStats() {
    return {
      enabled: this.enabled,
      chatEnabled: this.chatEnabled,
      conversationManaged: this.conversationManaged,
      legacyRandomChatActive: this.chatEnabled && !this.conversationManaged,
      chatScope: this.chatScope,
      botCount: this.bots.length,
      mapIds: this.mapIds.slice(),
      line: this.line,
      movePacketsSent: this.movePacketsSent,
      chatPacketsSent: this.chatPacketsSent,
      chatFailures: this.chatFailures,
      lastMoveAt: this.lastMoveAt,
      lastChatAt: this.lastChatAt,
      preparedNameCount: preparedNames.getStats().names,
      preparedChatCharacterCount: preparedChat.getStats().characterCount,
      preparedChatPhraseCount: preparedChat.getStats().phraseCount,
    };
  }

  getVisiblePlayers(mapId, line = 0) {
    if (!this.enabled) return [];
    const safeMapId = Math.max(0, toSafeInt(mapId, 0));
    const safeLine = Math.max(0, toSafeInt(line, 0));
    return this.bots
      .filter((bot) => bot.mapId === safeMapId && bot.line === safeLine)
      .map((bot) => clonePlain(bot.mapPlayer));
  }

  getBotPlayer(playerId) {
    const target = String(playerId || '').trim();
    if (!target) return null;
    const bot = this.bots.find((entry) => (
      entry.id === target || String(entry.player && entry.player._id || '') === target
    ));
    return bot ? clonePlain(bot.player) : null;
  }

  isBotId(playerId) {
    const target = String(playerId || '').trim();
    return !!target && this.bots.some((bot) => (
      bot.id === target || String(bot.player && bot.player._id || '') === target
    ));
  }

  getChatSpeakers(mapId, line = 0) {
    const safeMapId = Math.max(0, toSafeInt(mapId, 0));
    const safeLine = Math.max(0, toSafeInt(line, 0));
    return this.bots
      .filter((bot) => bot.mapId === safeMapId && bot.line === safeLine)
      .map((bot) => ({
        id: bot.id,
        dbid: String(bot.player && bot.player._id || ''),
        name: String(bot.player && bot.player.name || ''),
        level: Math.max(1, toSafeInt(bot.player && bot.player.level, 1)),
        mapId: bot.mapId,
        line: bot.line,
      }));
  }

  sendChatAs(botId, content, options = {}) {
    const target = String(botId || '').trim();
    const phrase = String(content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!target || !phrase || !this.wsServer) return { sent: 0, reason: 'invalid' };
    const bot = this.bots.find((entry) => entry.id === target);
    if (!bot) return { sent: 0, reason: 'not_found' };
    try {
      // Lazy require avoids making chat.js part of the service load cycle.
      const chat = require('../handlers/chat');
      const entry = chat.buildChatEntry({ content: phrase, channel: 0, msgType: 0 }, bot.player, {
        sys: false,
        reply: options.reply || null,
      });
      const sent = this.wsServer.broadcastMap(bot.mapId, bot.line, 1601, {
        channel: 0,
        data: entry,
      });
      if (sent > 0) {
        this.chatPacketsSent += sent;
        this.lastChatAt = Date.now();
        logger.info(
          `[Bots] chat bot=${bot.id} scope=map source=${String(options.source || 'legacy')} recipients=${sent}`,
        );
      }
      return { sent, entry, bot: { id: bot.id, name: bot.player.name, mapId: bot.mapId, line: bot.line } };
    } catch (err) {
      this.chatFailures += 1;
      logger.warn(`[Bots] chat failed bot=${bot.id}: ${err.message}`);
      return { sent: 0, reason: 'error' };
    }
  }

  _buildBots() {
    this.bots = [];
    this.movePacketsSent = 0;
    this.chatPacketsSent = 0;
    this.chatFailures = 0;
    this.lastMoveAt = 0;
    this.lastChatAt = 0;
    const mapConfig = ensureObject(configService.get('MapConfig'));
    const appearanceRows = rowsFromTable(configService.get('RobotAppearanceConfig'));
    const attrRows = rowsFromTable(configService.get('RobotAttrsConfig'));
    const configuredMapIds = this.allMaps
      ? Object.keys(mapConfig)
        .map((key) => Math.max(0, toSafeInt(key, 0)))
        .filter((id) => id > 0 && toSafeInt(lookup(mapConfig, id).type, 0) === 1)
        .sort((left, right) => left - right)
      : this.mapIds.slice();
    this.mapIds = Array.from(new Set(configuredMapIds));
    let ordinal = 0;

    for (const mapId of configuredMapIds) {
      if (this.bots.length >= this.maxTotal) break;
      const mapRow = ensureObject(lookup(mapConfig, mapId));
      if (toSafeInt(mapRow.type, 0) !== 1) {
        logger.warn(`[Bots] skip map=${mapId}: only MapConfig.type=1 is allowed`);
        continue;
      }
      const points = getMapPoints(mapId);
      for (let index = 0; index < this.countPerMap && this.bots.length < this.maxTotal; index += 1) {
        const pointCount = Math.max(1, points.length);
        const point = buildSpreadPoint(points, index % pointCount, Math.floor(index / pointCount));
        const bot = this._makeBot(mapId, index, ordinal, point, appearanceRows, attrRows, points);
        this.bots.push(bot);
        ordinal += 1;
      }
    }
  }

  _makeBot(mapId, index, ordinal, point, appearanceRows, attrRows, points) {
    const appearance = ensureObject(appearanceRows.length > 0
      ? appearanceRows[ordinal % appearanceRows.length]
      : {});
    const attr = ensureObject(attrRows.length > 0 ? attrRows[ordinal % attrRows.length] : {});
    const id = `bot_map_${mapId}_${index + 1}`;
    const level = Math.max(1, toSafeInt(attr.robotLv, 1 + (ordinal % 20)));
    const roleInfo = {
      kungfuId: Math.max(1, toSafeInt(appearance.job, 4)),
      subJob: Math.max(0, toSafeInt(appearance.subJob, 0)),
      stage: Math.max(1, Math.floor(level / 10) + 1),
    };
    const robotShow = ensureArray(appearance.robotShow);
    const fashionMap = buildFashionMap(robotShow);
    if (Object.keys(fashionMap).length <= 0) {
      Object.assign(fashionMap, buildDefaultFashionMap(roleInfo));
    }
    const attrs = ensureObject(attr.robotAttrs);
    let power = Math.max(0, toSafeInt(attr.combatPower, 0));
    let powerScore = power;
    if (Object.keys(attrs).length > 0) {
      try {
        power = Math.max(0, toSafeInt(arenaReadModel.displayPower(attrs), 0));
        powerScore = Math.max(0, toSafeInt(battleService.calcPowerScore(attrs), 0));
      } catch (_err) {
        power = Math.max(0, level * 100);
        powerScore = power;
      }
    }
    if (power <= 0) power = Math.max(100, level * 100);

    const name = preparedNames.getNameByIndex(ordinal) || resolveLanguageText(
      appearance.name,
      `${this.namePrefix} ${index + 1}`
    );
    const serverId = Math.max(1, toSafeInt(process.env.SERVER_ID, 1001));
    const serverName = String(process.env.SERVER_NAME || '').trim();
    const fightPet = ensureArray(attr.fightPet);
    const petId = Math.max(0, toSafeInt(fightPet[0], 0));
    const fashionIds = Object.values(fashionMap).map((id) => Math.max(0, toSafeInt(id, 0))).filter((id) => id > 0);
    const player = {
      _id: buildBotChatDbid(id),
      _bot: true,
      isBot: true,
      userId: id,
      playerId: id,
      name,
      level,
      power,
      powerScore,
      serverId,
      serverName,
      avatar: Math.max(0, toSafeInt(appearance.robotHead, toSafeInt(fashionMap['102'], 11305))),
      avatarFrame: -1,
      title: -1,
      roleInfo,
      fashionInfo: {
        curFashion: { ...fashionMap },
        fashion: { ...fashionMap },
        fashionMap: { ...fashionMap },
        fashions: Object.fromEntries(fashionIds.map((idValue) => [String(idValue), 1])),
        activateFashion: fashionIds,
      },
      items: {},
      currencies: {},
      petInfo: petId > 0 ? { pets: [{ id: petId, slot: -1 }] } : {},
    };
    const showInfo = normalizeShowInfo({
      dbid: id,
      serverId,
      serverName,
      kungfuId: roleInfo.kungfuId,
      subJob: roleInfo.subJob,
      level,
      name,
      power,
      stage: roleInfo.stage,
      petId,
      petSoulId: -1,
      artifactId: 0,
      fate: 0,
      foreverCard: 0,
      equipMap: {},
      fashionMap,
      avatar: player.avatar,
      avatarFrame: -1,
      title: -1,
    });
    const mapPlayer = {
      id,
      x: toSafeInt(point.x, 1029),
      y: toSafeInt(point.y, 1374),
      speedUp: 0,
      bloodPer: 10000,
      pkValue: 0,
      showInfo,
      playerId: id,
      name,
      level,
      avatar: player.avatar,
      avatarFrame: -1,
      title: -1,
    };
    return {
      id,
      mapId,
      line: this.line,
      points,
      spreadLayer: Math.floor(index / Math.max(1, points.length)),
      waypointIndex: points.length > 0 ? (index + 1) % points.length : 0,
      x: mapPlayer.x,
      y: mapPlayer.y,
      nextMoveAt: Date.now() + randomInt(this.moveIntervalMs, this.moveIntervalMs * 2),
      nextChatAt: Date.now() + randomInt(this.chatMinIntervalMs, this.chatMaxIntervalMs),
      player,
      mapPlayer,
    };
  }

  _tick() {
    if (!this.enabled || !this.wsServer || this.bots.length <= 0) return;
    const now = Date.now();
    for (const bot of this.bots) {
      const hasObservers = typeof this.wsServer.hasMapObservers === 'function'
        ? this.wsServer.hasMapObservers(bot.mapId, bot.line)
        : (typeof this.wsServer.hasRealPlayersOnMap === 'function'
          && this.wsServer.hasRealPlayersOnMap(bot.mapId, bot.line));
      if (!hasObservers) {
        continue;
      }

      if (now >= bot.nextMoveAt) {
        this._advance(bot);
        const sent = this.wsServer.broadcastMap(bot.mapId, bot.line, 1403, {
          id: bot.id,
          mapId: bot.mapId,
          type: 0,
          x: bot.x,
          y: bot.y,
        });
        this.movePacketsSent += Math.max(0, toSafeInt(sent, 0));
        if (sent > 0) this.lastMoveAt = now;
        bot.nextMoveAt = now + randomInt(this.moveIntervalMs, this.moveIntervalMs * 2);
      }

      if (this.chatEnabled && !this.conversationManaged && now >= bot.nextChatAt) {
        this._chat(bot);
        bot.nextChatAt = now + randomInt(this.chatMinIntervalMs, this.chatMaxIntervalMs);
      }
    }
  }

  _advance(bot) {
    if (bot.points.length > 0) {
      const point = buildSpreadPoint(bot.points, bot.waypointIndex, bot.spreadLayer);
      bot.waypointIndex = (bot.waypointIndex + 1) % bot.points.length;
      bot.x = toSafeInt(point.x, bot.x);
      bot.y = toSafeInt(point.y, bot.y);
    } else {
      bot.x += randomInt(-80, 80);
      bot.y += randomInt(-80, 80);
    }
    bot.mapPlayer.x = bot.x;
    bot.mapPlayer.y = bot.y;
  }

  _chat(bot) {
    const characterLines = preparedChat.getPhrasesForName(bot.player && bot.player.name);
    const pool = characterLines.length > 0 ? characterLines : this.chatLines;
    const phrase = pool[randomInt(0, pool.length - 1)];
    if (!phrase) return;
    try {
      if (this.chatScope === 'map') {
        return this.sendChatAs(bot.id, phrase, { source: 'legacy' }).sent > 0;
      } else {
        // Lazy require avoids making chat.js part of the service load cycle.
        const chat = require('../handlers/chat');
        const entry = chat.buildChatEntry({ content: phrase, channel: 0, msgType: 0 }, bot.player, {
          sys: false,
        });
        chat.pushChatEntry(0, entry);
        this.chatPacketsSent += 1;
        this.lastChatAt = Date.now();
        logger.info(`[Bots] chat bot=${bot.id} scope=world`);
        return true;
      }
    } catch (err) {
      this.chatFailures += 1;
      logger.warn(`[Bots] chat failed bot=${bot.id}: ${err.message}`);
    }
    return false;
  }
}

const singleton = new BotPopulationService();

module.exports = singleton;
module.exports.BotPopulationService = BotPopulationService;
module.exports.buildBotChatDbid = buildBotChatDbid;
module.exports.parseFlag = parseFlag;
module.exports.parseIdList = parseIdList;
