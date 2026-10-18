'use strict';
// Independent read-only regression harness. No network, DB, player writes or deployment.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/lhs-power-display-v1.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_a6195824.js'), 'utf8');
const animStart = bundle.indexOf('o.playNumAni=function');
const animFn = bundle.slice(animStart + 'o.playNumAni='.length, bundle.indexOf(',o.stopNumAni=', animStart));
function canonical(value, seq = 1, entity = 'self', server = 1001, kind = 'current') {
  return { id: entity, playerId: entity, serverId: server, power: value,
    combatPowerValue: value, combatPowerVersion: 'native-weighted-v1', combatPowerUnit: 'point',
    combatPowerEntityId: entity, combatPowerServerId: server, combatPowerStatus: 'ready',
    combatPowerKind: kind, combatPowerEpoch: 'epoch-a', combatPowerSequence: seq, combatPowerRevision: String(seq) };
}
function fixture() {
  class Display {
    constructor() { this.children = []; this.width = 500; }
    addChild(child) { this.children.push(child); child.parent = this; return child; }
    removeChild(child) { this.children = this.children.filter(x => x !== child); child.parent = null; }
    addEventListener() {}
  }
  class Label extends Display { get textWidth() { return String(this.text || '').length * 15; } }
  const tweens = [];
  const tween = {
    get(target) { const t = { target, to(attrs) { this.attrs = attrs; return this; }, call(cb) { this.cb = cb; return this; } }; tweens.push(t); return t; },
    removeTweens(target) { for (const t of tweens) if (t.target === target) t.cancelled = true; }
  };
  class Animated extends Display {
    get num() { return this._num; }
    set num(n) { this._num = n; if (this.updateText) this.updateText(); }
  }
  Animated.prototype.playNumAni = vm.runInNewContext('(' + animFn + ')', { F: tween });
  class Cell extends Display {
    constructor() { super(); this.powerLabel = this.addChild(new Display()).addChild(new Animated()); this.powerLabel._num = 0; }
    dataChanged() {}
    setValue(n) { this.data = n; }
  }
  class Tip { setData() {} }
  class RoleModel { calAllPower() { return 12; } }
  class Socket { Rpc(tag, data, success) { this.success = success; } }
  const W = { PlayerInfoModel: { playerInfo: canonical(100) }, ActorModel: { actorId: 'self', playerId: 'self' } };
  const context = vm.createContext({ PowerCell: Cell, PowerTipItem: Tip, RoleModel, GameSocket: Socket, W,
    UserInfo: { UserID: 'self', ServerID: 1001 }, eui: { Label }, egret: { Tween: tween } });
  vm.runInContext(script, context);
  const role = new RoleModel(), socket = new Socket();
  return { context, W, role, Cell, RoleModel, receive(payload) { socket.Rpc(2200, {}, () => {}); socket.success(payload); } };
}
const results = [];
function test(name, fn) { try { fn(fixture()); results.push({ name, result: 'PASS' }); } catch (e) { results.push({ name, result: 'FAIL', error: e.message }); } }
test('newer self model update supersedes older RPC cache', f => {
  f.receive(canonical(100, 1));
  f.W.PlayerInfoModel.playerInfo = canonical(150, 2);
  assert.equal(f.role.calAllPower(), 150);
});
test('viewing another player never overwrites self HUD', f => {
  f.receive({ playerInfo: canonical(9000, 1, 'opponent') });
  assert.equal(f.role.calAllPower(), 100);
  assert.equal(f.W.PlayerInfoModel.playerInfo.combatPowerEntityId, 'self');
});
test('same player id on different server never overwrites self HUD', f => {
  f.receive(canonical(9000, 1, 'self', 1002));
  assert.equal(f.role.calAllPower(), 100);
});
test('historical combat snapshot never overwrites current self HUD', f => {
  f.receive(canonical(30, 1, 'self', 1001, 'snapshot'));
  assert.equal(f.role.calAllPower(), 100);
});
test('RPC captured refresh does not freeze subsequent model push', f => {
  f.receive(canonical(100, 1));
  Object.assign(f.W.PlayerInfoModel.playerInfo, canonical(200, 3));
  assert.equal(f.role.calAllPower(), 200);
});
test('repeated install does not wrap RoleModel again', f => {
  const first = f.RoleModel.prototype.calAllPower;
  for (let i = 0; i < 120; i++) f.context.LhsPowerDisplay.install();
  assert.equal(f.RoleModel.prototype.calAllPower, first);
});
test('unrelated ancestor canonical cannot override explicit legacy row', f => {
  const cell = new f.Cell();
  cell.parent = { data: canonical(9000, 1, 'opponent') };
  cell.data = { playerId: 'self', serverId: 1001, power: 100 };
  cell.dataChanged();
  assert.equal(cell.__lhsPowerShownValue, 100);
});
test('animation renders intermediate value not final ancestor snapshot', f => {
  const cell = new f.Cell();
  cell.data = 100; cell.dataChanged();
  cell.parent = { data: canonical(200, 2) };
  cell.playAnim(200);
  cell.powerLabel.num = 150;
  assert.equal(cell.__lhsPowerShownValue, 150);
});
test('stale packet cannot roll back power in same epoch', f => {
  f.receive(canonical(200, 2)); f.receive(canonical(100, 1));
  assert.equal(f.role.calAllPower(), 200);
});
test('valid newer RPC can increase and decrease canonical power', f => {
  f.receive(canonical(200, 2)); assert.equal(f.role.calAllPower(), 200);
  f.receive(canonical(80, 3)); assert.equal(f.role.calAllPower(), 80);
});
test('generatedAt fallback orders packets when epoch is absent', f => {
  const newer = canonical(240, 0);
  delete newer.combatPowerEpoch; delete newer.combatPowerSequence; newer.combatPowerGeneratedAt = 20;
  const older = canonical(120, 0);
  delete older.combatPowerEpoch; delete older.combatPowerSequence; older.combatPowerGeneratedAt = 10;
  f.receive(newer); f.receive(older);
  assert.equal(f.role.calAllPower(), 240);
});
console.log(JSON.stringify({ result: results.some(r => r.result === 'FAIL') ? 'FAIL' : 'PASS',
  tests: results, checks: results.length, actualNativeAnimationMethod: true, nativeUI: false, productionWrites: 0 }, null, 2));
process.exitCode = results.some(r => r.result === 'FAIL') ? 1 : 0;
