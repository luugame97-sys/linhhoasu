'use strict';
// RAM-only transport/native-client regression. No player or network access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const dir = path.resolve(process.argv[2] || path.join(root, 'linhhoasu/webgame/game/js'));
const maintenance = fs.readFileSync(path.join(dir, 'lhs-event-maintenance-v1.js'), 'utf8');
const fuluPath = path.join(dir, 'lhs-fulu-safe-v1.js');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
function common() {
  const calls = [], tips = [], warnings = [];
  let hidden = 0;
  class Base { Rpc(tag, payload, callback, failure) { calls.push({tag, payload, callback, failure}); } }
  const ctx = vm.createContext({BaseSystem: Base, console: {warn: x => warnings.push(x)},
    UserTips: {ins: () => ({showTips: x => tips.push(x)})},
    GlobalManager: {ViewManagerImpl: {HideLoading: () => hidden++}}});
  ctx.window = ctx;
  vm.runInContext(maintenance, ctx);
  return {ctx, calls, tips, warnings, model: new Base(), hidden: () => hidden};
}
for (const tag of [1700, 1000, 1801]) for (const id of [21001, 27001, 30001, 52001]) {
  test('silent refusal ' + tag + '/' + id + ' clears loading without success/retry', () => {
    const h = common(); let callback = 0, failure = 0;
    h.model.Rpc(tag, {id}, () => callback++, () => failure++);
    h.calls[0].callback({result: -1, code: 'EVENT_MAINTENANCE', id});
    assert.equal(h.tips.length, 0);
    assert.equal(h.hidden(), 1);
    assert.equal(callback, 0); assert.equal(failure, 0); assert.equal(h.calls.length, 1);
  });
}
test('successful responses and other errors still reach their original callbacks', () => {
  const h = common(), replies = [{result: 0}, {result: 1, code: 'NOT_ENOUGH'}, null];
  for (const reply of replies) {
    let received = false;
    h.model.Rpc(1700, {id: 43002}, value => {assert.equal(value, reply); received = true;});
    h.calls.at(-1).callback(reply); assert.equal(received, true);
  }
  assert.equal(h.hidden(), 0);
});
test('unrelated RPC and transport error handlers remain intact', () => {
  const h = common(); let failure = 0;
  const callback = () => {};
  h.model.Rpc(1202, {}, callback, () => failure++);
  assert.equal(h.calls[0].callback, callback);
  h.calls[0].failure(); assert.equal(failure, 1);
});
function fulu() {
  const base = path.join(__dirname, 'test_fulu_safe_client_20261007.js');
  const source = fs.readFileSync(base, 'utf8')
    .replace(/const guard = .*;/, 'const guard = fs.readFileSync(' + JSON.stringify(fuluPath) + ', "utf8");')
    .replace('vm.runInContext(guard, ctx);',
      'ctx.BaseSystem = Model; vm.runInContext(' + JSON.stringify(maintenance) + ', ctx); vm.runInContext(guard, ctx);')
    .replace('return {ctx, data, model,', 'return {timers, storage, ctx, data, model,');
  const m = new Module(base, module); m.filename = base; m.paths = module.paths;
  m._compile(source, base);
  return m.exports.harness();
}
function idle(h) {
  assert.equal(h.notices.length, 0);
  assert.equal(h.storage.size, 0);
  assert.equal(h.timers.filter(t => t.ms === 12000 && !t.cleared).length, 0);
  assert.equal(h.ctx.LhsFuluSafeV1.completed, 0);
  assert.equal(h.panel.rendered, undefined);
  assert.equal(h.data.score, 0); assert.equal(h.getItem233(), 99);
}
test('Fulu draw refusal releases controls, pending receipt and retry timer silently', () => {
  const h = fulu(); h.panel.onSummonBtnClick(); const c = h.calls[0];
  c.success({...c.payload, result: 1, code: 'EVENT_MAINTENANCE', datas: []});
  idle(h); assert.equal(h.panel.summonBtn.touchEnabled, true);
  assert.equal(h.panel.closeBtn.touchEnabled, true);
  c.success(h.response(c)); assert.equal(h.data.score, 0, 'late success must be ignored');
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2, 'next explicit action is unblocked');
});
test('Fulu selection refusal restores selection without notice or retry', () => {
  const h = fulu(); h.panel._selectedHuluIndex = 2; h.panel.onYesBtnClick(); const c = h.calls[0];
  c.success({...c.payload, result: 1, code: 'EVENT_MAINTENANCE', datas: []});
  idle(h); assert.equal(h.data.record, 4); assert.equal(h.panel.chooseHulu.touchEnabled, true);
});
for (const tag of [1000, 1801]) test('Fulu task ' + tag + ' refusal clears pending silently', () => {
  const h = fulu();
  h.taskModel.Rpc(tag, {ids: [75001], type: 52001 | (1 << 30)}, () => assert.fail('success callback'));
  const c = h.calls[0]; c.success({...c.payload, result: -1, code: 'EVENT_MAINTENANCE', ids: []});
  idle(h); assert.equal(h.tasks[0].status, 20);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('Fulu non-maintenance refusal still explains a real error', () => {
  const h = fulu(); h.panel.onSummonBtnClick(); const c = h.calls[0];
  c.success({...c.payload, result: 1, code: 'NOT_ENOUGH', reason: 'Không đủ vật phẩm', datas: []});
  assert.deepEqual(h.notices, ['Không đủ vật phẩm']);
  assert.equal(h.panel.summonBtn.touchEnabled, true);
});
console.log(JSON.stringify({result: failed ? 'FAIL' : 'PASS', passed, failed,
  mode: 'RAM-only native client methods', productionWrites: 0, networkAttempts: 0}));
process.exitCode = failed ? 1 : 0;
