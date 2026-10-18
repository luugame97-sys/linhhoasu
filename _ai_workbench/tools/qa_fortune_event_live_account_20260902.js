'use strict';

const assert = require('assert');
const fs = require('fs');
require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({ path: '/linhhoasu/lhs/newServer/.env' });
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/lhs_s1001';
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_PREFIX = process.env.REDIS_PREFIX || 's1001:';
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
const { packRequest, unpackResponse } = require('/linhhoasu/lhs/newServer/src/protocol/ReqCodec');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const redis = require('/linhhoasu/lhs/newServer/src/db/redis');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const authSession = require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');
const runtimeBus = require('/linhhoasu/lhs/newServer/src/services/RuntimeBus');

const ACCOUNT = 'vanduc97';
const SERVER_ID = 1001;
const ACTIVITY_ID = 43001;
const MONSTER_ACTIVITY_ID = 44001;
const ACTIVITY_TASK_TYPE = ACTIVITY_ID | (1 << 30);
const password = fs.readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
if (!password) throw new Error('QA_PASSWORD_REQUIRED_ON_STDIN');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function gameDayKey(value = Date.now()) { return Math.floor((value + 8 * 60 * 60 * 1000) / 86400000); }
function cloneForReplace(value) {
  const copy = JSON.parse(JSON.stringify(value));
  if (value && value._id) copy._id = value._id;
  return copy;
}
function activityRow(player, id) {
  return array(object(player.activityInfo).datas).find((row) => number(row && row.id) === id) || null;
}
function itemCount(player, id) {
  if (id === 1) return number(player.currencies && player.currencies.diamond);
  if (id === 2) return number(player.currencies && player.currencies.silver);
  if (id === 6) return number(player.currencies && player.currencies.gold);
  return number(player.items && player.items[id]);
}
function selectedSnapshot(player) {
  const tasks = object(object(player.taskInfo).tasks);
  return {
    items: Object.fromEntries([1, 2, 4, 6, 55, 65, 176, 177, 178, 179, 93092, 94411, 94412, 94413, 94414, 94415, 113114, 11548]
      .map((id) => [id, itemCount(player, id)])),
    activity43: activityRow(player, ACTIVITY_ID),
    activity44: activityRow(player, MONSTER_ACTIVITY_ID),
    tasks: Object.fromEntries(Array.from({ length: 9 }, (_, index) => 61001 + index).map((id) => [id, tasks[id] || null])),
    counters: object(object(player.other_attr_info).mainTaskProgress),
    fashionInfo: object(player.fashionInfo),
    shopInfo: object(player.shopInfo),
    rechargeInfo: object(player.rechargeInfo),
  };
}
function syncLiveSession(userId, player) {
  const wsServer = runtimeBus.getWsServer();
  if (wsServer && typeof wsServer.syncSessionPlayer === 'function') {
    wsServer.syncSessionPlayer(userId, player);
  }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function resultPacket(rows, tag, msgUid = null) {
  return rows.find((row) => number(row && row.tag) === tag && (msgUid == null || number(row.msgUid) === msgUid)) || null;
}
function rewardCount(rows, id) {
  return array(rows).filter((row) => number(row && row.id) === id).reduce((sum, row) => sum + number(row.count), 0);
}

async function callGameMsg(cmd, params) {
  const response = await fetch('http://127.0.0.1:8080/gameMsg.do', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: packRequest(cmd, params),
  });
  return { http: response.status, body: unpackResponse(Buffer.from(await response.arrayBuffer())) };
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9200', { headers: { Origin: 'http://127.0.0.1' }, handshakeTimeout: 8000 });
    const timer = setTimeout(() => reject(new Error('WS_CONNECT_TIMEOUT')), 12000);
    ws.once('open', () => { clearTimeout(timer); resolve(ws); });
    ws.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function createRpc(ws) {
  const received = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const input = Buffer.isBuffer(raw) ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : raw;
    const decoded = Unpack(input);
    const rows = Array.isArray(decoded) ? decoded : [decoded];
    rows.filter(Boolean).forEach((row) => received.push(row));
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const found = rows.find(waiter.predicate);
      if (!found) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(found);
    }
  });
  const waitFor = (predicate, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const existing = received.find(predicate);
    if (existing) return resolve(existing);
    const waiter = { predicate, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('WS_PACKET_TIMEOUT'));
    }, timeoutMs);
    waiters.push(waiter);
  });
  const call = async (tag, data, msgUid) => {
    const start = received.length;
    const responsePromise = waitFor((row) => number(row.tag) === tag && number(row.msgUid) === msgUid);
    ws.send(Buffer.from(Pack(tag, data, msgUid)));
    const response = await responsePromise;
    await sleep(250);
    return { response, packets: received.slice(start) };
  };
  return { received, waitFor, call };
}

