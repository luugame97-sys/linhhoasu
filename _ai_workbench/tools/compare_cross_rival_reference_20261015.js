'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const files = {
  cn: 'linhhoasu/lhs/js/main.min_a6195824.js',
  live: '_ai_workbench/temp/cross_rival_20261015/baseline/web/js/main.min_drop200.js',
};
const names = ['sendCrossRivalEnter','sendMapEnter','sendMapLeave','sendTaskReward',
  'crossRivalCampScoreSort','sendCoreAttack','sendCoreCancel','sendEssenceOpen',
  'sendEssenceCancel','sendBoxOpen','sendRobBox','sendStartFight','sendFinishFight',
  'doCrossRivalInfo','sc_cross_rival_map_enter'];
const result = {};
for (const [label, relative] of Object.entries(files)) {
  const bytes = fs.readFileSync(path.join(root, relative)), text = bytes.toString('utf8');
  const methods = {};
  for (const name of names) {
    const re = new RegExp('c\\.' + name + '=function', 'g');
    const match = re.exec(text);
    if (!match) { methods[name] = null; continue; }
    const start = match.index, owner = match[0].split('.')[0];
    let end = text.indexOf('},' + owner + '.', start);
    if (end < 0 || end-start > 18000) end = Math.min(start+4000,text.length);
    methods[name] = text.slice(start,end+1);
  }
  result[label] = { path: relative, sha256:crypto.createHash('sha256').update(bytes).digest('hex'), methods };
}
result.comparison = names.map(name=>({name, cnFound:!!result.cn.methods[name],liveFound:!!result.live.methods[name],
  same:!!result.cn.methods[name] && result.cn.methods[name]===result.live.methods[name]}));
const output = path.join(root,'_ai_workbench/temp/cross_rival_20261015/reference-comparison.json');
fs.writeFileSync(output, JSON.stringify(result,null,2));
console.log(JSON.stringify({output,comparison:result.comparison,cnHash:result.cn.sha256},null,2));
