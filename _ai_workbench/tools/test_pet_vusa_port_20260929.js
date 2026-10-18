'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const candidate = path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/candidate/config_e5ac72c2.bin');
// This draft is intentionally isolated. Passing these fixture assertions does
// not establish parity with VUSA's server or approve its production release.
const source = fs.readFileSync(path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/candidate/pet.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/candidate/main.min_drop100.js'), 'utf8');
const cfgService = require(path.join(app, 'src/services/ConfigService'));
const tables = cfgService.decodeTables(fs.readFileSync(candidate));

function load(mathRandom) {
  const deps = {
    '../services/ConfigService': { get: (name) => tables[name] || {} },
    '../services/PlayerService': { savePlayer: async () => {}, savePlayerDeferred: async () => {} },
    '../logger': { warn() {}, info() {}, error() {} },
    '../services/MainTaskProgressService': {
      addPetComposeCount() { return false; }, addPetWashCount() { return false; }, refreshMainTaskProgress() { return false; },
    },
    './raid': { addRewardToPlayer(player, id, count) { player.items ||= {}; player.items[id] = (player.items[id] || 0) + count; } },
    './task': { buildActiveTaskUpdatePackets() { return []; } },
  };
  const module = { exports: {} };
  const math = Object.create(Math);
  math.random = mathRandom;
  vm.runInNewContext(source + '\nmodule.exports.__qa={getPetLevelMax,rollComposeSuccess,pickPassiveSkills};', {
    module, exports: module.exports,
    require: (key) => deps[key],
    process: { env: {} }, console, Date, Math: math,
  }, { filename: 'pet.js' });
  return module.exports;
}

function player(pets, item36 = 0) {
  return {
    items: { 36: item36 },
    currencies: { diamond: 0, gold: 0, silver: 0 },
    petInfo: { field: 16, nextUid: 100010, pets, unlockAtlas: [], rewardedAtlas: [], wishMap: {}, timeRecords: {} },
  };
}

function pet(uid, id, slot) { return { uid, id, level: 1, exp: 0, slot, locked: 0, lock: 0, passiveSkills: [], lockSkills: [] }; }
function packet(result, tag) { const list = Array.isArray(result) ? result : [result]; return list.find((row) => row && row.tag === tag); }

const clone = x => JSON.parse(JSON.stringify(x));
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
async function nativeParity() {
  const reference = fs.readFileSync(path.join(root,'_ai_workbench/temp/vusa_login_assets_20260928/main.min_vi_1e47377c.js'),'utf8');
  const acorn = require(path.join(app,'node_modules/acorn'));
  function native(marker, context) {
    const at = reference.indexOf(marker); assert.ok(at >= 0);
    let ast = acorn.parseExpressionAt(reference, at + marker.indexOf('function'), {ecmaVersion:2022});
    if (ast.type === 'SequenceExpression') ast=ast.expressions[0];
    return vm.runInNewContext('('+reference.slice(ast.start,ast.end)+')', context);
  }
  const handler = load(() => 0.5);
  const gen = id => handler.__qa.pickPassiveSkills(id, tables.PetConfig[id].quality);
  const make = id => ({...pet(2,id,1),passiveSkills:gen(id)});
  for (const washLevel of [1,10,20]) for (let locks=0;locks<7;locks++) {
    await check(`native-wash-cost-level${washLevel}-locks${locks}`,async()=>{
      const target=make(810101); target.lockSkills=Array.from({length:locks},(_,i)=>i);
      const p=player([target],0);p.items[37]=10000;p.petInfo.skillWashLevel=washLevel;p.petInfo.skillWashExp=0;
      const oracle=native('getRefreshCost=function',{Y:{Config:tables,PetModel:{getPetDataByUid:()=>target}},O:Math});
      const expected=oracle.call({selectPetUid:2}); const preserved=target.passiveSkills.slice(0,locks);
      const r=packet(await handler.handlePetWashSkill({uid:2},{userId:'ram',player:p},1),3306);
      assert.equal(r.data.result,0);assert.equal(10000-p.items[37],expected.count);
      assert.deepEqual(JSON.parse(JSON.stringify(p.petInfo.pets[0].passiveSkills.slice(0,locks))),JSON.parse(JSON.stringify(preserved)));
      assert.ok(p.petInfo.skillWashLevel<=20);
    });
  }
  await check('wash-all-locked-does-not-charge',async()=>{
    const target=make(810101);target.lockSkills=[0,1,2,3,4,5,6];const p=player([target]);p.items[37]=1000;
    const r=packet(await handler.handlePetWashSkill({uid:2},{userId:'ram',player:p},1),3306);
    assert.equal(r.data.result,-1);assert.equal(p.items[37],1000);
  });
  await check('wash-insufficient-does-not-reroll',async()=>{
    const target=make(810101);const before=target.passiveSkills.slice();const p=player([target]);p.items[37]=9;
    const r=packet(await handler.handlePetWashSkill({uid:2},{userId:'ram',player:p},1),3306);
    assert.equal(r.data.result,-1);assert.equal(p.items[37],9);assert.deepEqual(JSON.parse(JSON.stringify(p.petInfo.pets[0].passiveSkills)),JSON.parse(JSON.stringify(before)));
  });
  const upgradeCfg=tables.PetSoulUpgradeConfig;
  const soulId=Number(Object.keys(tables.PetSoulConfig)[0]);
  const quality=tables.PetSoulConfig[soulId].quality;
  const star=Math.max(...Object.keys(upgradeCfg[quality]).map(Number));
  const souls=[{id:soulId,star}];
  const nativeModel={getPetSouls:()=>souls,getUpgradeConfig:(q,s)=>upgradeCfg[q][s]};
  const context={Y:{Config:tables,PetSoulModel:nativeModel}};
  nativeModel.getCoercionValue=native('a.getCoercionValue=function',context);
  nativeModel.getCoercionStage=native('a.getCoercionStage=function',context);
  const nativeMax=native('a.getPetLevelMax=function',context);
  for (const id of [82101,87101,89101,810101,810201,810301,810401,810501]) {
    await check(`native-coercion-cap-${id}`,async()=>{
      const p=player([make(id)]);p.other_attr_info={petSoulInfo:{petSouls:clone(souls)}};
      const expected=nativeMax(tables.PetConfig[id].quality,true);
      assert.equal(handler.__qa.getPetLevelMax(p,p.petInfo.pets[0]),expected);
      p.items[36]=1e9;p.petInfo.pets[0].level=expected;
      const r=packet(await handler.handlePetUpgrade({uid:2,lv:1},{userId:'ram',player:p},1),3304);
      assert.equal(r.data.result,-1);assert.equal(p.items[36],1e9);
    });
  }
  for (const [from,to] of [[89101,810101],[89201,810501],[89301,810201],[89401,810401],[89501,810301]]) {
    await check(`compose-same-type-map-${from}`,async()=>{
      const h=load(()=>0);const p=player([pet(1,from,0),pet(2,from,1)],150);
      const r=packet(await h.handlePetCompose({uid:1,targetUid:2},{userId:'ram',player:p},1),3302);
      assert.equal(r.data.data.id,to);assert.equal(p.items[36],0);assert.equal(new Set(r.data.data.passiveSkills).size,7);
      const replay=packet(await h.handlePetCompose({uid:1,targetUid:2},{userId:'ram',player:p},1),3302);
      assert.equal(replay.data.result,-1);assert.equal(p.items[36],0);assert.equal(p.petInfo.pets.length,1);
    });
  }
  for (const rate of [0,10000]) for (const sameType of [true,false]) {
    await check(`manual-auto-same-transition-${rate}-${sameType}`,async()=>{
      const previous=tables.PetQualityConfig[9].composeSuccessRate;tables.PetQualityConfig[9].composeSuccessRate=rate;
      try {
        const a=player([pet(1,89101,0),pet(2,sameType?89101:89301,1)],150),b=clone(a);
        const h=load(()=>0.5);
        await h.handlePetCompose({uid:1,targetUid:2},{userId:'ram',player:a},1);
        await h.handlePetAutoCompose({quality:10},{userId:'ram',player:b},2);
        assert.deepEqual(clone(a.petInfo.pets),clone(b.petInfo.pets));assert.deepEqual(a.items,b.items);
      } finally {tables.PetQualityConfig[9].composeSuccessRate=previous;}
    });
  }
  for (const random of [0,0.0009999,0.001,0.9999]) await check(`q9-rate-boundary-${random}`,async()=>{
    tables.PetQualityConfig[9].composeSuccessRate=10;
    assert.equal(load(()=>random).__qa.rollComposeSuccess(9),random<0.001);
  });
  await check('exp-overflow-rejected-without-consuming',async()=>{
    const p=player([{...make(82101),level:199}, {...pet(3,82001,0),level:2}]);
    const r=packet(await handler.handlePetEat({matUid:3,targetUid:2},{userId:'ram',player:p},1),3311);
    assert.equal(r.data.result,-1);assert.equal(p.petInfo.pets.length,2);assert.equal(p.petInfo.pets[0].level,199);
  });
}

async function main() {
  console.error('QA_CONFIG_START');
  assert.equal(Object.keys(tables.PetConfig).length, 46);
  assert.equal(tables.PetQualityConfig[9].composeSuccessRate, 10);
  assert.equal(tables.PetQualityConfig[10].passiveSkillCount, 7);
  assert.deepEqual(tables.PetBaseConfig.breakLimitPetQuality, [7, 9, 10]);
  for (const id of [810101, 810201, 810301, 810401, 810501]) {
    assert.equal(tables.PetConfig[id].quality, 10);
    assert.ok(tables.PetSkillConfig[id]);
    assert.ok(tables.AppearanceConfig[id]);
    assert.ok(tables.AssetsConfig[id]);
  }
  console.error('QA_CONFIG_PASS');

  const savedQ9Rate = tables.PetQualityConfig[9].composeSuccessRate;
  tables.PetQualityConfig[9].composeSuccessRate = 10000;
  const successHandler = load(Math.random);
  console.error('QA_HANDLER_LOADED');
  const successPlayer = player([pet(1, 89101, 0), pet(2, 89101, 1)], 150);
  const success = packet(await successHandler.handlePetCompose({ uid: 1, targetUid: 2 }, { userId: 'qa', player: successPlayer }, 1), 3302);
  assert.equal(success.data.result, 0);
  assert.equal(success.data.composeSuccess, true);
  assert.equal(successPlayer.petInfo.pets.length, 1);
  assert.equal(tables.PetConfig[successPlayer.petInfo.pets[0].id].quality, 10);
  assert.equal(successPlayer.items[36], 0);
  console.error('QA_SUCCESS_PASS');

  tables.PetQualityConfig[9].composeSuccessRate = 0;
  const failHandler = load(Math.random);
  const failPlayer = player([pet(11, 89101, 0), pet(12, 89101, 1)], 150);
  const failure = packet(await failHandler.handlePetCompose({ uid: 11, targetUid: 12 }, { userId: 'qa', player: failPlayer }, 2), 3302);
  assert.equal(failure.data.result, 0);
  assert.equal(failure.data.composeSuccess, false);
  assert.deepEqual(failPlayer.petInfo.pets.map((row) => row.uid), [12]);
  assert.equal(failPlayer.items[36], 0);
  console.error('QA_FAIL_PASS');

  tables.PetQualityConfig[2].composeSuccessRate = 0;
  const commonFailPlayer = player([{ uid: 13, id: 82101, level: 1, slot: 0 }, { uid: 14, id: 82101, level: 1, slot: 1 }], 5);
  const commonFailure = packet(await failHandler.handlePetCompose({ uid: 13, targetUid: 14 }, { userId: 'qa', player: commonFailPlayer }, 6), 3302);
  assert.equal(commonFailure.data.result, 0);
  assert.equal(commonFailure.data.composeSuccess, true);
  assert.equal(commonFailPlayer.petInfo.pets.length, 1);
  assert.equal(tables.PetConfig[commonFailPlayer.petInfo.pets[0].id].tag, 2);
  assert.equal(commonFailPlayer.items[36], 0);

  const insufficientPlayer = player([pet(21, 89101, 0), pet(22, 89101, 1)], 0);
  const insufficient = packet(await successHandler.handlePetCompose({ uid: 21, targetUid: 22 }, { userId: 'qa', player: insufficientPlayer }, 3), 3302);
  assert.equal(insufficient.data.result, -1);
  assert.deepEqual(insufficientPlayer.petInfo.pets.map((row) => row.uid), [21, 22]);
  console.error('QA_INSUFFICIENT_PASS');

  const maxPlayer = player([pet(31, 810101, 0), pet(32, 810101, 1)], 250);
  const maxResult = packet(await successHandler.handlePetCompose({ uid: 31, targetUid: 32 }, { userId: 'qa', player: maxPlayer }, 4), 3302);
  assert.equal(maxResult.data.result, -1);
  assert.deepEqual(maxPlayer.petInfo.pets.map((row) => row.uid), [31, 32]);
  console.error('QA_MAX_PASS');

  tables.PetQualityConfig[2].composeSuccessRate = 10000;
  const autoHandler = load(Math.random);
  const autoPlayer = player([pet(41, 82101, 0), pet(42, 82101, 1), pet(43, 82001, 2), pet(44, 82001, 3)], 1000);
  const auto = packet(await autoHandler.handlePetAutoCompose({ quality: 4 }, { userId: 'qa', player: autoPlayer }, 7), 3314);
  assert.equal(auto.data.result, 0);
  assert.equal(autoPlayer.petInfo.pets.length, 2);
  assert.equal(autoPlayer.petInfo.pets.filter((row) => row.id === 82001).length, 1);
  assert.equal(autoPlayer.petInfo.pets.find((row) => row.id === 82001).level, 2);
  console.error('QA_AUTO_PASS');
  tables.PetQualityConfig[9].composeSuccessRate = savedQ9Rate;

  assert.match(bundle, /composeSuccess===false/);
  assert.match(bundle, /giữ linh thú chính/);
  await nativeParity();
  const report={result:'CANDIDATE_FIXTURES_PASS',baseGroups:8,nativeAndBoundaryChecks:checks.length,checks,productionWrites:0,networkAttempts:0,
    limitations:['q9 retained-primary policy still needs reference runtime confirmation','combat/extraSkill not implemented','EXP overflow conversion not implemented','persistence-failure/reconnect not validated','not a live E2E result']};
  fs.writeFileSync(path.join(root,'_ai_workbench/temp/pet_vusa_port_20260929/pet-logic-qa.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,checks:undefined}));
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
