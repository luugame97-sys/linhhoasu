'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(
  process.env.PLAYER_HEALTHBAR_SCRIPT || 'linhhoasu/webgame/game/js/lhs-player-healthbar-v1.js',
  'utf8'
);
const bundle = fs.readFileSync(
  process.env.PLAYER_HEALTHBAR_BUNDLE || '_ai_workbench/temp/drop100_release_20260914/main.min_drop100.js',
  'utf8'
);
assert(bundle.includes('this.dbid=t.showInfo.dbid'), 'native EntityData must retain player dbid');

function MapRaid() { this.roleEnityType = 7; this.entities = {}; }
MapRaid.prototype.AddTeam = function (handle, members) {
  const data = members[0], calls = [];
  const entity = {
    m_Model: { GetTopPos: () => ({ x: 1, y: -99 }) },
    GetInfo: () => data,
    hpBar: {}, ShowBloodBar: () => calls.push('show'), GetHpBar() { return this.hpBar; },
    SetHpBarValue: (hp, max) => calls.push(['hp', hp, max]),
    UpdateBloodPos: pos => calls.push(['pos', pos])
  };
  this.entities[String(handle)] = entity;
  return { GetMapEntity: () => entity, calls };
};
MapRaid.prototype.GetEntity = function (handle) { return this.entities[String(handle)]; };
function DungeonMapRaid() { MapRaid.call(this); }
DungeonMapRaid.prototype = Object.create(MapRaid.prototype);
DungeonMapRaid.prototype.constructor = DungeonMapRaid;
DungeonMapRaid.prototype.MapentityHpChange = function () { throw Error('native raid gate called'); };
function MapEntity(info) {
  this.m_Info = info;
  this.mRaid = { roleEnityType: 7 };
  this.skinTop = 0;
  this.m_NameTxt = node(this, 0, 0, 0, 25);
  // Same nested centering structure as MapEntityTxtSkin; placeholder y=189
  // must be transformed through its parents, never clamped or summed alone.
  const group = node(this.m_NameTxt, -28, -179, 56, 203);
  this.m_NameTxt.txt = node(group, 0, 189, 80, 20, 0.7, 0.7);
  this.m_NameTxt.getPlayerNamePart = function () { return this.txt; };
  this.m_NameTxt.getBounds = () => ({ x: -100, y: -200, width: 200, height: 400 });
  this.m_HpBar = node(this, 0, 0, 0, 0);
  const track = node(this.m_HpBar, -38, -8, 76, 16);
  this.m_HpBar.thumb = node(track, 2, 2, 72, 12);
}
function node(parent, x, y, width, height, scaleX = 1, scaleY = 1) {
  return { parent, x, y, width, height, scaleX, scaleY, visible: true,
    validateNow() {},
    getTransformedBounds(target) {
      let x = 0, y = 0, w = this.width, h = this.height, p = this;
      while (p !== target) {
        if (!p) throw Error('unrelated coordinate spaces');
        const sx = p.scaleX ?? 1, sy = p.scaleY ?? 1;
        x = p.x + x * sx; y = p.y + y * sy;
        w *= sx; h *= sy; p = p.parent;
      }
      return { x: Math.min(x, x + w), y: Math.min(y, y + h), width: Math.abs(w), height: Math.abs(h) };
    }
  };
}
MapEntity.prototype.GetInfo = function () { return this.m_Info; };
MapEntity.prototype.GetHpBar = function () { return this.m_HpBar; };
MapEntity.prototype.UpdateBloodPos = function (position) {
  this.m_HpBar.x = position.x;
  this.m_HpBar.y = position.y;
};
MapEntity.prototype.UpateName = function () { this.m_NameTxt.y = this.skinTop - 30; };
MapEntity.prototype.updateLastSpinePos = function () { return false; };
function DungeonMapEntity(info) { MapEntity.call(this, info); }
DungeonMapEntity.prototype = Object.create(MapEntity.prototype);
DungeonMapEntity.prototype.constructor = DungeonMapEntity;
DungeonMapEntity.prototype.UpateName = function () { this.m_NameTxt.y = -55; };
function ProgressBar() {
  this.labelDisplay = { visible: false, text: '', size: 0 };
  this.thumb = {};
}
ProgressBar.prototype.validateNow = function () {};
function MainPanel() {}
MainPanel.prototype.OnOpen = function () { this.opened = true; };
MainPanel.prototype.OnClose = function () { this.closed = true; };
function MainPanelNew() { MainPanel.call(this); }
MainPanelNew.prototype = Object.create(MainPanel.prototype);
MainPanelNew.prototype.constructor = MainPanelNew;
const intervals = new Map(); let intervalId = 0;
const selfInfo = { type: 7, dbid: 'self', attributeData: { 1: 600, 2: 1000 } };
const selfEntity = { GetInfo: () => selfInfo };
const globalManager = {
  RoleModel: { getAllAttr: () => ({ 1: 1000 }) },
  ActorModel: { actorID: 'self' },
  RaidMgr: { mMapRaid: { GetEntity: id => String(id) === 'self' ? selfEntity : null } }
};

