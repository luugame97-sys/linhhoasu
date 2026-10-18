'use strict';

const config = require('./ConfigService');
const FREE_SHOP_ID = 11001400;
const PAID_SHOP_IDS = Object.freeze([11001401,11001402,11001403,11001404,11001405]);
const DAY = 86400000;
// Historical purchases before this hotfix have totals, but no per-day/instance ledger.
// The first fishing contest opened on this date; do not give its buyers a fresh allowance.
const LEGACY_START = Date.parse('2026-09-06T19:00:00+07:00');
const LEGACY_INSTANCE = `F6006_${LEGACY_START}`;
const dayKey = now => Math.floor((now + 8 * 3600000) / DAY);
const count = value => Math.max(0, Math.floor(Number(value) || 0));
function inScope(id) { return Number(id) === FREE_SHOP_ID || PAID_SHOP_IDS.includes(Number(id)); }
function hasRequest(params) { return Object.keys(params?.require || {}).some(inScope); }
function oldCount(player, id) {
  return Math.max(count(player.shopInfo?.buyRecords?.[id]), ...(player.rechargeInfo?.records || []).filter(r=>Number(r.id)===id).map(r=>count(r.count)));
}
function getCount(player, id, window, now=Date.now()) {
  const ledger = player.rechargeInfo?.fishingEventShopClaims;
  if (id === FREE_SHOP_ID) {
    if (ledger?.freeDaily?.dayKey === dayKey(now)) return count(ledger.freeDaily.count);
    return dayKey(now) === dayKey(LEGACY_START) ? Math.min(1, oldCount(player,id)) : 0;
  }
  const value = ledger?.periods?.[window.key]?.[id];
  if (value != null) return count(value);
  return window.key === LEGACY_INSTANCE ? oldCount(player,id) : 0;
}
function policy(player, id, now=Date.now()) {
  id = Number(id);
  if (!inScope(id)) return null;
  const window = require('./FishingEventSchedule').active(player,6006,now);
  if (!window) return {error:'FISH_EVENT_NOT_ACTIVE',shopId:id};
  const row = config.get('ActivityShopConfig')?.[6006]?.[id];
  if (!row || !Number.isSafeInteger(row.limit) || row.limit < 1) return {error:'FISH_SHOP_CONFIG_MISSING',shopId:id};
  return {shopId:id,activityId:6006,window,dayKey:dayKey(now),count:getCount(player,id,window,now),
    limit:id===FREE_SHOP_ID?1:row.limit*10,limitType:row.limitType};
}
function commit(player, state, amount=1) {
  if (!state || state.error || !Number.isSafeInteger(amount) || amount<1 || state.count+amount>state.limit) throw Error('FISH_SHOP_LIMIT_INVALID');
  player.rechargeInfo ||= {};
  const ledger = player.rechargeInfo.fishingEventShopClaims ||= {};
  if (state.shopId===FREE_SHOP_ID) ledger.freeDaily={dayKey:state.dayKey,count:state.count+amount};
  else { ledger.periods ||= {};ledger.periods[state.window.key] ||= {};ledger.periods[state.window.key][state.shopId]=state.count+amount; }
}
function buyRecords(player, window, now=Date.now()) {
  return Object.fromEntries([FREE_SHOP_ID,...PAID_SHOP_IDS].map(id=>[id,getCount(player,id,window,now)]));
}
function activityPackets(player) {
  if (!player) return [];
  const copy=JSON.parse(JSON.stringify(player));
  return require('./FishingEventSchedule').sync(copy).rows.filter(row=>row.id===6006).map(data=>({tag:1701,msgUid:0,data:{data}}));
}
async function handleItemPurchase(params,session,msgUid) {
  const failure = code => [...activityPackets(session?.player),{tag:1202,msgUid,data:{result:-1,code,msg:code,id:FREE_SHOP_ID,rewardInfo:{items:[],equips:[]}}}];
  if (!session?.userId || !session.player) return failure('FISH_SHOP_SESSION_REQUIRED');
  return require('./PlayerMutationService').run(session.userId,async()=>{
    if (!session.player) return failure('FISH_SHOP_SESSION_REQUIRED');
    const entries=Object.entries(params?.require||{});
    if(entries.length!==1||Number(entries[0][0])!==FREE_SHOP_ID||entries[0][1]!==1) return failure('FISH_SHOP_SINGLE_FREE_ONLY');
    const state=policy(session.player,FREE_SHOP_ID);
    if(state.error)return failure(state.error);
    if(state.count>=state.limit)return failure('DAILY_LIMIT_REACHED');
    const goods=config.get('ShopConfig')?.[FREE_SHOP_ID];
    if(!goods||goods.payId||goods.cost?.length||!goods.rewards?.length)return failure('FISH_SHOP_CONFIG_MISSING');
    const integrity=require('./FishingIntegrityService'),next=integrity.clone(session.player);
    const granted=integrity.grant(next,goods.rewards);
    commit(next,state,1);
    next.shopInfo ||= {};next.shopInfo.buyRecords ||= {};
    next.shopInfo.buyRecords[FREE_SHOP_ID]=count(next.shopInfo.buyRecords[FREE_SHOP_ID])+1;
    next.shopInfo.lastBuyTime=Date.now();
    next.rechargeInfo.records ||= [];
    const record=next.rechargeInfo.records.find(r=>Number(r.id)===FREE_SHOP_ID);
    if(record)record.count=count(record.count)+1;else next.rechargeInfo.records.push({id:FREE_SHOP_ID,count:1});
    session.player=next;
    await integrity.save(session);
    session._itemListCache=null;
    return [...activityPackets(next),...granted.packets,
      {tag:1202,msgUid:0,data:require('./RewardSync').buildRewardItemSync(next,goods.rewards)},
      {tag:1202,msgUid,data:{result:0,ids:[FREE_SHOP_ID],items:granted.rewardInfo.items,changed:granted.changed,rewardInfo:granted.rewardInfo}}];
  });
}
module.exports={FREE_SHOP_ID,PAID_SHOP_IDS,inScope,hasRequest,policy,commit,buyRecords,activityPackets,handleItemPurchase};
