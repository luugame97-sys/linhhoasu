'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ObjectId, MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');

const serverId = Number(process.env.QA_SERVER_ID || 1001);
const wsPort = Number(process.env.QA_WS_PORT || (serverId === 1002 ? 9201 : 9200));
const dbName = process.env.QA_DB || `lhs_s${serverId}`;
const uid = `qa_appearance_${Date.now().toString(36)}`;
const dbUid = `${uid}_s${serverId}`;
const playerId = crypto.randomBytes(12).toString('hex');
const code = `QAAPP${Date.now().toString(36)}`.toUpperCase();
const client = new MongoClient('mongodb://127.0.0.1:27017');
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
      let rows;
      try {
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        rows = Unpack(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      } catch (_error) { return; }
      for (const packet of (Array.isArray(rows) ? rows : [rows])) {
        if (match(packet)) { done(); resolve(packet); return; }
      }
    }
    function done() { clearTimeout(timer); ws.off('message', on); }
    ws.on('message', on);
  });
}

async function login(msgUid) {
  const player500 = recv((packet) => packet && packet.tag === 500 && packet.data);
  const response = recv((packet) => packet && packet.tag === 1 && packet.msgUid === msgUid);
  ws.send(Pack(1, {
    platformuid: uid, userid: uid, userId: uid,
    serverid: serverId, serverId, firstName: 'QA Appearance',
  }, msgUid));
  assert.equal((await response).data.result, 0);
  return player500;
}

function fashionOwned(player, id) {
  const info = player.fashionInfo || {};
  return Number(info.fashions && info.fashions[id] || 0) > 0
    || (info.activateFashion || []).map(Number).includes(Number(id));
}

function nativeOwned(player, family, id) {
  if (family === 'formation') return (player.formationInfo && player.formationInfo.owns || []).map(Number).includes(id);
  if (family === 'sword') return (player.swordInfo && player.swordInfo.data || []).some((row) => Number(row.id) === id);
  if (family === 'artifact') return (player.artifactInfo && player.artifactInfo.artifacts || []).some((row) => Number(row.id) === id);
  if (family === 'spirit') return (player.spiritInfo && player.spiritInfo.owns || []).map(Number).includes(id);
  return false;
}

function timedValid(player, id) {
  const row = (player.fashionInfo && player.fashionInfo.fashionData || []).find((entry) => Number(entry.id) === id);
  return !!(row && row.limitValues && Number(row.limitValues['10']) > Math.floor(Date.now() / 1000));
}

function nativeCounts(player) {
  return {
    swords: (player.swordInfo && player.swordInfo.data || []).length,
    artifacts: (player.artifactInfo && player.artifactInfo.artifacts || []).length,
  };
}