function preparePlayer(snapshot) {
  const player = cloneForReplace(snapshot);
  player.items = object(player.items);
  player.currencies = object(player.currencies);
  player.items[176] = 1;
  player.items[178] = Math.max(30, itemCount(player, 178));
  player.items[179] = Math.max(600, itemCount(player, 179));
  delete player.items[113114];
  delete player.items[11548];

  player.fashionInfo = object(player.fashionInfo);
  player.fashionInfo.fashions = object(player.fashionInfo.fashions);
  delete player.fashionInfo.fashions['113114'];
  delete player.fashionInfo.fashions['11548'];
  player.fashionInfo.activateFashion = array(player.fashionInfo.activateFashion).filter((id) => ![113114, 11548].includes(number(id)));

  player.activityInfo = object(player.activityInfo);
  player.activityInfo.datas = array(player.activityInfo.datas);
  let row43 = activityRow(player, ACTIVITY_ID);
  if (!row43) {
    row43 = { id: ACTIVITY_ID, startTime: Date.now() - 86400000, endTime: Date.now() + 864000000 };
    player.activityInfo.datas.push(row43);
  }
  row43.score = 9;
  row43.record = 0;
  row43.recordList = [];
  row43.records = { ...object(row43.records), 1: 1, 3: 0, 10: 0, 11: 0 };
  row43.buyRecords = { ...object(row43.buyRecords), 11018000: 1, 11018101: 0 };
  row43.extra = { ...object(row43.extra), fortuneDayKey: gameDayKey() };

  let row44 = activityRow(player, MONSTER_ACTIVITY_ID);
  if (!row44) {
    row44 = { id: MONSTER_ACTIVITY_ID, startTime: Date.now() - 86400000, endTime: Date.now() + 864000000 };
    player.activityInfo.datas.push(row44);
  }
  row44.score = 1;
  row44.record = 0;
  row44.recordList = [];
  row44.records = { ...object(row44.records), 1: 90000 };

  player.activityInfo.dailyShopClaims = object(player.activityInfo.dailyShopClaims);
  player.activityInfo.dailyShopClaims[ACTIVITY_ID] = object(player.activityInfo.dailyShopClaims[ACTIVITY_ID]);
  player.activityInfo.dailyShopClaims[ACTIVITY_ID][11018000] = { dayKey: gameDayKey(), count: 1, lastClaimAt: Date.now() };

  player.shopInfo = object(player.shopInfo);
  player.shopInfo.buyRecords = object(player.shopInfo.buyRecords);
  player.shopInfo.buyRecords[11018101] = 0;
  player.rechargeInfo = object(player.rechargeInfo);
  player.rechargeInfo.records = array(player.rechargeInfo.records).filter((entry) => number(entry && entry.id) !== 11018101);

  player.other_attr_info = object(player.other_attr_info);
  const counters = player.other_attr_info.mainTaskProgress = object(player.other_attr_info.mainTaskProgress);
  counters.arenaChallengeCount = Math.max(1, number(counters.arenaChallengeCount));
  counters.eliteMonsterKillCount = 1;
  counters.guildChallengeCount = 1;
  counters.dungeonBossChallengeCount = Math.max(1, number(counters.dungeonBossChallengeCount));
  counters.crossRivalChallengeCount = Math.max(1, number(counters.crossRivalChallengeCount));
  counters.itemConsume = { ...object(counters.itemConsume), 4: 100, 55: 50, 65: 50 };

  const bases = {
    61002: counters.arenaChallengeCount - 1,
    61003: 0,
    61004: 0,
    61005: 0,
    61006: 0,
    61007: 0,
    61008: counters.dungeonBossChallengeCount - 1,
    61009: counters.crossRivalChallengeCount - 1,
  };
  player.taskInfo = object(player.taskInfo);
  player.taskInfo.tasks = object(player.taskInfo.tasks);
  player.taskInfo.tasksMap = object(player.taskInfo.tasksMap);
  const targets = { 61001: 1, 61002: 1, 61003: 1, 61004: 100, 61005: 50, 61006: 50, 61007: 1, 61008: 1, 61009: 1 };
  const taskList = [];
  Object.keys(targets).forEach((key) => {
    const id = number(key);
    const state = { id, type: ACTIVITY_TASK_TYPE, status: id === 61001 ? 20 : 10, progress: id === 61001 ? 1 : 0, target: targets[id], progressBase: 0 };
    if (id !== 61001) state.__fortuneCounterBase = Math.max(0, number(bases[id]));
    if (id !== 61001) {
      const values = {
        61002: counters.arenaChallengeCount,
        61003: counters.eliteMonsterKillCount,
        61004: counters.itemConsume[4],
        61005: counters.itemConsume[65],
        61006: counters.itemConsume[55],
        61007: counters.guildChallengeCount,
        61008: counters.dungeonBossChallengeCount,
        61009: counters.crossRivalChallengeCount,
      };
      state.progress = Math.min(state.target, Math.max(0, number(values[id]) - state.__fortuneCounterBase));
      state.status = state.progress >= state.target ? 20 : 10;
    }
    player.taskInfo.tasks[key] = state;
    taskList.push(state);
  });
  player.taskInfo.tasksMap[String(ACTIVITY_TASK_TYPE)] = taskList;
  return player;
}

