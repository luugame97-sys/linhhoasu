'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/lhs-fishing-x10-v2.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop200.js'), 'utf8');
const cardSection = bundle.slice(bundle.indexOf('i(y0t,g0t=Q),(mTt=y0t.prototype)'));
const onOpen = cardSection.slice(cardSection.indexOf('mTt.OnOpen=function') + 'mTt.OnOpen='.length, cardSection.indexOf(',mTt.updateContent='));
assert.ok(onOpen.startsWith('function') && onOpen.endsWith('}'));
const count = bundle.match(/getAutoMutlFishCount=(function\(\)\{return U9\.autoConfig\.fishing_mutl\?3:1\})/)[1];
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }

function fixture() {
  let now = 1791680000000, seq = 0;
  const timers = new Map(), storage = new Map(), calls = [], notices = [];
  function Base() { this.children = []; this.stage = {}; this.width = 620; this.height = 780; }
  Base.prototype.addChild = function (c) { this.children.push(c); c.parent = this; c.stage = this.stage; return c; };
  Base.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parent = null; c.stage = null; };
  Base.prototype.getChildAt = function (i) { return this.children[i]; };
  Object.defineProperty(Base.prototype, 'numChildren', { get() { return this.children.length; } });
  function Button() { Base.call(this); this.skinName = 'NativeGetButtonSkin'; this.enabled = true; }
  Button.prototype = Object.create(Base.prototype);
  Button.prototype.addEventListener = function (_, fn) { this.tap = fn; };
  function Label() { Base.call(this); }
  Label.prototype = Object.create(Base.prototype);
  function Rect() { Base.call(this); }
  Rect.prototype = Object.create(Base.prototype);
  function Card() { Base.call(this); this.btnGet = new Button(); this.nativeOpens = 0; }
  Card.prototype = Object.create(Base.prototype);
  Card.prototype.observe = function () {};
  Card.prototype.updateContent = function () { this.nativeOpens++; };
  Card.prototype.OnClose = function () { this.closed = true; };
  Card.getKey = () => 'native-card-read';
  function Fish() {}
  Fish.prototype.isUnlockAutoFish = () => false;
  const recharge = { _rechargeInfo: { monthCards: {} }, getMonthCardExpireTime(id) { return this._rechargeInfo.monthCards[id] || 0; },
    onMonthcardsUpdate(data) { this._rechargeInfo.monthCards[data.id] = data.time; } };
  const items = { value: 10000, GetItemCount() { return this.value; }, onItemChange(p) { this.value = p.changed[0].count; } };
  const bus = { dispatch() {}, dispatchImmediate() {} };
  const m = { RechargeModel: recharge, ActorModel: { actorID: 'role-a' }, MessageCenter: bus,
    ItemModel: items, UserTips: { showTips(t) { notices.push(t); } } };
  const data = { serverId: 1001, expiresAt: 0, tokenCount: 10000, serverTime: now };
  const controls = { hold: false, error: '', data };
  recharge.Rpc = function (tag, params, success, failure) {
    assert.equal(arguments.length, 4, 'native BaseSystem.Rpc signature');
    assert.equal(typeof failure, 'function'); assert.equal(tag, 1230);
    calls.push({ params, success, failure });
    if (controls.hold) return;
    if (controls.error && !params.query) return success({ result: -1, code: controls.error, ...data });
    if (!params.query) { data.tokenCount -= 2400; data.expiresAt = Math.max(now, data.expiresAt) + 86400000; }
    success({ result: 0, ...data });
  };
  const ctx = { console, Math, Number, String, JSON, Uint32Array, Date: { now: () => now },
    setTimeout(fn, ms) { timers.set(++seq, { fn, ms }); return seq; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { timers.set(++seq, { fn, ms, repeat: true }); return seq; }, clearInterval(id) { timers.delete(id); },
    crypto: { getRandomValues(bytes) { for (let i = 0; i < bytes.length; i++) bytes[i] = ++seq; } },
    localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, v); }, removeItem(k) { storage.delete(k); } },
    eui: { Group: Base, Button, Label, Rect }, egret: { TouchEvent: { TOUCH_TAP: 'tap' } },
    FishingCard: Card, FishingModel: Fish, GlobalManager: m, UserInfo: { ServerID: 1001, UserID: 'account-a' },
    GameServer: { serverTimeMilli: now }, MessageDef: { FISH_MUTL_UPDATE: 'count' },
    Y: m, E: {}, A: { ins: () => bus }, y0t: Card, U9: { autoConfig: { fishing_mutl: true } }
  };
  ctx.egret.localStorage = ctx.localStorage; ctx.window = ctx;
  vm.createContext(ctx);
  Card.prototype.OnOpen = vm.runInContext('(' + onOpen + ')', ctx);
  Fish.prototype.getAutoMutlFishCount = vm.runInContext('(' + count + ')', ctx);
  m.FishingModel = new Fish();
  vm.runInContext(source, ctx);
  return { ctx, m, controls, calls, storage, timers, Card, source, tickTimeout() {
    for (const [id, t] of [...timers]) if (t.ms === 20000 && !t.repeat) { timers.delete(id); t.fn(); }
  }, advance(ms) { now += ms; ctx.GameServer.serverTimeMilli = now; } };
}

