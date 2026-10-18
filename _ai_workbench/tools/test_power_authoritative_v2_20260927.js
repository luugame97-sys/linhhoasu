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
assert.doesNotMatch(source, /proto\.calAllPower\s*=/, 'presentation addon must not replace combat calculator');
assert.match(index, /lhs-power-authoritative-v1\.js\?v=20260927_power_authoritative_v4/);

const timers = [];
const calls = [];
const handlers = {};
const dispatches = [];
const renders = [];

const playerInfo = {
  playerId: 'p-self', serverId: 1001, power: 837705799, powerScore: 8377057,
  powerUnit: 'native-weighted-point', roleInfo: {}, equipInfo: {}, level: 182,
};
const roleProto = {
  calAllPower() { return 931805829; },
};
function RoleModel() {}
RoleModel.prototype = roleProto;
const role = new RoleModel();
const manager = {
  ActorModel: { actorID: 'p-self' },
  RoleModel: role,
  PlayerInfoModel: { playerInfo },
  ViewManager: { getView(Type) { return views.get(Type) || null; } },
};

function MainPanel() {}
function MainPanelNew() {}
function PlayerInfoPanel() {}
function RoleInfoPanel() {}
function PowerCell() {}
PowerCell.prototype.dataChanged = function () {};
const mainCell = { data: 0, stage: true, parent: null, addEventListener() {} };
const profileCell = { data: 0, stage: true, parent: null, addEventListener() {} };
const mainView = { skinName: 'MainPanelSkin', powerCell: mainCell };
const profileView = { skinName: 'PlayerInfoPanelSkin', powerCell: profileCell };
mainCell.parent = mainView;
profileCell.parent = profileView;
const views = new Map([[MainPanel, mainView], [MainPanelNew, null], [PlayerInfoPanel, profileView], [RoleInfoPanel, null]]);

const center = { dispatch(name, value) { dispatches.push({ name, value }); } };
function MessageCenter() {}
MessageCenter.ins = () => center;
const socket = {
  connected: true,
  AddHandler(tag, fn, context) { handlers[tag] = payload => fn.call(context, payload); },
  Rpc(tag, data, cb, context) { calls.push({ tag, data, cb, context }); },
};
function GameSocket() {}
GameSocket.ins = () => socket;

const definitions = { RoleModel, PlayerInfoModel: function PlayerInfoModel() {}, PowerCell,
  MainPanel, MainPanelNew, PlayerInfoPanel, RoleInfoPanel, GameSocket };
const context = {
  GameGlobalYDXZ: manager,
  UserInfo: { UserID: 'u-self', ServerID: 1001 },
  MessageCenter, MessageDef: { MAINPANEL_POWER_REFRESH: 'POWER', ROLE_ATTR_UPDATE: 'ROLE' },
  GameSocket, LhsHudPowerFullV1: { render(cell, value) { renders.push({ cell, value }); } },
  LhsPowerCellsFullV1: { render(cell, value) { renders.push({ cell, value }); } },
  PowerCell, MainPanel, MainPanelNew, PlayerInfoPanel, RoleInfoPanel, RoleModel,
  egret: { Event: { ADDED_TO_STAGE: 'add', REMOVED_FROM_STAGE: 'remove' }, getDefinitionByName(name) { return definitions[name]; } },
  setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
  console: { warn() {}, info() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

assert.equal(role.calAllPower(), 931805829, 'native calculator must remain unchanged');
assert.equal(context.LhsPowerAuthoritativeV1.version, '20260927_power_authoritative_v4');
assert.equal(context.LhsPowerAuthoritativeV1.seeded >= 1, true);
assert.equal(context.LhsPowerAuthoritativeV1.getDisplayPower(), 837705799);
assert.equal(mainCell.data, 837705799);
assert.equal(profileCell.data, 837705799);

assert.equal(calls.length >= 1, true);
calls[0].cb({ result: 0, playerId: 'p-self', serverId: 1001, power: 837705799,
  powerScore: 8377057, powerUnit: 'native-weighted-point', revision: 1 });
assert.equal(context.LhsPowerAuthoritativeV1.applied, 1);
assert.equal(mainCell.data, 837705799);

handlers[6198]({ result: 0, playerId: 'other', serverId: 1001, power: 999999999,
  powerScore: 9999, powerUnit: 'native-weighted-point', revision: 2 });
assert.equal(context.LhsPowerAuthoritativeV1.rejected, 1);
assert.equal(mainCell.data, 837705799);

console.log(JSON.stringify({ result: 'PASS', checks: 12, nativePower: role.calAllPower(),
  displayPower: context.LhsPowerAuthoritativeV1.getDisplayPower(), requested: context.LhsPowerAuthoritativeV1.requested,
  applied: context.LhsPowerAuthoritativeV1.applied, rejected: context.LhsPowerAuthoritativeV1.rejected }));
