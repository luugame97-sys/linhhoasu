'use strict';
const assert = require('assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const {extract, src, root} = require('./inspect_fishing_background_20260907');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const logger = path.join(app, 'src/logger.js');
require.cache[logger] = {id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){}}};
const cfg = require(path.join(app,'src/services/ConfigService'));
const tables = cfg.loadAllTables();
const bonus = require(path.join(app,'src/services/NativeBonusService'));
const clone = v => JSON.parse(JSON.stringify(v));
let checks=0;
function same(a,b,message){assert.deepEqual(clean(a),clean(b),message);checks++;}
function clean(value){return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==0).sort(([a],[b])=>Number(a)-Number(b)));}
function nativeContext(tables) {
  const ctx=vm.createContext({Y:{Config:tables},ec:{copyDataHandler:clone},O:Math,x:{PERCENT_RATE:10000},GQ:{EntryAttrId:8005}});
  ctx.eO={};
  for(const name of ['attrAddition','attrMultiply'])ctx.eO[name]=vm.runInContext('('+extract('CSe.'+name+'=function',4840000).source+')',ctx);
  return ctx;
}
function nativeSpec(info,tables) {
  const ctx=nativeContext(tables),model={_info:clone(info)};
  for(const name of ['getAttrs','getBaseAttrAdd','getSlots','getSlotLv','getSpecSpirit','getSpecSpiritAttrsByDataAndLv','getEchoLv','getLvSlotCount','getSuitInfo','getSuitInfoByDatas']) {
    model[name]=vm.runInContext('('+extract('m.'+name+'=function',6300000).source+')',ctx);
  }
  return model.getAttrs();
}
same(bonus.specSpirit({}),{},'missing info grants nothing');
const configs=Object.values(tables.SpecSpiritConfig).filter(r=>r.attrs&&tables.SpecSpiritStarConfig[r.stage]);
const levelIds=Object.keys(tables.SpecSpiritLevelConfig).map(Number).sort((a,b)=>a-b);
const suitIds=Object.keys(tables.SpecSpiritSuitConfig).map(Number);
const normalEntry=Object.values(tables.SpecSpiritEntryConfig).find(r=>r.type!==8&&r.attrId>0);
const boostEntry=tables.SpecSpiritEntryConfig[8005];assert(boostEntry);
let rngState=0x423;
function random(n){rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState%n;}
for(let i=0;i<80;i++) {
  const info={slots:{},slotLv:{},list:[]};
  for(const [j,tag] of [101,102,103,201,202,203].entries()) {
    info.slotLv[tag]=levelIds[random(levelIds.length)];
    if(i%8===j)continue;
    const row=configs[random(configs.length)], stars=Object.keys(tables.SpecSpiritStarConfig[row.stage]).map(Number).filter(n=>tables.SpecSpiritStarAttrConfig[n]);
    const spirit={uid:j+1,id:row.id,star:stars[random(stars.length)],suit:i%2?suitIds[0]:suitIds[random(suitIds.length)],entrys:[]};
    if(i%3===0)spirit.entrys.push({id:8005,type:boostEntry.attrId,value:999});
    if(normalEntry)spirit.entrys.push({id:normalEntry.id,type:normalEntry.attrId,value:100+i});
    info.list.push(spirit);info.slots[tag]=spirit.uid;
  }
  const p={other_attr_info:{specSpiritInfo:info}},before=JSON.stringify(p);
  same(bonus.specSpirit(p),nativeSpec(info,tables),'SpecSpirit native parity case '+i);
  assert.equal(JSON.stringify(p),before);checks++;
}
// Orphan data must not invent a spirit, mutate ownership, or crash combat.
same(bonus.specSpirit({other_attr_info:{specSpiritInfo:{slots:{101:9999},list:[],slotLv:{}}}}),{},'orphan slot');