check('native nested tab OnOpen attaches without ViewManager.open and preserves native content', () => {
  const f = fixture(), p = new f.Card(); p.OnOpen(); p.OnOpen();
  assert.equal(p.nativeOpens, 2); assert.equal(p.children.length, 1); assert.equal(p.children[0].label, 'Đặc quyền câu cá x10');
  vm.runInContext(source, f.ctx); p.OnOpen(); assert.equal(p.children.length, 1);
});
check('popup queries without purchase, shows zero/positive balance, closes without orphan timer', () => {
  const f = fixture(), p = new f.Card(); p.OnOpen(); p.children[0].tap();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].params.query, true);
  const g = p.children[1], buy = g.children.find(x => x.label && x.label.startsWith('Mua'));
  assert.equal(buy.enabled, true); assert.ok(g.children.some(x => (x.text || '').includes('10.000')));
  p.OnClose(); assert.equal(p.children.length, 1); assert.equal(f.timers.size, 0);
});
check('x1/x3 fallback, purchase exact 2400 and x10 with native card independent', () => {
  const f = fixture(), model = f.m.FishingModel;
  assert.equal(model.getAutoMutlFishCount(), 3); f.ctx.U9.autoConfig.fishing_mutl = false; assert.equal(model.getAutoMutlFishCount(), 1);
  f.ctx.LhsFishingX10V2.purchase(r => assert.equal(r.result, 0));
  assert.equal(f.m.ItemModel.value, 7600); assert.equal(model.getAutoMutlFishCount(), 10);
  assert.equal(model.isUnlockAutoFish(), false); assert.equal(f.m.RechargeModel._rechargeInfo.monthCards[11000009], undefined);
  f.advance(86400001); assert.equal(model.getAutoMutlFishCount(), 1);
});
check('entitlement survives client relog through native monthCards, query zero clears old entitlement', () => {
  const f = fixture(); f.m.RechargeModel._rechargeInfo.monthCards[11000022] = f.ctx.Date.now() + 10000;
  assert.equal(f.ctx.LhsFishingX10V2.active(), true);
  f.ctx.LhsFishingX10V2.query(); assert.equal(f.ctx.LhsFishingX10V2.active(), false);
});
check('S2 no button/query/purchase/x10 even with an unexpired local card', () => {
  const f = fixture(); f.ctx.UserInfo.ServerID = 1002;
  const p = new f.Card(); p.OnOpen(); assert.equal(p.children.length, 0);
  f.m.RechargeModel._rechargeInfo.monthCards[11000022] = f.ctx.Date.now() + 86400000;
  f.ctx.LhsFishingX10V2.purchase(r => assert.equal(r.code, 'FISH_X10_S1_ONLY'));
  assert.equal(f.calls.length, 0); assert.equal(f.m.FishingModel.getAutoMutlFishCount(), 3);
});
check('business rejection releases pending, a fresh purchase can follow', () => {
  const f = fixture(); f.controls.error = 'FISH_X10_NOT_ENOUGH_TOKEN';
  f.ctx.LhsFishingX10V2.purchase(); const first = f.calls[1].params.requestId;
  assert.equal(f.storage.size, 0); f.controls.error = ''; f.ctx.LhsFishingX10V2.purchase();
  assert.notEqual(f.calls[3].params.requestId, first); assert.equal(f.m.ItemModel.value, 7600);
});
check('timeout retries same receipt; double click and late callback cannot debit another purchase', () => {
  const f = fixture(); f.ctx.LhsFishingX10V2.query();
  const params = { id: 11000022, multi: 1, requestId: f.ctx.Date.now() + '-fx10_pending111' };
  f.storage.set('lhs-fishing-x10:1001:role-a', JSON.stringify(params)); f.controls.hold = true;
  f.ctx.LhsFishingX10V2.purchase(); f.ctx.LhsFishingX10V2.purchase(); assert.equal(f.calls.length, 2);
  const late = f.calls[1].success; f.tickTimeout(); f.ctx.LhsFishingX10V2.purchase();
  assert.equal(f.calls[2].params.requestId, params.requestId);
  late({ result: 0, ...f.controls.data, expiresAt: f.ctx.Date.now() + 86400000 });
  assert.equal(f.ctx.LhsFishingX10V2.active(), false);
  f.calls[2].success({ result: 0, replayed: true, ...f.controls.data, tokenCount: 7600, expiresAt: f.ctx.Date.now() + 86400000 });
  assert.equal(f.storage.size, 0); assert.equal(f.m.ItemModel.value, 7600);
});
check('storage failure remains owner scoped and changing owner ignores old ACK', () => {
  const f = fixture();
  f.ctx.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  // Query succeeds, purchase waits.
  const native = f.m.RechargeModel.Rpc;
  f.m.RechargeModel.Rpc = function (tag, p, cb, fail) { f.controls.hold = !p.query; native.call(this, tag, p, cb, fail); };
  f.ctx.LhsFishingX10V2.purchase(); const old = f.calls[1]; f.tickTimeout();
  f.m.ActorModel.actorID = 'role-b'; f.ctx.LhsFishingX10V2.purchase();
  assert.equal(f.calls[2].params.query, true); assert.notEqual(f.calls[3].params.requestId, old.params.requestId);
  old.success({ result: 0, ...f.controls.data, expiresAt: f.ctx.Date.now() + 86400000 });
  assert.equal(f.ctx.LhsFishingX10V2.active(), false);
});
console.log(JSON.stringify({ result: 'PASS', checks, productionWrites: 0, networkAttempts: 0, nativeMethodsExtracted: ['FishingCard.OnOpen', 'FishingModel.getAutoMutlFishCount'] }));
