'use strict';
const assert=require('assert/strict'),Module=require('module'),path=require('path');
const candidate=path.resolve(process.argv[2]);
const app=path.resolve(process.argv[3]);
const calls={replace:[],sale:[],saves:0};
const equipStub={
  ensureEquipInfo(){},
  replaceOpenEquipToPlan(player,params){calls.replace.push(params);return params.requirePowerUpgrade?{result:0,usedListId:0,mapId:0,equip:{uid:9},beforePower:100,afterPower:200}:{result:0,usedListId:0,mapId:0,equip:{uid:9},beforePower:0,afterPower:0}},
  saleOpenEquips(player,uids,options){calls.sale.push({uids,options});return {result:0,uids:[1],ignoredUids:[2],rewardInfo:{items:[{id:2,count:10}]}}},
  isEquipTemplateItem(){return false},createEquipFromTemplateId(){},addOpenEquip(){},
};
const original=Module._load;
Module._load=function(request,parent,isMain){
  if(parent&&path.resolve(parent.filename)===candidate){
    if(request==='../services/EquipService')return equipStub;
    if(request==='../services/PlayerService')return {drainPendingSaves(){return Promise.resolve();},savePlayerDeferred(){calls.saves++;return Promise.resolve();},savePlayer(){return Promise.resolve(true);}};
    if(request==='../logger')return {warn(){},info(){},error(){},debug(){}};
    if(request.startsWith('../')) return require(path.resolve(app,'src','handlers',request));
    if(request.startsWith('./')) return require(path.resolve(app,'src','handlers',request));
  }
  return original.call(this,request,parent,isMain);
};
const item=require(candidate);Module._load=original;
const session={userId:'fixture',player:{currencies:{silver:0},items:{},equipInfo:{}}};
(async()=>{
 let r=await item.handleEquipReplace({uid:9,listId:0,mapId:0,autoDelegate:true},session,101);
 let p=Array.isArray(r)?r.find(x=>x.tag===2200):r;
 assert.equal(calls.replace[0].requirePowerUpgrade,true);assert.equal(p.data.autoDelegate,true);assert.equal(p.data.beforePower,100);assert.equal(p.data.afterPower,200);
 r=await item.handleEquipReplace({uid:9,listId:0,mapId:0},session,102);
 assert.equal(calls.replace[1].requirePowerUpgrade,false);
 r=await item.handleEquipSale({uids:[1,2],autoDelegate:true},session,103);
 p=r.find(x=>x.tag===2201);assert.equal(calls.sale[0].options.safeAutoDelegate,true);assert.deepEqual(p.data.uids,[1]);assert.deepEqual(p.data.ignoredUids,[2]);assert.equal(p.data.autoDelegate,true);
 r=await item.handleEquipSale({uids:[1,2]},session,104);
 assert.equal(calls.sale[1].options.safeAutoDelegate,false);
 console.log(JSON.stringify({result:'PASS',checks:10,saves:calls.saves}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
