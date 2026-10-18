'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const sourcePath = path.join(root, 'linhhoasu/webgame/game/js/lhs-power-authoritative-v1.js');
const indexPath = path.join(root, 'linhhoasu/webgame/game/index.html');
const source = fs.readFileSync(sourcePath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
assert.match(source, /20260927_power_authoritative_v4/);
assert.match(source, /TAG = 6198/);
assert.match(index, /lhs-power-authoritative-v1\.js\?v=20260927_power_authoritative_v4/);

const timers = [];
const calls = [];
const handlers = {};
const listeners = {};
const tips = [];
const dispatches = [];
const playerInfo = {
  playerId: 'p-self', serverId: 1001, power: 837700000, powerScore: 8377000,
  powerUnit: 'native-weighted-point', roleInfo: {}, equipInfo: {}, level: 182,
};

function UserTips() {}
UserTips.prototype.showPowerTip = function (before, after) { tips.push({ before, after }); };
const userTips = new UserTips();
UserTips.ins = () => userTips;
function MessageCenter() {}
const center = {
  dispatch(name, value) { dispatches.push({ name, value }); },
  addListener(name, fn) { listeners[name] = fn; },
};
MessageCenter.ins = () => center;

const role = { _oldPower: 0, calAllPower() { return 926454824; } };
const manager = {
  ActorModel: { actorID: 'p-self' },
  RoleModel: role,
  PlayerInfoModel: { playerInfo },
  ViewManager: { getView() { return null; } },
};
const socket = {
  connected: true,
  AddHandler(tag, fn, context) { handlers[tag] = payload => fn.call(context, payload); },
  Rpc(tag, data, callback, context) { calls.push({ tag, data, callback, context }); },
};
function GameSocket() {}
GameSocket.ins = () => socket;

const definitions = { GameSocket, UserTips, MessageCenter };
const context = {
  GameGlobalYDXZ: manager,
  UserInfo: { UserID: 'u-self', ServerID: 1001 },
  GameSocket, UserTips, MessageCenter,
  MessageDef: { MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE', ON_LOGIN_INFO_UPDATE: 'LOGIN' },
  SocketMessageDef: { SOCKET_CLOSE: 'SOCKET_CLOSE', SOCKET_CONNECTED: 'SOCKET_CONNECTED' },
  egret: { getDefinitionByName(name) { return definitions[name]; } },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
  console: { warn() {}, info() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const api = context.LhsPowerAuthoritativeV1;
assert.equal(api.version, '20260927_power_authoritative_v4');
assert.equal(api.tipInstalled, true);
assert.equal(calls.length, 1);

// First server value is a silent baseline; it cannot show a login delta.
calls[0].callback({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 837700000, powerScore: 8377000, powerUnit: 'native-weighted-point', revision: 1 });
assert.equal(tips.length, 0);

// A local/native caller is suppressed and can never display 926M.
userTips.showPowerTip(837700000, 926454824);
assert.equal(tips.length, 0);
assert.equal(api.localTipsSuppressed, 1);

// Only the next accepted server snapshot emits the authoritative delta.
handlers[6198]({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 837803451, powerScore: 8378034, powerUnit: 'native-weighted-point', revision: 2 });
assert.deepEqual(tips, [{ before: 837700000, after: 837803451 }]);
assert.equal(api.lastDelta.delta, 103451);
assert.equal(api.deltaEmitted, 1);

handlers[6198]({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 837700000, powerScore: 8377000, powerUnit: 'native-weighted-point', revision: 3 });
assert.deepEqual(tips, [
  { before: 837700000, after: 837803451 },
  { before: 837803451, after: 837700000 },
]);
assert.equal(api.lastDelta.delta, -103451);

// Reconnect starts a silent baseline again; the old stream cannot bleed into it.
listeners.SOCKET_CONNECTED();
handlers[6198]({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 838000000, powerScore: 8380000, powerUnit: 'native-weighted-point', revision: 1 });
assert.equal(tips.length, 2);
handlers[6198]({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 838100000, powerScore: 8381000, powerUnit: 'native-weighted-point', revision: 2 });
assert.equal(tips.length, 3);
assert.deepEqual(tips[2], { before: 838000000, after: 838100000 });

console.log(JSON.stringify({ result: 'PASS', checks: 14,
  deltaUp: 103451, deltaDown: -103451, localTipsSuppressed: api.localTipsSuppressed,
  deltaEmitted: api.deltaEmitted }));
