/**
 * Application entry:
 * MongoDB + Redis + handlers + (optional) WS + (optional) HTTP.
 */

const path = require('path');
const nodeCrypto = require('crypto');

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto = nodeCrypto.webcrypto;
}

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongo = require('./db/mongo');
const redis = require('./db/redis');
const WSServer = require('./net/WSServer');
const HTTPServer = require('./net/HTTPServer');
const handlers = require('./handlers');
const ConfigService = require('./services/ConfigService');
const tagMetrics = require('./services/TagMetricsService');
const arenaSettlement = require('./services/ArenaSettlementService');
const rankService = require('./services/RankService');
const Player = require('./db/models/Player');
const ArenaFightLog = require('./db/models/ArenaFightLog');
const logger = require('./logger');
  const runtimeConfig = require('./runtimeConfig');
const runtimeBus = require('./services/RuntimeBus');
const chatBus = require('./services/ChatBus');
const publicNotification = require('./services/PublicNotificationService');
const auctionService = require('./services/AuctionService');

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const WS_PORT = parsePort(process.env.WS_PORT, 9200);
const HTTP_PORT = parsePort(process.env.HTTP_PORT, 18080);
const AGENT_HTTP_PORT = parsePort(process.env.AGENT_HTTP_PORT, 8081);
const SERVER_ID = parsePort(process.env.SERVER_ID, 1001);
const SERVER_NAME = process.env.SERVER_NAME || 'default-server';
const WS_TLS_KEY = process.env.WS_TLS_KEY || '/etc/ssl/private/lhs.key';
const WS_TLS_CERT = process.env.WS_TLS_CERT || '/etc/ssl/certs/lhs.crt';

