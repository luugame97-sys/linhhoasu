'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const guard = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/lhs-socket-send-v3.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/egretex.min_37b3ee13.js'), 'utf8');
// Extract actual shipped engine methods, not a hand-written equivalent.
const setter = engine.match(/t\._setSocket=(function\(t\)\{.*?\}),t\.connect=/)[1];
const sender = engine.match(/t\.send=(function\(t\)\{return this\.socket!==this\._nativeSocket.*?\}),t\.close=/)[1];
let checks = 0;
function fixture(missingDescriptor = false) {
  const states = new WeakMap();
  const sent = [];
  class NativeSocket {
    constructor() { states.set(this, 0); }
    get readyState() { if (!states.has(this)) throw new TypeError('Illegal invocation'); return states.get(this); }
    send(data) {
      if (!states.has(this)) throw new TypeError('Illegal invocation');
      if (this.sendError) throw this.sendError;
      assert.strictEqual(states.get(this), 1);
      sent.push({ socket: this, data });
      return 'native-return';
    }
  }
  if (missingDescriptor) delete NativeSocket.prototype.readyState;
  const context = vm.createContext({ WebSocket: NativeSocket, console });
  context.window = context;
  vm.runInContext(guard, context);
  vm.runInContext('function Adapter(){}; Adapter.prototype._bindEvent=function(){};' +
    'Adapter.prototype._setSocket=' + setter + ';Adapter.prototype.send=' + sender + ';' +
    'egret={web:{HTML5WebSocket:Adapter}};', context);
  assert.strictEqual(context.LhsSocketSendV3.install(), true);
  return { context, states, sent, NativeSocket, adapter: new context.Adapter() };
}
function rejected(fn, code) { assert.throws(fn, e => e.code === code); checks++; }
const f = fixture();
rejected(() => f.adapter.send('not sent'), 'LHS_SOCKET_NOT_INITIALIZED');
f.adapter._setSocket('ws://fixture');
rejected(() => f.adapter.send('connecting'), 'LHS_SOCKET_NOT_OPEN');
f.states.set(f.adapter._nativeSocket, 1);
assert.strictEqual(f.adapter.send('first'), 'native-return'); checks++;
const originalSocket = f.adapter._nativeSocket;
f.adapter.socket = { send() { throw new Error('wrong holder'); } };
f.adapter._nativeSend = f.NativeSocket.prototype.send; // unbound regression
f.adapter.send('unbound repaired');
assert.strictEqual(f.sent.at(-1).socket, originalSocket); checks++;
f.adapter._nativeSend = () => { throw new Error('tampered sender'); };
f.NativeSocket.prototype.send = () => { throw new Error('tampered prototype'); };
f.adapter.send('immutable capture'); checks++;
for (let n = 0; n < 20; n++) {
  const old = f.adapter._nativeSocket;
  f.adapter._setSocket('ws://fixture-reconnect');
  f.states.set(f.adapter._nativeSocket, 1);
  f.adapter._nativeSend = data => old.send(data);
  f.adapter.send('generation-' + n);
  assert.strictEqual(f.sent.at(-1).socket, f.adapter._nativeSocket);
  assert.notStrictEqual(f.sent.at(-1).socket, old);
} checks++;
const current = f.adapter._nativeSocket;
f.adapter._nativeSocket = Object.create(f.NativeSocket.prototype);
rejected(() => f.adapter.send('fake'), 'LHS_SOCKET_STALE_GENERATION');
f.adapter._nativeSocket = current;
for (const state of [0, 2, 3]) {
  f.states.set(current, state);
  rejected(() => f.adapter.send('closed'), 'LHS_SOCKET_NOT_OPEN');
}
f.states.set(current, 1);
const nativeError = new Error('fixture sensitive message');
current.sendError = nativeError;
assert.throws(() => f.adapter.send('fixture secret payload'), e => e === nativeError); checks++;
assert(!JSON.stringify(f.context.LhsSocketSendV3.debug).includes('sensitive'));
assert(!JSON.stringify(f.context.LhsSocketSendV3.debug).includes('secret')); checks++;
const before = f.sent.length;
f.context.WebSocket = class OtherSocket { send() {} };
rejected(() => f.adapter._setSocket('ws://class-mismatch'), 'LHS_SOCKET_INVALID_RECEIVER');
rejected(() => f.adapter.send('after failed reconnect'), 'LHS_SOCKET_NOT_INITIALIZED');
assert.strictEqual(f.sent.length, before); checks++;
const connectError = new Error('fixture connection error');
f.context.WebSocket = class FailingSocket { constructor() { throw connectError; } send() {} };
assert.throws(() => f.adapter._setSocket('ws://throw'), e => e === connectError); checks++;
rejected(() => f.adapter.send('after constructor error'), 'LHS_SOCKET_NOT_INITIALIZED');
const unavailable = fixture(true);
rejected(() => unavailable.adapter._setSocket('ws://fixture'), 'LHS_SOCKET_NATIVE_UNAVAILABLE');
assert.strictEqual(unavailable.sent.length, 0); checks++;
// A bound function ignores a synthetic receiver: previous change was equivalent.
const bound = (function () { return this; }).bind(originalSocket);
assert.strictEqual(Reflect.apply(bound, {}, []), originalSocket); checks++;
console.log(JSON.stringify({ result: 'PASS', checks, engineMethodsExtracted: true, nativeNetwork: false }));
