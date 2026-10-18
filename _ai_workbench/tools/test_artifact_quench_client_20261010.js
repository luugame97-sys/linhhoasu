'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../../linhhoasu/webgame/game/js/lhs-artifact-quench-v1.js'), 'utf8');
function fixture(storage = new Map()) {
  const calls = [], timers = new Map(), messages = [], bag = {}, artifacts = {};
  let timeId = 0;
  function Socket() { this._host = 's1'; }
  Socket.prototype.Rpc = function (tag, params, ok, ctx, fail) { calls.push({ tag, params, ok, ctx, fail }); };
  const win = { GameSocket: Socket, setTimeout(fn) { timers.set(++timeId, fn); return timeId; }, clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    UserTips: { ins: () => ({ showTips: m => messages.push(m) }) },
    W: { ActorModel: { actorID: 'role1' }, ItemModel: { onItemChange: p => p.changed.forEach(row => { bag[row.id] = row.count; }) },
      ArtifactModel: { getArtifactDataByUId: uid => artifacts[uid], updateArtifactDate: row => { artifacts[row.uid] = row; } } } };
  vm.runInNewContext(source, { window: win, Number, Date, JSON, Object, Array, Math });
  return { socket: new Socket(), win, calls, timers, messages, bag, artifacts, storage,
    epoch: () => { const c = calls[calls.length - 1]; assert.equal(c.tag, 2499); c.ok({ result: 0, epoch: 'a'.repeat(32), sequence: 4 }); },
    reply: (data = {}) => { const c = calls[calls.length - 1]; c.ok({ result: 0, requestId: c.params.requestId, ...data }); } };
}
let checks = 0;
function test(name, work) { work(); checks++; }
test('unrelated RPC unchanged', () => {
  const f = fixture(), data = { x: 1 }; f.socket.Rpc(1000, data); assert.equal(f.calls[0].params, data);
});
test('epoch, one flight, ACK and absolute material sync', () => {
  const f = fixture(); let callbacks = 0;
  f.socket.Rpc(3505, { uid: 1, element: 0 }, () => callbacks++); f.socket.Rpc(3505, { uid: 1, element: 0 });
  assert.equal(f.calls.length, 1); f.epoch(); assert.equal(f.calls[1].params.requestId, 'v3_' + 'a'.repeat(32) + '_5');
  f.reply({ artifact: { uid: 1, quenchLv: 1 }, itemCounts: [{ id: 191, count: 95 }] });
  assert.equal(callbacks, 1); assert.equal(f.bag[191], 95); assert.equal(f.storage.size, 0); assert.equal(f.artifacts[1].quenchLv, 1);
});
test('timeout retry after page reload retains request ID', () => {
  const f = fixture(); f.socket.Rpc(3506, { uid: 1, element: 2 }); f.epoch(); const first = f.calls[1].params.requestId;
  [...f.timers.values()][0](); const g = fixture(f.storage); g.socket.Rpc(3506, { uid: 1, element: 2 });
  assert.equal(g.calls.length, 1); assert.equal(g.calls[0].tag, 3506); assert.equal(g.calls[0].params.requestId, first);
  g.reply({ replayed: true, refreshCache: { element: 2, eSkillGroup: 2320201 } }); assert.equal(g.storage.size, 0);
});
test('rejection never invokes native success callback', () => {
  const f = fixture(); let success = 0; f.socket.Rpc(3505, { uid: 1 }, () => success++); f.epoch();
  f.reply({ result: -1, code: 'ARTIFACT_MATERIALS_NOT_ENOUGH', itemCounts: [{ id: 191, count: 0 }] });
  assert.equal(success, 0); assert.equal(f.storage.size, 0); assert.equal(f.bag[191], 0); assert.ok(f.messages.length > 0);
});
test('late ACK after timeout cannot overwrite new owner', () => {
  const f = fixture(); f.socket.Rpc(3505, { uid: 1 }); f.epoch(); f.win.W.ActorModel.actorID = 'role2';
  f.reply({ artifact: { uid: 1, quenchLv: 1 }, itemCounts: [{ id: 191, count: 3 }] });
  assert.equal(f.artifacts[1], undefined); assert.equal(f.bag[191], undefined);
});
test('shared sequence advances and pending confirm survives failure', () => {
  const f = fixture(); f.socket._lhsFeatureEpoch = { id: 'a'.repeat(32), seq: 9 };
  f.socket.Rpc(3507, { uid: 1 }); f.epoch(); assert.equal(f.calls[1].params.requestId, 'v3_' + 'a'.repeat(32) + '_10');
  assert.equal(f.socket._lhsFeatureEpoch.seq, 10); f.calls[1].fail({ code: 'NETWORK_ERROR' });
  assert.equal(f.storage.size, 1); f.socket.Rpc(3506, { uid: 1 }); assert.equal(f.calls.length, 2);
  f.socket.Rpc(3507, { uid: 1 }); assert.equal(f.calls[2].params.requestId, f.calls[1].params.requestId);
});
test('response mismatch stays unresolved', () => {
  const f = fixture(); let success = 0; f.socket.Rpc(3505, { uid: 1 }, () => success++); f.epoch();
  f.reply({ requestId: 'wrong' }); assert.equal(success, 0); assert.equal(f.storage.size, 1);
});
console.log(JSON.stringify({ result: 'PASS', checks, productionWrites: 0, networkAttempts: 0 }));
