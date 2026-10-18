'use strict';
const config=require('./ConfigService'),rules=require('../config/fishingEconomy.json'),crypto=require('crypto');
const clone=v=>JSON.parse(JSON.stringify(v));
const int=n=>Number.isSafeInteger(n)&&n>=0;
function draw(max,rng){const n=rng?rng(max):crypto.randomInt(max);if(!Number.isSafeInteger(n)||n<0||n>=max)throw Error('FISH_ECONOMY_RNG');return n;}
function windowFor(player,now=Date.now()){
 const schedule=require('./FishingEventSchedule');return schedule.current(now).find(w=>w.id!==6006&&schedule.active(player,w.id,now))||null;
}
function reconcile(player,now=Date.now()){
 player.fishInfo||={};player.items||={};const info=player.fishInfo,w=windowFor(player,now),old=info.eventCurrency;
 const balance=Number(player.items[119]||0);if(!int(balance))throw Error('FISH_CURRENCY_INVALID');
 let converted=0;
 if(old&&old.end<=now){
  converted=balance;const silver=Number(player.currencies?.silver||0),reward=converted*rules.currency.silverPerCoin;
  if(!int(silver)||!int(reward)||!int(silver+reward))throw Error('FISH_CURRENCY_OVERFLOW');
  player.items[119]=0;player.currencies||={};player.currencies.silver=silver+reward;
  info.eventCurrencySettlement={key:old.key,coins:converted,silver:reward,at:now};info.eventCurrency=null;
 }
 if(!info.eventCurrency&&w)info.eventCurrency={key:w.key,id:w.id,end:w.endTime,bonusRemainder:0,earned:0};
 return {converted,silver:converted*rules.currency.silverPerCoin,window:w};
}
function markCatch(player,result,now=Date.now()){
 const {window:w}=reconcile(player,now);const info=player.fishInfo;
 if(!w||Number(info.scene)!==Number(config.get('Activity33Config')?.[w.id]?.sceneId))return;
 const kept=new Set([...(info.fishResult?.fishInfos||[]),...Object.values(info.slots||{}),...(result.fishInfos||[])].map(f=>String(f.uid)));
 info.eventSaleSources=Object.fromEntries(Object.entries(info.eventSaleSources||{}).filter(([uid,key])=>kept.has(uid)&&key===w.key));
 for(const fish of result.fishInfos||[])info.eventSaleSources[String(fish.uid)]=w.key;
}
function saleBonus(player,fish,rng,now=Date.now()){
 const {window:w}=reconcile(player,now),info=player.fishInfo,uid=String(fish.uid),source=info.eventSaleSources?.[uid];
 if(info.eventSaleSources)delete info.eventSaleSources[uid];
 if(!w||source!==w.key||Number(info.scene)!==Number(config.get('Activity33Config')?.[w.id]?.sceneId)||fish.lock)return [];
 if(draw(10000,rng)>=rules.currency.saleChanceBps)return [];
 let count=rules.currency.min+draw(rules.currency.max-rules.currency.min+1,rng);const state=info.eventCurrency;
 if(Number(player.rechargeInfo?.monthCards?.[rules.currency.privilegeShopId]||0)>now){
  const fraction=count*rules.currency.bonusBps+Number(state.bonusRemainder||0);state.bonusRemainder=fraction%10000;count+=Math.floor(fraction/10000);
 }
 state.earned=Number(state.earned||0)+count;return[{id:119,count}];
}
function carpRoll(count,rng){
 if(!Number.isSafeInteger(count)||count<1||count>rules.carp.maxAutomatic)throw Error('FISH_CARP_COUNT');
 const pool=rules.carp.pool;if(pool.reduce((n,r)=>n+r.weight,0)!==10000)throw Error('FISH_CARP_POOL');
 const result=new Map();for(let i=0;i<count;i++){let roll=draw(10000,rng),chosen;for(const r of pool){roll-=r.weight;if(roll<0){chosen=r;break;}}if(!chosen||!config.get('AssetsConfig')?.[chosen.id])throw Error('FISH_CARP_CONFIG');const n=chosen.min+draw(chosen.max-chosen.min+1,rng);result.set(chosen.id,(result.get(chosen.id)||0)+n);}
 return[...result].map(([id,count])=>({id,count}));
}
function expandCarp(rows,rng){return rows.flatMap(r=>Number(r.id)===94501?carpRoll(Number(r.count),rng):[r]);}
async function useCarp(params,session,msgUid){
 const fail=code=>({tag:1300,msgUid,data:{result:1,code,rewardInfo:{items:[],equips:[]}}});
 if(!session?.userId)return fail('FISH_SESSION_REQUIRED');
 return require('./PlayerMutationService').run(session.userId,async()=>{
  if(!session.player)return fail('FISH_SESSION_REQUIRED');const count=params.count==null?1:Number(params.count);
  if(!Number.isSafeInteger(count)||count<1||count>rules.carp.maxUse)return fail('FISH_CARP_MAX_100');
  const next=clone(session.player);next.items||={};if(Number(next.items[94501]||0)<count)return fail('FISH_CARP_NOT_ENOUGH');
  const rewards=carpRoll(count);next.items[94501]-=count;
  const integrity=require('./FishingIntegrityService'),grant=integrity.grant(next,rewards);session.player=next;await integrity.save(session);
  const sync=require('./RewardSync').buildRewardItemSync(next,rewards);sync.items.push({id:94501,count:-count});sync.changed.push({id:94501,count:next.items[94501]});
  return[...grant.packets,{tag:1202,msgUid:0,data:sync},{tag:1300,msgUid,data:{result:0,id:94501,count,rewardInfo:grant.rewardInfo,rewards:grant.rewardInfo}}];
 });
}
function isCurrencyShop(id){return(config.get('ShopConfig')?.[id]?.cost||[]).some(r=>r.id===119);}
async function currencyShop(params,session,msgUid){
 const fail=code=>({tag:1202,msgUid,data:{result:1,code,rewardInfo:{items:[],equips:[]}}});
 if(!session?.userId)return fail('FISH_SESSION_REQUIRED');
 return require('./PlayerMutationService').run(session.userId,async()=>{
  if(!session.player)return fail('FISH_SESSION_REQUIRED');const entries=Object.entries(params.require||{});if(entries.length!==1)return fail('FISH_CURRENCY_SINGLE_SHOP');
  const id=Number(entries[0][0]),count=entries[0][1];if(!Number.isSafeInteger(count)||count<1||count>1000)return fail('FISH_CURRENCY_COUNT');
  const next=clone(session.player),state=reconcile(next),w=state.window;
  if(!w)return fail('FISH_EVENT_NOT_ACTIVE');const goods=config.get('ShopConfig')?.[id],policy=config.get('ActivityShopConfig')?.[w.id]?.[id];
  if(!policy||!goods||goods.payId||goods.cost.length!==1||goods.cost[0].id!==119)return fail('FISH_CURRENCY_SHOP_NOT_ACTIVE');
  const info=next.fishInfo,stats=info.eventStats?.[w.key];if(!stats)return fail('FISH_EVENT_STATE_REQUIRED');stats.buyRecords||={};const bought=Number(stats.buyRecords[id]||0);
  if(policy.limit>0&&bought+count>policy.limit)return fail('FISH_CURRENCY_SHOP_LIMIT');const cost=goods.cost[0].count*count;
  if(!int(cost)||Number(next.items[119]||0)<cost)return fail('FISH_CURRENCY_NOT_ENOUGH');next.items[119]-=cost;stats.buyRecords[id]=bought+count;
  const rewards=goods.rewards.map(r=>({...r,count:r.count*count}));const integrity=require('./FishingIntegrityService'),grant=integrity.grant(next,rewards);session.player=next;await integrity.save(session);
  const sync=require('./RewardSync').buildRewardItemSync(next,rewards);sync.items.push({id:119,count:-cost});sync.changed.push({id:119,count:next.items[119]});
  return[...require('./FishingEventService').syncPackets(next),...grant.packets,{tag:1202,msgUid:0,data:sync},{tag:1202,msgUid,data:{result:0,ids:[id],items:grant.rewardInfo.items,changed:sync.changed,rewardInfo:grant.rewardInfo}}];
 });
}
module.exports={rules,reconcile,markCatch,saleBonus,carpRoll,expandCarp,useCarp,isCurrencyShop,currencyShop};
