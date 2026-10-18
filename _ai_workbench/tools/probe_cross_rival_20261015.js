'use strict';
// Executed through SSH stdin. Only find/aggregate/listIndexes/readiness/file reads.
const fs = require('fs'), crypto = require('crypto'), vm = require('vm');
const { MongoClient } = require('mongodb');
const pm = JSON.parse(require('child_process').execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8e6 }));
const nodes = pm.filter(p => /^lhs-s100[1-8]$/.test(p.name)).sort((a, b) => a.name.localeCompare(b.name));
const now = Date.now();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const loggerPath = require.resolve('./src/logger');
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true,
  exports: { info() {}, warn() {}, error() {}, debug() {} } };
for (const [key, value] of Object.entries(nodes[0].pm2_env)) {
  if (typeof value === 'string') process.env[key] = value;
}
const config = require('./src/services/ConfigService');
const tables = config.loadAllTables();
const rules = JSON.parse(fs.readFileSync('src/config/crossServerEventSchedule.json', 'utf8'));
function sandboxModule(file, imports) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error('Unexpected import ' + name);
  }, Date, process: { env: {} } }, { filename: file });
  return module.exports;
}
const cross = sandboxModule('src/services/CrossServerEventService.js', {
  crypto, '../config/crossServerEventSchedule.json': rules, '../db/models/CrossEventEntry': {}
});
const schedule = sandboxModule('src/services/CrossEventScheduleService.js', {
  './CrossServerEventService': cross, './ConfigService': config
});
function tail(file) {
  if (!file || !fs.existsSync(file)) return [];
  const size = fs.statSync(file).size, buffer = Buffer.alloc(Math.min(size, 262144));
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length)); }
  finally { fs.closeSync(fd); }
  return buffer.toString('utf8').split('\n').slice(1);
}
function logSummary(p) {
  const lines = [...tail(p.pm2_env.pm_out_log_path), ...tail(p.pm2_env.pm_err_log_path)];
  const tagged = lines.filter(line => /tag=65(?:[5-8]\d)|CrossRival|\[CrossEvent\]/.test(line));
  return { scannedTailBytesPerFile: 262144, matchingLines: tagged.length,
    samples: tagged.slice(-8).map(line => line.replace(/user=\S+|playerId=\S+|name=\S+/g, '[redacted]')) };
}
const cycle = cross.cycleFor('crossRival', now);
const result = { checkedAt: new Date(now).toISOString(), cycle, schedule: rules,
  productionWrites: 0, playerWrites: 0, gameRpcCalls: 0, files: {}, config: {}, servers: [], shared: {} };
for (const name of Object.keys(tables).filter(name => /^CrossRival/.test(name))) result.config[name] = tables[name];
result.config.System324 = tables.SystemConfig?.[324];
const base = tables.CrossRivalBaseConfig || {};
result.config.relatedShops = Object.values(tables.ShopConfig || {}).filter(row =>
  Number(row.shopType) === Number(base.shopType) || JSON.stringify(row).includes('CrossRival'));
