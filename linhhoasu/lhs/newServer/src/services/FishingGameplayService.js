'use strict';
const crypto = require('crypto');
const config = require('./ConfigService');
const rules = require('../config/fishingGameplayBalance.json');
const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
const owns = (p, id) => Number(p.items?.[id] || 0) > 0;
const attr = (info, id) => (info.rodAttrs || []).reduce((n, a) => n + (Number(a.type) === id ? Number(a.value) || 0 : 0), 0);
const normal = r => r && r.type >= 1 && r.type <= 10;
function draw(max, rng) { const n = rng ? rng(max) : crypto.randomInt(max); if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(n) || n < 0 || n >= max) throw Error('FISH_RNG_INVALID'); return n; }
function chance(bps, rng) { return draw(10000, rng) < clamp(bps, 0, 10000); }
function pick(rows, weight, rng) {
  const weighted = rows.map(r => [r, Math.max(1, Math.floor(weight(r)))]), total = weighted.reduce((n, r) => n + r[1], 0);
  let n = draw(total, rng); for (const [row, w] of weighted) { if (n < w) return row; n -= w; } throw Error('FISH_POOL_EMPTY');
}
function range(bounds, rng) { return bounds[0] + draw(bounds[1] - bounds[0] + 1, rng); }
function baitEffects(player, bait) {
  const info = player.fishInfo;
  const raftUnlocked = (player.systemUnlockInfo?.unlockedSystem || []).includes(223);
  const efficiency = attr(info, 105) + (raftUnlocked ? Number(config.get('FishRaftGradeConfig')?.[info.raftRank]?.attrs?.[105] || 0) : 0)
    + (owns(player, 6202) && raftUnlocked ? 2000 : 0);
  const raw = config.get('FishBaitConfig')?.[bait]?.attrs || {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, [5,11].includes(Number(k)) ? v : Math.floor(v * (1 + clamp(efficiency, 0, 10000) / 10000))]));
}
function orderMatch(row, order) {
  const cfg = config.get('FishOrderConfig')?.[order.id]; if (!cfg || order.received || order.progress >= cfg.count) return false;
  return cfg.type === 41 ? row.type === cfg.fishType : cfg.type === 42 ? row.id === cfg.fishType : cfg.type === 43 && row.quality === cfg.fishType;
}
function normalCatch(player, pool, bait, rng) {
  const info = player.fishInfo, table = config.get('FishConfig'), effect = baitEffects(player, bait), premium = bait === 5542 || bait === 5543;
  const miss = Math.max(0, rules.normal.missBps - (effect[1] || 0) * rules.normal.focusPointToMissBps);
  const escape = Math.max(0, rules.normal.escapeBps - (effect[2] || 0) * rules.normal.strengthPointToEscapeBps);
  if (!premium) {
    const outcome = draw(10000, rng);
    if (outcome < miss) return { escape: 1 }; // native konggan
    if (outcome < miss + escape) return { escape: 2 }; // native taotuo
    const relics = (config.get('FishSceneConfig')?.[info.scene]?.relics || []).map(id => table[id]).filter(Boolean);
    if (relics.length && outcome < miss + escape + rules.normal.relicBps * (1 + attr(info, 212) / 10000)) {
      const row = pick(relics, () => 1, rng); return row.type === 104 ? { item: { id: row.id, count: 1 } } : { id: row.id, multi: 10000 };
    }
    if (chance(rules.normal.treasureBps * (1 + attr(info, 211) / 10000), rng)) return { id: pick([5201,5202,5203], () => 1, rng), multi: 10000 };
    for (const family of rules.specialFamilies) {
      const count = family.owners.filter(id => owns(player, id)).length;
      if (count && chance(count * rules.advertised.specialFishBps, rng)) return { id: pick(family.ids, () => 1, rng), multi: 10000 };
    }
  }
  let allowed = pool.map(id => table[id]).filter(normal);
  if (premium) {
    const types = new Set(allowed.map(r => r.type));
    allowed = Object.values(table).filter(r => normal(r) && types.has(r.type) && r.quality >= (bait === 5543 ? 9 : 7));
    if (bait === 5542) allowed = allowed.filter(r => r.quality >= Number(info.slots?.[r.type]?.quality || 0));
  }
  if (!allowed.length) throw Error('FISH_GAMEPLAY_POOL_EMPTY');
  const mutations = allowed.filter(r => r.isUnusual), regular = allowed.filter(r => !r.isUnusual);
  const mutationBps = premium ? rules.advertised.premiumBaitMutationBps
    : rules.normal.mutationBps * (owns(player, 5907) ? rules.advertised.thanhLongMutationMultiplier : 1) * (1 + (effect[13] || 0) / 10000);
  const selectedPool = mutations.length && chance(mutationBps, rng) ? mutations : regular;
  if(!selectedPool.length)throw Error('FISH_GAMEPLAY_POOL_EMPTY');
  const qualities = [...new Set(selectedPool.map(r => r.quality))];
  const quality = pick(qualities, q => (rules.normal.qualityWeights[q] || 1)
    * (Number(effect[11]) === q ? 1 + rules.normal.qualityBaitWeightBonusBps / 10000 : 1)
    * (q >= 7 && owns(player, 6207) ? 1.1 : 1), rng);
  const row = pick(selectedPool.filter(r => r.quality === quality), r => {
    const bps = 10000 + (effect[200 + r.type] || 0) + attr(info, 200 + r.type) - attr(info, 300 + r.type)
      + (effect[5] === r.id ? rules.normal.targetBaitWeightBonusBps : 0)
      + (owns(player, 5902) && (info.orders || []).some(o => orderMatch(r,o)) ? 1000 : 0);
    return clamp(bps, 1000, 50000);
  }, rng);
  let multi = range(chance(rules.normal.bigBps + (effect[3] || 0), rng) ? rules.normal.bigWeight : rules.normal.normalWeight, rng);
  if (premium) multi = Math.max(multi, Number(info.pics?.[row.id]?.multi || 0));
  return { id: row.id, multi, double: owns(player, 5905) && chance(rules.advertised.chuTuocDoubleBps, rng) };
}
function soulCatch(player, rng) {
  const info = player.fishInfo, r = draw(10000,rng);
  if (r < rules.soul.missBps) return { escape:1 };
  if (r < rules.soul.missBps + rules.soul.escapeBps) return { escape:2 };
  const rows = Object.values(config.get('FishSoulConfig')).filter(r => Number(r.levelShow || 1) <= info.level);
  const mutated = rows.filter(r => r.isUnusual), plain = rows.filter(r => !r.isUnusual);
  const pool = mutated.length && chance(rules.soul.mutationBps,rng) ? mutated : plain;
  const q = pick([...new Set(pool.map(r=>r.quality))], q=>rules.soul.qualityWeights[q]||1,rng);
  const row=pick(pool.filter(r=>r.quality===q),()=>1,rng);
  const result={id:row.id,multi:range([10000,Math.max(10000,row.maxKgValue)],rng)};
  // Only release boxes whose advertised native skin currently exists.
  if(chance(rules.soul.boxDropBps,rng)) result.item={id:info.level>=18?94822:94821,count:1};
  return result;
}
function sale(player, fish, rng) {
  const cfg=config.get('FishConfig')?.[fish.id];if(!cfg)throw Error('FISH_SALE_UNKNOWN');
  const family=rules.specialFamilies.find(r=>r.type===cfg.type),treasure=rules.treasureRewards[fish.id];
  let rewards;
  if(family)rewards=[{id:family.rewardId,count:range([family.min,family.max],rng)}];
  else if(treasure)rewards=[{id:treasure.id,count:range([treasure.min,treasure.max],rng)}];
  else if(cfg.type===102)rewards=[{id:68,count:rules.normal.relicCoins}];
  else rewards=[{id:68,count:Math.max(1,Number(cfg.quality)||1)}];
  for(const reward of rewards){const boost=reward.id===1?106:reward.id===4?107:reward.id===69?108:0;if(boost&&chance(attr(player.fishInfo,boost),rng))reward.count*=2;}
  if(owns(player,6203)&&chance(1000,rng))rewards.push({id:pick([5512,5513,5514],()=>1,rng),count:1});
  return [...rewards,...require('./FishingEconomyService').saleBonus(player,fish,rng)];
}
function recoverEnergy(player, now=Date.now()) {
  player.fishInfo ||= {};player.items ||= {};
  const info=player.fishInfo,row=config.get('AssetsRefreshConfig')?.[65];if(!row)return false;
  const rate=owns(player,6209)?1.05:1,max=Math.floor(row.countMax*rate),interval=Math.ceil(row.time*1000/rate);
  const before=Number(player.items[65]||0),start=Number(info.energyRecoveredAt||0);
  if(!start||start>now){info.energyRecoveredAt=now;return true;}
  if(before>=max){info.energyRecoveredAt=now;return false;}
  const ticks=Math.floor((now-start)/interval);if(ticks<1)return false;
  player.items[65]=Math.min(max,before+ticks*row.count);
  info.energyRecoveredAt=player.items[65]>=max?now:start+ticks*interval;return true;
}
function validate() {
  for(const group of ['normal','soul'])for(const key of ['missBps','escapeBps','mutationBps'])if(!Number.isInteger(rules[group][key])||rules[group][key]<0||rules[group][key]>10000)throw Error('FISH_GAMEPLAY_CONFIG_INVALID');
  for(const group of ['normal','soul'])if(Object.values(rules[group].qualityWeights).some(v=>!Number.isSafeInteger(v)||v<1)||Object.values(rules[group].qualityWeights).reduce((n,v)=>n+v,0)!==10000)throw Error('FISH_QUALITY_WEIGHTS_INVALID');
  if(rules.advertised.chuTuocDoubleBps!==1000||rules.advertised.bachHoDoubleBps!==1000||rules.advertised.premiumBaitMutationBps!==5000)throw Error('FISH_ADVERTISED_RATE_CHANGED');
  return rules;
}
module.exports={rules,validate,draw,chance,pick,range,baitEffects,normalCatch,soulCatch,sale,owns,recoverEnergy};
