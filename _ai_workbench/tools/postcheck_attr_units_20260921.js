'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { info(){}, warn(){}, error(){}, debug(){} } };
const { decodeTables } = require(path.join(app, 'src/services/ConfigService'));
const EXPECTED_BUNDLE = 'bd7979c98148a2066832fc2ab8d8210a55f21c52788555b20850f0d235ca4585';
const EXPECTED_INDEX = 'e4f677a4c34e7611fdee1498e9b4c7842603e589269184ca23d65e48058ef2aa';
const KEY = '20260921_attr_units_v1';
const origin = 'http://103.116.105.154:81/';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function get(relative) {
  const url = new URL(relative, origin).href;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, url);
  return { url, bytes: Buffer.from(await response.arrayBuffer()) };
}
function extract(source, start, end) {
  const at = source.indexOf(start), stop = source.indexOf(end, at + start.length);
  assert(at >= 0 && stop > at, start);
  return source.slice(at + start.length, stop);
}
(async () => {
  const index = await get('index.html');
  const html = index.bytes.toString('utf8');
  assert.equal(sha(index.bytes), EXPECTED_INDEX);
  const mainRelative = html.match(/"(js\/main\.min_drop100\.js\?v=[^"]+)"/)[1];
  assert(mainRelative.endsWith(KEY));
  assert(!html.includes('20260920_gmt7_sync_v1'));
  const main = await get(mainRelative);
  assert.equal(sha(main.bytes), EXPECTED_BUNDLE);
  const languageVersion = html.match(/var translationVersion = '([^']+)'/)[1];
  const languageAsset = await get('update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin?v=' + languageVersion);
  const language = decodeTables(languageAsset.bytes).LanguageConfig;
  const source = main.bytes.toString('utf8');
  const attrSource = extract(source, 'CSe.formatAttrValue1=', ',CSe.calPowerByAttr=');
  const powerSource = extract(source, 'wPt.overLengthPower=', ',wPt.overLenghPowerEn=');
  const genericSource = extract(source, 'wPt.overLength=', ',wPt.overLengthEn=');
  const context = vm.createContext({
    Y: { Config: { AttrConfig: { 1: { dataType: 1 }, 2: { dataType: 2 } } } },
    B: { ConvertLanguageToText: id => language[id]?.cn || '' },
    AppInfo: { lang: 'cn' },
    wPt: { truncateDecimal: (n,d) => { const p=10**d; return Math.floor(n*p)/p; }, overLengthEn:n=>String(n), overLenghPowerEn:n=>String(n) },
  });
  const attr = vm.runInContext('(' + attrSource + ')', context);
  const power = vm.runInContext('(' + powerSource + ')', context);
  const generic = vm.runInContext('(' + genericSource + ')', context);
  const rows = [200000,1000000,154795631,200000000,452972957,999999999,1000000000,2000000000].map(raw => ({ raw, attr: String(attr(1,raw)), power: String(power(raw)) }));
  assert.equal(rows.find(r=>r.raw===200000).attr, '200000');
  assert.equal(rows.find(r=>r.raw===154795631).attr, '154.80Tr');
  assert.equal(rows.find(r=>r.raw===200000000).attr, '200.00Tr');
  assert.equal(rows.find(r=>r.raw===452972957).attr, '452.97Tr');
  assert.equal(rows.find(r=>r.raw===1000000000).attr, '1.00Tỷ');
  assert.equal(rows.find(r=>r.raw===2000000000).power, '2.00Tỷ');
  assert.equal(attr(2,10000), '100%');
  assert.equal(attr(2,10001), '100.01%');
  assert(genericSource.includes('1e8<=t'), 'generic formatter unexpectedly changed');
  assert(!attrSource.includes('1e8<=e'));
  assert(!powerSource.includes('1e8'));
  const report = {
    result: 'POSTCHECK_PASS', at: new Date().toISOString(), productionWrites: 0, pm2Restart: false,
    index: { url:index.url, sha256:sha(index.bytes), bytes:index.bytes.length, mainRelative },
    bundle: { url:main.url, sha256:sha(main.bytes), bytes:main.bytes.length },
    language: { url:languageAsset.url, sha256:sha(languageAsset.bytes), units:{30090590:language[30090590]?.cn,30020171:language[30020171]?.cn} },
    rows, percentages: [{raw:10000,text:attr(2,10000)},{raw:10001,text:attr(2,10001)}],
    genericFormatterUnchanged: true,
  };
  const output = path.join(root, '_ai_workbench/temp/attr_format_fix_20260921/postcheck.json');
  fs.writeFileSync(output, JSON.stringify(report,null,2) + '\n');
  console.log(JSON.stringify({output,...report},null,2));
})().catch(error => { console.error(error.stack); process.exitCode=1; });
