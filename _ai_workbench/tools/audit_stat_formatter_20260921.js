'use strict';
// Fetch public assets only. Execute extracted pure native formatters in a VM.
// No login, RPC, DB, in-page injection, source patch, or deployment.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const game = path.join(root, 'linhhoasu/webgame/game');
const lp = require.resolve(path.join(app, 'src/logger'));
require.cache[lp] = { id: lp, filename: lp, loaded: true, exports: { info(){}, warn(){}, error(){}, debug(){} } };
const { decodeTables } = require(path.join(app, 'src/services/ConfigService'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const origin = 'http://103.116.105.154:81/';
async function resource(relative) {
  const url = new URL(relative, origin).href;
  const response = await fetch(url, {signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('HTTP_' + response.status + ':' + relative);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { url, status: response.status, bytes, sha256: hash(bytes) };
}
function extract(source, begin, end) {
  const at = source.indexOf(begin);
  assert(at >= 0, begin);
  const stop = source.indexOf(end, at + begin.length);
  assert(stop > at, end);
  return { text: source.slice(at + begin.length, stop), line: source.slice(0, at).split('\n').length, charOffset: at };
}
(async () => {
  const index = await resource('index.html');
  const html = index.bytes.toString('utf8');
  const mainRelative = html.match(/"(js\/main\.min_drop100\.js\?v=[^"]+)"/)[1];
  const languageVersion = html.match(/var translationVersion = '([^']+)'/)[1];
  const langRelative = 'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin?v=' + languageVersion;
  const [main, lang] = await Promise.all([resource(mainRelative), resource(langRelative)]);
  const source = main.bytes.toString('utf8');
  const language = decodeTables(lang.bytes).LanguageConfig;
  const attributes = decodeTables(fs.readFileSync(path.join(game, 'update/resource/assets/excel/config_fashion_20260909.bin'))).AttrConfig;
  const units = Object.fromEntries([30090590,30020170,30020171,30020322].map(id => [id, language[id].cn]));
  const context = vm.createContext({ Y: { Config: { AttrConfig: attributes } }, B: { ConvertLanguageToText: id => language[id].cn } });
  const native = extract(source, 'CSe.formatAttrValue1=', ',CSe.calPowerByAttr=');
  const formatter = vm.runInContext('(' + native.text + ')', context);
  const rows = [200000,200000000,209300000,2000000000,154795631,452972957].map(raw => ({raw, hpText: formatter(1,raw)}));
  assert.equal(attributes[1].dataType, 1);
  assert.equal(units[30090590], 'Tỷ');
  assert.equal(rows[0].hpText, '200000');
  assert.equal(rows[1].hpText, '2.00Tỷ');
  assert.equal(rows[2].hpText, '2.09Tỷ');
  assert.equal(rows[3].hpText, '20.00Tỷ');
  const localMain = fs.readFileSync(path.join(game, 'js/main.min_drop100.js'));
  const candidate = fs.readFileSync(path.join(root, '_ai_workbench/temp/attr_format_fix_20260920/candidate_main.min_drop100.js'));
  const candidateNative = extract(candidate.toString('utf8'), 'CSe.formatAttrValue1=', ',CSe.calPowerByAttr=');
  const candidateFormatter = vm.runInContext('(' + candidateNative.text + ')', context);
  const routes = [
    ['sharedRenderer', 'this.valueLabel.text="+"+eO.formatAttrValue1(this.data.attr.id,this.data.attr.val)'],
    ['otherProfileInheritance', 'i(x7e,T9e=Al)'],
    ['otherProfileValue', 'this._viewData.totalAttr[u]'],
    ['selfProfileValue', 'this.attrList_1.itemRenderer=g7,[]),s=Y.RoleModel.getAllAttr()'],
  ].map(([name, needle]) => {
    const at = source.indexOf(needle); assert(at >= 0, name);
    return { name, line: source.slice(0,at).split('\n').length, charOffset: at, text: needle };
  });
  const report = {
    at: new Date().toISOString(), readOnly: true, productionWrites: 0,
    testType: 'Executed pure formatter from current public bytes and decoded current public language; not a logged-in UI screenshot',
    index: {url:index.url,sha256:index.sha256,bytes:index.bytes.length,mainRelative,languageVersion},
    main: {url:main.url,sha256:main.sha256,bytes:main.bytes.length,equalsLocal:main.bytes.equals(localMain)},
    language: {url:lang.url,sha256:lang.sha256,bytes:lang.bytes.length,units},
    attr1: attributes[1], native, rows, sharedRoutes: routes,
    previousCandidate: {sha256:hash(candidate),currentBytesAreCandidate:main.bytes.equals(candidate),native:candidateNative,
      rows:rows.map(r=>({raw:r.raw,hpText:candidateFormatter(1,r.raw)}))},
    conclusions: {raw200kDoesNotBecome2Billion:true,labelMisstatesHundredMillionAsBillion:true,bothProfilesShareRenderer:true},
  };
  const output = path.join(root, '_ai_workbench/temp/stat_formatter_verified_20260921.json');
  fs.writeFileSync(output, JSON.stringify(report,null,2) + '\n');
  console.log(JSON.stringify({output,...report},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
