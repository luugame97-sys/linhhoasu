'use strict';
// Receipt lives inside the existing authenticated recharge write.
const PAY_ID=10900;
function check(player,id,now=Date.now(),multi=1){
  if(Number(id)!==PAY_ID)return null;
  const cross=require('./CrossServerEventService'),cycle=cross.cycleFor('topArena',now);
  if(!cycle)return {ok:false,reason:'TOP_ARENA_CLOSED'};
  const timeline=require('./TopArenaService').calendar(cycle);
  if(now<timeline.gamePassStartTime||now>=timeline.settleTime)return {ok:false,reason:'TOP_ARENA_PASS_CLOSED'};
  if(multi!==1)return {ok:false,reason:'INVALID_MULTI'};
  if(player.rechargeInfo?.topArenaPasses?.[cycle.key])return {ok:false,reason:'ALREADY_ACTIVE'};
  return {ok:true,cycleKey:cycle.key};
}
function apply(player,id,now){
  if(Number(id)!==PAY_ID)return null;
  const gate=check(player,id,now);if(!gate?.ok)throw Error(gate?.reason||'TOP_ARENA_PASS_INVALID');
  player.rechargeInfo||={};player.rechargeInfo.topArenaPasses||={};player.rechargeInfo.topArenaPasses[gate.cycleKey]=true;
  return {cycleKey:gate.cycleKey,pass:1};
}
module.exports={PAY_ID,check,apply};
