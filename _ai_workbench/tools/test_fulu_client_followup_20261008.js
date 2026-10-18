'use strict';
// RAM-only native-method harness; no network, player writes or browser actions.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const input = path.resolve(process.argv[2] || path.join(root,
  '_ai_workbench/temp/fulu_qa_20261008/candidate/webgame/game/js/lhs-fulu-safe-v1.js'));
const harnessPath = path.join(__dirname, 'test_fulu_safe_client_20261007.js');
const original = fs.readFileSync(harnessPath, 'utf8');
const harnessSource = original.replace(/const guard = .*;/,
  'const guard = fs.readFileSync(' + JSON.stringify(input) + ', "utf8");');
let passed = 0, failed = 0;
function test(name, fn) {
  const loaded = new Module(harnessPath, module);
  loaded.filename = harnessPath;
  loaded.paths = module.paths;
  loaded._compile(harnessSource + '\nmodule.exports.extract = extract;', harnessPath);
  try {
    const h = loaded.exports.harness();
    h.native = name => vm.runInContext('(' + loaded.exports.extract(name) + ')', h.ctx);
    fn(h); passed++; console.log('PASS ' + name);
  }
  catch (error) {failed++; console.error('FAIL ' + name + ': ' + error.message);}
}
test('actor switch releases pending draw on timeout; old ACK cannot apply', h => {
  h.panel.onSummonBtnClick(); const old = h.calls[0];
  h.ctx.UserInfo.UserID = 'next-actor';
  h.tick(12000);
  assert.equal(h.panel.summonBtn.touchEnabled, true);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[1].payload.requestId, old.payload.requestId);
  old.success(h.response(old)); assert.equal(h.data.score, 0);
});
test('cycle switch releases pending draw on timeout; next cycle has fresh nonce', h => {
  h.panel.onSummonBtnClick(); const old = h.calls[0];
  h.data.endTime = 30; h.tick(12000);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].payload.cycleKey, '52001:10:30');
  assert.notEqual(h.calls[1].payload.requestId, old.payload.requestId);
  old.success(h.response(old)); assert.equal(h.data.score, 0);
});
test('cycle switch must not rollback a new cycle selection', h => {
  h.panel._selectedHuluIndex = 2; h.panel.onYesBtnClick();
  h.data.endTime = 30; h.data.record = 2;
  h.tick(12000); assert.equal(h.data.record, 2);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('1775 before1700 buffers result; 1701 row alone cannot complete draw', h => {
  h.panel.onSummonBtnClick(); const call = h.calls[0], reply = h.response(call);
  h.model.OnActivityDataUpdate({data: reply.datas[0]});
  h.panel.onDrawResult(reply.draw); assert.equal(h.panel.rendered, undefined);
  call.success(reply); assert.ok(h.panel.rendered);
  assert.equal(h.ctx.LhsFuluSafeV1.completed, 1);
  h.panel.onDrawResult(reply.draw); call.success(reply);
  assert.equal(h.ctx.LhsFuluSafeV1.completed, 1);
});
test('1700 before1775 renders once and ignores duplicate push', h => {
  h.panel.onSummonBtnClick(); const call = h.calls[0], reply = h.response(call);
  call.success(reply); const rendered = h.panel.rendered;
  h.panel.onDrawResult(reply.draw); assert.equal(h.panel.rendered, rendered);
  assert.equal(h.ctx.LhsFuluSafeV1.completed, 1);
});
test('missing ACK retries exact payload; earlier valid ACK can settle later attempt', h => {
  h.panel.onSummonBtnClick(); const old = h.calls[0], reply = h.response(old);
  h.panel.onDrawResult(reply.draw); h.tick(12000);
  assert.equal(JSON.stringify(h.calls[1].payload), JSON.stringify(old.payload));
  old.success(reply); assert.equal(h.ctx.LhsFuluSafeV1.completed, 1);
  h.calls[1].success(reply); assert.equal(h.ctx.LhsFuluSafeV1.completed, 1);
});
test('native animation error restores controls without retrying committed draw', h => {
  h.panel.startBackgroundAnimation = () => {throw Error('fixture spine missing');};
  h.panel.onSummonBtnClick(); h.calls[0].success(h.response(h.calls[0]));
  assert.equal(h.panel.summonBtn.touchEnabled, true);
  assert.equal(h.data.score, 1); assert.equal(h.calls.length, 1);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('missing animation completion releases controls at bounded timeout', h => {
  h.panel.onSummonBtnClick(); h.calls[0].success(h.response(h.calls[0]));
  h.tick(60000); assert.equal(h.panel.summonBtn.touchEnabled, true);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('task actor switch clears pending at timeout', h => {
  h.taskModel.sendAllTaskRewardByActivityId(52001);
  h.ctx.UserInfo.UserID = 'next-actor'; h.tick(12000);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('old day task ACK cannot mark a new day task claimed', h => {
  h.ctx.GameServer = {serverTimeMilli: Date.UTC(2026, 9, 7, 16, 59)};
  h.taskModel.sendAllTaskRewardByActivityId(52001); const call = h.calls[0], p = call.payload;
  h.ctx.GameServer.serverTimeMilli += 120000;
  call.success({result: 0, requestId: p.requestId, cycleKey: p.cycleKey, dayKey: p.dayKey,
    ids: p.ids, rewardInfo: {items: [{id: 233, count: 1}]},
    taskInfo: {tasks: {75001: {id: 75001, type: p.type, status: 30, progress: 1}}}});
  assert.equal(h.tasks[0].status, 20);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('old day task timeout releases pending without retransmitting previous day intent', h => {
  h.ctx.GameServer = {serverTimeMilli: Date.UTC(2026, 9, 7, 16, 59)};
  h.taskModel.sendAllTaskRewardByActivityId(52001);
  h.ctx.GameServer.serverTimeMilli += 120000; h.tick(12000);
  assert.equal(h.calls.length, 1);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('skip checkbox does not unlock draw before native reward dismissal', h => {
  h.panel.skipCheckBox.selected = true;
  h.panel.onSummonBtnClick(); h.calls[0].success(h.response(h.calls[0]));
  h.panel.showRewardsAndCleanup(); h.panel.onSummonBtnClick();
  assert.equal(h.calls.length, 1);
  h.closeReward(); h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
for (const multiple of [2,3,4,5]) for (const skip of [false,true]) {
  test('native animation pipeline x' + multiple + ' skip=' + skip + ' reaches rewards', h => {
    const p = h.panel;
    p._currentMultiple = multiple; p.skipCheckBox.selected = skip;
    h.ctx.Y.SoundManager = {PlayEffect() {}};
    h.ctx.y = {ins: () => ({doTimer(ms, times, fn, receiver) {fn.call(receiver);}})};
    let backgroundDone, drops = 0;
    p.spineBg = {
      registerSpineEventHandler(fn) {backgroundDone = fn;},
      clearSpineEventHandler() {},
      play(name) {if (name === 'a_1') backgroundDone();}
    };
    p.checkAndUpdateResultImage = () => {};
    p.playScreenShakeEffect = () => {};
    p.resultImage.loadEnsure = () => ({then() {return {catch() {}};}});
    for (const name of ['generateHuluArray','shuffleArray','startBackgroundAnimation',
      'onBackgroundA1Complete','startHuluDropAnimation','dropNextHulu','showHuluWithAnimation',
      'onHuluDropHit','onHuluDropComplete','onAllHulusDropped','performFinalJudgment']) p[name] = h.native(name);
    p._fuluItems = Array.from({length: 5}, () => ({
      playDropAnimation(color, special) {
        drops++;
        p.onHuluDropHit({item: this, isSpecial: special});
        p.onHuluDropComplete(this);
      }
    }));
    p.onSummonBtnClick(); const call = h.calls[0];
    assert.equal(call.payload.index, multiple);
    call.success(h.response(call));
    assert.equal(drops, 5); assert.equal(p._currentResultArray.length, 5);
    assert.equal(p._pendingRewards.length, 0, 'native reached reward popup');
    assert.equal(p.summonBtn.touchEnabled, false, 'wait for popup dismissal');
    h.closeReward(); assert.equal(p.summonBtn.touchEnabled, true);
    p.onSummonBtnClick(); assert.equal(h.calls.length, 2);
  });
}
console.log(JSON.stringify({passed, failed, mode: 'RAM-only native methods', productionWrites: 0}));
process.exitCode = failed ? 1 : 0;
