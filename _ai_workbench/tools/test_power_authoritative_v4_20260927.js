'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const authPath = path.join(root, 'linhhoasu/webgame/game/js/lhs-power-authoritative-v1.js');
const hudPath = path.join(root, 'linhhoasu/webgame/game/js/lhs-hud-power-full-v1.js');
const indexPath = path.join(root, 'linhhoasu/webgame/game/index.html');
const authSource = fs.readFileSync(authPath, 'utf8');
const hudSource = fs.readFileSync(hudPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

assert.match(authSource, /20260927_power_authoritative_v4/);
assert.match(hudSource, /20260927_hud_power_full_v3/);
assert.match(hudSource, /api\.render\s*=\s*render/);
assert.match(index, /lhs-hud-power-full-v1\.js\?v=20260927_hud_power_full_v3/);
assert.match(index, /lhs-power-authoritative-v1\.js\?v=20260927_power_authoritative_v4/);

// Regression: an older/lazy HUD object may exist without render(). It must
// not abort apply() before the authoritative +/- tip path runs.
const timers = [];
const calls = [];
const handlers = {};
const tips = [];
const views = new Map();
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
  dispatch() {},
  addListener() {},
};
MessageCenter.ins = () => center;
function MainPanel() {}
function PowerCell() {}
PowerCell.prototype.dataChanged = function () {};
const mainCell = { data: 0, stage: true, parent: null, addEventListener() {} };
const mainView = { skinName: 'MainPanelSkin', powerCell: mainCell };
mainCell.parent = mainView;
views.set(MainPanel, mainView);
const role = { _oldPower: 0, calAllPower() { return 926454824; } };
const manager = {
  ActorModel: { actorID: 'p-self' },
  RoleModel: role,
  PlayerInfoModel: { playerInfo },
  ViewManager: { getView(Type) { return views.get(Type) || null; } },
};
const socket = {
  connected: true,
  AddHandler(tag, fn, context) { handlers[tag] = payload => fn.call(context, payload); },
  Rpc(tag, data, callback, context) { calls.push({ tag, data, callback, context }); },
};
function GameSocket() {}
GameSocket.ins = () => socket;
const definitions = { GameSocket, UserTips, MessageCenter, MainPanel, PowerCell };
const context = {
  GameGlobalYDXZ: manager,
  UserInfo: { UserID: 'u-self', ServerID: 1001 },
  GameSocket, UserTips, MessageCenter, MainPanel, PowerCell,
  // Deliberately missing render(), matching the live v3 failure.
  LhsHudPowerFullV1: { installed: true },
  MessageDef: { MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE' },
  SocketMessageDef: { SOCKET_CLOSE: 'SOCKET_CLOSE', SOCKET_CONNECTED: 'SOCKET_CONNECTED' },
  egret: { Event: { ADDED_TO_STAGE: 'add', REMOVED_FROM_STAGE: 'remove' },
    getDefinitionByName(name) { return definitions[name]; } },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
  console: { warn() {}, info() {} },
};
vm.createContext(context);
vm.runInContext(authSource, context, { filename: authPath });
const api = context.LhsPowerAuthoritativeV1;
assert.equal(api.version, '20260927_power_authoritative_v4');
assert.ok(calls.length >= 1);
calls[0].callback({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 837700000, powerScore: 8377000,
  powerUnit: 'native-weighted-point', revision: 1 });
handlers[6198]({ result: 0, playerId: 'p-self', serverId: 1001,
  power: 837803451, powerScore: 8378034,
  powerUnit: 'native-weighted-point', revision: 2 });
assert.equal(api.applied, 2);
assert.equal(mainCell.data, 837803451);
assert.deepEqual(tips, [{ before: 837700000, after: 837803451 }]);
assert.equal(api.renderErrors, 0);
assert.ok(api.rendererMissing >= 2);

// The HUD addon must expose the capability expected by authoritative sync.
const hudTimers = [];
function HudPowerCell() {}
HudPowerCell.prototype.dataChanged = function () {};
function HudMainPanel() {}
HudMainPanel.prototype.OnOpen = function () {};
HudMainPanel.prototype.updatePower = function () {};
function HudMainPanelNew() {}
HudMainPanelNew.prototype.OnOpen = function () {};
HudMainPanelNew.prototype.updatePower = function () {};
const hudContext = {
  window: null,
  PowerCell: HudPowerCell,
  MainPanel: HudMainPanel,
  MainPanelNew: HudMainPanelNew,
  egret: { getDefinitionByName() { return null; } },
  setTimeout(fn) { hudTimers.push(fn); return hudTimers.length; },
  clearTimeout() {},
  console: { warn() {}, info() {} },
};
hudContext.window = hudContext;
vm.createContext(hudContext);
vm.runInContext(hudSource, hudContext, { filename: hudPath });
const hud = hudContext.LhsHudPowerFullV1;
assert.equal(typeof hud.render, 'function');
const label = { text: '', textWidth: 120, left: 0, validateNow() {} };
const hudCell = { __lhsFullPowerHud: true, __lhsFullPowerClosed: false,
  powerLabel: label, __lhsFullPowerLocalWidth: 350 };
hud.render(hudCell, 837803451);
assert.equal(label.text, '837.803.451');

console.log(JSON.stringify({ result: 'PASS', checks: 17,
  acceptedSnapshots: api.applied, rendererMissing: api.rendererMissing,
  delta: tips[0].after - tips[0].before, hudText: label.text }));
