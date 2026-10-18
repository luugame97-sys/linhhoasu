'use strict';
const assert=require('assert/strict');
const resolver=require('../src/services/RechargeRewardResolver');
const pass=require('../src/services/OldTrekPassService');
const playerService=require('../src/services/PlayerService');
playerService.savePlayer=async(_id,player)=>player;
playerService.savePlayerDeferred=async(_id,player)=>player;
require('../src/services/ServerConfigService').getCurrentRechargeArea=async()=>1;
const compat=require('../src/handlers/compat');
const old=require('../src/handlers/old-trek');
const p={userId:'ram-pass',playerId:'12345',name:'test',level:100,items:{1001:10000},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},rechargeInfo:{records:[]}};
old.ensureOldTrekInfo(p);
(async()=>{
 for(let id=11121;id<=11128;id++){
  const empty={items:{},currencies:{},other_attr_info:{}};
  assert(resolver.resolveRechargeRewards(empty,{payId:id,route:'token',multi:1}).ok);
  assert.equal(resolver.resolveRechargeRewards(empty,{payId:id,route:'token',multi:2}).reason,'INVALID_MULTI');
  assert.equal(resolver.resolveRechargeRewards(empty,{payId:id,route:'cash',amount:1,multi:1}).reason,'AMOUNT_MISMATCH');
  pass.apply(empty,id); assert.equal(resolver.resolveRechargeRewards(empty,{payId:id,route:'token',multi:1}).reason,'ALREADY_ACTIVE');
 }
 const s={userId:p.userId,player:p};
 const result=await compat.handleTokenRecharge1230({id:11121,multi:1},s,8);
 const packets=Array.isArray(result)?result:[result],ack=packets.find(r=>r.tag===1230);
 assert.equal(ack.data.result,0,JSON.stringify(ack));
 assert.equal(s.player.items[1001],9832);assert.equal(s.player.currencies.diamond,1680);
 assert(s.player.other_attr_info.oldTrekInfo.sailorList.some(r=>r.id===360101));
 assert.equal(s.player.items[360101]||0,0,'typed sailor must not be a fake bag item');
 assert(packets.some(r=>r.tag===7000));assert(packets.some(r=>r.tag===1210));
 const before=s.player.items[1001];await compat.handleTokenRecharge1230({id:11121,multi:1},s,9);assert.equal(s.player.items[1001],before);
 console.log(JSON.stringify({status:'PASS',products:8,tokenRoute:1,checks:['metadata','duplicate','invalid multi','cash mismatch','168 tokens','1680 diamonds','typed sailor','client packets','repeat no cost'],productionWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
