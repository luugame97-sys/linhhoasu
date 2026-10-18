'use strict';
const { randomUUID } = require('node:crypto');
const config = require('./ConfigService');
const access = require('./FarmAccessService');
const players = require('./PlayerService');
const runtime = require('./RuntimeBus');
const Guild = require('../db/models/Guild');
const day = require('./GameDayService');
const clone = x => JSON.parse(JSON.stringify(x));
const idOf = p => String(p.playerId || p.userId || '');
const policy = () => require('./FarmPolicyService').policy.assistance;
const farmApi = () => require('../handlers/farm');
const slotKey = (type, index) => `${type}:${index}`;
function member(guild, player) {
  return Number(player.guildInfo?.guildId) === Number(guild.guildId)
    && guild.members?.some(m => String(m.userId || m.userid) === String(player.userId)
      && String(m.playerId || m.playerid || m.dbid || idOf(player)) === idOf(player));
}
function valid(owner, request, now = Date.now()) {
  if (!request || request.expiresAt <= now || request.guildId !== Number(owner.guildInfo?.guildId)) return false;
  const f = owner.farmInfo || {};
  if (request.type === 2) return (f.buildLv?.[request.index] || 1) === request.level
    && f.buildUpgrade?.[request.index] > now;
  const block = f.blockInfo?.find(b => b.index === request.index);
  return !!block?.robber && String(block.robber.dbid) === request.robberId
    && String(block.leaseId || block.finishTime) === request.cycle && block.finishTime > now;
}
function record(owner, r) {
  const assistData = { type:r.type, finish:r.finished || !valid(owner,r), name:owner.name || '',
    avatar:owner.roleInfo?.avatar || owner.avatar || 0, avatarurl:owner.avatarUrl || '' };
  if (r.type === 2) assistData.plantBuildInfo = { index:r.index, lv:r.level, list:r.helpers.map(h=>h.id) };
  else assistData.fightInfo = { index:r.index, playerId:r.robberId };
  return { uid:r.uid, type:3, playerId:idOf(owner), time:r.createdAt, kungfuId:owner.roleInfo?.kungfuId || 1,
    farmAssist:true, expiresAt:r.expiresAt, helperLimit:r.type===2?policy().perUpgradeHelpers:1, assistData };
}
function pushGuild(guild, tag, data, exclude) {
  const ws=runtime.getWsServer();
  for (const m of guild.members || []) if (String(m.userId)!==String(exclude)) ws?.pushToUser?.(m.userId,tag,data);
}
async function mirror(guild, owner, r) {
  const row=record(owner,r);
  const result=await Guild.updateOne({guildId:guild.guildId,'assistRecords.uid':r.uid},{$set:{'assistRecords.$':row}});
  if (!result.acknowledged) throw Error('FARM_ASSIST_INDEX_SAVE_FAILED');
  if (!(result.matchedCount ?? result.n)) {
    const added=await Guild.updateOne({guildId:guild.guildId,'assistRecords.uid':{$ne:r.uid}},
      {$push:{assistRecords:{$each:[row],$slice:-120}}});
    if (!added.acknowledged || !(added.matchedCount ?? added.n)) throw Error('FARM_ASSIST_INDEX_SAVE_FAILED');
  }
  return row;
}
async function create(params, session) {
  const owner=session.player, type=params.type, index=params.index, p=policy(), now=Date.now();
  if (!owner || !p.enabled || !Number.isInteger(index) || index<0) return {result:1,code:'FARM_ASSIST_INVALID'};
  const guild=await Guild.findOne({guildId:Number(owner.guildInfo?.guildId)||0}).lean();
  if (!guild || !member(guild,owner)) return {result:1,code:'FARM_ASSIST_GUILD_REQUIRED'};
  const f=owner.farmInfo, key=slotKey(type,index);
  f.socialRequests ||= {};
  let r=f.socialRequests[key];
  if (!r || !valid(owner,r,now)) {
    const block=f.blockInfo.find(b=>b.index===index);
    if (type===2 && !(config.get('PlantBuildConfig')?.[index] && f.buildUpgrade[index]>now)) return {result:1,code:'FARM_ASSIST_NOT_UPGRADING'};
    if (type===3 && (!block?.robber || String(block.robber.dbid)!==String(params.dbid) || block.finishTime<=now)) return {result:1,code:'NO_MATCHING_ROBBER'};
    r={uid:randomUUID(),type,index,guildId:guild.guildId,createdAt:now,helpers:[],finished:false,
      level:f.buildLv[index]||1,expiresAt:Math.min(now+86400000,type===2?f.buildUpgrade[index]:block.finishTime),
      cycle:type===2?randomUUID():String(block.leaseId || block.finishTime),robberId:type===3?String(block.robber.dbid):''};
    f.socialRequests[key]=r;
  }
  await access.save(owner,session);
  access.afterCommit(async()=>{ const row=await mirror(guild,owner,r); pushGuild(guild,1507,{record:row},session.userId); });
  return {result:0,record:record(owner,r)};
}
// Acquire every role lock before entering the generic per-role WS wrapper.
async function withLocks(params, session, work) {
  const owner=await players.findByPlayerId(String(params?.playerId || ''));
  const r=owner?.farmInfo?.socialRequests?.[slotKey(params?.type,params?.index)];
  const keys=[session?.userId,owner?.userId];
  if(r?.robberId){const robber=await players.findByPlayerId(r.robberId);keys.push(robber?.userId);}
  return require('./PlayerMutationService').runMany(keys,async()=>{
    for(const id of keys.filter(Boolean)) await players.drainPendingSaves(id);
    return work();
  });
}
async function confirmed(target, draft, session) {
  await access.save(draft,session);
  Object.assign(target,draft);
}
async function claim(params, session, msgUid) {
  const fail=code=>({tag:1519,msgUid,data:{result:0,code}});
  if (!session?.player || !policy().enabled || ![2,3].includes(params.type) || !Number.isInteger(params.index)) return fail('FARM_ASSIST_INVALID');
  return withLocks(params,session,async()=>{
    const helper=session.player, owner=await access.load(String(params.playerId));
    if(!owner || idOf(owner)===idOf(helper) || Number(owner.serverId)!==Number(helper.serverId)) return fail('FARM_ASSIST_INVALID_TARGET');
    const guild=await Guild.findOne({guildId:Number(helper.guildInfo?.guildId)||0}).lean();
    if(!guild || !member(guild,helper) || !member(guild,owner)) return fail('FARM_ASSIST_GUILD_REQUIRED');
    const key=slotKey(params.type,params.index), r=owner.farmInfo?.socialRequests?.[key];
    // The shipped native client does not include the request UID in 1519;
    // resolve its latest slot request by player/type/index. Newer clients may
    // include uid, which is checked strictly for replay safety.
    if(!r || (params.uid && params.uid!==r.uid)) return fail('FARM_ASSIST_STALE_REQUEST');
    if(r.robberId===idOf(helper)) return fail('FARM_ASSIST_SELF_ROBBER');
    let prior=r.helpers.find(h=>h.id===idOf(helper));
    if(!prior){
      if(!valid(owner,r) || r.finished || r.helpers.length>=(r.type===2?policy().perUpgradeHelpers:1)) return fail('FARM_ASSIST_FINISHED');
      const hd=clone(helper), today=day.key();
      const quota=hd.farmInfo.socialQuota?.day===today?hd.farmInfo.socialQuota:{day:today,uids:[]};
      if(!quota.uids.includes(r.uid)){
        if(quota.uids.length>=policy().dailyLimit) return fail('FARM_ASSIST_DAILY_LIMIT');
        quota.uids.push(r.uid);hd.farmInfo.socialQuota=quota;await confirmed(helper,hd,session);
      }
      const draft=clone(owner), req=draft.farmInfo.socialRequests[key];
      prior={id:idOf(helper),at:Date.now(),seconds:0};
      if(r.type===2){
        const cfg=config.get('PlantBuildConfig')[r.index][r.level], now=Date.now();
        const ms=Math.min(draft.farmInfo.buildUpgrade[r.index]-now,Math.floor(cfg.levelUpTime*1000*policy().ratePerHelp/10000),policy().secondsCap*1000);
        if(!(ms>0))return fail('FARM_ASSIST_FINISHED');
        draft.farmInfo.buildUpgrade[r.index]-=ms;prior.seconds=ms/1000;
      }else{
        const robber=await access.load(r.robberId);
        if(!robber)return fail('FARM_ASSIST_ROBBER_MISSING');
        const battle=require('./BattleService');
        const attacker=battle.calcPlayerPower(clone(helper)), defender=battle.calcPlayerPower(clone(robber));
        for(const [attrs,who,building] of [[attacker,helper,1],[defender,robber,2]]){
          const bonuses=config.get('PlantBuildConfig')[building]?.[who.farmInfo?.buildLv?.[building]||1]?.attrs||{};
          attrs[2]=Math.floor(attrs[2]*(1+(bonuses[1]||0)/10000));attrs[3]=Math.floor(attrs[3]*(1+(bonuses[2]||0)/10000));
        }
        const outcome={...battle.simulateBattle(attacker,defender,{isPvp:true}),attacker,defender};
        prior.fightResult=farmApi().buildFarmAssistFightResult(helper,r.robberId,robber,outcome);
        if(outcome.win)farmApi().cancelFarmAssistLease(draft,r.index);
      }
      req.helpers.push(prior);req.finished=r.type===3||req.helpers.length>=policy().perUpgradeHelpers;
      await confirmed(owner,draft);
    }
    const actual=owner.farmInfo.socialRequests[key], row=await mirror(guild,owner,actual), packets=[];
    if(r.type===2){
      const payload={buildLv:clone(owner.farmInfo.buildLv),buildUpgrade:clone(owner.farmInfo.buildUpgrade)};
      access.push(idOf(owner),{tag:2407,msgUid:0,data:payload},session);
    }else if(prior.fightResult?.win){
      const robber=await access.load(r.robberId);
      if(robber){
        const rd=clone(robber), before=rd.farmInfo.roblist.length;
        rd.farmInfo.roblist=rd.farmInfo.roblist.filter(x=>!(x.playerinfo?.dbid===idOf(owner)&&x.index===r.index&&String(x.leaseId||x.finishtime)===r.cycle));
        if(rd.farmInfo.roblist.length!==before)await confirmed(robber,rd);
        // Native 2406 removes the owner's whole entry. An old receipt must
        // not clear a newer dispatch to that owner from the client.
        if (!rd.farmInfo.roblist.some(x=>x.playerinfo?.dbid===idOf(owner))) {
          access.push(idOf(robber),{tag:2406,msgUid:0,data:{ownerId:idOf(owner),rewards:[]}},session);
        }
      }
      const block=owner.farmInfo.blockInfo.find(b=>b.index===r.index);
      access.push(idOf(owner),{tag:2401,msgUid:0,data:{ownerId:idOf(owner),blockinfo:clone(block)}},session);
    }
    pushGuild(guild,1509,{playerId:idOf(owner),assist:row.assistData},session.userId);
    packets.push({tag:1509,msgUid:0,data:{playerId:idOf(owner),assist:row.assistData}});
    if(prior.fightResult)packets.push({tag:1517,msgUid:0,data:{fightResult:prior.fightResult}});
    packets.push({tag:1519,msgUid,data:{result:1}});return packets;
  });
}
async function guildRecords(guildId) {
  const g=await Guild.findOne({guildId}).lean();
  return (g?.assistRecords||[]).filter(r=>r.farmAssist && r.expiresAt>Date.now());
}
module.exports={create,claim,withLocks,guildRecords};
