'use strict';
// Execute shipped native methods in isolation; no browser, network or player writes.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const web=path.resolve(__dirname,'../../../webgame/game');
const source=fs.readFileSync(path.join(web,'js/main.min_drop200.js'),'utf8');
function method(start,end,context={}){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert(a>=0&&b>a,start);
  return vm.runInNewContext('('+source.slice(a+start.indexOf('function'),b+1)+')',context);
}
let checks=0;
function test(name,fn){fn();checks++;}
test('Pending choices remain reachable after close/reload even below sweep target',()=>{
  const state=method('f.getCurTowerState=function','},f.getSkillSoltState=',{O:Math});
  for(const info of [
    {maxlayer:800,curlayer:11,skills:[70,14],skillCount:1},
    {maxlayer:800,curlayer:11,skills:[],skillCount:1},
    {maxlayer:800,curlayer:11,skills:[70],skillCount:0}
  ]){
    const m={towerInfo:JSON.parse(JSON.stringify(info)),getMaxTowerLevel:()=>info.maxlayer,getCfgMaxLevel:()=>800,getSweepLevel:n=>Math.max(10*(Math.floor(n/10)-2),0)};
    assert.equal(state.call(m),4);
    m.towerInfo.skills=[];m.towerInfo.skillCount=0;assert.equal(state.call(m),3);
  }
});
test('Native visible selection button opens selection without fight',()=>{
  let opened=0;const model={getCurTowerState:()=>4,onFighting(){throw Error('UNEXPECTED_FIGHT');}};
  const context={Y:{ClimbingTowerModel:model},P:{ins:()=>({open:()=>opened++})},Ab:{}};
  const view={startBtn0:{},startBtn1:{},startBtn2:{},startBtn3:{},endLab:{}};
  method('yre.setTowerState=function','},yre.setAuto=',context).call(view);
  assert(view.startBtn3.visible);assert(!view.startBtn2.visible);
  method('yre.onStartFighting=function','},yre.onAutoBtn=',context).call(view,{target:view.startBtn3});assert.equal(opened,1);
});
test('Stale sweep/fight clicks reopen choices without mutation RPC',()=>{
  let opened=0,sent=0;const model={towerInfo:{skills:[70],skillCount:1},onFighting(){throw Error('UNEXPECTED_FIGHT');},Rpc(){sent++;}};
  model.continueFighting=method('f.continueFighting=function','},f.onFighting=',{P:{ins:()=>({open:()=>opened++})},Ab:{}});
  const root={GlobalManager:{ClimbingTowerModel:model,ActorModel:{actorID:'fixture'}},UserInfo:{ServerID:1001,UserID:'fixture'},setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(path.join(web,'js/lhs-tower-fix-v2.js'),'utf8'),{window:root});
  [1,2,3].forEach(n=>model.onFighting(n));root.LhsTowerFixV2.send();assert.equal(opened,4);assert.equal(sent,0);
});
test('Duplicate skill confirm is collapsed until the first RPC settles',()=>{
  let sent=0,success=null,error=null;const model={towerInfo:{skills:[70],skillCount:1},onFighting(){},Rpc(){sent++;const args=arguments;success=args[2];error=args[3];}};
  const root={GlobalManager:{ClimbingTowerModel:model,ActorModel:{actorID:'fixture'}},UserInfo:{ServerID:1001,UserID:'fixture'},setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(path.join(web,'js/lhs-tower-fix-v2.js'),'utf8'),{window:root});
  model.Rpc(3700,{select:0,replace:0},()=>{},()=>{});model.Rpc(3700,{select:0,replace:0},()=>{},()=>{});assert.equal(sent,1);
  success({result:0});model.Rpc(3700,{select:0,replace:0},()=>{},()=>{});assert.equal(sent,2);
});
test('Late animation cannot use disposed or recycled battle entities',()=>{
  for(const variant of ['normal','disposed','newAI','newInfo','newEntity']){
    let cb,restored=0;const info={setAtt(){},getAtt:()=>100};
    const entity={GetInfo:()=>info,UpdateActionName:(_a,_b,f)=>cb=f};
    const ai={mEntity:entity,isinFreezeBuff:()=>false,UpdateBlood(){},playCurStatusAnim(){restored++;}};entity.mAI=ai;
    method('r.Hurt=function','},r.getCurRoleBuffStatuAction=',{Ft:{Hp:1},Fq:{GetBattleView:()=>({bloodLayer:{ShowSkillChangeBlood(){}}})}}).call(ai,{value:-5,wuxing:[],type:0},true,'hit',false);
    if(variant==='disposed')entity.mAI=null;
    if(variant==='newAI')entity.mAI={};
    if(variant==='newInfo')entity.GetInfo=()=>({});
    if(variant==='newEntity')ai.mEntity={};
    cb();assert.equal(restored,variant==='normal'?1:0);
  }
});
test('Missing quality10 battle badge is omitted without changing quality',()=>{
  const assets={9:{quality:9},10:{quality:10}},available=new Set(['battle_bm_pinzhi_9']);
  const badge=method('o.getPetOrPetSoulQualityImg=function','},o.HideBloodBar=',{Y:{Config:{AssetsConfig:assets}},RES:{hasRes:k=>available.has(k)}});
  assert.equal(badge(9),'battle_bm_pinzhi_9');assert.equal(badge(10),'');assert.equal(assets[10].quality,10);
  available.add('battle_bm_pinzhi_10');assert.equal(badge(10),'battle_bm_pinzhi_10');
});
console.log(JSON.stringify({status:'PASS',checks,productionWrites:0,kind:'shipped native client methods in VM'}));
