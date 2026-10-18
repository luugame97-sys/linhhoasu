'use strict';
// Execute the extracted native renderer, never a replacement implementation.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '_ai_workbench/temp/oldtrek_renderer_fix_20261008');
const config = JSON.parse(fs.readFileSync(path.join(out, 'runtime-config.json'), 'utf8'));
const clone = x => JSON.parse(JSON.stringify(x));
const extract = filename => {
  const text = fs.readFileSync(filename, 'utf8');
  const marker = 'S5e.dataChanged=function(){var t=Y.OldTrekModel.getTrekEventLogByUid';
  const start = text.indexOf(marker);
  assert(start >= 0);
  return text.slice(start + 'S5e.dataChanged='.length, text.indexOf(',t(tY=a5e,"OldTrekEventItem")', start));
};
const before = extract(path.join(out, 'before/webgame/game/js/main.min_drop200.js'));
const after = extract(process.argv[2] || path.join(out, 'candidate/webgame/game/js/main.min_drop200.js'));
function render(source, rows, data, previous) {
  const trace = [];
  const ctx = vm.createContext({Array,
    Y: {Config: {OldTrekCommonEventConfig: rows, AssetsConfig: {322: config.asset322}},
      OldTrekModel: {getTrekEventLogByUid: () => previous}},
    B: {setIncludeInLayoutVisible(obj, visible) { obj.visible = !!visible; obj.includeInLayout = !!visible; },
      ConvertLanguageToText: id => String(id), generateTextFlowByLangId: id => [{text: String(id)}]},
    U: {ArrayCollection: class {constructor(rows) {this.source = rows;}}},
    F: {removeTweens() {trace.push('removeTweens');}, get(obj) {return {
      wait(ms) {trace.push(['wait', ms]);return this;},
      to(props, ms, easing) {Object.assign(obj, props);trace.push(['to', props, ms]);return this;}};}},
    egret: {Ease: {quartOut: 'quartOut'}}});
  const fields = ['groupContent','groupTitle','labEventDesc','imgCheckResult','labResultDesc',
    'listResultAttr','listResultRewards','listResultEffect'];
  const view = Object.fromEntries(fields.map(k => [k, {}]));
  view.data = clone(data); view.scaleY = 0; view.validateNow = () => trace.push('validateNow');
  const original = JSON.stringify({rows, data: view.data, previous});
  vm.runInContext('(' + source + ')', ctx).call(view);
  assert.equal(JSON.stringify({rows, data: view.data, previous}), original, 'must not mutate config/state/rewards');
  return JSON.parse(JSON.stringify({view, trace}));
}
let count = 0, baselineReproduced = 0, validParity = 0;
for (const [id, row] of Object.entries(config.rows)) for (const result of [0, 1]) {
  const data = {id: Number(id), result, prevId: -1, rewards:[{id:322,count:-3},{id:319,count:5}],animDelay:-1};
  const fixed = render(after, config.rows, data, null);
  const effects = result === 0 ? row.effectRewardsSuccess : row.effectRewardsFailure;
  assert.deepEqual(fixed.view.listResultEffect.dataProvider.source,
    (Array.isArray(effects) ? effects : []).map(id => ({canClick:true,id})));
  assert.deepEqual(fixed.view.listResultRewards.dataProvider.source, [{id:319,count:5}]);
  assert.equal(fixed.view.listResultAttr.dataProvider.source[0].val, '-3');
  assert.equal(fixed.view.scaleY, 1);
  if (Array.isArray(effects)) {
    const old = render(before, config.rows, data, null);
    if (row.eventDesc == null) {
      assert.deepEqual(fixed.view.labResultDesc.textFlow,[]);
      // Missing description deliberately renders empty instead of looking up undefined.
      old.view.labResultDesc.textFlow = [];
    }
    assert.deepEqual(fixed, old); validParity++;
  } else {
    assert.throws(() => render(before, config.rows, data, null), /length/); baselineReproduced++;
  }
  count++;
}
const sample = Number(Object.keys(config.rows)[0]);
const baseData = {id:sample,result:0,prevId:221,rewards:[],animDelay:-1};
assert.throws(() => render(before, config.rows, baseData, {id:221,result:0}), /length/);
assert.equal(render(after, config.rows, baseData, {id:221,result:0}).view.groupTitle.visible,false);count++;
for (const result of [0, 1]) {
  const data = {...baseData,id:999999,result,rewards:[{id:319,count:7}],animDelay:800};
  const fixed = render(after, config.rows, data, null);
  assert.equal(fixed.view.scaleY,1);
  assert.deepEqual(fixed.view.labResultDesc.textFlow,[]);
  assert.deepEqual(fixed.view.listResultEffect.dataProvider.source,[]);
  assert.deepEqual(fixed.view.listResultRewards.dataProvider.source,[{id:319,count:7}]);count++;
}
for (const rewards of [undefined,null,[],{}]) {
  const fixed = render(after, config.rows, {...baseData,rewards},null);
  assert.equal(fixed.view.groupContent.visible,false);assert.equal(fixed.view.scaleY,1);count++;
}
const result={result:'PASS',nativeRendererCases:count,baselineMissingEffectsReproduced:baselineReproduced,
  completeConfigParity:validParity,missingCheckValueReproduced:1,productionWrites:0,networkAttempts:0};
fs.writeFileSync(path.join(out,'renderer-tests.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
