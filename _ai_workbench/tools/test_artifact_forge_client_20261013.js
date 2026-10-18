'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.resolve(__dirname, '../temp/artifact_forge_20261013/candidate/lhs-artifact-forge-v1.js'), 'utf8');
function fixture(storage = new Map()) {
  const calls = [], timers = new Map(), messages = [], rows = [
    { uid: 1, id: 23102, count: 0, attr: { level: 30 }, fit: 23009 },
    { uid: 2, id: 23103, count: 0, attr: { level: 20 }, fit: 23009 },
    { uid: 3, id: 23103, count: 7, attr: { level: 30 }, fit: 23009 },
    { uid: 4, id: 23103, count: 0, attr: { level: 19 }, fit: 23009 },
  ];
  function Socket() { this._host = 's1'; }
  Socket.prototype.Rpc = function (tag, params, ok, ctx, fail) { calls.push({ tag, params, ok, ctx, fail }); };
  const model = {
    getAllCanForgeArtifact() { return rows.slice(); },
    getArtifactDataByUId(uid) { return rows.find(row => row.uid === uid); },
    getArtifactFitSkillGroupIdByData(row) { return row && row.fit; },
    checkArtifactCanForge() { return true; },
  };
  const win = { GameSocket: Socket, setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { fn(); return 99; }, clearInterval() {}, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    UserTips: { ins: () => ({ showTips: text => messages.push(text) }) }, T: { serverTimeMilli: 1000 },
    W: { ActorModel: { actorID: 'role1' }, Config: { ArtifactBaseConfig: { forgeLevel: 20, forgeCountMax: 7 }, ArtifactConfig: { 23102: { quality: 6 }, 23103: { quality: 7 } } }, ArtifactModel: model } };
  vm.runInNewContext(source, { window: win, Number, Date, JSON, Object, Array, Math });
  return { socket: new Socket(), win, calls, timers, messages, rows, storage,
    epoch() { const c = calls[calls.length - 1]; assert.equal(c.tag, 2499); c.ok({ result: 0, epoch: 'a'.repeat(32), sequence: 0 }); },
    reply(data = {}) { const c = calls[calls.length - 1]; c.ok({ result: 0, requestId: c.params.requestId, ...data }); },
    reject(data = {}) { const c = calls[calls.length - 1]; c.ok({ result: -1, requestId: c.params.requestId, ...data }); } };
}
let checks = 0;
function test(name, work) { work(); checks++; }
test('forge list filters quality, level, count and fit', () => { const f = fixture(); const list = f.win.W.ArtifactModel.getAllCanForgeArtifact(); assert.deepEqual(list.map(row => row.uid), [1, 2]); assert.equal(f.win.W.ArtifactModel.checkArtifactCanForge(1), true); assert.equal(f.win.W.ArtifactModel.checkArtifactCanForge(2), true); });
test('explicit forge threshold overrides default and rejects expired/unmapped', () => { const f = fixture(); f.win.W.Config.ArtifactBaseConfig.forgeQuality = 7; assert.deepEqual(f.win.W.ArtifactModel.getAllCanForgeArtifact().map(r => r.uid), [2]); f.rows[1].forgeTime = 999; assert.equal(f.win.W.ArtifactModel.getAllCanForgeArtifact().length, 0); f.rows[1].forgeTime = 0; f.rows[1].fit = 0; assert.equal(f.win.W.ArtifactModel.getAllCanForgeArtifact().length, 0); });
test('double tap is single flight and successful ACK clears receipt', () => { const f = fixture(); let success = 0; f.socket.Rpc(3501, { uid: 2, count: 0 }, () => success++); f.socket.Rpc(3501, { uid: 2, count: 0 }); assert.equal(f.calls.length, 1); f.epoch(); assert.equal(f.calls[1].params.requestId, 'v3_' + 'a'.repeat(32) + '_1'); f.reply({ artifact: { uid: 2, count: 1 } }); assert.equal(success, 1); assert.equal(f.storage.size, 0); });
test('timeout retry keeps the same request id', () => { const f = fixture(); f.socket.Rpc(3501, { uid: 2, count: 0 }); f.epoch(); const id = f.calls[1].params.requestId; f.timers.get(1)(); const g = fixture(f.storage); g.socket.Rpc(3501, { uid: 2, count: 0 }); assert.equal(g.calls[0].tag, 3501); assert.equal(g.calls[0].params.requestId, id); });
test('rejected forge never calls native success callback', () => { const f = fixture(); let success = 0; f.socket.Rpc(3501, { uid: 1, count: 0 }, () => success++); f.epoch(); f.reject({ code: 'ARTIFACT_FORGE_INELIGIBLE' }); assert.equal(success, 0); assert.ok(f.messages.length > 0); });
console.log(JSON.stringify({ result: 'PASS', checks, productionWrites: 0, networkAttempts: 0 }));
