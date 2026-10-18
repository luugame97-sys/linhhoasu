/*
 * Disposable end-to-end registration smoke test for production s1001.
 *
 * The test creates one server-generated QA account, verifies the complete
 * 2817 -> 2818 -> 2820 -> WebSocket flow, then removes only that account,
 * its role/player documents, and its auth session. Passwords/tokens are
 * deliberately never printed.
 */
const assert = require('assert');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001';
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_PREFIX = process.env.REDIS_PREFIX || 's1001:';

const { packRequest, unpackResponse } = require('/linhhoasu/lhs/newServer/src/protocol/ReqCodec');
const { Pack, Unpack } = require('/linhhoasu/lhs/newServer/src/protocol/Codec');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const redis = require('/linhhoasu/lhs/newServer/src/db/redis');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const authSession = require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');

const GAME_MSG_URL = 'http://127.0.0.1:8080/gameMsg.do';

async function callGameMsg(cmd, params) {
  const response = await fetch(GAME_MSG_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: packRequest(cmd, params),
  });
  const body = unpackResponse(Buffer.from(await response.arrayBuffer()));
  return { http: response.status, body };
}

function resultCode(body) {
  return Number(body && (body.ret != null ? body.ret : body.iResult));
}

function safeResponseSummary(response) {
  const body = response && response.body ? response.body : {};
  return JSON.stringify({
    http: response && response.http,
    ret: body.ret,
    iResult: body.iResult,
    code: body.code,
    errInfo: body.errInfo,
  });
}

function wsLogin(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9200', {
      headers: { Origin: 'http://127.0.0.1' },
      handshakeTimeout: 5000,
    });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch (_err) { /* best effort */ }
      reject(new Error('WS_TEST_TIMEOUT'));
    }, 10000);
    let loginPacket = null;
    ws.on('open', () => ws.send(Buffer.from(Pack(1, payload, 991))));
    ws.on('message', (raw) => {
      const input = Buffer.isBuffer(raw)
        ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
        : raw;
      const decoded = Unpack(input);
      const messages = Array.isArray(decoded) ? decoded : [decoded];
      const found = messages.find((row) => row && Number(row.tag) === 1 && Number(row.msgUid) === 991);
      if (found) {
        loginPacket = found;
        if (Number(found.data && found.data.result) === 0) {
          ws.close(1000, 'registration smoke complete');
        }
      }
    });
    ws.on('close', (closeCode) => {
      clearTimeout(timer);
      resolve({ loginPacket, closeCode });
    });
    ws.on('error', reject);
  });
}

(async () => {
  let accountId = '';
  let password = '';
  let userId = '';
  let userToken = '';
  let result = null;

  await mongo.connect();
  redis.connect();
  try {
    const marker = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const random = await callGameMsg(2817, {
      withPWD: true,
      openId: `qa_registration_${marker}`,
    });
    assert.strictEqual(random.http, 200);
    assert.strictEqual(resultCode(random.body), 0, safeResponseSummary(random));
    accountId = String(random.body && random.body.strAccount || '');
    password = String(random.body && random.body.strPassword || '');
    assert(/^guest_[a-z0-9]+$/i.test(accountId), 'unexpected generated account');
    assert(password.length >= 8, 'generated password missing');

    const role = await callGameMsg(2818, {
      account: accountId,
      password,
      serverId: 1001,
    });
    assert.strictEqual(role.http, 200);
    assert.strictEqual(resultCode(role.body), 0, safeResponseSummary(role));
    userId = String(role.body && role.body.roles && role.body.roles[0]
      && role.body.roles[0].userId || role.body && role.body.userId || '');
    assert(userId, 'role userId missing');

    const login = await callGameMsg(2820, {
      uid: accountId,
      token: password,
      serverId: 1001,
    });
    assert.strictEqual(login.http, 200);
    assert.strictEqual(resultCode(login.body), 0, safeResponseSummary(login));
    userToken = String(login.body && login.body.userToken || '');
    userId = String(login.body && (login.body.userId || login.body.userID) || userId);
    assert(userToken, 'auth token missing');

    const ws = await wsLogin({
      platformuid: accountId,
      userid: userId,
      userId,
      userToken,
      serverId: 1001,
      serverid: 1001,
    });
    assert(ws.loginPacket, 'websocket login response missing');
    assert.strictEqual(Number(ws.loginPacket.data && ws.loginPacket.data.result), 0,
      JSON.stringify(ws.loginPacket.data || {}));
    assert.strictEqual(ws.closeCode, 1000);

    const account = await Account.findOne({ accountId }).lean();
    const player = await Player.findOne({ userId }).lean();
    assert(account && account.roles.some((row) => String(row.userId) === userId), 'account role not persisted');
    assert(player && String(player.userId) === userId, 'player not persisted');

    result = {
      result: 'PASS',
      randomRegistration: true,
      roleCreation: true,
      passwordLogin: true,
      websocketLogin: true,
      accountId,
      userId,
    };
  } finally {
    if (userToken) {
      try { await authSession.remove(userToken); } catch (_err) { /* best effort */ }
    }
    if (accountId) {
      try {
        const account = await Account.findOne({ accountId }).lean();
        const ids = Array.isArray(account && account.roles)
          ? account.roles.map((row) => String(row && row.userId || '')).filter(Boolean)
          : [];
        if (ids.length) await Player.deleteMany({ userId: { $in: ids } });
        await Account.deleteOne({ accountId });
      } catch (cleanupError) {
        console.error(`QA_CLEANUP_FAILED account=${accountId}: ${cleanupError.message}`);
        if (!result) throw cleanupError;
      }
    }
    await redis.disconnect();
    await mongo.disconnect();
  }

  console.log(JSON.stringify(result));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