for (const file of ['src/handlers/cross-rival.js', 'src/services/CrossServerEventService.js',
  'src/services/CrossEventScheduleService.js', 'src/services/CrossEventSettlementService.js',
  'src/router.js', 'src/net/WSServer.js', 'src/config/crossServerEventSchedule.json',
  '/linhhoasu/webgame/game/js/main.min_drop200.js', '/linhhoasu/webgame/game/js/lhs-cross-events-v2.js',
  '/linhhoasu/webgame/game/index.html']) {
  const stat = fs.statSync(file);
  result.files[file] = { sha256: hash(fs.readFileSync(file)), bytes: stat.size, mtime: stat.mtimeMs };
}
(async () => {
  const allIds = new Map();
  for (const p of nodes) {
    const e = p.pm2_env, serverId = Number(e.SERVER_ID || e.DEFAULT_SERVER_ID);
    const client = new MongoClient(e.MONGO_URI, { serverSelectionTimeoutMS: 5000, maxPoolSize: 1 });
    await client.connect();
    try {
      const db = client.db(), identity = client.db(e.IDENTITY_MONGO_DB || undefined);
      const server = await identity.collection('gameservers').findOne({ serverId },
        { projection: { _id: 0, serverId: 1, serverName: 1, openTime: 1, running: 1, pageId: 1 }, maxTimeMS: 5000 });
      const rows = await db.collection('players').find({}, { projection: {
        _id: 0, playerId: 1, level: 1, isBot: 1, bot: 1, botInfo: 1, crossRivalInfo: 1
      }, maxTimeMS: 5000 }).toArray();
      for (const row of rows) {
        const sidSet = allIds.get(row.playerId) || new Set(); sidSet.add(serverId); allIds.set(row.playerId, sidSet);
      }
      const states = rows.filter(row => row.crossRivalInfo && Object.keys(row.crossRivalInfo).length);
      const current = states.filter(row => row.crossRivalInfo.cycleKey === cycle.key);
      const campCounts = {}, scoreStats = { positive: 0, max: 0, sum: 0 };
      for (const row of current) {
        const info = row.crossRivalInfo, camp = String(info.camp ?? 'missing');
        campCounts[camp] = (campCounts[camp] || 0) + 1;
        scoreStats.positive += Number(Number(info.score) > 0);
        scoreStats.max = Math.max(scoreStats.max, Number(info.score) || 0); scoreStats.sum += Number(info.score) || 0;
      }
      const health = await fetch('http://127.0.0.1:' + e.HTTP_PORT + '/ready', { signal: AbortSignal.timeout(5000) });
      const ready = await health.json();
      const gates = [1, 79, 80, 100, 2000].map(level => {
        const d = schedule.describe('crossRival', { serverId, level }, server, now, serverId);
        return { level, open: d.open, eligible: d.eligible, reason: d.reason };
      });
      result.servers.push({ serverId, name: p.name, status: e.status, pid: p.pid, uptime: e.pm_uptime,
        crossEnabled: e.CROSS_EVENT_ENABLED, cwd: e.pm_cwd, db: db.databaseName, identityDb: identity.databaseName,
        server, allowed: cross.isServerAllowed(serverId), gates,
        ready: { http: health.status, status: ready.status, checks: ready.checks },
        playersIncludingBots: rows.length, states: states.length, currentStates: current.length,
        staleStates: states.length - current.length, campCounts, scoreStats,
        logs: logSummary(p) });
      if (!result.shared.db) {
        const entries = identity.collection('crossevententries');
        const settlements = identity.collection('crosseventsettlements');
        const grouped = await entries.aggregate([{ $match: { event: 'crossRival' } },
          { $group: { _id: { cycleKey: '$cycleKey', serverId: '$serverId', camp: '$payload.camp' },
            rows: { $sum: 1 }, minScore: { $min: '$score' }, maxScore: { $max: '$score' }, sumScore: { $sum: '$score' } } },
          { $sort: { '_id.cycleKey': -1, '_id.serverId': 1 } }], { maxTimeMS: 5000 }).toArray();
        const settleRows = await settlements.find({ event: 'crossRival' }, { maxTimeMS: 5000 }).sort({ cutoffAt: -1 }).limit(8).toArray();
        const cursors = await settlements.find({ _id: { $in: nodes.map(n => 'cross_scheduler_' + n.pm2_env.SERVER_ID) } },
          { projection: { _id: 1, cursorAt: 1 }, maxTimeMS: 5000 }).toArray();
        result.shared = { db: identity.databaseName, grouped, cursors,
          indexes: await entries.listIndexes().toArray(), settlements: settleRows.map(row => ({
            id: row._id, cycleKey: row.cycleKey, state: row.state, cutoffAt: row.cutoffAt,
            recipients: row.recipients?.length || 0, delivered: row.delivered?.length || 0,
            expired: row.expired?.length || 0, byServer: (row.recipients || []).reduce((m, r) => {
              m[r.serverId] = (m[r.serverId] || 0) + 1; return m;
            }, {}), rewardItemIds: [...new Set((row.recipients || []).flatMap(r => (r.attachments || []).map(a => a.id)))]
          })) };
      }
    } finally { await client.close(); }
  }
  result.duplicatePlayerIdsAcrossServers = [...allIds.values()].filter(s => s.size > 1).length;
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
