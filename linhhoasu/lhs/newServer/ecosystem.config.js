/**
 * 多大区多进程启动配置
 * 
 * 每个服务器实例独立进程，独立 WS 端口，共享 MongoDB 和 Redis
 * 通过 pm2 ecosystem 管理
 */

module.exports = {
  apps: [
    // ===== 长安一区 (serverId: 1001) =====
    {
      name: 'lhs-s1001',
      script: 'src/app.js',
      cwd: '/linhhoasu/lhs/newServer',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
        WS_PORT: 9200,
        WS_PUBLIC_PORT: 81,
        WS_PUBLIC_PATH: '/ws',
        WS_PUBLIC_PORT_1002: 81,
        WS_PUBLIC_PATH_1002: '/ws-s2',
        WS_PUBLIC_PORT_1003: 81,
        WS_PUBLIC_PATH_1003: '/ws-s3',
        SERVER_NODE_HTTP_MAP: '{"1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084"}',
        SERVER_NODE_HTTP_CMDS: '2818,2819,2820',
        AUTH_REDIS_PREFIX: 's1001:',
        WS_BEHIND_PROXY: 1,
        HTTP_PORT: 8080,   // 只有主进程提供 HTTP（静态文件 + API）
        SERVER_ID: 1001,
        DROP_LEVEL_100_ENABLED: '1',
        DROP_LEVEL_46_ENABLED: '1',
        SERVER_NAME: 'S1',

        ARENA_SETTLEMENT_ENABLED: '1',
        ARENA_SETTLEMENT_APPROVED: '1',
        ARENA_SETTLEMENT_ACTIVATION_AT: 1789318800000,
        EVENT_SETTLEMENT_ENABLED: '1',
        EVENT_SETTLEMENT_ACTIVATION_AT: 1789292110847,
        CROSS_EVENT_ENABLED: '1',
        EVENT_ROTATION_ENABLED: '1',
        EVENT_ROTATION_NATIVE_ENABLED: '1',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s1001',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's1001:',
        API_KEY: '289bdbcffd8dba865cda57e8db55a845f077e57830157c627bc9e30a7f759dde',
        DIST_API_KEY: 'd6936ad9500981db9c987509eb2dbacefd7e395b8afcec602b84e3b3e4cd205f',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'Vanduc00//00//',
		REQUIRE_INVITE_REGISTER: '0',
        BOT_ENABLED: '1',
        BOT_MAP_IDS: 'all',
        BOT_MAP_LINE: 0,
        BOT_COUNT_PER_MAP: 3,
        BOT_MAX_TOTAL: 324,
        BOT_MOVE_INTERVAL_MS: 10000,
        BOT_CHAT_ENABLED: '1',
        BOT_CHAT_SCOPE: 'map',
        BOT_CHAT_INTERVAL_MIN_MS: 240000,
        BOT_CHAT_INTERVAL_MAX_MS: 600000,
        // Central contextual chat. The external provider connector remains
        // off until BOT_AI_CHAT_API_URL / MODEL / API_KEY are configured.
        BOT_AI_CHAT_ENABLED: '1',
        BOT_AI_CHAT_PROVIDER_ENABLED: '0',
        BOT_AI_CHAT_RESPONSE_CHANCE_PERCENT: 75,
        BOT_AI_CHAT_SECOND_BOT_CHANCE_PERCENT: 20,
        BOT_AI_CHAT_LEGACY_QUOTE_CHANCE_PERCENT: 40,
        BOT_AI_CHAT_MAP_COOLDOWN_MS: 20000,
        BOT_AI_CHAT_PLAYER_COOLDOWN_MS: 45000,
        BOT_AI_CHAT_RESPONSE_DELAY_MIN_MS: 1400,
        BOT_AI_CHAT_RESPONSE_DELAY_MAX_MS: 3500,
        BOT_AI_CHAT_AMBIENT_MIN_MS: 60000,
        BOT_AI_CHAT_AMBIENT_MAX_MS: 150000,
        BOT_AI_CHAT_WORLD_AMBIENT_COOLDOWN_MS: 30000,
        BOT_AI_CHAT_MAX_REQUESTS_PER_MINUTE: 8,
        BOT_AI_CHAT_TIMEOUT_MS: 8000,
        BOT_AI_CHAT_MAX_OUTPUT_LENGTH: 120,
        BOT_WORKER_PREMIUM_DROP_QUALITY: 44,
        BOT_WORKER_PREMIUM_SHOW_ITEM_ID: 175,
        BOT_WORKER_FARM_REFILL_AT: 1000,
        BOT_WORKER_FARM_RESERVE: 100000,
        BOT_WORKER_SAVE_CHECKPOINT_MS: 30000,
        USER_CLIENT_VALIDATION_ENABLED: '1',
        SDK_AUTH_PASSWORD_STRICT: '1',
        ALLOW_AUTO_REGISTER: '0',
        AUTH_SESSION_TTL_SEC: 3600,
        CORS_ALLOWED_ORIGINS: '*',
      },
    },
    {
      name: 'lhs-real-bots',
      script: 'src/bots/RealBotWorker.js',
      cwd: '/linhhoasu/lhs/newServer',
      env: {
        NODE_ENV: 'production',
        // Ten managed real bots per normal map. Empty maps use a slow idle
        // pace; maps with human observers wake all ten bots and farm quickly.
        BOT_WORKER_ENABLED: 0,
        BOT_WORKER_COUNT: 0,
        BOT_WORKER_MAP_IDS: 'all',
        BOT_WORKER_MAP_LINE: 0,
        BOT_WORKER_FARM_ENABLED: 1,
        BOT_WORKER_FARM_MIN_MS: 300000,
        BOT_WORKER_FARM_MAX_MS: 600000,
        BOT_WORKER_ACTIVE_FARM_MIN_MS: 4000,
        BOT_WORKER_ACTIVE_FARM_MAX_MS: 6000,
        BOT_WORKER_FARM_SPEED_UP: 1,
        BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9200/bot-activity',
        BOT_WORKER_ACTIVITY_POLL_MS: 5000,
        BOT_WORKER_ACTIVITY_WAKE_BASE_MS: 1000,
        BOT_WORKER_ACTIVITY_WAKE_STEP_MS: 300,
        BOT_WORKER_CONNECT_INTERVAL_MS: 500,
        BOT_WORKER_FARM_COUNT: 1,
        BOT_WORKER_FARM_MOVE_SETTLE_MS: 250,
        BOT_WORKER_FARM_CLAIM_DELAY_MS: 650,
        BOT_WORKER_FARM_CLAIM_TIMEOUT_MS: 12000,
        BOT_WORKER_FARM_RESPAWN_MS: 10000,
        BOT_WORKER_PREMIUM_DROP_QUALITY: 44,
        BOT_WORKER_PREMIUM_SHOW_ITEM_ID: 175,
        BOT_WORKER_FARM_REFILL_AT: 1000,
        BOT_WORKER_FARM_RESERVE: 100000,
        BOT_WORKER_SAVE_CHECKPOINT_MS: 30000,
        BOT_WORKER_FARM_LOG: 1,
        BOT_WORKER_FARM_LOG_SAMPLE_RATE: 10,
      },
    },
    // ===== 长安二区 (serverId: 1002) =====
    {
      name: 'lhs-s1002',
      script: 'src/app.js',
      cwd: '/linhhoasu/lhs/newServer',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
        WS_PORT: 9201,
        WS_PUBLIC_PORT: 81,
        WS_PUBLIC_PATH: '/ws-s2',
        WS_BEHIND_PROXY: 1,
        HTTP_PORT: 8083,    // private canary HTTP; no public Nginx route yet
        LHS_HTTP_HOST: '127.0.0.1',
        AGENT_HTTP_PORT: 0,
        SERVER_ID: 1002,
        DROP_LEVEL_100_ENABLED: '1',
        SERVER_NAME: 'S2',

        ARENA_SETTLEMENT_ENABLED: '1',
        ARENA_SETTLEMENT_APPROVED: '1',
        ARENA_SETTLEMENT_ACTIVATION_AT: 1789318800000,
        EVENT_SETTLEMENT_ENABLED: '1',
        EVENT_SETTLEMENT_ACTIVATION_AT: 1789292110847,
        CROSS_EVENT_ENABLED: '1',
        EVENT_ROTATION_ENABLED: '1',
        EVENT_ROTATION_NATIVE_ENABLED: '1',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s1002',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's1002:',
        AUTH_REDIS_PREFIX: 's1001:',
        IDENTITY_MONGO_DB: 'lhs_s1001',
        BOT_ENABLED: '1',
        BOT_MAP_IDS: 'all',
        BOT_MAP_LINE: 0,
        BOT_COUNT_PER_MAP: 3,
        BOT_MAX_TOTAL: 324,
        BOT_MOVE_INTERVAL_MS: 10000,
        BOT_CHAT_ENABLED: '1',
        BOT_CHAT_SCOPE: 'map',
        BOT_CHAT_INTERVAL_MIN_MS: 240000,
        BOT_CHAT_INTERVAL_MAX_MS: 600000,
        BOT_AI_CHAT_ENABLED: '1',
        BOT_AI_CHAT_PROVIDER_ENABLED: '0',
        BOT_AI_CHAT_RESPONSE_CHANCE_PERCENT: 75,
        BOT_AI_CHAT_SECOND_BOT_CHANCE_PERCENT: 20,
        BOT_AI_CHAT_LEGACY_QUOTE_CHANCE_PERCENT: 40,
        BOT_AI_CHAT_MAP_COOLDOWN_MS: 20000,
        BOT_AI_CHAT_PLAYER_COOLDOWN_MS: 45000,
        BOT_AI_CHAT_RESPONSE_DELAY_MIN_MS: 1400,
        BOT_AI_CHAT_RESPONSE_DELAY_MAX_MS: 3500,
        BOT_AI_CHAT_AMBIENT_MIN_MS: 60000,
        BOT_AI_CHAT_AMBIENT_MAX_MS: 150000,
        BOT_AI_CHAT_WORLD_AMBIENT_COOLDOWN_MS: 30000,
        BOT_AI_CHAT_MAX_REQUESTS_PER_MINUTE: 8,
        BOT_AI_CHAT_TIMEOUT_MS: 8000,
        BOT_AI_CHAT_MAX_OUTPUT_LENGTH: 120,
        API_KEY: '289bdbcffd8dba865cda57e8db55a845f077e57830157c627bc9e30a7f759dde',
        DIST_API_KEY: 'd6936ad9500981db9c987509eb2dbacefd7e395b8afcec602b84e3b3e4cd205f',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: '31afQbdQOr7Z{s?3',
		//REQUIRE_INVITE_REGISTER: 0,
        CORS_ALLOWED_ORIGINS: '*',
      },
    },
    {
      name: 'lhs-real-bots-s2',
      script: 'src/bots/RealBotWorker.js',
      cwd: '/linhhoasu/lhs/newServer',
      env: {
        NODE_ENV: 'production',
        BOT_WORKER_ENABLED: 0,
        BOT_WORKER_COUNT: 0,
        BOT_WORKER_SERVER_ID: 1002,
        BOT_WORKER_WS_URL: 'ws://127.0.0.1:9201',
        BOT_WORKER_MAP_IDS: 'all',
        BOT_WORKER_MAP_LINE: 0,
        BOT_WORKER_FARM_ENABLED: 1,
        BOT_WORKER_FARM_MIN_MS: 300000,
        BOT_WORKER_FARM_MAX_MS: 600000,
        BOT_WORKER_ACTIVE_FARM_MIN_MS: 4000,
        BOT_WORKER_ACTIVE_FARM_MAX_MS: 6000,
        BOT_WORKER_FARM_SPEED_UP: 1,
        BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9201/bot-activity',
        BOT_WORKER_ACTIVITY_POLL_MS: 5000,
        BOT_WORKER_ACTIVITY_WAKE_BASE_MS: 1000,
        BOT_WORKER_ACTIVITY_WAKE_STEP_MS: 300,
        BOT_WORKER_CONNECT_INTERVAL_MS: 500,
        BOT_WORKER_FARM_COUNT: 1,
        BOT_WORKER_FARM_MOVE_SETTLE_MS: 250,
        BOT_WORKER_FARM_CLAIM_DELAY_MS: 650,
        BOT_WORKER_FARM_CLAIM_TIMEOUT_MS: 12000,
        BOT_WORKER_FARM_RESPAWN_MS: 10000,
        BOT_WORKER_PREMIUM_DROP_QUALITY: 44,
        BOT_WORKER_PREMIUM_SHOW_ITEM_ID: 175,
        BOT_WORKER_FARM_REFILL_AT: 1000,
        BOT_WORKER_FARM_RESERVE: 100000,
        BOT_WORKER_SAVE_CHECKPOINT_MS: 30000,
        BOT_WORKER_FARM_LOG: 1,
        BOT_WORKER_FARM_LOG_SAMPLE_RATE: 10,
      },
    },
    /*
    // ===== 苍穹一区 (serverId: 2001) =====
    {
      name: 'lhs-s2001',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9202,
        HTTP_PORT: 0,
        SERVER_ID: 2001,
        SERVER_NAME: '苍穹一区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s2001',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's2001:',
      },
    },
    // ===== 苍穹二区 (serverId: 2002) =====
    {
      name: 'lhs-s2002',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9203,
        HTTP_PORT: 0,
        SERVER_ID: 2002,
        SERVER_NAME: '苍穹二区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s2002',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's2002:',
      },
    },
    // ===== 仙踪一区 (serverId: 3001) =====
    {
      name: 'lhs-s3001',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9204,
        HTTP_PORT: 0,
        SERVER_ID: 3001,
        SERVER_NAME: '仙踪一区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s3001',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's3001:',
      },
    },*/
  ],
};

