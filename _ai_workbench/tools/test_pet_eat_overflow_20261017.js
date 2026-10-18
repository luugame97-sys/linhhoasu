'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const dir=path.resolve(__dirname,'../temp/pet_eat_overflow_20261017');
const source=fs.readFileSync(path.join(dir,'candidate/pet.js'),'utf8');
const tables={PetBaseConfig:{levelMax:200,breakLimitPetQuality:[7,9,10],initialField:48},PetConfig:{810101:{id:810101,quality:10,tag:1},87001:{id:87001,quality:7,tag:2},85501:{id:85501,quality:5,tag:1}},PetSoulConfig:{210301:{quality:7}},PetSoulUpgradeConfig:{7:{7:{coercion:4445}}},CoercionConfig:{19:{stage:19,coercion:4200,limitLevelUp:60}}};
const clone=x=>JSON.parse(JSON.stringify(x));
let saves=0;
const deps={'../services/ConfigService':{get:k=>tables[k]},'../services/PlayerService':{savePlayer:async()=>{saves++;}},'../logger':{},'../services/PlayerMutationService':{},'../services/FeatureReceiptService':{},'../services/RuntimeBus':{},'../services/MainTaskProgressService':{},'./raid':{}};
const mod={exports:{}};
vm.runInNewContext(source,{module:mod,exports:mod.exports,require:k=>{assert(k in deps,'unexpected dependency '+k);return deps[k];},console,Date,Math,process:{env:{}}});
function fixture(level=2,exp=260){return {petInfo:{pets:[{uid:102508,id:810101,level,slot:15,locked:0,passiveSkills:[1,2],lockSkills:[0]},{uid:105753,id:87001,level:exp,slot:28,locked:0,passiveSkills:[]}]},other_attr_info:{petSoulInfo:{petSouls:[{id:210301,star:7,petUid:102508}]}},items:{36:123},currencies:{diamond:456}};}
const cases=[];
async function test(name,p,expected,level,params={matUid:105753,targetUid:102508}){const before=clone(p),count=saves;const r=await mod.exports.handlePetEat(params,{userId:'isolated',player:p},1);assert.equal(r.data.result,expected,name);assert.equal(saves-count,expected===0?1:0,name);assert.deepEqual(p.items,before.items);assert.deepEqual(p.currencies,before.currencies);assert.deepEqual(p.other_attr_info,before.other_attr_info);if(expected===0){assert.equal(r.data.data.level,level);assert.equal(p.petInfo.pets.length,1);assert.deepEqual(Array.from(r.data.data.passiveSkills),before.petInfo.pets[0].passiveSkills);assert.deepEqual(Array.from(r.data.data.lockSkills),before.petInfo.pets[0].lockSkills);assert.equal(r.data.data.uid,102508);assert(r.data.rewards);const again=await mod.exports.handlePetEat(params,{userId:'isolated',player:p},2);assert.equal(again.data.result,-1);assert.equal(saves-count,1);}else assert.equal(p.petInfo.pets.length,2);cases.push(name);}
(async()=>{
await test('soul-bound target overflow',fixture(),0,260);
await test('exact cap',fixture(1,259),0,260);
await test('below cap',fixture(1,249),0,250);
await test('already capped discards all',fixture(260,260),0,260);
await test('legacy above-cap not downgraded',fixture(270,260),0,270);
await test('reverse drag canonicalized',fixture(),0,260,{matUid:102508,targetUid:105753});
let p=fixture();p.petInfo.pets[0].id=85501;await test('non-breakthrough quality cap200',p,0,200);
p=fixture();p.petInfo.pets[1].locked=1;await test('locked material protected',p,-1);
p=fixture();p.petInfo.pets[1].slot=-2;await test('equipped material protected',p,-1);
p=fixture();p.other_attr_info.petSoulInfo.petSouls[0].petUid=105753;await test('soul-bound material protected',p,-1);
p=fixture();p.petInfo.pets[0].locked=1;await test('locked recipient protected',p,-1);
p=fixture();p.petInfo.pets[0].slot=-1;await test('equipped recipient protected',p,-1);
p=fixture();p.petInfo.pets[1].id=85501;await test('non-EXP material rejected',p,-1);
await test('same uid rejected',fixture(),-1,undefined,{matUid:102508,targetUid:102508});
await test('unknown uid rejected',fixture(),-1,undefined,{matUid:999,targetUid:102508});
const baseline=fs.readFileSync(path.join(dir,'baseline/pet.js'),'utf8');
function strip(s){return s.replace(/\r\n/g,'\n').replace(/function canPetEat\([\s\S]*?\n}\n/,'CAN_EAT\n').replace(/async function handlePetEat\([\s\S]*?\n}\n/,'HANDLE_EAT\n');}
assert.equal(strip(source),strip(baseline),'unrelated source must remain unchanged');
const out={status:'PASS',cases,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),scope:'isolated production handler with mocked persistence; no real player mutation or E2E'};
fs.writeFileSync(path.join(dir,'tests.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});
