'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop200.js'), 'utf8');
const guard = fs.readFileSync(path.join(root, '_ai_workbench/temp/event_goal_20261007/fulu/candidate/client/lhs-fulu-safe-v1.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'linhhoasu/lhs/newServer/scripts/_tables_dump/Activity52Config.json'), 'utf8')).data[52001];
const receipts = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/FeatureReceiptService.js'));
function extract(name, offset = 0) {
  const marker = name + '=function', at = source.indexOf(marker, offset);
  assert.ok(at >= 0, name);
  const start = at + name.length + 1;
  let depth = 0, quote = '', escape = false;
  for (let p = source.indexOf('{', start); p < source.length; p++) {
    const c = source[p];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, p + 1);
  }
  throw Error(name);
}
const storage = new Map();
function harness(options = {}) {
  let seq = 0, rewardCallback, item233 = 99;
  const timers = [], calls = [], notices = [], packets = [];
  const ctx = vm.createContext({console: {log() {}}, Number, Object, Array, Date, Math,
    setTimeout(fn, ms) {const t = {fn, ms, cleared: false}; timers.push(t); return t;},
    clearTimeout(t) {if (t) t.cleared = true;},
    sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)},
    crypto: {randomUUID: () => 'fixture-' + (++seq)}, UserInfo: {ServerID: 1001, UserID: 'admin-fixture'},
    A: {ins: () => ({dispatch() {}})}, E: {}, ROt: {MODULE_SELECT: 0, MODULE_DRAW: 1, MODULE_REWARD: 2},
    UserTips: {ins: () => ({showTips: s => notices.push(s)})},
    S: {ins: () => ({showTipsByLangId: s => notices.push(s)})},
    Er: {Open(reward, cb) {rewardCallback = cb;}}, bjt: {RECORD_DRAWCOUNT_INDEX: 1},
    P: {ins: () => ({open() {}})}, vy: {},
    Ost: {ins: () => ({showCheckBox() {}})}, B: {ConvertLanguageToText: id => id},
    F: {get() {return {set() {return this;}, to() {return this;}};}},
    egret: {Ease: {circOut: {}, circIn: {}}},
    bV: {getActivityTaskType: id => id | (1 << 30)},
  });
  const native = (n, offset) => vm.runInContext('(' + extract(n, offset) + ')', ctx);
  const row = options.row || {id: 52001, startTime: 10, endTime: 20, record: 4, score: 0, records: {1: 0, 2: 0}, extra: {}};
  class Data {
    getPanelConfig() {return config;}
  }
  Object.assign(Data.prototype, {sendDrawHulu: native('sendDrawHulu'), sendSelectHulu: native('sendSelectHulu'),
    sendGetReward: native('sendGetReward', source.indexOf('sendDrawHulu=function'))});
  const data = Object.assign(new Data(), row);
  class Model {
    getActivityDataById() {return data;}
    sendActivityOperate() {throw Error('Original Fulu transport should be replaced');}
    Rpc(tag, payload, success, failure) {
      assert.equal(receipts.read({}, tag, payload), null, 'real receipt service accepts generated client ID');
      const player = {};
      receipts.record(player, tag, payload, {fixture: 'accepted'});
      assert.deepEqual(receipts.read(player, tag, payload), {fixture: 'accepted'});
      calls.push({tag, payload, success, failure});
      if (options.transport) options.transport({tag, payload, success, failure});
    }
    OnActivityDataUpdate(packet) {Object.assign(data, packet.data); packets.push(packet);}
    OnSocketClose() {}
  }
  class Panel {
    constructor() {Object.assign(this, {_actData: data, _score: 0, _currentMultiple: 1,
      summonBtn: {touchEnabled: true}, closeBtn: {touchEnabled: true}, chooseHulu: {touchEnabled: true},
      skipCheckBox: {touchEnabled: true}, resultImage: {}, noHulu: {}, myHulu: {}, _pendingRewards: []});}
    hideAllHulus() {}
    generateHuluArray(colors, special) {this.rendered = {colors, special};}
    startBackgroundAnimation() {}
    updateUI() {}
    checkAndPlayFlyAnimation() {}
    updateMyHuluResource() {}
    updateHuluSelectionDisplay() {}
    hideChooseGrWithFade() {}
    OnClose() {}
  }
  Object.assign(Panel.prototype, {onSummonBtnClick: native('onSummonBtnClick'),
    onYesBtnClick: native('onYesBtnClick', source.indexOf('d.initHuluSelection=function')),
    onDrawResult: native('onDrawResult'), showRewardsAndCleanup: native('showRewardsAndCleanup')});
  const model = new Model();
  const tasks = options.tasks || [{id: 75001, type: 52001 | (1 << 30), status: 20, progress: 1},
    {id: 75002, type: 52001 | (1 << 30), status: 10, progress: 0}];
  class Tasks extends Model {
    getTaskDataByType(type) {return tasks.filter(task => task.type === type);}
    onTaskUpdate(packet) {
      const old = tasks.find(task => task.id === packet.task.id);
      if (old) Object.assign(old, packet.task); else tasks.push(packet.task);
    }
  }
  Object.assign(Tasks.prototype, {sendTaskReward: native('sendTaskReward', 6200000),
    sendTaskRewardPart: native('sendTaskRewardPart', 6200000),
    sendAllTaskRewardByActivityId: native('sendAllTaskRewardByActivityId', 6200000)});
  const taskModel = new Tasks();
  ctx.Y = ctx.GlobalManager = {ActivityModel: model, TaskModel: taskModel, ItemModel: {GetItemCount: id => id === 233 ? item233 : 0},
    Config: {ActivityConfig: {52001: {activityType: 52}}}};
  ctx.FuluMainPanel = Panel;
  ctx.window = ctx;
  vm.runInContext(guard, ctx);
  const panel = new Panel();
  function response(call, patch = {}) {
    const p = call.payload;
    const draw = {id: p.id, requestId: p.requestId, cycleKey: p.cycleKey,
      rewards: [{id: 232, count: 3}], colorCount: {1: 2,2: 1,3: 1,4: 1}, special: 0,
      score: 1, records: {1: 1,2: 0}};
    return {result: 0, id: p.id, requestId: p.requestId, cycleKey: p.cycleKey,
      datas: [{...row, score: 1, records: draw.records}], draw, ...patch};
  }
  function tick(ms) {const t = timers.find(t => !t.cleared && t.ms === ms); assert.ok(t, 'timer ' + ms); t.cleared = true; t.fn();}
  return {ctx, data, model, taskModel, tasks, panel, calls, notices, packets, response, tick,
    setItem233(value) {item233 = value;}, getItem233() {return item233;},
    closeReward() {rewardCallback(); tick(250);}};
}
if (require.main === module) {
let checks = 0;
function test(name, fn) {storage.clear(); fn(harness()); checks++; console.log('PASS ' + name);}
test('native draw busy, ACK + native render, reward dismissal', h => {
  assert.equal(h.ctx.LhsFuluSafeV1.installed, true);
  h.panel.onSummonBtnClick(); h.panel.onSummonBtnClick();
  assert.equal(h.calls.length, 1);
  const reply = h.response(h.calls[0]);
  h.panel.onDrawResult(reply.draw);
  assert.equal(h.panel.rendered, undefined, 'push waits for authoritative ACK');
  h.calls[0].success(reply);
  assert.equal(h.data.score, 1); assert.ok(h.panel.rendered);
  h.panel.showRewardsAndCleanup(); h.panel.onSummonBtnClick();
  assert.equal(h.calls.length, 1, 'no next draw while reward popup');
  h.closeReward(); h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('delayed old draw cannot corrupt newer pending draw', h => {
  h.panel.onSummonBtnClick(); const old = h.response(h.calls[0]);
  h.calls[0].success(old); h.panel.showRewardsAndCleanup(); h.closeReward();
  h.panel.onSummonBtnClick(); h.panel.onDrawResult({...old.draw, score: 900});
  assert.equal(h.data.score, 1); assert.equal(h.ctx.LhsFuluSafeV1.rejectedPackets, 1);
});
test('null/timeout errors retry same intent at most four times', h => {
  h.panel.onSummonBtnClick(); const first = JSON.stringify(h.calls[0].payload);
  h.calls[0].success(null); h.tick(12000); h.calls[2].failure(); h.tick(12000);
  assert.equal(h.calls.length, 4);
  h.calls.forEach(call => assert.equal(JSON.stringify(call.payload), first));
  assert.equal(h.panel.summonBtn.touchEnabled, true);
  assert.equal(storage.size, 1, 'unresolved nonce persists after budget exhaustion');
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 5);
  assert.equal(JSON.stringify(h.calls[4].payload), first, 'manual retry preserves exact nonce/intent');
  h.calls[4].success(h.response(h.calls[4], {replayed: true}));
  assert.equal(storage.size, 0, 'successful reconciliation clears persisted intent');
});
test('explicit reject restores controls and authoritative selection', h => {
  h.panel._selectedHuluIndex = 2; h.panel.onYesBtnClick();
  assert.equal(h.data.record, 2);
  const call = h.calls[0]; call.success(h.response(call, {result: 1, reason: 'FULU_REJECTED', datas: [{
    id: 52001, startTime: 10, endTime: 20, record: 4, score: 0, records: {1: 0,2: 0}}]}));
  assert.equal(h.data.record, 4); assert.equal(h.panel._selectedHuluIndex, 4);
});
test('reconnect preserves ID, changed intent is blocked', h => {
  h.panel.onSummonBtnClick(); const requestId = h.calls[0].payload.requestId;
  h.model.OnSocketClose(); const other = harness();
  other.panel._currentMultiple = 2; other.panel.onSummonBtnClick(); assert.equal(other.calls.length, 0);
  other.panel._currentMultiple = 1; other.panel.onSummonBtnClick();
  assert.equal(other.calls[0].payload.requestId, requestId);
  other.calls[0].success(other.response(other.calls[0], {replayed: true}));
  assert.equal(other.data.score, 1); assert.equal(storage.size, 0);
});
test('malformed ACK draw never updates data, correct replay resolves', h => {
  h.panel.onSummonBtnClick(); const call = h.calls[0];
  call.success(h.response(call, {draw: {}})); assert.equal(h.data.score, 0);
  assert.equal(h.calls.length, 2);
  h.calls[1].success(h.response(h.calls[1], {replayed: true})); assert.equal(h.data.score, 1);
});
test('cycle/account mismatch ignores old response', h => {
  h.panel.onSummonBtnClick(); const call = h.calls[0];
  h.ctx.UserInfo.UserID = 'different-actor'; call.success(h.response(call));
  assert.equal(h.data.score, 0); h.model.OnSocketClose();
});
test('maintenance release validates exact active metadata', h => {
  h.panel.onSummonBtnClick(); const call = h.calls[0], reply = h.response(call);
  assert.equal(h.ctx.LhsFuluSafeV1.onMaintenance({...reply, requestId: 'stale'}), false);
  assert.equal(h.panel.summonBtn.touchEnabled, false);
  assert.equal(h.ctx.LhsFuluSafeV1.onMaintenance({...reply, result: 1}), true);
  assert.equal(h.panel.summonBtn.touchEnabled, true); assert.equal(storage.size, 0);
  call.success(reply); assert.equal(h.panel.rendered, undefined);
});
function taskResponse(call, patch = {}) {
  const p = call.payload;
  return {result: 0, requestId: p.requestId, cycleKey: p.cycleKey, dayKey: p.dayKey,
    ids: p.ids, type: p.type, rewardInfo: {items: [{id: 233, count: 1}]},
    taskInfo: {tasks: {75001: {id: 75001, type: p.type, status: 30, progress: 1}}}, ...patch};
}
test('native login task claim-all→confirmed currency sync→native draw, distinct nonce shapes', h => {
  h.setItem233(0);
  h.taskModel.sendAllTaskRewardByActivityId(52001);
  assert.equal(h.calls.length, 1); const task = h.calls[0];
  assert.equal(task.tag, 1000); assert.deepEqual(Array.from(task.payload.ids), [75001]);
  assert.equal(task.payload.module, undefined); assert.equal(task.payload.selectedColor, undefined);
  // Represents the authoritative item1202 packet emitted after task transaction.
  h.setItem233(h.getItem233() + 1); task.success(taskResponse(task));
  assert.equal(h.tasks[0].status, 30); assert.equal(h.getItem233(), 1);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[1].payload.requestId, task.payload.requestId);
  assert.equal(h.calls[1].payload.ids, undefined); assert.equal(h.calls[1].payload.module, 1);
});
test('task retry manual/reconnect preserves nonce, replay adds no reward', h => {
  h.taskModel.sendTaskReward([75001], 52001 | (1 << 30));
  const first = h.calls[0];
  for (let i = 0; i < 4; i++) h.tick(12000);
  assert.equal(h.calls.length, 4);
  h.taskModel.sendTaskReward([75001], 52001 | (1 << 30));
  assert.equal(h.calls[4].payload.requestId, first.payload.requestId);
  h.calls[4].success(taskResponse(h.calls[4], {replayed: true, rewardInfo: {items: []}}));
  assert.equal(storage.size, 0); assert.equal(h.tasks[0].status, 30);
});
test('task maintenance metadata releases task pending without retry', h => {
  h.taskModel.sendAllTaskRewardByActivityId(52001); const call = h.calls[0];
  assert.equal(h.ctx.LhsFuluSafeV1.onMaintenance(taskResponse(call, {result: 1})), true);
  assert.equal(storage.size, 0);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
test('server task status30 settles missing ACK without fabricating reward', h => {
  h.taskModel.sendAllTaskRewardByActivityId(52001);
  h.taskModel.onTaskUpdate({task: {id: 75001, type: 52001 | (1 << 30), status: 30, progress: 1}});
  h.tick(12000);
  assert.equal(h.calls.length, 1); assert.equal(storage.size, 0);
  h.panel.onSummonBtnClick(); assert.equal(h.calls.length, 2);
});
console.log(JSON.stringify({pass: true, scenarios: checks, mode: 'RAM-only extracted native draw/renderer/reward cleanup'}));
}
module.exports = {harness};
