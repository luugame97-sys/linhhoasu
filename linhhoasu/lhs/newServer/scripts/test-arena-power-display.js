'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
require('./test-competitions-v3'); // logger/network guards, no tests run on import
const app=process.env.COMPETITION_APP||path.resolve(__dirname,'..');
const main=process.env.COMPETITION_MAIN||path.resolve(__dirname,'../../../webgame/game/js/main.min_drop100.js');
const cfg=require(app+'/src/services/ConfigService'),battle=require(app+'/src/services/BattleService');
const model=require(app+'/src/services/ArenaReadModelService'),arena=require(app+'/src/handlers/arena'),basic=require(app+'/src/handlers/basic');
const source=fs.readFileSync(main,'utf8'),formula=source.match(/calPowerByAttr=(function\(t\)\{[^}]+\}return Math\.ceil\(i\)\})/);
assert(formula,'ACTUAL_NATIVE_FORMULA_REQUIRED');
const native=vm.runInNewContext('('+formula[1]+')',{Y:{Config:cfg.loadAllTables()}});
const clone=v=>JSON.parse(JSON.stringify(v));let checks=0;
const equal=(a,b,name)=>{assert.deepEqual(a,b,name);checks++;};
const {BinJsonUtil,ByteArray}=require(app+'/src/protocol/BinJsonUtil');
async function mainTest(){
 let seed=0x943622;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const ids=Object.keys(cfg.get('AttrConfig')).filter(k=>Number(cfg.get('AttrConfig')[k].power)>=0);
 for(let i=0;i<200;i++){
  const attrs={};for(let j=0;j<16;j++)attrs[ids[Math.floor(rand()*ids.length)]]=Math.floor(rand()*1e8)+rand();
  const before=clone(attrs),legacy=battle.calcPowerScore(attrs);
  equal(model.displayPower(attrs),native(attrs),'exact native formula '+i);
  equal(attrs,before,'calculator is read-only '+i);equal(battle.calcPowerScore(attrs),legacy,'legacy score unchanged '+i);
 }
 for(const attrs of [{},{1:1},{1:1001,2:19,3:7,4:5},{1:1e12,2:4e11},{1:100,999:999999999,powerScore:888888888}])
  equal(model.displayPower(attrs),native(attrs),'edge/external score never multiplied');
 const p={_id:'0123456789abcdef01234567',userId:'qa_power_only',playerId:'qa_power_only',name:'QA Power',serverId:1001,level:120,
  roleInfo:{kungfuId:4,subJob:0,stage:1},boxInfo:{level:1},equipInfo:{curIndex:0,equipSetMap:{0:{}}},fashionInfo:{},petInfo:{pets:[]},items:{},currencies:{}};
 const before=clone(p),view=model.buildPlayerView(p,1001);
 equal(p,before,'read model does not mutate input');
 equal(view.publicRow.power,native(view.attrs),'rank/top public row in native unit');
 equal(view.publicRow.powerScore,battle.calcPowerScore(view.attrs),'legacy score remains separate');
 equal(view.playerSnapshot.power,battle.calcPowerScore(view.attrs),'private player snapshot legacy compatibility');
 equal(view.publicRow.powerUnit,'native-weighted-point','unit metadata');
 for(const robot of arena.competitionHelpers.generateOpponents(p)){
  equal(robot.power,native(robot.robotAttrs),'robot display uses native units');
  equal(robot.powerScore,battle.calcPowerScore(robot.robotAttrs),'robot battle score unchanged');
 }
 const result=arena.competitionHelpers.buildCompetitionFightResult(p,{...view.publicRow,robotAttrs:view.attrs},view.attrs,view.attrs,
  {win:true,playerDamage:0,monsterDamage:0,rounds:[]},16,1001);
 equal(result.entitys[0].showInfo.power,native(view.attrs),'own battle card unit');
 equal(result.entitys[1].showInfo.power,native(view.attrs),'opponent battle card unit');
 const old=clone(result);old.entitys[0].showInfo.power=123;old.entitys[1].showInfo.power=456;
 const recovered=arena.competitionHelpers.recoverArenaFightResult({win:1,fightResult:old,playerAttrs:view.attrs,opponentAttrs:view.attrs},p);
 equal(recovered.entitys[0].showInfo.power,native(view.attrs),'old receipt own card fixed');
 equal(recovered.entitys[1].showInfo.power,native(view.attrs),'old receipt opponent card fixed');
 equal(old.entitys[0].showInfo.power,123,'stored receipt not mutated');
 const profile=await basic.handleGetPlayerDetail({dbid:p._id},{userId:p.userId,player:p,serverId:1001},1);
 equal(profile.data.power,native(profile.data.totalAttr),'profile and comparison screen native units');
 equal(profile.data.powerScore,battle.calcPowerScore(profile.data.totalAttr),'profile compatibility score');
 for(const value of [197950314,1484839012,85539058,4294967296,1e12,Number.MAX_SAFE_INTEGER]){
  const b=new ByteArray();BinJsonUtil.json2bin({power:value,powerScore:123},b);const decoded=BinJsonUtil.readFullJson(new ByteArray(b.buffer));
  equal(decoded.power,value,'native codec full number '+value);equal(decoded.powerScore,123,'codec leaves score separate');
 }
 if(process.env.POWER_AUDIT_FIXTURE){
  const live=JSON.parse(fs.readFileSync(process.env.POWER_AUDIT_FIXTURE,'utf8'));
  for(const row of live.samples){equal(model.displayPower(row.attrs),row.nativeWeightedSameAttrs,'screenshot live fixture '+row.name);equal(battle.calcPowerScore(row.attrs),row.legacy,'live legacy unchanged '+row.name);}
 }
 console.log(JSON.stringify({result:'PASS',checks,networkAttempts:0,productionWrites:0,scope:'native weighted display only; battle attrs/calculator unchanged'}));
}
mainTest().catch(e=>{console.error(e.stack);process.exitCode=1;});
