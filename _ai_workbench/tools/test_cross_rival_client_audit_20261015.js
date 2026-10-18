'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const task = path.resolve(__dirname, '../temp/cross_rival_20261015');
const source = fs.readFileSync(path.join(task, 'baseline/web/js/main.min_drop200.js'), 'utf8');
const addon = fs.readFileSync(path.join(task, 'baseline/web/js/lhs-cross-events-v2.js'), 'utf8');
const live = JSON.parse(fs.readFileSync(path.join(task, 'live-audit.json'), 'utf8'));
const supplement = JSON.parse(fs.readFileSync(path.join(task, 'config-supplement.json'), 'utf8'));
function method(name, globals) {
  const marker = 'c.' + name + '=function', start = source.indexOf(marker);
  assert(start >= 0, 'Method not found ' + name);
  const end = source.indexOf('},c.', start);
  assert(end > start, 'Method delimiter missing ' + name);
  return vm.runInNewContext('(' + source.slice(start + ('c.' + name + '=').length, end + 1) + ')', globals);
}
const findings = [];
let captured;
function Rival() { this._crossRivalInfo = { stage: 2 }; }
Rival.prototype.checkActivityIsOpen = () => true;
Rival.prototype.doCrossRivalInfo = function (data) { this._crossRivalInfo = data; };
Rival.prototype.Rpc = function (tag, data, cb, error) { captured = { tag, callback: typeof cb === 'function', error: typeof error === 'function' }; };
function Top() {}
Top.prototype.IsTopArenaOpen = () => false;
Top.prototype.onInfoUpdate = () => {};
Top.prototype.Rpc = () => {};
const rival = new Rival(), manager = { CrossRivalModel: rival, TopArenaModel: new Top(), ActorModel: { actorID: 'RAM_ONLY' } };
const window = { GlobalManager: manager, UserInfo: { ServerID: 1001, UserID: 'RAM_ONLY' }, setTimeout() { return 1; }, clearTimeout() {} };
vm.runInNewContext(addon, { window, Date, Number });
rival.Rpc(6560, null);
assert.equal(captured.callback, true);
findings.push({ id: 'ADDON_TURNS_PUSH_ONLY_6560_INTO_CALLBACK_RPC', details: captured,
  consequence: 'Native socket assigns nonzero msgUid and timeout; server only returns 6500/msgUid=0.' });
let openedReward = false, caught = '';
const taskReward = method('sendTaskReward', { Er: { Open() { openedReward = true; } }, A: { ins: () => ({ dispatch() {} }) }, E: {} });
try { taskReward.call({ _crossRivalInfo: { taskRecord: [] }, Rpc(tag, data, cb) { cb({ result: -1, code: 'REQUEST_BACKPRESSURE' }); } }, 1); }
catch (error) { caught = error.message; }
assert(openedReward);
findings.push({ id: 'TASK_ERROR_RESPONSE_OPENS_REWARD_WITHOUT_VALIDATION', details: { openedReward, rewardInfoMissing: true, exceptionInStub: caught || null } });
let enteredMap = false;
const room = { sc_cross_rival_map_enter() { enteredMap = true; } };
const ui = { open: () => ({}), showCloud: fn => fn(), hideCloud() {} };
const enter = method('sendMapEnter', { Y: { CrossRivalRoomModel: room }, Mw: {}, P: { ins: () => ui }, pw: {} });
enter.call({ _crossRivalInfo: {}, Rpc(tag, data, cb) { cb({ result: -1, code: 'REQUEST_BACKPRESSURE' }); } }, 2, 0, 0, 100, 100);
assert(enteredMap);
findings.push({ id: 'MAP_ERROR_RESPONSE_IS_TREATED_AS_SUCCESS', details: { enteredMap } });
const campMap = { 1: { camp: 1, score: 0 }, 2: { camp: 2, score: 0 }, 3: { camp: 3, score: 0 }, 4: { camp: 4, score: 0 } };
method('crossRivalCampScoreSort', {}).call({ _crossRivalInfo: { campInfoMap: campMap }, getCrossRivalCampNum: () => 4 });
assert.equal(campMap[4].rank, 1);
findings.push({ id: 'CAMP_TIE_ORDER_DIFFERS_FROM_SERVER', details: { clientFirst: 4, serverInsertionTieFirst: 1 } });
const tableFindings = [];
for (const name of ['CrossRivalScoreRankRewardConfig', 'CrossRivalDefenseRankRewardConfig']) {
  const overlapping = Object.values(live.config[name]).filter(row => 500 >= row.rankMin && 500 <= row.rankMax);
  assert.equal(overlapping.length, 2);
  tableFindings.push({ table: name, rank: 500, overlapCount: 2, rows: overlapping.map(row => row.id) });
}
findings.push({ id: 'RANK_500_REWARD_OVERLAP', details: tableFindings });
const settlementModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(task, 'baseline/src/services/CrossEventSettlementService.js'), 'utf8'), {
  module: settlementModule, exports: settlementModule.exports,
  require(name) {
    if (name === 'crypto') return require('crypto');
    if (name === '../config/crossServerEventSchedule.json') return live.schedule;
    if (name === './CrossServerEventService' || name === './GameDayService') return {};
    throw Error('IMPORT_DENIED:' + name);
  }
});
assert.throws(() => settlementModule.exports.rewardsFor('crossRival', 500, { get: name => live.config[name] }), /CROSS_REWARD_OVERLAP/);
findings.push({ id: 'SETTLEMENT_ABORTS_AT_RANK_500', details: { error: 'CROSS_REWARD_OVERLAP' } });
const rawSystem = JSON.parse(JSON.stringify(supplement.binaries[0].system324));
const dayConfig = { SystemConfig: { 324: rawSystem }, ElfFieldConfig: {}, ValhallaConfig: {}, FashionConfig: {} };
const dayRoot = { GlobalManager: { Config: dayConfig }, setTimeout() {} };
vm.runInNewContext(fs.readFileSync(path.join(task, 'baseline/web/js/lhs-feature-day1-v1.js'), 'utf8'), { window: dayRoot, Number });
assert.equal(rawSystem.openDay, 1);
assert.equal(rawSystem.conditions.find(c => c.type === 3).value, 100);
assert.equal(rawSystem.conditions.find(c => c.type === 5).value, 1);
const result = { result: 'CHARACTERIZATION_COMPLETE_NOT_FIXED', findings,
  controls: [{ id: 'CLIENT_DAY_OVERLAY_MATCHES_SERVER', rawOpenDay: 22, effectiveOpenDay: 1, level: 100 }],
  nativeBrowserExecuted: false, networkAttempts: 0, productionWrites: 0 };
fs.writeFileSync(path.join(task, 'client-characterization.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
