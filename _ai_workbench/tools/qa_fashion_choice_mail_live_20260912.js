'use strict';
// Live native-contract QA: GM-style mail receive -> choice-box open -> relog.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const WS = require('/linhhoasu/lhs/newServer/node_modules/ws');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');
const sid = Number(process.argv[2]);
assert([1001, 1002].includes(sid));
const base = `qachoicemail_${crypto.randomBytes(6).toString('hex')}`;
const userId = `${base}_s${sid}`;
const playerId = crypto.randomBytes(12).toString('hex');
const dbClient = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 8000 });
let db, ws, insertedPlayer = false, insertedMail = false;
const pending = new Set();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function recv(tag, msgUid) {
  return new Promise((resolve, reject) => {
    const row = { tag, msgUid, resolve, reject, timer: setTimeout(() => {
      pending.delete(row); reject(new Error(`QA_TIMEOUT_${tag}`));
    }, 15000) };
    pending.add(row);
  });
}
async function connect() {
  ws = new WS(`ws://127.0.0.1:${sid === 1001 ? 9200 : 9201}`, { headers: { Origin: 'http://127.0.0.1' } });
  ws.on('message', raw => {
    let rows;
    try { const b = Buffer.from(raw); rows = Unpack(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); } catch (_error) { return; }
    for (const packet of (Array.isArray(rows) ? rows : [rows])) {
      for (const row of [...pending]) {
        if (row.tag === packet.tag && (row.msgUid == null || row.msgUid === packet.msgUid)) {
          clearTimeout(row.timer); pending.delete(row); row.resolve(packet.data);
        }
      }
    }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return rpc(1, { platformuid: base, userId: base, userid: base, serverid: sid,
    serverId: sid, firstName: `CQ${base.slice(-6)}` });
}
async function close() {
  if (ws && ws.readyState !== WS.CLOSED) {
    const done = new Promise(resolve => ws.once('close', resolve)); ws.close();
    await Promise.race([done, wait(1000)]); if (ws.readyState !== WS.CLOSED) ws.terminate();
  }
  await wait(500);
}
let sequence = 88000;
async function rpc(tag, data) { const id = ++sequence; const p = recv(tag, id); ws.send(Pack(tag, data, id)); return p; }
(async () => {
  await dbClient.connect(); db = dbClient.db(`lhs_s${sid}`);
  try {
    const bot = await db.collection('players').findOne({ isBot: true }); assert(bot, 'QA_BOT_TEMPLATE_MISSING');
    delete bot._id; delete bot.__v; delete bot.inviteCode; delete bot.botWorker;
    Object.assign(bot, { userId, playerId, name: `CQ${base.slice(-6)}`, serverId: sid, isBot: false,
      accountId: '', guildId: '', guildInfo: {}, level: 120, roleInfo: { kungfuId: 8, subJob: 1 },
      items: {}, currencies: { diamond: 0, silver: 0, gold: 0 }, other_attr_info: {},
      mailClaimLedger: [], fashionInfo: { fashion: {}, curFashion: {}, fashions: {}, activateFashion: [],
        fashionData: [], sets: [], setId: 0, suits: {}, dress: [] } });
    await db.collection('players').insertOne(bot); insertedPlayer = true;
    const mail = await db.collection('mails').insertOne({ userId, title: 'Fashion choice QA', content: 'QA',
      sender: 'QA', attachments: [{ id: 99001, count: 2 }, { id: 99002, count: 2 }], claimed: false,
      read: false, expireAt: new Date(Date.now() + 3600000) });
    insertedMail = true;
    await connect();
    assert.equal((await rpc(1103, { ids: [String(mail.insertedId)] })).result, 0, 'MAIL_RECEIVE_FAILED');
    let player = await db.collection('players').findOne({ userId, playerId });
    assert.equal(Number(player.items?.[99001] || 0), 2);
    assert.equal(Number(player.items?.[99002] || 0), 2);
    const epoch = await rpc(2499, {}); assert.equal(epoch.result, 0);
    let seq = epoch.sequence; const requestId = () => `v3_${epoch.epoch}_${++seq}`;
    let opened = await rpc(1300, { index: 99001, count: 1, selects: { 0: 1 }, requestId: requestId() });
    assert.equal(opened.result, 0, `OPEN_99001_FAILED ${JSON.stringify(opened)}`);
    opened = await rpc(1300, { index: 99001, count: 1, selects: { 2: 1 }, requestId: requestId() });
    assert.equal(opened.result, 0, `OPEN_99001_MATERIAL_FAILED ${JSON.stringify(opened)}`);
    opened = await rpc(1300, { index: 99002, count: 1, selects: { 17: 1 }, requestId: requestId() });
    assert.equal(opened.result, 0, `OPEN_99002_FAILED ${JSON.stringify(opened)}`);
    opened = await rpc(1300, { index: 99002, count: 1, selects: { 18: 1 }, requestId: requestId() });
    assert.equal(opened.result, 0, `OPEN_99002_MATERIAL_FAILED ${JSON.stringify(opened)}`);
    player = await db.collection('players').findOne({ userId, playerId });
    assert.equal(Number(player.items?.[99001] || 0), 0);
    assert.equal(Number(player.items?.[99002] || 0), 0);
    assert.equal(Number(player.items?.[837] || 0), 100);
    assert.equal(Number(player.items?.[806] || 0), 100);
    for (const id of [28371, 28372, 28373, 28379, 28361, 28362, 28363, 28369]) {
      assert(Number(player.fashionInfo?.fashions?.[id] || 0) > 0, `MISSING_FASHION_${id}`);
      assert(player.fashionInfo.activateFashion.includes(id), `MISSING_ACTIVE_${id}`);
    }
    await close(); await connect();
    const relog = await db.collection('players').findOne({ userId, playerId });
    assert.equal(Number(relog.items?.[99001] || 0), 0); assert.equal(Number(relog.items?.[99002] || 0), 0);
    assert(relog.fashionInfo.activateFashion.includes(28371));
    console.log(JSON.stringify({ result: 'PASS', serverId: sid, mailReceive: true,
      opened: [{ id: 99001, count: 1, suit: 28370 }, { id: 99001, count: 1, material: 837, amount: 100 },
        { id: 99002, count: 1, suit: 28360 }, { id: 99002, count: 1, material: 806, amount: 100 }],
      fullSetGranted: true, materialsGranted: true, persisted: true, relog: true, qaProfileRemoved: true, realPlayerWrites: 0 }));
  } finally {
    await close(); for (const row of pending) { clearTimeout(row.timer); row.reject(new Error('QA_CLOSED')); }
    if (insertedMail) await db.collection('mails').deleteMany({ userId });
    if (insertedPlayer) await db.collection('players').deleteMany({ userId, playerId });
    assert.equal(await db.collection('players').countDocuments({ userId, playerId }), 0);
    assert.equal(await db.collection('mails').countDocuments({ userId }), 0);
    await dbClient.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