async function main() {
  await client.connect();
  const database = client.db(dbName);
  const players = database.collection('players');
  const codes = database.collection('redemptioncodes');
  const mails = database.collection('mails');
  const source = await players.findOne({ isBot: true });
  assert(source);
  delete source._id;
  delete source.__v;
  source.userId = dbUid;
  source.playerId = playerId;
  source.name = `QA Appearance ${uid.slice(-8)}`;
  source.accountId = '';
  source.isBot = false;
  delete source.botWorker;
  source.serverId = serverId;
  source.serverName = `S${String(serverId).slice(-1)}`;
  source.level = 99;
  source.items = { 1001: 1000 };
  source.currencies = { diamond: 0, gold: 0, silver: 0 };
  source.fashionInfo = {
    curFashion: {}, fashion: {}, fashionMap: {}, fashions: {}, activateFashion: [],
    fashionData: [], suits: {}, suitColors: {}, starUp: {}, dress: [], sets: [], setId: 0,
    emoji: {}, emojiGroups: [],
  };
  source.formationInfo = {};
  source.swordInfo = {};
  source.spiritInfo = {};
  source.artifactInfo = {};
  source.rechargeInfo = { area: serverId === 1002 ? 2 : 1, records: [], periodRecords: {}, totalRecharge: 0, totalrecharge: 0 };
  source.activityInfo = { datas: [], disabledEntryIds: [], operateRecords: {}, giftCodeRecords: {} };
  source.mailClaimLedger = [];
  await players.insertOne(source);
  await codes.insertOne({
    code, name: 'QA appearance', status: 'active',
    rewards: { diamond: 0, gold: 0, silver: 0, items: { 11201: 1, 21101: 1, 22101: 1, 23101: 1, 24101: 1 } },
    maxUses: 1, perUserLimit: 1, usedCount: 0, usedBy: [],
    startsAt: null, expiresAt: new Date(Date.now() + 3600000),
    note: 'temporary QA', createdBy: 'codex-qa', updatedBy: 'codex-qa',
    createdAt: new Date(), updatedAt: new Date(),
  });

  try {
    await open();
    await login(800);
    await wait(600);

    const rechargeFashion = recv((packet) => packet && packet.tag === 1800 && packet.data
      && (packet.data.fashion || []).map(Number).includes(29001));
    const rechargeReply = recv((packet) => packet && packet.tag === 1230 && packet.msgUid === 801);
    ws.send(Pack(1230, { id: 11000003, multi: 1 }, 801));
    assert.equal((await rechargeReply).data.result, 0);
    await rechargeFashion;
    await wait(800);
    let saved = await players.findOne({ userId: dbUid });
    assert.equal(fashionOwned(saved, 29001), true);
    assert.equal(Number(saved.items && saved.items[29001] || 0), 0);

    const codeFashion = recv((packet) => packet && packet.tag === 1800 && packet.data
      && (packet.data.fashion || []).map(Number).includes(11201));
    const codeFormation = recv((packet) => packet && packet.tag === 3000 && packet.data && packet.data.info
      && (packet.data.info.owns || []).map(Number).includes(21101));
    const codeReply = recv((packet) => packet && packet.tag === 1750 && packet.msgUid === 802);
    ws.send(Pack(1750, { giftCode: code }, 802));
    const claimedCode = await codeReply;
    assert.equal(claimedCode.data.result, 0);
    assert.ok((claimedCode.data.rewardInfo.formations || []).some((row) => Number(row.id) === 21101));
    assert.ok((claimedCode.data.rewardInfo.spirits || []).some((row) => Number(row.id) === 24101));
    await Promise.all([codeFashion, codeFormation]);
    await wait(900);
    saved = await players.findOne({ userId: dbUid });
    assert.equal(timedValid(saved, 11201), true);
    assert.equal(nativeOwned(saved, 'formation', 21101), true);
    assert.equal(nativeOwned(saved, 'sword', 22101), true);
    assert.equal(nativeOwned(saved, 'artifact', 23101), true);
    assert.equal(nativeOwned(saved, 'spirit', 24101), true);
    assert.equal(fashionOwned(saved, 21101), true);
    assert.equal(fashionOwned(saved, 22101), true);
    assert.equal(fashionOwned(saved, 23101), true);
    assert.equal(fashionOwned(saved, 24101), true);
    const beforeReplay = nativeCounts(saved);
    const replayReply = recv((packet) => packet && packet.tag === 1750 && packet.msgUid === 803);
    ws.send(Pack(1750, { giftCode: code }, 803));
    assert.equal((await replayReply).data.result, 2);
    await wait(500);
    saved = await players.findOne({ userId: dbUid });
    assert.deepEqual(nativeCounts(saved), beforeReplay);

    const mailId = new ObjectId();
    await mails.insertOne({
      _id: mailId, userId: dbUid, title: 'QA appearance mail', content: 'temporary QA', sender: '0',
      attachments: [
        { id: 11212, count: 1 }, { id: 21102, count: 1 }, { id: 22102, count: 1 },
        { id: 23102, count: 1 }, { id: 24102, count: 1 }, { id: 29040, count: 1 },
      ],
      targetType: 'user', targetServerId: serverId, batchId: uid,
      createdBy: 'codex-qa', eventKey: uid, minClaimLevel: 0,
      read: false, claimed: false, expireAt: new Date(Date.now() + 3600000),
      createdAt: new Date(), updatedAt: new Date(),
    });
    const mailFashion = recv((packet) => packet && packet.tag === 1800 && packet.data
      && (packet.data.fashion || []).map(Number).includes(11212));
    const mailFormation = recv((packet) => packet && packet.tag === 3000 && packet.data && packet.data.info
      && (packet.data.info.owns || []).map(Number).includes(21102));
    const mailReply = recv((packet) => packet && packet.tag === 1103 && packet.msgUid === 804);
    ws.send(Pack(1103, { ids: [String(mailId)] }, 804));
    assert.equal((await mailReply).data.result, 0);
    await Promise.all([mailFashion, mailFormation]);
    await wait(900);
    saved = await players.findOne({ userId: dbUid });
    assert.equal(timedValid(saved, 11212), true);
    assert.equal(nativeOwned(saved, 'formation', 21102), true);
    assert.equal(nativeOwned(saved, 'sword', 22102), true);
    assert.equal(nativeOwned(saved, 'artifact', 23102), true);
    assert.equal(nativeOwned(saved, 'spirit', 24102), true);
    assert.equal(Number(saved.items && saved.items[29040] || 0), 1);

    const suitPush = recv((packet) => packet && packet.tag === 1800 && packet.data
      && (packet.data.fashion || []).map(Number).includes(29041));
    const useReply = recv((packet) => packet && packet.tag === 1300 && packet.msgUid === 805);
    ws.send(Pack(1300, { id: 29040, index: 29040, count: 1 }, 805));
    assert.equal((await useReply).data.result, 0);
    await suitPush;
    const equipReply = recv((packet) => packet && packet.tag === 1802 && packet.msgUid === 806);
    ws.send(Pack(1802, { id: 29040, color: 0, set: 0 }, 806));
    assert.equal((await equipReply).data.result, 0);
    await wait(700);
    saved = await players.findOne({ userId: dbUid });
    for (const id of [29041, 29042, 29043, 29049]) assert.equal(fashionOwned(saved, id), true);
    assert.equal(Object.values(saved.fashionInfo.fashion).map(Number).includes(29041), true);

    const fakeExpire = recv((packet) => packet && packet.tag === 1811 && packet.msgUid === 807);
    ws.send(Pack(1811, { ids: [29001] }, 807));
    assert.deepEqual((await fakeExpire).data.ids, []);
    const unauthorized = recv((packet) => packet && packet.tag === 1801 && packet.msgUid === 808);
    ws.send(Pack(1801, { id: 11290, type: 101, set: 0 }, 808));
    assert.equal((await unauthorized).data.result, -1);

    ws.close();
    await wait(500);
    await open();
    const relog = await login(809);
    const payload = (await relog).data;
    assert.equal(fashionOwned(payload, 29001), true);
    assert.equal(timedValid(payload, 11201), true);
    assert.equal(timedValid(payload, 11212), true);
    assert.equal(nativeOwned(payload, 'formation', 21101), true);
    assert.equal(nativeOwned(payload, 'formation', 21102), true);
    assert.equal(nativeOwned(payload, 'spirit', 24101), true);
    assert.equal(nativeOwned(payload, 'spirit', 24102), true);
    console.log('APPEARANCE_LIVE=' + JSON.stringify({
      result: 'PASS', checks: 45, serverId, dbName,
      rechargePackage: 11000003, giftCode: true, mail: true,
      timedFashion: true, nativeCollections: true, suitUseEquip: true,
      duplicateCodeBlocked: true, fakeExpiryBlocked: true,
      unauthorizedEquipBlocked: true, relogPreserved: true,
    }));
  } finally {
    if (ws) { try { ws.close(); } catch (_error) {} }
    await wait(700);
    await mails.deleteMany({ $or: [{ userId: dbUid }, { batchId: uid }, { eventKey: uid }] });
    await codes.deleteMany({ code });
    await players.deleteMany({ userId: dbUid });
    const remaining = {
      players: await players.countDocuments({ userId: dbUid }),
      codes: await codes.countDocuments({ code }),
      mails: await mails.countDocuments({ $or: [{ userId: dbUid }, { batchId: uid }, { eventKey: uid }] }),
    };
    assert.deepEqual(remaining, { players: 0, codes: 0, mails: 0 });
    await client.close();
    console.log('APPEARANCE_CLEANUP=' + JSON.stringify({ result: 'PASS', remaining }));
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