function nativeFormation(info,tables) {
  const ctx=nativeContext(tables),model={_formationInfo:clone(info),_formationKnotMap:{}};
  for(const name of ['getAttrs','getFormationNodeInfo','getFormationConnectConfig','isNodeHasDir','isNodeActive','getActiveNodeList','getConnectItemPunishLevel','getConnectItemShapeById']){
    model[name]=vm.runInContext('('+extract('m.'+name+'=function',6350000).source+')',ctx);
  }
  const knotParser=vm.runInContext('('+extract('C.refreshData=function',6388817).source+')',ctx);
  const parseAt=src.indexOf('a3e.prototype.parseData=function');
  const entryParser=vm.runInContext('('+extract('a3e.prototype.parseData=function',parseAt).source+')',ctx);
  for(const formation of info.formation) {
    const map=model._formationKnotMap[formation.id]={};
    for(const knot of info.knot.filter(k=>k.mapId===formation.id)) {
      const parsed={...clone(knot),entries:knot.entries.map(e=>{const p={};entryParser.call(p,e);return p;})};
      knotParser.call(parsed,formation.element);map[knot.id]=parsed;
    }
  }
  return {attrs:model.getAttrs(),active:model.getActiveNodeList(info.formation[0].id)};
}
const synthetic={...tables,
 ValhallaFormationKnotConfig:{1:{1:{id:1,type:1,shapeC:{0:[2]}},2:{id:2,type:3,shapeC:{0:[3],3:[1]}},3:{id:3,type:4,punishLevel:-1,shapeC:{3:[2]}}}},
 ValhallaFormationConnectItemConfig:{1:{id:1,shape:1,level:3},2:{id:2,shape:2,level:3}},
 ValhallaFormationConnectShapeConfig:{1:{id:1,connect:[0,3],dir:2},2:{id:2,connect:[0],dir:1}},
 ValhallaFormationConnectConfig:{2:{2:{baseAttrs:{1:100,2:20},extraAttrs:{101:50}}},3:{1:{baseAttrs:{1:50},extraAttrs:{2:30}}}},
 ValhallaFormationKnotWashConfig:{2:{extraRate:1000}},
 ValhallaFormationKnotEntryConfig:{1:{buff:[1,2,3,4,5]}},
 ValhallaFormationEntryBuffConfig:{1:{type:4,args:[2,5000]},2:{type:1,args:[-2,2000]},3:{type:2,args:[101]},4:{type:1,args:[-3,3000]},5:{type:3,args:[7,999]}},
};
for(let i=0;i<40;i++) {
 const info={formation:[{id:1,element:i%3,nodeMap:{2:i%2?1:2}}],knot:[{mapId:1,id:2,quality:2,add:10000+i,extra:i%3===0,entries:[{id:1,param:[[3,1000+i]]}]}]};
 const before=JSON.stringify(info),p={other_attr_info:{valhallaFormationInfo:info}},native=nativeFormation(info,synthetic);
 same(bonus.valhallaFormation(p,synthetic),native.attrs,'formation synthetic '+i);
 assert.deepEqual(bonus.activeNodes(info.formation[0],synthetic),Array.from(native.active));checks++;
 assert.equal(JSON.stringify(info),before);checks++;
}
const formId=Number(Object.keys(tables.ValhallaFormationKnotConfig)[0]);
const nodes=tables.ValhallaFormationKnotConfig[formId];
const itemIds=Object.values(tables.ValhallaFormationConnectItemConfig).filter(r=>r.level>0).map(r=>r.id);
for(let i=0;i<20;i++) {
 const formation={id:formId,element:1+i%5,nodeMap:{}},knot=[];
 for(const node of Object.values(nodes))if(node.type===3){
   formation.nodeMap[node.id]=itemIds[random(itemIds.length)];
   knot.push({mapId:formId,id:node.id,quality:2,add:10000+i*100,extra:false,entries:[]});
 }
 const info={formation:[formation],knot};
 same(bonus.valhallaFormation({other_attr_info:{valhallaFormationInfo:info}}),nativeFormation(info,tables).attrs,'real formation '+i);
}
same(bonus.valhallaFormation({}),{},'missing formation');
const linkedCtx=nativeContext(tables);
const nativeLinked=vm.runInContext('('+extract('C.attrModify=function',6263000).source+')',linkedCtx);
for(let i=0;i<100;i++) {
 const attrs=Object.fromEntries(Object.keys(tables.AttrConfig).map(k=>[k,random(10000)]));
 const expected=nativeLinked(clone(attrs));
 same(bonus.applyLinkedAttrs(clone(attrs)),expected,'linked native parity '+i);
}
const customWeights={1:{dataType:1,linkId:[]},2:{dataType:1,linkId:[]},51:{dataType:2,linkId:[1]},52:{dataType:2,linkId:[1]},61:{dataType:1,linkId:[2]}};
same(bonus.applyLinkedAttrs({1:1000,2:10,51:1000,52:2000,61:15},customWeights),
 {1:1300,2:25,51:1000,52:2000,61:15},'percent sources additive not compound, flat link additive');
