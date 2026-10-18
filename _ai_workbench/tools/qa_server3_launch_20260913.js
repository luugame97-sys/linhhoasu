'use strict';
// Read-only launch checks. No inserts, deletes, bot credentials or valid accounts.
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const APP = process.env.QA_APP_ROOT || '/linhhoasu/lhs/newServer';
const { MongoClient } = require(APP + '/node_modules/mongodb');
const WebSocket = require(APP + '/node_modules/ws');
const { packRequest, unpackResponse } = require(APP + '/src/protocol/ReqCodec');
const { PacketManager } = require(APP + '/src/protocol');
const OPEN = 1789268400000;
const SID = 1003;
const PROBE = 'qa_s3_gate_readonly_20260913';
const PORTS = [8080, 8084, 81];

function request(port, path, data, binary = false) {
  const body = data === undefined ? null : binary ? data : Buffer.from(JSON.stringify(data));
  return new Promise((resolve, reject) => {
    const headers = { Host: '103.116.105.154:81' };
    if (body) Object.assign(headers, { 'Content-Type': binary ? 'application/octet-stream' : 'application/json', 'Content-Length': body.length });
    const req = http.request({ host: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks);
          resolve({ status: res.statusCode, data: binary ? unpackResponse(raw) : JSON.parse(raw.toString()) });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('HTTP_TIMEOUT')));
    req.end(body);
  });
}
const native = (port, cmd, params) => request(port, '/gameMsg.do', packRequest(cmd, params), true);
function beforeGuard() { assert(Date.now() < OPEN - 15000, 'SKIP_GATE_PROBES_NEAR_OR_AFTER_OPEN'); }
function assertGate(data) {
  assert.equal(data.code, 'SERVER_NOT_OPEN');
  assert.equal(Number(data.openTime), OPEN);
}
function wsGate(url) {
  beforeGuard();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => finish(new Error('WS_TIMEOUT')), 10000);
    let done = false;
    function finish(error, value) {
      if (done) return;
      done = true; clearTimeout(timer); ws.terminate();
      if (error) reject(error); else resolve(value);
    }
    ws.on('open', () => {
      try {
        beforeGuard();
        ws.send(PacketManager.packSingle(1, { serverId: SID, serverid: SID, userid: PROBE, platformuid: PROBE }, 730001));
      } catch (error) { finish(error); }
    });
    ws.on('message', raw => {
      try {
        const decoded = PacketManager.unpackClient(Buffer.from(raw));
        const packet = (Array.isArray(decoded) ? decoded : [decoded]).find(row => Number(row && row.tag) === 1);
        if (packet) { assertGate(packet.data); finish(null, { code: packet.data.code, openTime: packet.data.openTime }); }
      } catch (error) { finish(error); }
    });
    ws.on('error', error => finish(error));
  });
}
async function boundary(rows) {
  const config = { serverId: SID, running: true, status: 1, isNew: true, openTime: OPEN };
  const sandbox = { module: { exports: {} }, require(name) {
    assert.equal(name, './ServerConfigService');
    return { findServerConfig: async id => id === SID ? config : null };
  } };
  vm.runInNewContext(fs.readFileSync(APP + '/src/services/ServerAccessService.js', 'utf8'), sandbox);
  const access = sandbox.module.exports;
  assert.equal((await access.resolveServerAccess(SID, OPEN - 1)).ok, false);
  assert.equal((await access.resolveServerAccess(SID, OPEN)).ok, true);
  assert.equal(access.resolveServerEntryState(config, OPEN - 1), 4);
  assert.equal(access.resolveServerEntryState(config, OPEN), 1);
  const source = fs.readFileSync(APP + '/src/handlers/serverList.js', 'utf8');
  const start = source.indexOf('function selectNewestOpenServer(');
  const end = source.indexOf('\nasync function buildNewestServerData', start);
  assert(start >= 0 && end > start);
  const pick = vm.runInNewContext('(' + source.slice(start, end) + ')');
  assert.equal(pick(rows, OPEN).serverId, SID);
  assert.notEqual((pick(rows, OPEN - 1) || {}).serverId, SID);
  return { result: 'PASS', checks: 6, simulatedBoundary: OPEN };
}
async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const rows = await client.db('lhs_s1001').collection('gameservers').find({}, { projection: { _id: 0 } }).toArray();
    const row = rows.find(item => Number(item.serverId) === SID);
    assert(row, 'S3_METADATA_MISSING');
    assert.equal(row.serverName, 'S3'); assert.equal(row.openTime, OPEN);
    assert.equal(row.running, true); assert.equal(row.status, 1); assert.equal(row.isNew, true);
    const players = client.db('lhs_s1003').collection('players');
    const accounts = client.db('lhs_s1001').collection('accounts');
    const residue = async () => ({
      accounts: await accounts.countDocuments({ accountId: PROBE }),
      players: await players.countDocuments({ $or: [{ accountId: PROBE }, { userId: PROBE }] }),
    });
    assert.deepEqual(await residue(), { accounts: 0, players: 0 });
    const output = { result: 'PASS', mode: Date.now() < OPEN ? 'before-open' : 'after-open', boundary: await boundary(rows), lists: [], gates: [] };
    for (const port of [8080, 8084]) assert.equal((await request(port, '/ready')).status, 200);
    for (const port of PORTS) {
      const page = await native(port, 3074, { pageId: 1 });
      assert.equal(page.status, 200);
      const server = (page.data.servers || []).find(item => Number(item.serverId) === SID);
      assert(server, 'S3_NOT_PUBLIC_' + port);
      assert.equal(Number(server.running), 1); assert.equal(Number(server.status), 1);
      assert.equal(Number(server.openTime), OPEN);
      assert.equal(Number(server.state), Date.now() < OPEN ? 4 : 1);
      assert(String(server.url).endsWith(':81/ws-s3'), 'BAD_S3_ENDPOINT_' + port);
      const latest = await native(port, 3075, {});
      if (Date.now() >= OPEN) assert.equal(Number(latest.data.newServerData.serverId), SID);
      output.lists.push({ port, state: server.state, url: server.url, latestId: latest.data.newServerData && latest.data.newServerData.serverId });
    }
    if (Date.now() < OPEN - 90000) {
      assert.equal(await players.countDocuments({ isBot: { $ne: true } }), 0, 'PUBLIC_ROLE_EXISTS_BEFORE_OPEN');
      const params = { uid: PROBE, strAccount: PROBE, token: 'invalid_readonly_probe', strPassword: 'invalid_readonly_probe', serverId: SID };
      for (const port of PORTS) {
        for (const cmd of [2820, 2818, 2819]) {
          beforeGuard(); const response = await native(port, cmd, params); assertGate(response.data);
          output.gates.push({ port, cmd, code: response.data.code });
        }
        beforeGuard();
        const rest = await request(port, '/api/user/login', { accountId: PROBE, password: 'invalid_readonly_probe', serverId: SID });
        assert.equal(rest.status, 403); assertGate(rest.data);
        output.gates.push({ port, rest: true, code: rest.data.code });
      }
      output.ws = [await wsGate('ws://127.0.0.1:9202'), await wsGate('ws://127.0.0.1:81/ws-s3')];
      assert.equal(await players.countDocuments({ isBot: { $ne: true } }), 0, 'PUBLIC_ROLE_CREATED_BY_PROBE');
    } else output.gateProbes = 'SKIPPED_AFTER_OR_NEAR_OPEN_NO_LOGIN_MUTATIONS';
    output.probeResidue = await residue();
    assert.deepEqual(output.probeResidue, { accounts: 0, players: 0 });
    output.expectedServerNew = SID;
    console.log('SERVER3_LAUNCH_QA=' + JSON.stringify(output));
  } finally { await client.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
