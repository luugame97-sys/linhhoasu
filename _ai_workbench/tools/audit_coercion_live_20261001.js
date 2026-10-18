'use strict';
// Run via SSH stdin. Raw Mongo reads only; no model initialization or handlers.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const app = '/linhhoasu/lhs/newServer';
const { MongoClient } = require(path.join(app, 'node_modules/mongodb'));
const { BinJsonUtil, ByteArray } = require(path.join(app, 'src/protocol/BinJsonUtil'));
const dotenv = require(path.join(app, 'node_modules/dotenv'));
const fileEnv = dotenv.parse(fs.readFileSync(path.join(app, '.env')));
const nodes = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 5e6 }))
  .filter(p => /^lhs-s100[1-6]$/.test(p.name));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function decodeSelected(file) {
  const buf = fs.readFileSync(file), reader = new ByteArray(buf), tables = {};
  while (reader.position < reader.length) {
    const name = reader.readUTFBytes(reader.readUnsignedByte());
    const size = reader.readUnsignedInt(), raw = buf.subarray(reader.position, reader.position + size);
    reader.position += size;
    if (/^(PetSoul|PetBaseConfig$|PetConfig$|CoercionConfig$|SystemConfig$)/.test(name)) {
      tables[name] = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
    }
  }
  return { tables, hash: sha(buf) };
}
const configCache = new Map();
const ids = value => String(value || '').split(',').map(Number).filter(Number.isFinite);
async function inspectNode(proc) {
  const env = { ...fileEnv, ...proc.pm2_env };
  if (!env.MONGO_URI) throw new Error('MONGO_URI_REQUIRED:' + proc.name);
  const cfgPath = env.CONFIG_BIN_PATH || '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin';
  if (!configCache.has(cfgPath)) configCache.set(cfgPath, decodeSelected(cfgPath));
  const { tables: t, hash } = configCache.get(cfgPath);
  const stages = Object.values(t.CoercionConfig).sort((a, b) => a.stage - b.stage);
  const breakIds = Object.values(t.PetConfig).filter(r => t.PetBaseConfig.breakLimitPetQuality.includes(r.quality)).map(r => r.id);
  const sid = Number(env.SERVER_ID || proc.name.slice(-4));
  const client = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000, maxPoolSize: 1 });
  try {
    await client.connect();
    const db = client.db();
    if (!/^lhs_s100[1-6]$/.test(db.databaseName)) throw new Error('UNEXPECTED_DATABASE:' + db.databaseName);
    const identity = env.IDENTITY_MONGO_DB || db.databaseName;
    const server = await client.db(identity).collection('gameservers').findOne({ serverId: sid }, { projection: { _id: 0, serverId: 1, openTime: 1, status: 1, running: 1 }, maxTimeMS: 5000 });
    const day = server && server.openTime > 0 ? Math.max(1, Math.ceil((Date.now() - server.openTime) / 86400000)) : null;
    const projection = { _id: 0, level: 1, 'petInfo.pets.id': 1, 'petInfo.pets.level': 1,
      'other_attr_info.petSoulInfo.petSouls.id': 1, 'other_attr_info.petSoulInfo.petSouls.star': 1,
      'petSoulInfo.petSouls.id': 1, 'petSoulInfo.petSouls.star': 1, 'systemUnlockInfo.unlockedSystem': 1 };
    const players = await db.collection('players').find({ 'petInfo.pets': { $elemMatch: { id: { $in: breakIds }, level: { $gte: 200 } } } },
      { projection, maxTimeMS: 5000 }).limit(1000).toArray();
    const histogram = {}, stats = { returned: players.length, cappedAt1000Rows: players.length === 1000, soulUnlocked: 0,
      soulLocked: 0, anyStarAboveZero: 0, withPet210: 0, withPetAbove210: 0, invalidSoulRows: 0, duplicateSoulRows: 0, maxUyAp: 0, soulMissing: 0 };
    for (const p of players) {
      const souls = (p.other_attr_info && p.other_attr_info.petSoulInfo || p.petSoulInfo || {}).petSouls || [];
      if (!souls.length) stats.soulMissing++;
      const seen = new Set(); let value = 0;
      for (const soul of souls) {
        if (seen.has(soul.id)) { stats.duplicateSoulRows++; continue; }
        seen.add(soul.id);
        const cfg = t.PetSoulConfig[soul.id], row = cfg && t.PetSoulUpgradeConfig[cfg.quality] && t.PetSoulUpgradeConfig[cfg.quality][soul.star];
        if (!row) { stats.invalidSoulRows++; continue; }
        value += row.coercion;
      }
      let stage = stages[0]; for (const row of stages) { if (value < row.coercion) break; stage = row; }
      const unlocked = (p.systemUnlockInfo && p.systemUnlockInfo.unlockedSystem || []).includes(231);
      stats[unlocked ? 'soulUnlocked' : 'soulLocked']++;
      if (souls.some(s => s.star > 0)) stats.anyStarAboveZero++;
      if ((p.petInfo.pets || []).some(pet => breakIds.includes(pet.id) && pet.level === 210)) stats.withPet210++;
      if ((p.petInfo.pets || []).some(pet => breakIds.includes(pet.id) && pet.level > 210)) stats.withPetAbove210++;
      stats.maxUyAp = Math.max(stats.maxUyAp, value);
      const key = JSON.stringify({ uyAp: value, stage: stage.stage, cap: t.PetBaseConfig.levelMax + stage.limitLevelUp,
        soulUnlocked: unlocked, meetsLevel135: p.level >= 135, soulCount: souls.length });
      histogram[key] = (histogram[key] || 0) + 1;
    }
    return { name: proc.name, status: proc.pm2_env.status, pid: proc.pid, restarts: proc.pm2_env.restart_time,
      database: db.databaseName, identityDatabase: identity, configHash: hash, server, computedDay: day,
      ignoreDay231: ids(env.IGNORE_DAY_GATE_SYSTEM_IDS === undefined ? '311' : env.IGNORE_DAY_GATE_SYSTEM_IDS).includes(231),
      forceUnlock231: ids(env.FORCE_UNLOCK_SYSTEM_IDS || '10010').includes(231), disabled231: ids(env.DISABLED_SYSTEM_IDS).includes(231),
      system231: t.SystemConfig[231], stats, histogram: Object.entries(histogram).map(([key, count]) => ({ ...JSON.parse(key), count })) };
  } finally { await client.close(); }
}
(async () => {
  const rows = [];
  for (const node of nodes) rows.push(await inspectNode(node));
  const sources = {};
  for (const rel of ['src/handlers/pet.js', 'src/handlers/pet-soul.js', 'src/handlers/upgrade.js', 'src/services/ConfigService.js', 'src/handlers/account.js']) {
    const file = path.join(app, rel); sources[rel] = sha(fs.readFileSync(file));
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), readOnly: true, directPlayerWrites: 0, rows, sources }));
})().catch(e => { console.error(e.name + ':' + String(e.message).replace(/mongodb[^\s]*/g, '[REDACTED_URI]')); process.exitCode = 1; });