// S3 shares the current S2 feature configuration, never its gameplay database.
// The server-side access gate opens at 10:00 Vietnam time on 13 September 2026.
const server3OpenTime = 1789268400000;
const server3Template = module.exports.apps.find((app) => app.name === 'lhs-s1002');
const server3BotsTemplate = module.exports.apps.find((app) => app.name === 'lhs-real-bots-s2');
module.exports.apps.push({
  ...server3Template,
  name: 'lhs-s1003',
  env: {
    ...server3Template.env,
    SERVER_ID: 1003,
    BOT_COUNT_PER_MAP: 3,
    BOT_MAX_TOTAL: 324,
    DROP_LEVEL_100_ENABLED: '1',
    SERVER_NAME: 'S3',
    SERVER_OPEN_TIME: server3OpenTime,
    WS_PORT: 9202,
    HTTP_PORT: 8084,
    WS_PUBLIC_PATH: '/ws-s3',
    WS_PUBLIC_PORT_1001: 81,
    WS_PUBLIC_PATH_1001: '/ws',
    WS_PUBLIC_PORT_1002: 81,
    WS_PUBLIC_PATH_1002: '/ws-s2',
    WS_PUBLIC_PORT_1003: 81,
    WS_PUBLIC_PATH_1003: '/ws-s3',
    SERVER_NODE_HTTP_MAP: '{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083"}',
    SERVER_NODE_HTTP_CMDS: '2818,2819,2820',
    MONGO_URI: 'mongodb://localhost:27017/lhs_s1003',
    REDIS_PREFIX: 's1003:',
    AUTH_REDIS_PREFIX: 's1001:',
    IDENTITY_MONGO_DB: 'lhs_s1001',
  },
}, {
  ...server3BotsTemplate,
  name: 'lhs-real-bots-s3',
  script: 'scripts/start-scheduled-bots.js',
  env: {
    ...server3BotsTemplate.env,
    SERVER_OPEN_TIME: server3OpenTime,
    BOT_WORKER_SERVER_ID: 1003,
    BOT_WORKER_ENABLED: 0,
    BOT_WORKER_COUNT: 0,
    BOT_WORKER_WS_URL: 'ws://127.0.0.1:9202',
    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9202/bot-activity',
  },
});

