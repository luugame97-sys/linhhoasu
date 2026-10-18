'use strict';
// Execute the existing formatter and Egret measurement method, without game mutation.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const assert = require('assert');
const root = path.resolve(__dirname, '../..');
const game = path.join(root, 'linhhoasu/webgame/game');
const main = fs.readFileSync(path.join(game, 'js/main.min_a6195824.js'), 'utf8');
const engine = fs.readFileSync(path.join(game, 'js/egret.min_7d668222.js'), 'utf8');
const fontAudit = JSON.parse(cp.execFileSync('python', ['-X', 'utf8', path.join(__dirname, 'audit_item_count_font_20260907.py')], {encoding:'utf8'}));
process.env.CONFIG_BIN_PATH = path.join(game, 'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin');
process.env.LOG_DIR = '';
const language = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/ConfigService')).loadAllTables().LanguageConfig;
function extract(source, start, end) {
  const offset = source.indexOf(start);
  assert(offset >= 0, start);
  const stop = source.indexOf(end, offset);
  assert(stop > offset, end);
  return source.slice(offset + start.length, stop);
}
const units = Object.fromEntries([30020170, 30020171, 30020322].map(id => [id, language[id].text]));
// Find the actual localized field, retaining the configuration as the oracle.
for (const id of Object.keys(units)) {
  if (units[id] === undefined) {
    const values = Object.values(language[id]).filter(x => typeof x === 'string');
    assert.strictEqual(values.length, 1);
    units[id] = values[0];
  }
}
const context = vm.createContext({wPt:{}, AppInfo:{lang:'cn'}, B:{ConvertLanguageToText:id=>units[id]},
  O:{$warn:()=>{}, HorizontalAlign:{LEFT:'left',RIGHT:'right',CENTER:'center'},VerticalAlign:{TOP:'top',BOTTOM:'bottom',MIDDLE:'middle'}}, L:{EMPTY_FACTOR:.33}});
const format = vm.runInContext('(' + extract(main, 'wPt.overLength=', ',wPt.overLengthEn=') + ')', context);
const measure = vm.runInContext('(' + extract(engine, 't.$getTextLines=', ',L.EMPTY_FACTOR=') + ')', context);
const font = fontAudit.frames;
const fontAdapter = {
  _getFirstCharHeight:()=>32,
  getConfig:()=>0,
  getTexture:ch=>font[ch] && {$getTextureWidth:()=>font[ch].sourceW,$getTextureHeight:()=>font[ch].sourceH,
    $offsetX:font[ch].offX,$offsetY:font[ch].offY}
};
const rows = [9999,99999,100000,300000,680000,800000,1000000,100000000,1000000000,1000000000000].map(count=>{
  const text = String(format(count));
  const label = {$text:text,$textLinesChanged:true,$font:fontAdapter,$lineSpacing:0,$letterSpacing:-2.5,
    $textFieldWidth:NaN,$textFieldHeight:NaN,$textAlign:'left',$verticalAlign:'top'};
  const lines = measure.call(label);
  const visible = [...text].filter(ch=>font[ch]).join('');
  const drawnWidth = [...visible].reduce((sum,ch,i)=>sum+font[ch].sourceW+(i?-2.5:0),0);
  return {count,text,missing:[...new Set([...text].filter(ch=>!font[ch]))],supportedGlyphs:visible,
    measuredWidth:label.$textWidth,drawnWidth,measurementShortfall:drawnWidth-label.$textWidth,lines};
});
assert.strictEqual(rows.find(r=>r.count===1000000).text, '100Vạn');
assert.deepStrictEqual(rows.find(r=>r.count===1000000).missing.sort(), ['V','n','ạ'].sort());
assert(rows.find(r=>r.count===1000000).measurementShortfall > 0);
const output = {diagnosisOnly:true,units,rows,unsupportedProposedUnits:fontAudit.missing,
  limitations:['Layout fixture is not native screenshot acceptance. Browser memory/cache and exact cropped final digit remain unverified.']};
const dest = path.join(root, '_ai_workbench/logs/item_count_display_diagnosis_20260907.json');
fs.writeFileSync(dest, JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
