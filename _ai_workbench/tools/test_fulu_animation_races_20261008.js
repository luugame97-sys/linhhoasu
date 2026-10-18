'use strict';
// Independent, RAM-only scheduling regressions. No browser/network/DB use.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const addon = path.resolve(process.argv[2] || path.join(root, '_ai_workbench/temp/fulu_qa_20261008/candidate/webgame/game/js/lhs-fulu-safe-v1.js'));
const base = path.join(__dirname, 'test_fulu_safe_client_20261007.js');
const nativePath = path.join(root, '_ai_workbench/temp/event_goal_20261007/before/webgame/game/js/main.min_drop200.js');
const code = fs.readFileSync(base, 'utf8')
  .replace(/const source = .*;/, 'const source = fs.readFileSync(' + JSON.stringify(nativePath) + ', "utf8");')
  .replace(/const guard = .*;/, 'const guard = fs.readFileSync(' + JSON.stringify(addon) + ', "utf8");')
  // The ordinary safe-client harness omits the native animation callbacks.
  // Install the extracted callbacks before the addon so its wrappers are
  // exercised against the real callback ordering.
  .replace('vm.runInContext(guard, ctx);',
    "Object.assign(Panel.prototype, {onHuluDropHit: native('onHuluDropHit'), onHuluDropComplete: native('onHuluDropComplete'), performFinalJudgment: native('performFinalJudgment')}); vm.runInContext(guard, ctx);");
let passed = 0, failed = 0;
function test(name, fn) {
  const m = new Module(base, module); m.filename = base; m.paths = module.paths;
  m._compile(code + '\nmodule.exports.extract = extract;', base);
  const h = m.exports.harness();
  h.native = name => vm.runInContext('(' + m.exports.extract(name) + ')', h.ctx);
  try { fn(h); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
test('duplicate cleanup must not unlock while first reward popup awaits dismissal', h => {
  h.panel.onSummonBtnClick(); h.calls[0].success(h.response(h.calls[0]));
  h.panel.showRewardsAndCleanup();
  h.panel.showRewardsAndCleanup();
  h.panel.onSummonBtnClick();
  assert.equal(h.calls.length, 1, 'second cleanup released active draw behind popup');
});
for (const order of ['hit-first', 'complete-first']) for (const multiple of [1,2,3,4,5]) {
  test('native ' + order + ' ordering x' + multiple + ' must reach rewards', h => {
    const p = h.panel, hits = [], completions = [], timers = [];
    let popupCount = 0;
    h.ctx.E.ACTIVITY_FULU_DROP_HIT = 'hit'; h.ctx.E.ACTIVITY_FULU_DROP_COMPLETE = 'complete';
    h.ctx.A = {ins: () => ({dispatch(type, value) {
      if (type === 'hit') p.onHuluDropHit(value);
      if (type === 'complete') p.onHuluDropComplete(value);
    }})};
    h.ctx.Y.SoundManager = {PlayEffect() {}};
    h.ctx.y = {ins: () => ({doTimer(ms, times, fn, receiver) {
      (ms === 166 ? hits : timers).push(() => fn.call(receiver));
    }})};
    h.ctx.Er = {Open() {popupCount++;}};
    h.ctx.F = {get() {return {to() {return this;}};}};
    p._currentMultiple = multiple; p.skipCheckBox.selected = false;
    for (const name of ['generateHuluArray','shuffleArray','startHuluDropAnimation','dropNextHulu',
      'showHuluWithAnimation','onAllHulusDropped']) p[name] = h.native(name);
    p.startBackgroundAnimation = () => p.startHuluDropAnimation();
    p.resultImage.loadEnsure = () => ({then() {return {catch() {}};}});
    p.checkAndUpdateResultImage = p.playScreenShakeEffect = () => {};
    p._fuluItems = Array.from({length: 5}, () => ({
      huluBlock: {y: 0, skeleton: {}, skeletonData: {}, state: {},
        clearSpineEventHandler() {}, registerSpineEventHandler(fn) {this.done = fn;},
        play(name) {if (name === 'a_2') completions.push(this.done);},
        loadEnsure() {return {then(fn) {fn(); return {catch() {}};}};}
      },
      playGrassAnimation() {},
      playDropAnimation: h.native('playDropAnimation'), onFallComplete: h.native('onFallComplete')
    }));
    p.onSummonBtnClick(); h.calls[0].success(h.response(h.calls[0]));
    // Independent native callbacks: flush Spine COMPLETE first, then HIT timers.
    if (order === 'hit-first') {
      while (hits.length || completions.length) {
        if (hits.length) hits.shift()();
        if (completions.length) completions.shift()();
      }
    } else {
      while (completions.length) completions.shift()();
      while (hits.length) hits.shift()();
    }
    while (timers.length) timers.shift()();
    assert.equal(p._droppedHuluCount, 5);
    assert.equal(popupCount, 1, 'five completed drops, no reward popup until 60s watchdog');
  });
}
console.log(JSON.stringify({passed, failed, mode: 'RAM-only adverse native callback ordering', productionWrites: 0}));
process.exitCode = failed ? 1 : 0;
