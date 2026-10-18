'use strict';
// Verify exact binary delta, actual client/server unlock predicates and cache URLs.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), app = path.join(root, 'linhhoasu/lhs/newServer');
const dir = path.join(root, '_ai_workbench/temp/system231_20261001');
const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const C = require(path.join(app, 'src/services/ConfigService'));
const serverCode = fs.readFileSync(path.join(app, 'src/handlers/upgrade.js'), 'utf8');
const clientCode = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js'), 'utf8');
const records = [], hashes = {};
function sourceFunction(src, name) {
  const start = src.indexOf('function ' + name + '('), end = src.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, name);
  return src.slice(src.slice(start - 6, start) === 'async ' ? start - 6 : start, end + 2);
}
function clientFunction(name, ctx) {
  const match = new RegExp('\\w+\\.' + name + '=function').exec(clientCode);
  assert.ok(match, name); const start = match.index + match[0].indexOf('function');
  const rest = clientCode.slice(start), next = /},\w+\.[A-Za-z_$]/.exec(rest);
  assert.ok(next, name);
  return vm.runInContext('(' + rest.slice(0, next.index + 1) + ')', ctx);
}
function rawTables(buf) {
  const result = new Map(); let at = 0;
  while (at < buf.length) {
    const start = at, size = buf.readUInt8(at++), name = buf.toString('utf8', at, at + size); at += size;
    const compressed = buf.readUInt32BE(at); at += 4 + compressed;
    assert.ok(at <= buf.length); result.set(name, buf.subarray(start, at));
  }
  assert.equal(at, buf.length); return result;
}
(async () => {
  const expected = [{type:7,value:206,cond:4}, {type:3,value:135,cond:4}];
  for (const [name, row] of Object.entries(build.files)) {
    const before = fs.readFileSync(path.join(dir, 'baseline', name)), after = fs.readFileSync(path.join(dir, 'candidate', name));
    assert.equal(hash(before), row.beforeSha256); assert.equal(hash(after), row.sha256); hashes[name] = hash(after);
    if (name === 'index.html') continue;
    const old = C.decodeTables(before), actual = C.decodeTables(after), wanted = copy(old);
    wanted.SystemConfig[231].conditions = expected;
    assert.deepEqual(copy(actual), wanted, 'Only SystemConfig[231].conditions may change');
    const rawOld = rawTables(before), rawNew = rawTables(after); let unchanged = 0;
    for (const [table, data] of rawOld) if (table !== 'SystemConfig') { assert.ok(data.equals(rawNew.get(table))); unchanged++; }
    assert.equal(actual.PetBaseConfig.levelMax, 200); assert.equal(actual.CoercionConfig[50].limitLevelUp, 800);
    const server = vm.createContext({ config:{get:k=>actual[k]}, process:{env:{}},
      toSafeInt:(v,d=0)=>Number.isFinite(Number(v))?Math.floor(Number(v)):d,
      getTaskConditionProgress:()=>10108 });
    for (const fn of ['normalizeIdList','getIgnoreDayGateSystemIds','getSystemConditions','compareConditionProgress','isSystemConditionMet']) vm.runInContext(sourceFunction(serverCode,fn),server);
    const Y={Config:actual,PlayerInfoModel:{playerInfo:{level:1}},UnlockSystem:{isSystemUnlock:()=>false}}, T={serverOpenDay:1};
    const ctx=vm.createContext({Y,T}), model={maxRecursionLockCount:10};
    model.calcSingleConditionType=clientFunction('calcSingleConditionType',ctx);
    model.checkConditions=clientFunction('checkConditions',ctx);
    let cases=0;
    for (const level of [134,135,200]) for (const day of [1,4,33,43]) for (const pet of [false,true]) {
      const should=level>=135&&pet, parts=[];
      for(const c of actual.SystemConfig[231].conditions) parts.push(await server.isSystemConditionMet({level},c,new Set(pet?[206]:[]),0,{serverRunDay:day,systemId:231}));
      Y.PlayerInfoModel.playerInfo.level=level;T.serverOpenDay=day;Y.UnlockSystem.isSystemUnlock=id=>id===206&&pet; model.isSystemUnlock=Y.UnlockSystem.isSystemUnlock;
      assert.equal(parts.every(Boolean),should,'server boundary');
      assert.equal(model.checkConditions(actual.SystemConfig[231].conditions),should,'client boundary'); cases++;
    }
    records.push({name,passed:true,unchangedBinaryTables:unchanged,otherSystemRowsUnchanged:Object.keys(actual.SystemConfig).length-1,predicateCases:cases,conditions:actual.SystemConfig[231].conditions});
  }
  const oldIndex=fs.readFileSync(path.join(dir,'baseline/index.html'),'utf8'), index=fs.readFileSync(path.join(dir,'candidate/index.html'),'utf8');
  const anchor="parsed.searchParams.set('v', translationVersion);";
  const replacement="parsed.searchParams.set('v', /(?:config_e5ac72c2|config_fashion_20260909)\\.bin$/i.test(parsed.pathname) ? '20261001_system231_v1' : translationVersion);";
  assert.equal(index,oldIndex.replace(anchor,replacement),'Only scoped cache rewrite may change');
  assert.ok(!index.includes('public_giftcode_status.php')); assert.ok(!index.includes('pet_vusa_lian_20260930.bin'));
  for(const script of index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
  const start=index.indexOf('function rewriteRuntimeUrl('),end=index.indexOf('var rawXhrOpen',start);
  const urlCtx=vm.createContext({URL,window:{location:{href:'https://linhhoasu.lol/index.html'}},apiBase:'https://linhhoasu.lol',translationVersion:'20260930_pet_cap1000_v1'});
  vm.runInContext(index.slice(start,end),urlCtx);
  const cases=[['config_fashion_20260909.bin','20261001_system231_v1'],['config_e5ac72c2.bin','20261001_system231_v1'],['config_lang_c2fa8585.bin','20260930_pet_cap1000_v1'],['gameEui_18e11b8e.bin','20260930_pet_cap1000_v1'],['code_bdbbacd8.bin','20260930_pet_cap1000_v1']];
  for(const [file,version] of cases) assert.equal(new URL(urlCtx.rewriteRuntimeUrl('./update/resource/assets/excel/'+file)).searchParams.get('v'),version);
  assert.equal(urlCtx.rewriteRuntimeUrl('./update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin'),'./update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin');
  records.push({name:'index.html',passed:true,urlCases:cases.length+1,scope:'Only config binary cache keys change; language, Spine, bundle and loader stay intact'});
  const evidence={result:'PASS',passed:records.length,total:records.length,changedFiles:5,candidateHashes:hashes,records,productionWrites:0};
  fs.writeFileSync(path.join(dir,'test.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
