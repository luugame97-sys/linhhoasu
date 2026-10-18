'use strict';
// Reproduce existing defects without editing runtime or loading a player DB.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'linhhoasu/lhs/newServer'),dir=path.join(root,'_ai_workbench/temp/combat_parity_20260922');
const evidence=JSON.parse(fs.readFileSync(path.join(dir,'formula_audit.json'),'utf8'));
const receipt=JSON.parse(fs.readFileSync(path.join(dir,'cross_arena_case.json'),'utf8')).fights[0];
const source=fs.readFileSync(path.join(app,'src/services/BattleService.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),evidence.hashes.battle);
const config={get:n=>n==='ConstConfig'?{fightMaxRound:15}:n==='AttrConfig'?Object.fromEntries(evidence.attrRows.map(r=>[r.id,r])):{}};
let random=()=>0.5;const mockMath=Object.create(Math);mockMath.random=()=>random();
const mod={exports:{}};vm.runInNewContext(source,{module:mod,exports:mod.exports,Math:mockMath,require:n=>{assert.equal(n,'./ConfigService');return config;}});
const b=mod.exports,clone=x=>JSON.parse(JSON.stringify(x)),base=()=>({1:10000,2:100,3:50,4:100,205:0});
function run(a,d,seed=71){let state=seed;random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);const result=b.simulateBattle(a,d,{isPvp:true});delete result.powerScore;return result;} // Compare combat events/outcome only; weighted power changing does not imply battle effect.
const findings=[];function check(name,fn){fn();findings.push({name,reproduced:true});}
check('exact receipt double-evade timeout, both orientations',()=>{for(const [a,d]of [[receipt.atkAttr,receipt.defAttr],[receipt.defAttr,receipt.atkAttr]]){const r=run(a,d);assert.equal(r.win,false);assert.equal(r.totalRounds,15);assert.equal(r.playerHPLeft,a[1]);assert.equal(r.monsterHPLeft,d[1]);}});
check('crit incorrectly depends on pet suppression 205',()=>{const a={...base(),105:10000},d=base();const plain=run(a,d),pet=run({...a,205:5000},d),crit=run({...a,202:10000},d);assert(pet.rounds[0].playerDmg>plain.rounds[0].playerDmg);assert.deepEqual(crit,plain);});
check('bleed resistance 171 incorrectly adds outgoing flat damage',()=>{assert(run({...base(),171:1000},base()).rounds[0].playerDmg>run(base(),base()).rounds[0].playerDmg);});
check('element attack/defense 5/6 do not change simulator result',()=>{const r=run(base(),base());assert.deepEqual(run({...base(),5:1000000},{...base(),6:2000}),r);});
check('final damage, healing, arena bonuses and shield ignored in simulator fixtures',()=>{for(const id of [202,203,222,223,231,232,233,234,241,242,331,332,350,351,352,353,354,355,531,532,533,534]){assert.deepEqual(run({...base(),[id]:100000},base()),run(base(),base()),'id '+id);}});
check('counter-killed attacker still lands combo second hit',()=>{const r=run({...base(),1:10,103:10000},{...base(),102:10000,2:1000});const a=r.rounds[0].actions;const killed=a.findIndex(x=>x.kind==='counter'&&x.targetHp===0);assert(killed>=0);assert(a.slice(killed+1).some(x=>x.kind==='attack'&&x.caster==='player'));});
check('full HP lifesteal emits artificial heal1',()=>{const r=run({...base(),101:10000,4:1000},base());assert(r.rounds[0].actions.some(x=>x.kind==='heal'&&x.caster==='player'&&x.value===1&&x.targetHp===10000));});
check('counter can trigger before stun is applied to defender state',()=>{const r=run({...base(),106:10000,4:1000},{...base(),102:10000});const a=r.rounds[0].actions;const stunned=a.findIndex(x=>x.kind==='stun'&&x.target==='monster');assert(stunned>=0);assert(a.slice(stunned+1).some(x=>x.kind==='counter'&&x.caster==='monster'));});
check('mount bond disappears server-side without an equipped mount',()=>{
 const client=fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/main.min_drop100.js'),'utf8');assert.equal(crypto.createHash('sha256').update(client).digest('hex'),evidence.hashes.client);
 const acorn=require(path.join(app,'node_modules/acorn'));const at=client.indexOf('GetAttrByUid=function');let ast=acorn.parseExpressionAt(client,client.indexOf('function',at),{ecmaVersion:'latest'});if(ast.type==='SequenceExpression')ast=ast.expressions[0];
 const sample=JSON.parse(fs.readFileSync(path.join(dir,'skill_config_audit.json'),'utf8')).tables.SwordBondConfig.sample[0];
 const fn=vm.runInNewContext('('+client.slice(ast.start,ast.end)+')',{Y:{Config:{SwordBondConfig:{[sample.id]:sample}}}});
 const expected=fn.call({_mountInfo:{swordBond:[sample.id]},getMountDataByUid:()=>null},0);
 const helper={exports:{}};vm.runInNewContext(source+'\nmodule.exports.auditMount=addMountAttrs;',{module:helper,exports:helper.exports,require:()=>({get:n=>n==='SwordBondConfig'?{[sample.id]:sample}:{}})});
 const actual={};helper.exports.auditMount(actual,{swordInfo:{equippedUid:0,data:[],swordBond:[sample.id]}});assert.equal(expected[51],150);assert.equal(actual[51],undefined);
});
const rows=evidence.attrRows.map(row=>{const a=base(),d=base(),plain=run(a,d);return{id:row.id,name:row.localizedName?.cn??row.localizedName,power:row.power,dataType:row.dataType,linkId:row.linkId,defineLinkId:row.defineLinkId,directReadInSource:row.simulatorDirectRead,changedAttackerFixture:JSON.stringify(run({...a,[row.id]:10000},d))!==JSON.stringify(plain),changedDefenderFixture:JSON.stringify(run(a,{...d,[row.id]:10000}))!==JSON.stringify(plain)};});
const result={at:new Date().toISOString(),sourceHash:evidence.hashes.battle,readOnly:true,productionWrites:0,fixturesPassed:findings.length,meaning:'PASS means existing behavior/defects reproduced; NOT game correctness acceptance',findings,rows};
fs.writeFileSync(path.join(dir,'formula_regressions.json'),JSON.stringify(result,null,2)+'\n');
let md='# Kiểm kê 197 ID thuộc tính — 22/09/2026\n\nNguồn: AttrConfig runtime, bản dịch language live, simulator SHA '+evidence.hashes.battle+'.\n\n“Không đọc trực tiếp” không đồng nghĩa vô dụng toàn game: có ID chuyển đổi ở calculator hoặc thuộc hệ riêng. Thử nghiệm chỉ đổi một thuộc tính trên fixture cơ bản, không chứng nhận mọi nhánh.\n\n| ID | Tên config | Trọng số LC | Kiểu | Liên kết | Simulator đọc trực tiếp | Thay đổi fixture ATK/DEF |\n|---|---|---:|---:|---|---|---|\n';
for(const r of rows)md+=`| ${r.id} | ${String(r.name).replace(/\|/g,'/')} | ${r.power} | ${r.dataType} | ${r.linkId?.join(',')||JSON.stringify(r.defineLinkId)} | ${r.directReadInSource?'Có':'Không'} | ${r.changedAttackerFixture?'Có':'Không'}/${r.changedDefenderFixture?'Có':'Không'} |\n`;
fs.writeFileSync(path.join(root,'_ai_workbench/reports/combat_attr_catalog_20260922.md'),md);
console.log(JSON.stringify({fixturesPassed:findings.length,attributes:rows.length,directReadConfigured:rows.filter(r=>r.directReadInSource).length,findings}));
