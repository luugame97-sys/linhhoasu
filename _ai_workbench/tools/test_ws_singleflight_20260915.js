'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const app = process.env.LHS_APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const original = path.join(app, 'src/net/WSServer.js');
let WSServer;
if (process.env.WS_CANDIDATE_PATH) {
  const candidate = new Module(original, module);
  candidate.filename = original;
  candidate.paths = Module._nodeModulePaths(path.dirname(original));
  candidate._compile(fs.readFileSync(process.env.WS_CANDIDATE_PATH, 'utf8'), original);
  WSServer = candidate.exports;
} else {
  WSServer = require(original);
}

async function run(tag) {
  let release; const handled = [], responses = [];
  const server = Object.create(WSServer.prototype);
  server.queueWarnDepth = 8; server.handlerStuckWarnMs = 3000;
  server._handleSingleMessage = async (_ws, msg) => { handled.push(msg); await new Promise(resolve => { release = resolve; }); };
  server.sendResponse = (_ws, response) => responses.push(response);
  const session = {
    wsId: 1, _closing: false, _queueDepth: 0, _queueSequence: 0,
    _messageQueue: Promise.resolve(), _singleFlightTags: new Set(), _singleFlightLogAt: new Map(),
    player: { formationInfo: { level: 8, exp: 4 }, swordInfo: { data: [{ uid: 7, level: 9 }] } }
  };
  const ws = {};
  server._enqueueMessage(ws, { tag, msgUid: 1, data: { uid: 7 } }, session);
  for (let uid = 2; uid <= 500; uid += 1) {
    server._enqueueMessage(ws, { tag, msgUid: uid, data: { uid: 7 } }, session);
  }
  await Promise.resolve(); await Promise.resolve();
  assert.equal(handled.length, 1); assert.equal(session._queueDepth, 1);
  assert.equal(responses.length, 499); assert(responses.every(row => row.data.code === 'REQUEST_ALREADY_PENDING'));
  release(); await session._messageQueue;
  assert.equal(session._queueDepth, 0); assert.equal(session._singleFlightTags.size, 0);
  return responses[0];
}
(async () => {
  const formation = await run(3001); assert.equal(formation.data.level, 8);
  const mount = await run(3204); assert.equal(mount.data.data.uid, 7);
  console.log(JSON.stringify({ result: 'PASS', checks: 10, tags: [3001, 3204], floodPerTag: 500, coalescedPerTag: 499, queueMax: 1 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
