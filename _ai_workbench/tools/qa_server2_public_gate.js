'use strict';

const assert = require('assert');
const http = require('http');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
const { packRequest, unpackResponse } = require('/linhhoasu/lhs/newServer/src/protocol/ReqCodec');
const { PacketManager } = require('/linhhoasu/lhs/newServer/src/protocol');

const OPEN_TIME = 1788516000000;

function postGameMsg(port, command, params) {
  const body = packRequest(command, params);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/gameMsg.do',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
        Host: 'lhs.mg365.fun',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: unpackResponse(Buffer.concat(chunks)) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('HTTP_TIMEOUT')));
    req.end(body);
  });
}

function probeWsGate() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(process.env.WS_URL || 'ws://127.0.0.1:9201');
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch (_err) {}
      reject(new Error('WS_TIMEOUT'));
    }, 10000);
    ws.on('open', () => {
      ws.send(PacketManager.packSingle(1, {
        serverId: 1002,
        serverid: 1002,
        userid: 'gate_probe_only',
        platformuid: 'gate_probe_only',
      }, 700001));
    });
    ws.on('message', (raw) => {
      const decoded = PacketManager.unpackClient(Buffer.from(raw));
      const packets = Array.isArray(decoded) ? decoded : [decoded];
      const login = packets.find((packet) => Number(packet && packet.tag) === 1);
      if (!login) return;
      clearTimeout(timer);
      ws.close();
      resolve(login);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  assert.ok(Date.now() < OPEN_TIME, 'QA_BEFORE_OPEN_ONLY');

  if (process.env.QA_MODE === 'private') {
    const privateHttpGate = await postGameMsg(8083, 2820, {
      uid: 'gate_probe_only',
      token: 'never_used_password',
      serverId: 1002,
    });
    assert.strictEqual(privateHttpGate.status, 200);
    assert.strictEqual(privateHttpGate.data.code, 'SERVER_NOT_OPEN');
    const privateWsGate = await probeWsGate();
    assert.strictEqual(privateWsGate.data && privateWsGate.data.code, 'SERVER_NOT_OPEN');
    console.log(`SERVER2_PRIVATE_GATE_QA=${JSON.stringify({ result: 'PASS', checks: 4 })}`);
    return;
  }

  const page = await postGameMsg(8080, 3074, { pageId: 1 });
  assert.strictEqual(page.status, 200);
  const s2 = (page.data.servers || []).find((server) => Number(server.serverId) === 1002);
  assert.ok(s2, 'S2_NOT_PUBLIC');
  assert.strictEqual(Number(s2.running), 1);
  assert.strictEqual(Number(s2.status), 1);
  assert.strictEqual(Number(s2.state), 4);
  assert.strictEqual(Number(s2.openTime), OPEN_TIME);
  assert.ok(String(s2.url || '').endsWith(':81/ws-s2'), `BAD_S2_URL:${s2.url}`);

  const httpGate = await postGameMsg(8080, 2820, {
    uid: 'gate_probe_only',
    token: 'never_used_password',
    serverId: 1002,
  });
  assert.strictEqual(httpGate.status, 200);
  assert.strictEqual(httpGate.data.code, 'SERVER_NOT_OPEN');
  assert.strictEqual(Number(httpGate.data.openTime), OPEN_TIME);

  const wsGate = await probeWsGate();
  assert.strictEqual(Number(wsGate.data && wsGate.data.result), -1);
  assert.strictEqual(wsGate.data && wsGate.data.code, 'SERVER_NOT_OPEN');
  assert.strictEqual(Number(wsGate.data && wsGate.data.openTime), OPEN_TIME);

  console.log(`SERVER2_PUBLIC_GATE_QA=${JSON.stringify({
    result: 'PASS',
    checks: 12,
    serverList: {
      serverId: s2.serverId,
      running: s2.running,
      status: s2.status,
      state: s2.state,
      openTime: s2.openTime,
      url: s2.url,
    },
    httpGate: { code: httpGate.data.code, openTime: httpGate.data.openTime },
    wsGate: { code: wsGate.data.code, openTime: wsGate.data.openTime },
  })}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