const ctx = vm.createContext({
  window: null, MapRaid, DungeonMapRaid, MapEntity, DungeonMapEntity, MainPanel, MainPanelNew,
  GlobalManager: globalManager, eui: { ProgressBar },
  VariableType: { Hp: 1, MaxHp: 2 },
  Number, console: { warn() {}, info() {} },
  setTimeout() { throw Error('unexpected retry'); },
  setInterval(fn) { const id = ++intervalId; intervals.set(id, fn); return id; },
  clearInterval(id) { intervals.delete(id); }
});
ctx.window = ctx;
vm.runInContext(source, ctx);
assert.equal(ctx.LhsPlayerHealthBarV1.installed, true);
assert.equal(ctx.LhsPlayerHealthBarV1.version, '20260917_player_healthbar_reanchor_v8');

const normal = new MapRaid();
const player = normal.AddTeam('p1', [{ type: 7, dbid: 'p1', attributeData: { 1: 7345, 2: 10000 } }]);
assert.deepEqual(player.calls, ['show', ['hp', 7345, 10000], ['pos', { x: 1, y: -99 }]]);
const monster = normal.AddTeam('m1', [{ type: 8, bloodPer: 2000 }]);
assert.deepEqual(monster.calls, []);
const npcSameType = normal.AddTeam('n1', [{ type: 7, attributeData: { 1: 2000, 2: 10000 } }]);
assert.deepEqual(npcSameType.calls, []);

const special = new DungeonMapRaid();
const self = special.AddTeam('self', [{ type: 7, dbid: 'self', attributeData: { 1: 45, 2: 90 } }]);
assert.deepEqual(self.calls, ['show', ['hp', 45, 90], ['pos', { x: 1, y: -99 }]]);
special.MapentityHpChange('self', 2500, 10000);
assert.deepEqual(self.calls.slice(-4), ['show', ['hp', 45, 90], ['pos', { x: 1, y: -99 }], ['hp', 2500, 10000]]);
const dungeonMonster = special.AddTeam('dm', [{ type: 9, dbid: 'monster' }]);
special.MapentityHpChange('dm', 1, 10000);
assert.deepEqual(dungeonMonster.calls, []);
assert.equal(ctx.LhsPlayerHealthBarV1.shown, 3);
assert.equal(ctx.LhsPlayerHealthBarV1.errors, 0);

const mapPlayer = new MapEntity({ type: 7, dbid: 'map-player' });
mapPlayer.UpateName();
assert.equal(mapPlayer.m_NameTxt.y, -48);
assert.equal(mapPlayer.m_HpBar.y, -13);
mapPlayer.UpateName();
assert.equal(mapPlayer.m_NameTxt.y, -48);
assert.equal(mapPlayer.m_HpBar.y, -13);
mapPlayer.UpdateBloodPos({ x: 100, y: -999 });
assert.equal(mapPlayer.m_HpBar.y, -13);
const mapNpc = new MapEntity({ type: 7, dbid: '' });
mapNpc.UpateName();
assert.equal(mapNpc.m_NameTxt.y, -30);
const dungeonPlayer = new DungeonMapEntity({ type: 7, dbid: 'dungeon-player' });
dungeonPlayer.UpateName();
assert.equal(dungeonPlayer.m_NameTxt.y, -73);
assert.equal(dungeonPlayer.m_HpBar.y, -38);

