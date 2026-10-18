'use strict';

const assert = require('assert');
const path = require('path');

const root = process.env.ROLE_FLOW_STAGE_ROOT || '/linhhoasu/lhs/newServer';
const WebSocket = require(path.join(root, 'node_modules/ws'));
const { packRequest, unpackResponse } = require(path.join(root, 'src/protocol/ReqCodec'));
const { Pack, Unpack } = require(path.join(root, 'src/protocol/Codec'));
const mongo = require(path.join(root, 'src/db/mongo'));
const redis = require(path.join(root, 'src/db/redis'));
const Account = require(path.join(root, 'src/db/models/Account'));
const Player = require(path.join(root, 'src/db/models/Player'));
const Mail = require(path.join(root, 'src/db/models/Mail'));
const authSession = require(path.join(root, 'src/services/AuthSessionService'));

const HTTP_BASE = process.env.ROLE_FLOW_HTTP_BASE || 'http://127.0.0.1:18082';
const WS_URL = process.env.ROLE_FLOW_WS_URL || 'ws://127.0.0.1:19200';

async function callGameMsg(cmd, params) {
  const response = await fetch(`${HTTP_BASE}/gameMsg.do`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: packRequest(cmd, params),
  });
  return { http: response.status, body: unpackResponse(Buffer.from(await response.arrayBuffer())) };
}

function resultCode(body) {
  return Number(body && (body.ret != null ? body.ret : body.iResult));
}

function waitForPacket(ws, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS_PACKET_TIMEOUT')), timeoutMs);
    const onMessage = (raw) => {
      try {
        const input = Buffer.isBuffer(raw)
          ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
          : raw;
        const decoded = Unpack(input);
        const packets = Array.isArray(decoded) ? decoded : [decoded];
        const packet = packets.find(predicate);
        if (packet) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(packet);
        }
      } catch (error) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        reject(error);
      }
    };
    ws.on('message', onMessage);
  });
}

function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Origin: 'http://127.0.0.1' },
      handshakeTimeout: 5000,
    });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch (_) {}
      reject(new Error('WS_CONNECT_TIMEOUT'));
    }, 10000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

(async () => {
  const marker = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const accountId = `qa_flow_${marker}`.slice(0, 20);
  const password = 'QaFlowPass9';
  let userId = '';
  let token = '';
  let ws = null;
  await mongo.connect();
  redis.connect();
  try {
    const registration = await callGameMsg(2818, {
      account: accountId,
      password,
      openId: `qa_${marker}`,
    });
    assert.strictEqual(registration.http, 200, JSON.stringify(registration.body));
    assert.strictEqual(resultCode(registration.body), 0, JSON.stringify(registration.body));
    assert.strictEqual(Number(registration.body.needCreateRole), 1, '2818 must return account-only state');
    assert.strictEqual(Array.isArray(registration.body.roles) ? registration.body.roles.length : 0, 0, '2818 created a role early');

    const accountAfterRegistration = await Account.findOne({ accountId }).lean();
    assert(accountAfterRegistration, 'account was not persisted');
    assert.strictEqual(Array.isArray(accountAfterRegistration.roles) ? accountAfterRegistration.roles.length : 0, 0, 'account already has a role');

    const sdkAuth = await callGameMsg(2820, {
      uid: accountId,
      token: password,
      serverId: 1001,
      firstName: 'gc_',
    });
    assert.strictEqual(sdkAuth.http, 200, JSON.stringify(sdkAuth.body));
    assert.strictEqual(resultCode(sdkAuth.body), 0, JSON.stringify(sdkAuth.body));
    userId = String(sdkAuth.body.userId || sdkAuth.body.userID || '');
    token = String(sdkAuth.body.userToken || '');
    assert(userId, '2820 did not return a placeholder userId');
    assert(token, '2820 did not return an auth token');

    const accountAfterSdk = await Account.findOne({ accountId }).lean();
    const role = accountAfterSdk && Array.isArray(accountAfterSdk.roles)
      ? accountAfterSdk.roles.find((row) => String(row.userId) === userId)
      : null;
    assert(role, 'placeholder role metadata missing');
    const placeholder = await Player.findOne({ userId }).lean();
    assert(placeholder, 'placeholder player missing');
    assert.strictEqual(Number(placeholder.roleInfo && placeholder.roleInfo.kungfuId), 0, 'placeholder role is already selected');

    ws = await connectWs();
    ws.send(Buffer.from(Pack(1, {
      platformuid: accountId,
      userid: userId,
      userId,
      userToken: token,
      serverId: 1001,
      serverid: 1001,
      batchMsgEnabled: true,
    }, 9001)));
    const loginPacket = await waitForPacket(ws, (packet) => Number(packet.tag) === 1 && Number(packet.msgUid) === 9001);
    assert.strictEqual(Number(loginPacket.data && loginPacket.data.result), 0, JSON.stringify(loginPacket.data || {}));

    ws.send(Buffer.from(Pack(3100, { id: 4, subJob: 0 }, 9002)));
    const selectPacket = await waitForPacket(ws, (packet) => Number(packet.tag) === 3100 && Number(packet.msgUid) === 9002);
    assert.strictEqual(Number(selectPacket.data && selectPacket.data.id), 4, JSON.stringify(selectPacket.data || {}));
    const selected = await Player.findOne({ userId }).lean();
    assert.strictEqual(Number(selected && selected.roleInfo && selected.roleInfo.kungfuId), 4, '3100 selection was not persisted');

    console.log(JSON.stringify({
      result: 'PASS',
      accountOnlyRegistration: true,
      placeholderRoleFrom2820: true,
      authSessionWsLogin: true,
      nativeSelection3100: true,
    }));
  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (token) {
      try { await authSession.remove(token); } catch (_) {}
    }
    if (userId) {
      try { await Player.deleteMany({ userId }); } catch (_) {}
      try { await Mail.deleteMany({ userId }); } catch (_) {}
    }
    try { await Account.deleteOne({ accountId }); } catch (_) {}
    try { await redis.disconnect(); } catch (_) {}
    try { await mongo.disconnect(); } catch (_) {}
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