// S4_LAUNCH_20260916: 17:00 Vietnam time; gameplay isolated from S1/S2/S3.
const server4OpenTime = 1789552800000;
for (const app of module.exports.apps.filter(app => /^lhs-s100[123]$/.test(app.name))) {
  app.env.WS_PUBLIC_PORT_1004 = 81;
  app.env.WS_PUBLIC_PATH_1004 = '/ws-s4';
  const routes = JSON.parse(app.env.SERVER_NODE_HTTP_MAP || '{}');
  routes['1004'] = 'http://127.0.0.1:8085';
  app.env.SERVER_NODE_HTTP_MAP = JSON.stringify(routes);
}
const server4Template = module.exports.apps.find(app => app.name === 'lhs-s1003');
const server4BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s3');
module.exports.apps.push({
  ...server4Template,
  name: 'lhs-s1004',
  env: {
    ...server4Template.env,
    SERVER_ID: 1004,
    BOT_COUNT_PER_MAP: 3,
    BOT_MAX_TOTAL: 324,
    DEFAULT_SERVER_ID: 1004,
    SERVER_NAME: 'S4',
    SERVER_OPEN_TIME: server4OpenTime,
    WS_PORT: 9203,
    HTTP_PORT: 8085,
    WS_PUBLIC_PATH: '/ws-s4',
    WS_PUBLIC_PORT_1004: 81,
    WS_PUBLIC_PATH_1004: '/ws-s4',
    SERVER_NODE_HTTP_MAP: '{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084"}',
    MONGO_URI: 'mongodb://localhost:27017/lhs_s1004',
    REDIS_PREFIX: 's1004:',
    IDENTITY_MONGO_DB: 'lhs_s1001',
    AUTH_REDIS_PREFIX: 's1001:',
    // Match S3 effective runtime; do not activate an unreviewed arena payout.
    ARENA_SETTLEMENT_ENABLED: '0',
    ARENA_SETTLEMENT_APPROVED: '0',
    ARENA_SETTLEMENT_ACTIVATION_AT: server4OpenTime,
    EVENT_SETTLEMENT_ACTIVATION_AT: server4OpenTime,
  },
}, {
  ...server4BotTemplate,
  name: 'lhs-real-bots-s4',
  script: 'scripts/start-scheduled-bots-s4.js',
  env: {
    ...server4BotTemplate.env,
    SERVER_OPEN_TIME: server4OpenTime,
    BOT_WORKER_SERVER_ID: 1004,
    BOT_WORKER_ENABLED: 0,
    BOT_WORKER_COUNT: 0,
    BOT_WORKER_WS_URL: 'ws://127.0.0.1:9203',
    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9203/bot-activity',
  },
});
// Synchronized competition release; retain every unrelated per-node setting.
for (const app of module.exports.apps.filter(app => app.script === 'src/app.js')) {
  // Shared system auction: explicitly approved formula catalog, no player
  // consignment/recycle. Keep this flag beside the other release gates so a
  // restart cannot silently run a partially deployed auction backend.
  if (/^lhs-s100[1-8]$/.test(app.name)) {
    app.env.AUCTION_SHARED_ENABLED = '1';
    app.env.AUCTION_SHARED_APPROVED = '1';
    app.env.AUCTION_CATALOG_PATH = '/linhhoasu/lhs/newServer/src/config/auctionCatalog.v1.json';
  }
  // Candidate stays off until native canary is accepted. Set activation once,
  // at release time, without granting historical seasons retroactively.
  app.env.OLD_TREK_EVENT_ENGINE_ENABLED = '1';
  app.env.OLD_TREK_SETTLEMENT_ENABLED = '1';
  app.env.OLD_TREK_SETTLEMENT_ACTIVATION_AT = '1789956000000'; // 21/09/2026 09:00 GMT+7
  app.env.CUSTOM_PVP_FORMULA_ENABLED = '1';
  app.env.ROLE_LEVEL_2000_ENABLED = '1';
}
require('./src/config/competitionsRelease').apply(module.exports.apps);