// Regression: visible track top must be 3px below the actual name at every
// skin height, scale, mirrored parent and late EUI layout, regardless of HP.
let geometryChecks = 0;
for (const top of [-60, -180, -360, 0]) {
  mapPlayer.skinTop = top;
  for (const sx of [1, -1, 0.75]) {
    mapPlayer.m_NameTxt.scaleX = sx;
    mapPlayer.m_NameTxt.scaleY = 1.25;
    mapPlayer.m_HpBar.scaleY = 1.12;
    mapPlayer.UpateName();
    mapPlayer.m_NameTxt.txt.parent.y -= 7; // late layout after name callback
    for (let i = 0; i < 5; i++) {
      mapPlayer.m_HpBar.thumb.width = i * 14; // includes empty HP
      mapPlayer.updateLastSpinePos();
      const label = mapPlayer.m_NameTxt.txt.getTransformedBounds(mapPlayer);
      const track = mapPlayer.m_HpBar.thumb.parent.getTransformedBounds(mapPlayer);
      assert(Math.abs(track.y - label.y - label.height - 3) < 1e-8);
      assert(Math.abs(track.x + track.width / 2 - label.x - label.width / 2) < 1e-8);
      geometryChecks += 2;
    }
  }
}
const initializing = new MapEntity({type: 7, dbid: 'loading'});
initializing.m_HpBar = null;
initializing.GetHpBar = () => { throw Error('must not create bar during name init'); };
assert.doesNotThrow(() => initializing.UpateName());
const invalidLayout = new MapEntity({type: 7, dbid: 'invalid-layout'});
invalidLayout.m_NameTxt.txt.getTransformedBounds = () => { throw Error('skin not ready'); };
assert.doesNotThrow(() => invalidLayout.UpateName());
assert.equal(invalidLayout.__lhsBarPositionSyncing, false);
assert.equal(invalidLayout.__lhsPlayerNameSyncing, false);

function panel(Type, left) {
  const parent = { top: 27, children: [], addChild(row) { this.children.push(row); row.parent = this; } };
  const view = new Type();
  view.playerNameLabel = { parent, verticalCenter: 8 };
  view.powerCell = { left };
  return view;
}
const oldPanel = panel(MainPanel, 125);
oldPanel.OnOpen();
assert.equal(oldPanel.__lhsHudHealthBar.__lhsText, '600/1000');
assert.equal(oldPanel.__lhsHudHealthBar.height, 23);
assert.equal(oldPanel.__lhsHudHealthBar.y, 27);
assert.equal(oldPanel.playerNameLabel.verticalCenter, -13);
assert.equal(oldPanel.playerNameLabel.parent.top, 16);
assert.equal(oldPanel.playerNameLabel.parent.height, 55);
assert.equal(oldPanel.__lhsHudHealthBar.x + oldPanel.__lhsHudHealthBar.width < oldPanel.powerCell.left, true);
assert.equal(oldPanel.powerCell.left, 170);
selfInfo.attributeData[1] = 375;
intervals.get(oldPanel.__lhsHudHealthTimer)();
assert.equal(oldPanel.__lhsHudHealthBar.__lhsText, '375/1000');
oldPanel.OnClose();
assert.equal(oldPanel.__lhsHudHealthTimer, null);
const newPanel = panel(MainPanelNew, 144);
newPanel.OnOpen();
assert.equal(newPanel.powerCell.left, 189);
newPanel.OnClose();

vm.runInContext(source, ctx);
assert.equal(MapRaid.prototype.AddTeam.__lhsPlayerHealthBarV1, true);

// Real Egret geometry, not a full EUI renderer or browser E2E. Shapes stand
// in for label glyphs and textures, keeping genuine content bounds, matrix
// transforms, anchor offsets and nested containers from the shipped engine.
const engineContext = vm.createContext({ Audio: function () {}, console });
engineContext.window = engineContext;
vm.runInContext(fs.readFileSync(process.env.PLAYER_HEALTHBAR_ENGINE
  || 'linhhoasu/webgame/game/js/egret.min_7d668222.js', 'utf8'), engineContext);
