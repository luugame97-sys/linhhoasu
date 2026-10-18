'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = path.resolve(__dirname, '..');
const clientPath = path.resolve(app, '../../webgame/game/js/lhs-power-authoritative-v1.js');
const indexPath = path.resolve(app, '../../webgame/game/index.html');
const source = fs.readFileSync(clientPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

assert.match(source, /20260927_power_authoritative_v3/);
assert.match(source, /TAG = 6198/);
assert.match(index, /lhs-power-authoritative-v1\.js\?v=20260927_power_authoritative_v3/);

const timers = [];
const cleared = new Set();
const dispatches = [];
const renders = [];
const calls = [];
const handlers = {};
const role = { _oldPower: 123, changeAttr() {} };
const cell = { data: 0, __lhsFullPowerHud: false };
function MainPanel() {}
function MainPanelNew() {}
const views = new Map([
  [MainPanel, { powerCell: cell }],
  [MainPanelNew, { powerCell: cell }],
]);
const center = { dispatch(name, value) { dispatches.push({ name, value }); } };
function MessageCenter() {}
MessageCenter.ins = () => center;
const socket = {
  connected: true,
  AddHandler(tag, fn, context) { handlers[tag] = (payload) => fn.call(context, payload); },
  Rpc(tag, data, callback, context, error) {
    calls.push({ tag, data, callback, context, error });
  },
};
function GameSocket() {}
GameSocket.ins = () => socket;

const context = {
  GameGlobalYDXZ: {
    ActorModel: { actorID: 'p-1001' },
    RoleModel: role,
    ViewManager: { getView(Type) { return views.get(Type) || null; } },
  },
  UserInfo: { UserID: 'u-1', ServerID: 1001 },
  GameSocket,
  MainPanel,
  MainPanelNew,
  MessageCenter,
  MessageDef: { MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE' },
  LhsHudPowerFullV1: { render(target, value) { renders.push({ target, value }); } },
  LhsPowerCellsFullV1: { render(target, value) { renders.push({ target, value }); } },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout(id) { cleared.add(id); },
  console: { warn() {}, info() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: clientPath });

assert.equal(context.LhsPowerAuthoritativeV1.version, '20260927_power_authoritative_v3');
assert.equal(context.LhsPowerAuthoritativeV1.installed, true);
assert.equal(Object.keys(handlers).includes('6198'), true);

// First polling pass must opt the connection into the light server packet.
const firstTick = timers.shift();
assert.equal(typeof firstTick, 'function');
firstTick();
assert.equal(calls.length, 1);
assert.equal(calls[0].tag, 6198);

// The RPC response is the first authoritative value.
calls[0].callback({ result: 0, playerId: 'p-1001', serverId: 1001, power: 200000, powerScore: 2000, powerUnit: 'native-weighted-point', revision: 1 });
assert.equal(context.LhsPowerAuthoritativeV1.applied, 1);
assert.equal(role._oldPower, 200000);
assert.equal(role._lhsServerPower, 200000);
assert.equal(cell.data, 200000);
assert.ok(renders.some((row) => row.value === 200000));
assert.ok(dispatches.some((row) => row.name === 'POWER' && row.value === 200000));

// Later unsolicited tag=6198 packets must update the HUD without a full tag=500 login refresh.
handlers[6198]({ result: 0, playerId: 'p-1001', serverId: 1001, power: 210000, powerScore: 2100, powerUnit: 'native-weighted-point', revision: 2 });
assert.equal(context.LhsPowerAuthoritativeV1.applied, 2);
assert.equal(cell.data, 210000);

// Cross-account/server packets are rejected and cannot overwrite the current player.
handlers[6198]({ result: 0, playerId: 'other', serverId: 1001, power: 999999999, powerScore: 9999, powerUnit: 'native-weighted-point', revision: 3 });
handlers[6198]({ result: 0, playerId: 'p-1001', serverId: 1002, power: 999999999, powerScore: 9999, powerUnit: 'native-weighted-point', revision: 4 });
assert.equal(context.LhsPowerAuthoritativeV1.applied, 2);
assert.equal(context.LhsPowerAuthoritativeV1.rejected, 2);
assert.equal(cell.data, 210000);

console.log(JSON.stringify({
  result: 'PASS', checks: 16, requested: context.LhsPowerAuthoritativeV1.requested,
  applied: context.LhsPowerAuthoritativeV1.applied, rejected: context.LhsPowerAuthoritativeV1.rejected,
  handlers: Object.keys(handlers).length,
}));