(async () => {
  let token = '';
  let ws = null;
  let snapshot = null;
  let userId = '';
  let restored = false;
  const report = { result: 'FAILED', account: ACCOUNT, serverId: SERVER_ID, checks: {} };
  await mongo.connect();
  await redis.connect();
  try {
    const account = await Account.findOne({ accountId: ACCOUNT }).select({ roles: 1 }).lean();
    assert(account && array(account.roles).length > 0, 'QA_ACCOUNT_ROLE_MISSING');
    userId = String(account.roles.find((role) => number(role.serverId) === SERVER_ID)?.userId || account.roles[0].userId || '');
    assert(userId, 'QA_USER_ID_MISSING');
    snapshot = await Player.findOne({ userId }).lean();
    assert(snapshot, 'QA_PLAYER_MISSING');
    const beforeSelected = selectedSnapshot(snapshot);
    const prepared = preparePlayer(snapshot);
    await Player.replaceOne({ _id: snapshot._id }, prepared, { timestamps: false });

    const login = await callGameMsg(2820, { uid: ACCOUNT, token: password, serverId: SERVER_ID });
    assert.equal(login.http, 200);
    assert.equal(number(login.body && login.body.ret), 0, JSON.stringify({ ret: login.body && login.body.ret, errInfo: login.body && login.body.errInfo }));
    token = String(login.body.userToken || '');
    assert(token, 'LOGIN_TOKEN_MISSING');
    ws = await connectSocket();
    const rpc = createRpc(ws);
    ws.send(Buffer.from(Pack(1, {
      platformuid: ACCOUNT,
      userid: userId,
      userId,
      userToken: token,
      serverId: SERVER_ID,
      serverid: SERVER_ID,
      batchMsgEnabled: true,
    }, 9000)));
    const loginPacket = await rpc.waitFor((packet) => number(packet.tag) === 1 && number(packet.msgUid) === 9000);
    assert.equal(number(loginPacket.data && loginPacket.data.result), 0);
    const preparedPersisted = await Player.findOne({ userId }).lean();
    syncLiveSession(userId, preparedPersisted);
    report.checks.login = true;

    const freeBefore = await Player.findOne({ userId }).lean();
    const free = await rpc.call(1200, { id: 11018000, count: 1 }, 9001);
    assert.notEqual(number(free.response.data && free.response.data.result), 0);
    const freeFailure = resultPacket(free.packets, 1202, 9001);
    assert(freeFailure && freeFailure.data && freeFailure.data.code === 'DAILY_LIMIT_REACHED');
    const freeAfter = await Player.findOne({ userId }).lean();
    assert.equal(itemCount(freeAfter, 4), itemCount(freeBefore, 4));
    report.checks.freePackageReplayBlocked = true;

    const task = await rpc.call(1700, { id: ACTIVITY_ID, module: 1, index: 0, param: 0 }, 9002);
    assert.equal(number(task.response.data && task.response.data.result), 0);
    let live = await Player.findOne({ userId }).lean();
    if (rewardCount(task.response.data.rewardInfo && task.response.data.rewardInfo.items, 176) !== 20) {
      throw new Error('TASK_REWARD_MISMATCH ' + JSON.stringify({
        rewardInfo: task.response.data && task.response.data.rewardInfo,
        tasks: live && live.taskInfo && live.taskInfo.tasks,
        activity43: activityRow(live || {}, ACTIVITY_ID),
      }));
    }
    assert.equal(itemCount(live, 176), 21);
    assert.equal(number(activityRow(live, ACTIVITY_ID).records[10]), 120);
    assert(Array.from({ length: 9 }, (_, index) => 61001 + index).every((id) => number(live.taskInfo.tasks[id].status) === 30));
    report.checks.nineTasksAndRewards = true;

    const daily = await rpc.call(1700, { id: ACTIVITY_ID, module: 2, index: 0, param: 0 }, 9003);
    assert.equal(number(daily.response.data && daily.response.data.result), 0);
    assert.equal(rewardCount(daily.response.data.rewardInfo.items, 179), 20);
    assert.equal(rewardCount(daily.response.data.rewardInfo.items, 178), 2);
    assert.equal(rewardCount(daily.response.data.rewardInfo.items, 94415), 1);
    live = await Player.findOne({ userId }).lean();
    assert.equal(number(activityRow(live, ACTIVITY_ID).records[11]), 31);
    report.checks.dailyMilestones = true;

    const beforeDraw = await Player.findOne({ userId }).lean();
    const single = await rpc.call(1700, { id: ACTIVITY_ID, module: 0, index: 0, param: 0 }, 9004);
    assert.equal(number(single.response.data && single.response.data.result), 0);
    const singleFestival = resultPacket(single.packets, 1796);
    assert(singleFestival && array(singleFestival.data && singleFestival.data.rewards).length === 1);
    live = await Player.findOne({ userId }).lean();
    assert.equal(itemCount(live, 178), itemCount(beforeDraw, 178) - 1);
    assert.equal(number(activityRow(live, ACTIVITY_ID).score), 10);
    report.checks.singleDrawPersisted = true;

    const beforeTen = live;
    const ten = await rpc.call(1700, { id: ACTIVITY_ID, module: 0, index: 1, param: 0 }, 9005);
    assert.equal(number(ten.response.data && ten.response.data.result), 0);
    const tenFestival = resultPacket(ten.packets, 1796);
    assert(tenFestival && array(tenFestival.data && tenFestival.data.rewards).length === 10);
    live = await Player.findOne({ userId }).lean();
    assert.equal(itemCount(live, 178), itemCount(beforeTen, 178) - 10);
    assert.equal(number(activityRow(live, ACTIVITY_ID).score), 20);
    report.checks.tenDrawPersisted = true;

    const score = await rpc.call(1700, { id: ACTIVITY_ID, module: 3, index: 10, param: 0 }, 9006);
    assert.equal(number(score.response.data && score.response.data.result), 0);
    assert(array(score.response.data && score.response.data.rewardInfo && score.response.data.rewardInfo.fashion).some((entry) => number(entry.id) === 113114));
    assert(resultPacket(score.packets, 1800) && array(resultPacket(score.packets, 1800).data.fashion).includes(113114));
    live = await Player.findOne({ userId }).lean();
    assert.equal(number(object(live.fashionInfo).fashions['113114']), 1);
    assert.equal(itemCount(live, 113114), 0);
    const scoreReplay = await rpc.call(1700, { id: ACTIVITY_ID, module: 3, index: 10, param: 0 }, 9007);
    assert.equal(number(scoreReplay.response.data && scoreReplay.response.data.result), 2);
    report.checks.drawMilestoneFashionAndReplay = true;

    const beforeMonster = live;
    const monster = await rpc.call(1700, { id: MONSTER_ACTIVITY_ID, module: 0, index: 0, param: 0 }, 9008);
    assert.equal(number(monster.response.data && monster.response.data.result), 0);
    live = await Player.findOne({ userId }).lean();
    assert.equal(itemCount(live, 176), itemCount(beforeMonster, 176) - 1);
    assert.equal(itemCount(live, 177), itemCount(beforeMonster, 177) + 10);
    assert.equal(itemCount(live, 179), itemCount(beforeMonster, 179) + 10);
    assert.equal(itemCount(live, 1), itemCount(beforeMonster, 1) + 10);
    assert.equal(itemCount(live, 4), itemCount(beforeMonster, 4) + 10);
    assert.equal(itemCount(live, 6), itemCount(beforeMonster, 6) + 1);
    assert.equal(number(activityRow(live, MONSTER_ACTIVITY_ID).score), 2);
    report.checks.monsterConfiguredRewardPersisted = true;

    const rank = await rpc.call(1700, { id: MONSTER_ACTIVITY_ID, module: 1, index: 0, param: 0 }, 9009);
    assert.equal(number(rank.response.data && rank.response.data.result), 0);
    const rankPush = resultPacket(rank.packets, 1703);
    assert(rankPush && Array.isArray(rankPush.data.ranklist) && rankPush.data.ranklist.length > 0);
    report.checks.rank = { ok: true, rows: rankPush.data.ranklist.length, selfRank: number(rankPush.data.rank) };

    const beforeExchange = live;
    const exchange = await rpc.call(1200, { id: 11018101, count: 1 }, 9010);
    assert.equal(number(exchange.response.data && exchange.response.data.result), 0);
    live = await Player.findOne({ userId }).lean();
    assert.equal(itemCount(live, 179), itemCount(beforeExchange, 179) - 200);
    assert.equal(number(object(live.fashionInfo).fashions['11548']), 1);
    assert.equal(number(activityRow(live, ACTIVITY_ID).buyRecords[11018101]), 1);
    const exchangeReplay = await rpc.call(1200, { id: 11018101, count: 1 }, 9011);
    assert.notEqual(number(exchangeReplay.response.data && exchangeReplay.response.data.result), 0);
    report.checks.exchangeShopAndLimit = true;

    report.result = 'PASS';
    report.transientMutation = true;
    report.playerBefore = { name: String(snapshot.name || ''), level: number(snapshot.level) };
    report.eventStateDuringTest = {
      taskScore: number(activityRow(live, ACTIVITY_ID).records[10]),
      dailyRewardMask: number(activityRow(live, ACTIVITY_ID).records[11]),
      drawScore: number(activityRow(live, ACTIVITY_ID).score),
      monsterLevel: number(activityRow(live, MONSTER_ACTIVITY_ID).score),
    };
    report._beforeSelected = beforeSelected;
  } finally {
    if (ws) {
      try { ws.close(1000, 'QA complete'); } catch (_) {}
      await sleep(3500);
    }
    if (token) {
      try { await authSession.remove(token); } catch (_) {}
    }
    if (snapshot && snapshot._id) {
      const expected = canonical(selectedSnapshot(snapshot));
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await Player.replaceOne({ _id: snapshot._id }, snapshot, { timestamps: false });
        syncLiveSession(userId, snapshot);
        await sleep(attempt === 1 ? 1500 : 3000);
        const restoredPlayer = await Player.findOne({ _id: snapshot._id }).lean();
        const actual = canonical(selectedSnapshot(restoredPlayer));
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
          restored = true;
          break;
        }
      }
    }
    report.restored = restored;
    delete report._beforeSelected;
    try { await redis.disconnect(); } catch (_) {}
    try { await mongo.disconnect(); } catch (_) {}
  }
  assert.equal(restored, true, 'QA_PLAYER_RESTORE_FAILED');
  console.log('FORTUNE_QA_JSON=' + JSON.stringify(report));
})().catch(async (error) => {
  console.error(error && error.stack ? error.stack : String(error));
  try { await redis.disconnect(); } catch (_) {}
  try { await mongo.disconnect(); } catch (_) {}
  process.exitCode = 1;
});