// End-to-end calculator -> deterministic PvP without gameplay handler, DB or
// inventory writes. Config is real; only random rolls are fixed.
function loadBattle(source) {
 const module={exports:{}},math=Object.create(Math);math.random=()=>0.5;
 vm.runInNewContext(source,{module,exports:module.exports,Math:math,require:name=>{
   if(name==='./ConfigService')return cfg;
   if(name==='./NativeBonusService')return bonus;
   if(name==='./HomelandSkinUnlockService')return{bonusBps:()=>0};
   throw new Error('UNEXPECTED_TEST_DEPENDENCY:'+name);
 }});
 return module.exports;
}
const current=loadBattle(fs.readFileSync(path.join(app,'src/services/BattleService.js'),'utf8'));
const old=loadBattle(fs.readFileSync(path.join(root,'_ai_workbench/temp/power_display_20260913/baseline/lhs/newServer/src/services/BattleService.js'),'utf8'));
const plain={level:100,roleInfo:{stage:1},other_attr_info:{}};
same(current.calcPlayerPower(plain),old.calcPlayerPower(plain),'unaffected role baseline attrs');
const spiritRow=configs[0];
const specInfo={slots:{101:1},slotLv:{101:1},list:[{uid:1,id:spiritRow.id,star:0,suit:0,entrys:[]}]};
const owned={...plain,other_attr_info:{specSpiritInfo:specInfo}},ownedBefore=JSON.stringify(owned);
const expected=old.calcPlayerPower(plain);const component=bonus.specSpirit(owned);
for(const [id,v] of Object.entries(component))expected[id]=(expected[id]||0)+v;
same(current.calcPlayerPower(owned),expected,'owned SpecSpirit reaches battle attrs');
assert.equal(JSON.stringify(owned),ownedBefore);checks++;
const baseAttrs={1:10000,2:2000,3:0,4:100},enemy={1:30000,2:1000,3:0,4:200};
const noLife=current.simulateBattle(baseAttrs,enemy,{isPvp:true}).rounds[0];
const life=current.simulateBattle({...baseAttrs,101:35215},enemy,{isPvp:true}).rounds[0];
assert.equal(noLife.playerHP,9000);checks++;
assert.equal(life.playerHP,10000);checks++;
assert.equal(life.playerHeal,1000);checks++;
const resisted=current.simulateBattle({...baseAttrs,101:35215},{...enemy,151:35215},{isPvp:true}).rounds[0];
assert.equal(resisted.playerHeal,0);checks++;
const full=current.simulateBattle({...baseAttrs,4:300,101:35215},enemy,{isPvp:true}).rounds[0];
assert.equal(full.playerHeal,0);checks++;
assert.equal(full.actions.filter(a=>a.kind==='heal').length,0);checks++;
assert.equal(old.simulateBattle({...baseAttrs,4:300,101:35215},enemy,{isPvp:true}).rounds[0].playerHeal,1);checks++;
// JSON round-trip removes different VM prototypes before deep comparison.
assert.deepEqual(clone(current.simulateBattle(baseAttrs,enemy,{isPvp:true})),
  clone(old.simulateBattle(baseAttrs,enemy,{isPvp:true})), 'unaffected no-heal battle unchanged');checks++;
console.log(JSON.stringify({result:'PASS',checks,specSpiritCases:80,formationCases:60,nativeFunctionsExecuted:true,productionWrites:0}));