// S6_LAUNCH_20260927: 10:00 Asia/Bangkok; gameplay isolated from S1-S5.
const server6OpenTime = 1790478000000;
for (const app of module.exports.apps.filter(app => /^lhs-s100[1-5]$/.test(app.name))) {
  app.env.WS_PUBLIC_PORT_1006 = 81;
  app.env.WS_PUBLIC_PATH_1006 = '/ws-s6';
  const routes = JSON.parse(app.env.SERVER_NODE_HTTP_MAP || '{}');
  routes['1006'] = 'http://127.0.0.1:8087';
  app.env.SERVER_NODE_HTTP_MAP = JSON.stringify(routes);
}
const server6Template = module.exports.apps.find(app => app.name === 'lhs-s1004');
const server6BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s4');
if (!server6Template || !server6BotTemplate) throw new Error('S6_TEMPLATES_MISSING');
module.exports.apps.push({
  ...server6Template,
  name: 'lhs-s1006',
  env: {
    ...server6Template.env,
    SERVER_ID: 1006,
    DEFAULT_SERVER_ID: 1006,
    SERVER_NAME: 'S6',
    SERVER_OPEN_TIME: server6OpenTime,
    WS_PORT: 9205,
    HTTP_PORT: 8087,
    WS_PUBLIC_PATH: '/ws-s6',
    WS_PUBLIC_PORT_1006: 81,
    WS_PUBLIC_PATH_1006: '/ws-s6',
    SERVER_NODE_HTTP_MAP: '{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084","1004":"http://127.0.0.1:8085","1005":"http://127.0.0.1:8086"}',
    MONGO_URI: 'mongodb://localhost:27017/lhs_s1006',
    REDIS_PREFIX: 's1006:',
    IDENTITY_MONGO_DB: 'lhs_s1001',
    AUTH_REDIS_PREFIX: 's1001:',
    ARENA_SETTLEMENT_ENABLED: '0',
    ARENA_SETTLEMENT_APPROVED: '0',
    ARENA_SETTLEMENT_ACTIVATION_AT: server6OpenTime,
    EVENT_SETTLEMENT_ACTIVATION_AT: server6OpenTime,
  },
}, {
  ...server6BotTemplate,
  name: 'lhs-real-bots-s6',
  script: 'scripts/start-scheduled-bots-s6.js',
  env: {
    ...server6BotTemplate.env,
    SERVER_OPEN_TIME: server6OpenTime,
    BOT_WORKER_SERVER_ID: 1006,
    BOT_WORKER_WS_URL: 'ws://127.0.0.1:9205',
    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9205/bot-activity',
  },
});

// Shared release flags must be applied after every server template is added.
// This prevents a newly cloned S<N> process from silently losing a current
// code/config release during PM2 restart/resurrect. Per-server opening,
// settlement and reward policy remains controlled by its own durable fields.
for (const app of module.exports.apps.filter(app => app.script === 'src/app.js' && /^lhs-s\d+$/.test(app.name))) {
  app.env.DROP_LEVEL_100_ENABLED = '1';
  app.env.ROLE_LEVEL_2000_ENABLED = '1';
  app.env.OLD_TREK_EVENT_ENGINE_ENABLED = '1';
  app.env.OLD_TREK_SETTLEMENT_ENABLED = '1';
  app.env.CUSTOM_PVP_FORMULA_ENABLED = '1';
  app.env.CROSS_EVENT_ENABLED = '1';
  app.env.AUCTION_SHARED_ENABLED = '1';
  app.env.AUCTION_SHARED_APPROVED = '1';
  app.env.AUCTION_CATALOG_PATH = '/linhhoasu/lhs/newServer/src/config/auctionCatalog.v1.json';
}

