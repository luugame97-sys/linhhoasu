'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');

const source = process.argv[2] || 'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js';
const code = fs.readFileSync(source, 'utf8');
const sent = [];
const responses = [];
const toasts = [];

function GameSocket() {}
GameSocket.prototype.Rpc = function (tag, data, callback, context, onError) {
  sent.push({ tag, data });
  const next = responses.shift();
  if (!next) return;
  if (next.error) {
    if (onError) onError.call(context, next.error);
  } else if (callback) {
    callback.call(context, next.value);
  }
};

const root = {
  GameSocket,
  UserTips: { ins: () => ({ showTips: (message) => toasts.push(message) }) },
  W: { LandModel: { _cacheUseItem: {} } },
  performance: { now: () => Date.now() },
};
const context = vm.createContext({ window: root, Date, Math, setTimeout, clearTimeout });
vm.runInContext(code, context, { filename: source });

const socket = new GameSocket();
responses.push({ value: { result: -1, msg: 'not logged in' } });
socket.Rpc(2403, {}, () => { throw new Error('auth failure reached success callback'); });
assert.equal(sent.length, 1);
assert.equal(toasts.length, 0);
assert.equal(socket._lhsAuthLost, true);

socket.Rpc(2417, {}, () => { throw new Error('suppressed request reached success callback'); });
assert.equal(sent.length, 1, 'farm polling must stop after auth loss');
assert.equal(toasts.length, 0);

responses.push({ value: { result: 0 } });
socket.Rpc(1, {}, () => {});
assert.equal(socket._lhsAuthLost, false, 'successful login must reopen farm RPCs');

responses.push({ value: { result: 0 } });
socket.Rpc(2403, {}, () => {});
assert.equal(sent.length, 3);

responses.push({ value: { result: -1, code: 'AUTH_REQUIRED', msg: 'not logged in' } });
socket.Rpc(2406, { itemId: 27, count: 1 }, () => { throw new Error('auth failure reached write callback'); });
assert.equal(socket._lhsAuthLost, true);
assert.equal(toasts.length, 0);

responses.push({ value: { result: 0 } });
socket.Rpc(1, {}, () => {});
responses.push({ value: { result: -1, code: 'insufficient_materials' } });
socket.Rpc(2403, {}, () => {});
assert.equal(sent.length, 6, 'non-auth rejection is still sent after a fresh login');
assert.equal(toasts.length, 1, 'non-auth rejection keeps the existing user feedback');

console.log(JSON.stringify({ result: 'PASS', sent: sent.length, toasts: toasts.length, authFailures: root.LhsFarmAlchemyV2.authFailures }));