async function start() {
  runtimeConfig.validateProductionConfig();
  logger.info(`[App] starting... (${SERVER_NAME} #${SERVER_ID})`);

  // 1. Infrastructure connections.
  await mongo.connect();
  redis.connect();

  // 2. Runtime init.
  ConfigService.loadAllTables();
  await require('./services/ServerConfigService').initializeServerConfigs();
  if (String(process.env.ARENA_RANK_REBUILD_ON_START || '1') !== '0') {
    await rankService.rebuildArenaFromMongo(Player).then((result) => {
      logger.info(`[Arena] rank rebuild count=${result.count} ok=${result.ok}`);
    }).catch((err) => {
      logger.warn(`[Arena] rank rebuild skipped: ${err.message}`);
    });
  }
  handlers.registerAll();

  // Start the global chat bus before any settlement scheduler. Settlement
  // jobs run once immediately on boot; starting them first could consume a
  // rank window while Redis chat was still unavailable and lose its notice.
  try {
    const chatHandler = require('./handlers/chat');
    await chatBus.start(chatHandler.handleChatBusEntry);
  } catch (err) {
    logger.warn(`[App] chat bus start failed: ${err.message}`);
  }

  // New page-1 servers (S4/S5 and future S6+) must not silently inherit the
  // launch template's disabled Arena payout flags. Their activation is tied
  // to the durable server opening time, so a restart cannot move the first
  // payout window forward and silently skip a cutoff.
  const autoCompetitionServer = SERVER_ID >= 1001 && SERVER_ID <= 1099;
  if (autoCompetitionServer
    && (String(process.env.ARENA_SETTLEMENT_ENABLED || '') !== '1'
      || String(process.env.ARENA_SETTLEMENT_APPROVED || '') !== '1')) {
    const openedAt = Number(process.env.SERVER_OPEN_TIME) || 0;
    const configuredAt = Number(process.env.COMPETITION_REWARD_ACTIVATION_AT)
      || Number(process.env.ARENA_SETTLEMENT_ACTIVATION_AT) || 0;
    if (openedAt || configuredAt) {
      process.env.ARENA_SETTLEMENT_ENABLED = '1';
      process.env.ARENA_SETTLEMENT_APPROVED = '1';
      process.env.ARENA_SETTLEMENT_ACTIVATION_AT = String(openedAt || configuredAt);
      logger.info(`[Competition] auto-enabled Arena payout for page-1 server ${SERVER_ID} from ${process.env.ARENA_SETTLEMENT_ACTIVATION_AT}`);
    } else {
      logger.warn(`[Competition] Arena payout remains disabled for page-1 server ${SERVER_ID}: missing durable open/activation time`);
    }
  }
  // Settlement consumes a server-side snapshot provider. It never reads the
  // live Redis ZSET directly, so the feature can remain disabled until an
  // operator explicitly approves the activation flags.
  const arenaSettlementScheduler = arenaSettlement.startArenaSettlementScheduler({
    serverId: SERVER_ID,
    snapshotProvider: async ({ serverId, cutoffAt }) => {
      const [rows, futureLogs] = await Promise.all([
        Player.find({
        arenaScore: { $exists: true },
        isBot: { $ne: true },
        managedBot: { $ne: true },
        $or: [{ createdAt: { $lte: new Date(cutoffAt) } }, { createdAt: { $exists: false }, createTime: { $lte: cutoffAt } }],
        }).select({ userId: 1, playerId: 1, name: 1, arenaScore: 1, arenaReceiptLedger: 1, arenaLogOutbox: 1, _id: 0 })
          .maxTimeMS(5000).lean(),
        ArenaFightLog.find({ serverId, createdAt: { $gt: new Date(cutoffAt) } })
          .select({ fightId: 1, attackerId: 1, targetPlayerId: 1, targetId: 1, scoreChange: 1,
            targetScoreChange: 1, zeroSumVersion: 1, createdAt: 1, _id: 0 })
          .sort({ createdAt: -1 }).maxTimeMS(5000).lean(),
      ]);
      const reverse = new Map();
      const committed = new Map(futureLogs.map(log => [String(log.fightId), log]));
      for (const player of rows) {
        for (const entry of player.arenaReceiptLedger || []) {
          if (entry.fightId && entry.createdAt > cutoffAt) committed.set(String(entry.fightId), {
            attackerId: player.playerId,
            targetPlayerId: entry.targetPlayerId || entry.targetId || entry.targetScore?.targetPlayerId,
            scoreChange: entry.scorechange,
            targetScoreChange: entry.targetScoreChange ?? entry.targetScore?.scoreChange,
            zeroSumVersion: entry.zeroSumVersion || (entry.targetScore ? 1 : 0),
            createdAt: new Date(entry.createdAt),
          });
        }
        for (const log of player.arenaLogOutbox || []) {
          if (log.fightId && new Date(log.createdAt).getTime() > cutoffAt) committed.set(String(log.fightId), log);
        }
      }
      committed.forEach((log) => {
        const id = String(log.attackerId || '');
        if (!id) return;
        reverse.set(id, (reverse.get(id) || 0) + (Number(log.scoreChange) || 0));
        if (Number(log.zeroSumVersion) === 1 && log.targetPlayerId) {
          const targetDelta = Number.isFinite(Number(log.targetScoreChange))
            ? Number(log.targetScoreChange) : -(Number(log.scoreChange) || 0);
          const targetId = String(log.targetPlayerId);
          reverse.set(targetId, (reverse.get(targetId) || 0) + targetDelta);
        }
      });
      const projected = rows.map((row) => ({
        playerId: String(row.playerId),
        userId: String(row.userId),
        name: String(row.name || ''),
        score: Math.max(0, (Number(row.arenaScore) || 0) - (reverse.get(String(row.playerId)) || 0)),
      })).sort((a, b) => b.score - a.score || b.playerId.localeCompare(a.playerId));
      return {
        cutoffAt,
        complete: true,
        rows: projected.map((row, index) => ({
          playerId: row.playerId,
          userId: row.userId,
          name: row.name,
          rank: index + 1,
          score: row.score,
          serverId,
        })),
      };
    },
    logger,
    publicNotify: publicNotification.announceRank,
  });
  const eventRewardSettlement = require('./services/EventRewardSettlementService').createService({
    serverId: SERVER_ID,
    enabled: String(process.env.EVENT_SETTLEMENT_ENABLED || '0') === '1',
    activationAt: parsePort(process.env.EVENT_SETTLEMENT_ACTIVATION_AT,
      require('./config/eventRewardSettlement.json').activationAt),
    pushMail: (userId, mailDoc) => {
      const ws = runtimeBus.getWsServer();
      if (ws) ws.pushToUser(userId, 1102, { result: 0,
        mailData: require('./handlers/mail').toClientMail(mailDoc) });
    },
    publicNotify: publicNotification.announceRank,
  }).start();
  const crossEventSettlement = String(process.env.CROSS_EVENT_ENABLED || '0') === '1'
    ? require('./services/CrossEventSettlementService') : null;
  let crossEventTimer = null;
  const topArenaTimer = require('./services/TopArenaService').start();
  if (crossEventSettlement) {
    crossEventTimer = crossEventSettlement.createService({ serverId: SERVER_ID, config: ConfigService, logger, publicNotify: publicNotification.announceRank }).start();
  }
  const oldTrekSettlement = require('./services/OldTrekSettlementService').createService({
    serverId: SERVER_ID,
    enabled: process.env.OLD_TREK_SETTLEMENT_ENABLED === '1',
    activationAt: Number(process.env.OLD_TREK_SETTLEMENT_ACTIVATION_AT || 0),
    pushMail: (userId, mailDoc) => {
      const ws = runtimeBus.getWsServer();
      if (ws) ws.pushToUser(userId, 1102, { result: 0, mailData: require('./handlers/mail').toClientMail(mailDoc) });
    },
  }).start();

  // 3. Start WS/HTTP by role.
  let wsServer = null;
  let httpServer = null;
  let agentHttpServer = null;
  let auctionScheduler = null;

  if (WS_PORT > 0) {
    const wsBehindProxy = String(process.env.WS_BEHIND_PROXY || '').toLowerCase() === '1'
      || String(process.env.WS_BEHIND_PROXY || '').toLowerCase() === 'true';
    const wsHost = process.env.WS_HOST || (wsBehindProxy ? '127.0.0.1' : '0.0.0.0');
    const wsOpts = { port: WS_PORT, host: wsHost };
    if (!wsBehindProxy) {
      wsOpts.tls = { key: WS_TLS_KEY, cert: WS_TLS_CERT };
    }
    wsServer = new WSServer(wsOpts);
    await wsServer.start();
    runtimeBus.setWsServer(wsServer);
  } else {
    logger.warn('[App] WS disabled because WS_PORT <= 0');
    runtimeBus.setWsServer(null);
  }

  if (HTTP_PORT > 0) {
    httpServer = new HTTPServer({ port: HTTP_PORT });
    const serverList = require('./handlers/serverList');
    serverList.register(httpServer);
    // Wire WSServer so admin endpoints can push live updates to online players
    if (wsServer) httpServer.setWsServer(wsServer);
    await httpServer.start();
  } else {
    logger.warn('[App] HTTP disabled because HTTP_PORT <= 0');
  }

  if (AGENT_HTTP_PORT > 0) {
    agentHttpServer = new HTTPServer({
      port: AGENT_HTTP_PORT,
      portalType: 'agent',
      clientDir: path.join(__dirname, '..', '..', 'LHS-agent-portal'),
      defaultStaticPage: 'agent-users.html',
    });
    const serverList = require('./handlers/serverList');
    serverList.register(agentHttpServer);
    if (wsServer) agentHttpServer.setWsServer(wsServer);
    await agentHttpServer.start();
  } else {
    logger.info('[App] 内置代理 HTTP 已禁用（分销后台由 lhs-dist:3001 提供）');
  }

  if (!wsServer && !httpServer && !agentHttpServer) {
    throw new Error('WS/HTTP/AGENT_HTTP are all disabled. Set at least one port > 0');
  }

  auctionScheduler = auctionService.startScheduler({ serverId: SERVER_ID });

  logger.info(
    `[App] started: ${SERVER_NAME} #${SERVER_ID}`
      + `${wsServer ? ` WS:${WS_PORT}` : ''}`
      + `${httpServer ? ` HTTP:${HTTP_PORT}` : ''}`
      + `${agentHttpServer ? ` AGENT_HTTP:${AGENT_HTTP_PORT}` : ''}`
  );

  const shutdown = async (signal) => {
    logger.info(`[App] received ${signal}, shutting down...`);
    try {
      if (eventRewardSettlement && typeof eventRewardSettlement.stop === 'function') {
        await eventRewardSettlement.stop();
      }
      await oldTrekSettlement.stop();
      if (crossEventTimer) crossEventTimer.stop();
      if (wsServer) await wsServer.stop();
      runtimeBus.setWsServer(null);
      await chatBus.stop();
      if (arenaSettlementScheduler && typeof arenaSettlementScheduler.stop === 'function') {
        arenaSettlementScheduler.stop();
      }
      if (auctionScheduler && typeof auctionScheduler.stop === 'function') {
        auctionScheduler.stop();
      }
      if (httpServer) await httpServer.stop();
      if (agentHttpServer) await agentHttpServer.stop();
    } catch (err) {
      logger.error(`[App] stop server failed: ${err.message}`);
    }

    try {
      const result = tagMetrics.writeDailyReport();
      if (result.enabled) {
        logger.info(`[Metrics] tag metrics written: ${result.filePath}`);
      }
    } catch (err) {
      logger.warn(`[Metrics] write tag metrics failed: ${err.message}`);
    }

    await redis.disconnect();
    await mongo.disconnect();
    logger.info('[App] stopped');
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('uncaughtException', (err) => {
    logger.error(`[App] uncaught exception: ${err.message}\n${err.stack}`);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`[App] unhandled rejection: ${reason}`);
  });

  return { wsServer, httpServer, agentHttpServer };
}

if (require.main === module) {
  start().catch((err) => {
    logger.error(`[App] startup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { start, parsePort };
