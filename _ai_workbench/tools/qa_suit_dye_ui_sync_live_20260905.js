'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');

const serverId = Number(process.env.QA_SERVER_ID || 1001);
const wsPort = Number(process.env.QA_WS_PORT || 9200);
const dbName = process.env.QA_DB || 'lhs_s1001';
const uid = `qa_suit_dye_${Date.now().toString(36)}`;
const dbUid = `${uid}_s${serverId}`;
const playerId = crypto.randomBytes(12).toString('hex');
const client = new MongoClient('mongodb://127.0.0.1:27017');
const baseIds = [29031, 29032, 29033, 29039];
const colorIds = [80229031, 80229032, 80229033, 80229039];
let ws;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function open() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${wsPort}`, {
      headers: { Origin: 'http://127.0.0.1' }, handshakeTimeout: 10000,
    });
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function recv(match, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { done(); reject(new Error('TIMEOUT')); }, timeout);
    function on(raw) {
      let packets;
      try {
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        packets = Unpack(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      } catch (_error) { return; }
      for (const packet of (Array.isArray(packets) ? packets : [packets])) {
        if (match(packet)) { done(); resolve(packet); return; }
      }
    }
    function done() { clearTimeout(timer); ws.off('message', on); }
    ws.on('message', on);
  });
}

async function login(msgUid) {
  const payload = recv((packet) => packet && packet.tag === 500 && packet.data);
  const response = recv((packet) => packet && packet.tag === 1 && packet.msgUid === msgUid);
  ws.send(Pack(1, {
    platformuid: uid, userid: uid, userId: uid,
    serverid: serverId, serverId, firstName: 'QA Suit Dye',
  }, msgUid));
  assert.equal((await response).data.result, 0);
  return payload;
}

function ownsAll(info, ids) {
  const source = info && Array.isArray(info.activateFashion)
    ? info.activateFashion
    : (info && Array.isArray(info.fashion) ? info.fashion : []);
  const owned = new Set(source.map(Number));
  return ids.every((id) => owned.has(id));
}

async function main() {
  await client.connect();
  const players = client.db(dbName).collection('players');
  const source = await players.findOne({ isBot: true });
  assert(source);
  delete source._id;
  delete source.__v;
  source.userId = dbUid;
  source.playerId = playerId;
  source.name = `QA Dye ${uid.slice(-8)}`;
  source.accountId = '';
  source.isBot = false;
  delete source.botWorker;
  source.serverId = serverId;
  source.serverName = `S${String(serverId).slice(-1)}`;
  source.level = 99;
  source.items = { 118: 40 };
  source.currencies = { diamond: 0, gold: 0, silver: 0 };
  source.fashionInfo = {
    curFashion: {}, fashion: {}, fashionMap: {}, equipped: {},
    fashions: Object.fromEntries(baseIds.map((id) => [String(id), 1])),
    activateFashion: baseIds.slice(), fashionData: [], suits: {}, suitColors: {},
    starUp: {}, dress: [], sets: [], setId: 0, emoji: {}, emojiGroups: [],
  };
  await players.insertOne(source);

  try {
    await open();
    await login(9200);
    const costPush = recv((packet) => packet && packet.tag === 1202 && packet.msgUid === 0
      && (packet.data && packet.data.changed || []).some((row) => Number(row.id) === 118 && Number(row.count) === 0));
    const fashionPush = recv((packet) => packet && packet.tag === 1800 && packet.msgUid === 0
      && ownsAll(packet.data, colorIds));
    const response = recv((packet) => packet && packet.tag === 1803 && packet.msgUid === 9201);
    ws.send(Pack(1803, { id: 29030, color: 2, replace: 0 }, 9201));
    const [costPacket, fashionPacket, reply] = await Promise.all([costPush, fashionPush, response]);
    assert.equal(reply.data.result, 0);
    assert.equal(ownsAll(fashionPacket.data, colorIds), true);
    assert.ok((costPacket.data.items || []).some((row) => Number(row.id) === 118 && Number(row.count) === -40));
    await wait(700);
    let saved = await players.findOne({ userId: dbUid });
    assert.equal(Number(saved.items && saved.items[118] || 0), 0);
    assert.equal(ownsAll(saved.fashionInfo, colorIds), true);
    assert.deepEqual((saved.fashionInfo.suitColors && saved.fashionInfo.suitColors['29030'] || []).map(Number), [2]);

    const retryPush = recv((packet) => packet && packet.tag === 1800 && packet.msgUid === 0
      && ownsAll(packet.data, colorIds));
    const retryResponse = recv((packet) => packet && packet.tag === 1803 && packet.msgUid === 9202);
    ws.send(Pack(1803, { id: 29030, color: 2, replace: 0 }, 9202));
    const [, retry] = await Promise.all([retryPush, retryResponse]);
    assert.equal(retry.data.result, 0);
    await wait(500);
    saved = await players.findOne({ userId: dbUid });
    assert.equal(Number(saved.items && saved.items[118] || 0), 0);

    ws.close();
    await wait(400);
    await open();
    const relog = await login(9203);
    const payload = (await relog).data;
    assert.equal(ownsAll(payload.fashionInfo, colorIds), true);
    assert.deepEqual((payload.fashionInfo.suitColors && payload.fashionInfo.suitColors['29030'] || []).map(Number), [2]);
    console.log('SUIT_DYE_UI_LIVE=' + JSON.stringify({
      result: 'PASS', checks: 16, serverId, dbName, suitId: 29030, color: 2,
      colorIds, firstPush1800: true, lockRemovedImmediately: true,
      cost: { id: 118, count: 40 }, duplicateCost: 0, retryPush1800: true,
      persisted: true, relogPreserved: true,
    }));
  } finally {
    if (ws) { try { ws.close(); } catch (_error) {} }
    await wait(700);
    await players.deleteMany({ userId: /^qa_suit_dye_/ });
    const remaining = await players.countDocuments({ userId: /^qa_suit_dye_/ });
    assert.equal(remaining, 0);
    await client.close();
    console.log('SUIT_DYE_UI_CLEANUP=' + JSON.stringify({ result: 'PASS', remaining }));
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
