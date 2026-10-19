'use strict';
const day=require('./GameDayService');
const VERSION='20261017_tower_daily_reset_v1';
const clone=x=>JSON.parse(JSON.stringify(x));
function needsReset(player,now=Date.now()){
  if(!player)return false;const info=player.swordInfo;
  return !Number.isInteger(info?.towerDay)||info.towerDay<day.key(now);
}
function prepare(player,now=Date.now()){
  if(!needsReset(player,now))return false;
  const info=player.swordInfo||={},today=day.key(now),legacy=!Number.isInteger(info.towerDay);
  const before={day:info.towerDay??null,curlayer:info.curlayer??0,dailyCount:info.dailyCount??0,skills:clone(info.skills||[]),slotlist:clone(info.slotlist||[]),skillCount:info.skillCount??0};
  info.maxlayer=Math.max(Number(info.maxlayer)||0,Number(info.curlayer)||0);
  info.curlayer=0;info.dailyCount=0;info.skills=[];info.slotlist=[];info.skillCount=0;info.towerDay=today;
  info.claimedMilestones=[];info.towerRevision=(Number(info.towerRevision)||0)+1;
  info.towerResetV1={version:VERSION,at:now,legacy,before};
  return true;
}
function snapshot(player,now=Date.now()){
  const i=player?.swordInfo||{};return{result:0,version:VERSION,serverTime:now,dayKey:day.key(now),nextResetAt:day.end(now),
    maxlayer:Number(i.maxlayer)||0,curlayer:Number(i.curlayer)||0,dailyCount:Number(i.dailyCount)||0,skillCount:Number(i.skillCount)||0,
    skills:clone(i.skills||[]),slotlist:clone(i.slotlist||[]),autoSelect:Number(i.autoSelect)||0,autoPriority:clone(i.autoPriority||[]),
    towerRevision:Number(i.towerRevision)||0,offerId:require('./TowerProgressService').offerId(i),claimedMilestones:clone(i.claimedMilestones||[])};
}
async function recoverLoaded(player,collection,now=Date.now()){
  if(!needsReset(player,now))return player;
  const present=Object.hasOwn(player,'swordInfo'),before=present?clone(player.swordInfo):null,draft={swordInfo:clone(before||{})};prepare(draft,now);
  const result=await collection.updateOne({userId:player.userId,swordInfo:present?{$eq:before}:{$exists:false}},{$set:{swordInfo:draft.swordInfo,updatedAt:new Date()}},{maxTimeMS:10000});
  if(!result.matchedCount)throw Error('TOWER_DAY_CAS_RETRY');
  player.swordInfo=draft.swordInfo;return player;
}
async function synchronize(session,now=Date.now()){
  if(!session?.player||!needsReset(session.player,now))return [];
  return require('./PlayerMutationService').run(session.userId,async()=>{
    if(!session.player||!needsReset(session.player,now))return [];
    const players=require('./PlayerService');await players.drainPendingSaves(session.userId);
    const fresh=await players.loadPlayer(session.userId);
    if(!fresh||String(fresh.playerId)!==String(session.player.playerId))throw Error('TOWER_PLAYER_CHANGED');
    if(needsReset(fresh,now))throw Error('TOWER_DAY_NOT_SYNCHRONIZED');
    Object.assign(session.player,fresh);
    return[{tag:3700,msgUid:0,data:snapshot(fresh,now)}];
  });
}
async function withReset(params,session,msgUid,handler){const packets=await synchronize(session),result=await handler(params,session,msgUid);return packets.length?[...packets,...(Array.isArray(result)?result:[result])]:result;}
async function handleSnapshot(_params,session,msgUid){return require('./TowerProgressService').get().snapshot(session,msgUid);}
module.exports={VERSION,needsReset,prepare,snapshot,recoverLoaded,synchronize,withReset,handleSnapshot};
