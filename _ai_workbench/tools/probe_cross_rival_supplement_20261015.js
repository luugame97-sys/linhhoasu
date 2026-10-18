'use strict';
// Bounded read-only follow-up: native config parity, shop inputs, mail read-back.
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const pm = JSON.parse(require('child_process').execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8e6 }));
const nodes = pm.filter(p => /^lhs-s100[1-8]$/.test(p.name));
const first = nodes.find(p => p.name === 'lhs-s1001').pm2_env;
for (const [key, value] of Object.entries(first)) if (typeof value === 'string') process.env[key] = value;
const loggerPath = require.resolve('./src/logger');
require.cache[loggerPath] = { id: loggerPath, loaded: true, exports: { info() {}, warn() {}, error() {}, debug() {} } };
const config = require('./src/services/ConfigService'), tables = config.loadAllTables();
console.error('CrossRival audit: config loaded');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const result = { checkedAt: new Date().toISOString(), productionWrites: 0, gameRpcCalls: 0,
  shops: Object.values(tables.ShopConfig || {}).filter(row => [21, 22].includes(Number(row.tab))),
  assets: {}, binaries: [], served: [], references: [], mailReadBack: [] };
for (const id of [310, 311, 312, 313, 314, 315, 316, 317, 318, 101310]) result.assets[id] = tables.AssetsConfig?.[id];
const crossNames = Object.keys(tables).filter(name => /^CrossRival/.test(name));
function selectedTables(buffer) {
  const out = {}, { BinJsonUtil, ByteArray } = require('./src/protocol/BinJsonUtil');
  for (let offset = 0; offset < buffer.length;) {
    const n = buffer.readUInt8(offset++), name = buffer.toString('utf8', offset, offset + n); offset += n;
    const length = buffer.readUInt32BE(offset); offset += 4;
    if (offset + length > buffer.length) throw Error('CONFIG_LENGTH');
    if (crossNames.includes(name) || name === 'SystemConfig') {
      out[name] = BinJsonUtil.readFullJson(new ByteArray(require('zlib').inflateSync(buffer.subarray(offset, offset + length))));
    }
    offset += length;
  }
  return out;
}
if (auditPart === 'config' || auditPart === 'all') for (const base of ['/linhhoasu/lhs/update', '/linhhoasu/webgame/game/update']) {
  for (const filename of ['config_fashion_20260909.bin', 'config_e5ac72c2.bin']) {
    const file = base + '/resource/assets/excel/' + filename, data = fs.readFileSync(file), decoded = selectedTables(data);
    result.binaries.push({ path: file, sha256: hash(data), tableHashes: Object.fromEntries(crossNames.map(name =>
      [name, hash(JSON.stringify(decoded[name] || {}))])), system324: decoded.SystemConfig?.[324] });
    console.error('CrossRival audit: binary selected tables read ' + base + '/' + filename);
  }
}
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory() && !/backup|node_modules|\.git|temp|logs/i.test(ent.name)) walk(file);
    else if (ent.isFile() && file.endsWith('.js') && fs.statSync(file).size <= 1000000) {
      const source = fs.readFileSync(file, 'utf8');
      const matches = source.split('\n').map((text, i) => ({ line: i + 1, text: text.trim().slice(0, 250) }))
        .filter(row => /crossRivalInfo|essenceState|CrossRivalCampRankRewardConfig|CrossRivalDefenseRankRewardConfig/.test(row.text));
      if (matches.length) result.references.push({ file, matches: matches.slice(0, 24), total: matches.length });
    }
  }
}
if (auditPart === 'config' || auditPart === 'all') {
  for (const directory of ['src/handlers', 'src/services']) walk(directory);
  console.error('CrossRival audit: scoped references read');
}
(async () => {
  if (auditPart === 'public' || auditPart === 'all') for (const rel of ['index.html', 'js/lhs-cross-events-v2.js?v=20260917_parallel_v2', 'js/main.min_drop200.js?v=20261013_artifact_ui_guard_v1']) {
    try {
      const body = require('child_process').execFileSync('curl', ['-fsS', '--max-time', '5', 'https://linhhoasu.lol/' + rel], { maxBuffer: 12e6 });
      result.served.push({ path: rel, status: 200, bytes: body.length, sha256: hash(body),
        sourceMatch: hash(body) === hash(fs.readFileSync('/linhhoasu/webgame/game/' + rel.split('?')[0])) });
    } catch (error) { result.served.push({ path: rel, error: error.message }); }
  }
  if (auditPart === 'mail' || auditPart === 'all') {
  const client = new MongoClient(first.MONGO_URI, { serverSelectionTimeoutMS: 5000, maxPoolSize: 1 });
  await client.connect();
  try {
    const identity = client.db(first.IDENTITY_MONGO_DB || undefined);
    const settlement = await identity.collection('crosseventsettlements').findOne({ _id: 'cross_crossRival_C3_1791133200000' }, { maxTimeMS: 5000 });
    for (const recipient of settlement?.recipients || []) {
      const node = nodes.find(p => Number(p.pm2_env.SERVER_ID) === recipient.serverId);
      const dbName = new URL(node.pm2_env.MONGO_URI).pathname.slice(1), db = client.db(dbName);
      // Mongoose casts the 24-hex deterministic ID to ObjectId; native reads must too.
      const ids = [recipient.mailId];
      if (ObjectId.isValid(recipient.mailId)) ids.push(new ObjectId(recipient.mailId));
      const mail = await db.collection('mails').findOne({ _id: { $in: ids } }, { maxTimeMS: 5000 });
      const claim = await db.collection('players').findOne({ userId: recipient.userId, mailClaimLedger: recipient.mailId },
        { projection: { _id: 1 }, maxTimeMS: 5000 });
      result.mailReadBack.push({ serverId: recipient.serverId, rank: recipient.rank, score: recipient.score,
        deliveredMarker: (settlement.delivered || []).includes(recipient.playerId), mailExists: !!mail, claimedLedger: !!claim,
        mailMatches: !!mail && mail.userId === recipient.userId && Number(mail.targetServerId) === recipient.serverId
          && JSON.stringify(mail.attachments) === JSON.stringify(recipient.attachments),
        attachments: recipient.attachments });
    }
  } finally { await client.close(); }
  }
  console.log(JSON.stringify(result));
  process.exit(0);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