const egret = engineContext.egret;
function realGroup(parent, x = 0, y = 0) {
  const group = new egret.DisplayObjectContainer();
  group.x = x; group.y = y;
  if (parent) parent.addChild(group);
  return group;
}
function realShape(parent, x, y, width, height) {
  const shape = new egret.Shape();
  shape.graphics.beginFill(0xffffff);
  shape.graphics.drawRect(x, y, width, height);
  shape.graphics.endFill();
  parent.addChild(shape);
  return shape;
}
function realEntity(dbid) {
  const entity = realGroup(null);
  entity.m_Info = { type: 7, dbid };
  entity.mRaid = { roleEnityType: 7 };
  entity.skinTop = -180;
  for (const key of ['GetInfo', 'UpateName', 'UpdateBloodPos', 'updateLastSpinePos']) {
    entity[key] = MapEntity.prototype[key];
  }
  const name = entity.m_NameTxt = realGroup(entity);
  const nameGroup = realGroup(name, -28, -179);
  const row = name.txt = realShape(nameGroup, -3, -4, 80, 20);
  row.y = 189;
  row.scaleX = row.scaleY = 0.7;
  name.getPlayerNamePart = function () { return this.txt; };
  const bar = entity.m_HpBar = realGroup(entity);
  const track = realGroup(bar, -38, -8);
  realShape(track, -2, -1, 76, 16);
  const thumb = bar.thumb = realShape(track, 0, 0, 72, 12);
  thumb.x = thumb.y = 1;
  return entity;
}
let realEngineChecks = 0;
let realEngineMaxError = 0;
const actualPlayer = realEntity('geometry-player');
for (const top of [-60, -180, -360]) {
  actualPlayer.skinTop = top;
  for (const scale of [1, -1, 0.75]) {
    actualPlayer.m_NameTxt.scaleX = scale;
    actualPlayer.m_NameTxt.scaleY = 1.25;
    actualPlayer.m_NameTxt.anchorOffsetY = 7;
    actualPlayer.m_HpBar.scaleY = 1.12;
    actualPlayer.UpateName();
    actualPlayer.m_NameTxt.txt.parent.y -= 9; // EUI layout completes later.
    actualPlayer.m_NameTxt.txt.parent.scaleY = 1.15;
    actualPlayer.m_NameTxt.scaleX *= 1.2; // Costume resize without UpateName.
    for (const hpScale of [1, 0.5, 0]) {
      actualPlayer.m_HpBar.thumb.scaleX = hpScale;
      for (let frame = 0; frame < 4; frame++) {
        // Continuous costume/name layout changes, without UpateName callbacks.
        actualPlayer.m_NameTxt.scaleX = scale * (1 + frame * 0.1);
        actualPlayer.m_NameTxt.scaleY = 1 + frame * 0.15;
        actualPlayer.m_NameTxt.txt.parent.y -= frame + 1;
        actualPlayer.updateLastSpinePos();
        const label = actualPlayer.m_NameTxt.txt.getTransformedBounds(actualPlayer);
        const track = actualPlayer.m_HpBar.thumb.parent.getTransformedBounds(actualPlayer);
        const gapError = Math.abs(track.y - label.y - label.height - 3);
        const centerError = Math.abs(track.x + track.width / 2 - label.x - label.width / 2);
        realEngineMaxError = Math.max(realEngineMaxError, gapError, centerError);
        assert(gapError <= 1,
          'real Egret track must stay immediately below actual label content');
        assert(centerError <= 1,
          'real Egret track must stay horizontally centered under label');
        realEngineChecks += 2;
      }
    }
  }
}
const actualNpc = realEntity('');
actualNpc.m_HpBar.x = 20;
actualNpc.m_HpBar.y = 40;
actualNpc.UpateName();
actualNpc.updateLastSpinePos();
assert.equal(actualNpc.m_NameTxt.y, actualNpc.skinTop - 30);
assert.equal(actualNpc.m_HpBar.x, 20);
assert.equal(actualNpc.m_HpBar.y, 40);
realEngineChecks += 3;
console.log(JSON.stringify({ result: 'PASS', geometryChecks, realEngineChecks, realEngineMaxError, playerOnly: true, npcMonsterUnchanged: true, nativeDbidContract: true, mapNameRaise: 18, mapBarAnchor: 'rendered label bottom to track top +3', mapNameIdempotent: true, hudNameCenter: -13, hudBarY: 27, hud: 'current/max', hudHeight: 23, powerShift: 45 }));
