'use strict';
// Extracts and executes the actual native Fulu methods in RAM, without a browser,
// transport, account, package dependencies or production mutations.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const client = path.join(root, 'linhhoasu/webgame/game/js/main.min_drop200.js');
const source = fs.readFileSync(client, 'utf8');
const table = name => JSON.parse(fs.readFileSync(path.join(root,
  'linhhoasu/lhs/newServer/scripts/_tables_dump', name + '.json'), 'utf8')).data;
const config = table('Activity52Config')[52001];
const arrangements = table('Activity52ArrangeConfig')[52001];
function extract(name) {
  const marker = name + '=function';
  const at = source.indexOf(marker, name === 'sendGetReward' ? source.indexOf('sendDrawHulu=function') : 0);
  assert.ok(at >= 0, marker);
  const start = at + name.length + 1;
  let depth = 0, quote = '', escape = false;
  for (let p = source.indexOf('{', start); p < source.length; p++) {
    const c = source[p];
    if (quote) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, p + 1);
  }
  throw Error('Unclosed native method ' + name);
}
let checks = 0;
const calls = [];
let confirmation;
const ctx = vm.createContext({
  Y: {ActivityModel: {sendActivityOperate: (...args) => calls.push(args)},
    ItemModel: {GetItemCount: () => 999}},
  ROt: {MODULE_SELECT: 0, MODULE_DRAW: 1, MODULE_REWARD: 2},
  A: {ins: () => ({dispatch() {}})}, E: {},
  S: {ins: () => ({showTipsByLangId: id => calls.push(['tip', id])})},
  P: {ins: () => ({open() {}})}, vy: {},
  Ost: {ins: () => ({showCheckBox: (...args) => { confirmation = args; }})},
  B: {ConvertLanguageToText: id => id},
});
const native = name => vm.runInContext('(' + extract(name) + ')', ctx);
const data = {id: 52001, record: 4, getPanelConfig: () => config};
for (const [name, index, expectedModule] of [
  ['sendSelectHulu', 4, 0], ['sendDrawHulu', 5, 1], ['sendGetReward', 0, 2],
]) {
  native(name).call(data, index);
  assert.deepEqual(calls.at(-1).slice(0, 4), [52001, expectedModule, index, null]);
  checks++;
}
data.sendDrawHulu = multi => calls.push(['draw', multi]);
const panel = {_actData: data, _score: 79, _currentMultiple: 5,
  summonBtn: {}, closeBtn: {}, chooseHulu: {}};
native('onSummonBtnClick').call(panel);
assert.deepEqual(calls.at(-1), ['draw', 5]); checks++;
panel._score = 80;
confirmation = null;
native('onSummonBtnClick').call(panel);
assert.equal(confirmation[0], 'FuluGuaranteedMultipleDraw'); checks++;
confirmation[2].func.call(confirmation[2].thisObj);
assert.deepEqual(calls.at(-1), ['draw', 1]); checks++;
const patterns = [[5], [4,1], [1,1,1,1,1], [3,2], [3,1,1], [2,2,1], [2,1,1,1]];
const matcher = {isMatchingType: native('isMatchingType'), _arrangeConfig: arrangements};
const match = native('findBestMatchingConfig');
for (let i = 0; i < patterns.length; i++) {
  const colors = Object.fromEntries(patterns[i].map((count, j) => [j + 1, count]));
  const result = match.call(matcher, colors);
  assert.equal(result.type, i + 1); checks++;
}
const rows = Object.values(arrangements).flatMap(prize => Object.values(prize));
assert.equal(rows.length, 7); checks++;
assert.equal(rows.reduce((sum, row) => sum + row.showRate, 0), 10000); checks++;
for (const row of rows) {
  assert.equal(row.rewards.reduce((sum, reward) => sum + reward.weight, 0), 10000);
  checks++;
}
assert.equal(config.consume, 233); checks++;
assert.equal(config.exchangeId, 232); checks++;
assert.equal(config.triggerTimes, 2); checks++;
const result = {mode: 'RAM-only actual native functions', checks, pass: true,
  clientSha256: crypto.createHash('sha256').update(source).digest('hex'),
  config, arrangements: rows.map(row => ({prize: row.prize, type: row.type,
    showRate: row.showRate, display: row.display})),
  guarantee: {score79multi5: 'native permits', score80multi5: 'native requests single draw'},
  rules: [145,146].map(id => {const rule = table('RuleConfig')[id];
    return {id, textId: rule.text, text: table('LanguageConfig')[rule.text].cn};}),
  unknowns: ['natural jackpot luck reset', 'luck increment rate',
    'score overflow at multiplier crossing', 'special rainbow probability']};
if (process.argv[2]) {
  const output = path.resolve(process.argv[2]);
  const evidenceRoot = path.join(root, '_ai_workbench/temp/event_goal_20261007/fulu');
  assert.ok(output.startsWith(evidenceRoot + path.sep), 'Evidence path must be scoped');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result, null, 2));
