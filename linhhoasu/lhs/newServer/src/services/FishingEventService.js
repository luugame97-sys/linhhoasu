'use strict';
const crypto=require('crypto');
const config=require('./ConfigService'),integrity=require('./FishingIntegrityService'),schedule=require('./FishingEventSchedule'),game=require('./FishingGameplayService'),balance=require('./FishingBalanceService');
const empty=()=>({items:[],equips:[],fashion:[]});
const day=()=>Math.floor((Date.now()+8*3600000)/86400000);
function state(player,w){schedule.sync(player);return player.fishInfo.eventStats[w.key];}
function syncPackets(player){const rows=schedule.sync(player).rows;return [...rows.map(data=>({tag:1701,msgUid:0,data:{data}})),...schedule.taskRows(player).map(task=>({tag:1000,msgUid:0,data:{task}}))];}
function onCatch(player,count,result){
 for(const w of schedule.current().filter(w=>schedule.active(player,w.id))){
  const stats=state(player,w);stats.casts+=count;
  if(w.id===6006){stats.score+=count;continue;}
  const row=config.get('Activity33Config')[w.id];
  if(Number(player.fishInfo.scene)!==Number(row.sceneId))continue;
  if(row.type===1){for(let i=0;i<count;i++)if(game.chance(game.rules.events.ticketBps)){const type=1+game.draw(3);stats.games[type]=Math.min(game.rules.events.maxTicketsPerGame,stats.games[type]+1);}}
  if(row.type===3){for(let i=0;i<count;i++){const n=game.draw(10000);if(n<game.rules.events.bottleItemBps)result.items.push({id:214,count:1});else if(n<game.rules.events.bottleItemBps+game.rules.events.bottleNetBps)result.items.push({id:215,count:1});}}
  if(row.type===2){for(let i=0;i<count;i++)if(result.fishInfos.length<20&&game.chance(game.rules.events.kingBps)){
    const fish=game.pick(row.fish||[],r=>r.weight);const multi=game.range(game.rules.events.kingWeight);const cfg=config.get('FishConfig')[fish.id];
    result.fishInfos.push({id:fish.id,uid:player.fishInfo.fishUidSeq++,type:cfg.type,quality:cfg.quality,multi,attrs:[],skills:[],tempSkills:{},lock:0,dead:0});stats.score=Math.max(stats.score,multi*cfg.minKg);
  }}
 }
 require('./FishingEconomyService').markCatch(player,result);
 return [...syncPackets(player),balance.syncCounts(player,[2,119])];
}
async function rank(player,w){
 const Player=require('../db/models/Player'),field=`fishInfo.eventStats.${w.key}.score`;
 const rows=await Player.find({isBot:{$ne:true},managedBot:{$ne:true},serverId:Number(player.serverId),[field]:{$gt:0}}).sort({[field]:-1,playerId:1}).limit(100).select({playerId:1,name:1,serverId:1,serverName:1,level:1,roleInfo:1,fashionMap:1,fashionInfo:1,equipInfo:1,avatar:1,avatarFrame:1,title:1,power:1,fishInfo:1}).lean();
 const selfScore=Number(player.fishInfo.eventStats?.[w.key]?.score||0);
 const index=rows.findIndex(r=>r.playerId===player.playerId);
 let selfRank=index>=0?index+1:0;
 if(selfScore>0&&index<0)selfRank=1+await Player.countDocuments({isBot:{$ne:true},managedBot:{$ne:true},serverId:Number(player.serverId),$or:[{[field]:{$gt:selfScore}},{[field]:selfScore,playerId:{$lt:player.playerId}}]});
 const {buildFishMapPlayer}=require('../handlers/fish');
 const list=rows.map(p=>({...buildFishMapPlayer(p,p.fishInfo),score:Number(p.fishInfo.eventStats[w.key].score||0)}));
 return {rank:selfRank,score:selfScore,ranklist:list,toplist:list.slice(0,3)};
}
async function settle(player){
 // Ranking rewards are durable Mail settlements.  Never grant them through
 // the online heartbeat: a reconnect and the offline scheduler must not be
 // two independent payout paths.
 return [];
}
async function heartbeat(session){
 const player=session.player;if(!player||session._fishEventNextSync>Date.now())return [];session._fishEventNextSync=Date.now()+15000;
 const next=integrity.clone(player),changed=schedule.sync(next).changed,energyChanged=game.recoverEnergy(next);
 const currency=require('./FishingEconomyService').reconcile(next);
 for(const key of Object.keys(next.fishInfo.eventStats||{}))await flushBottleOutbox(next,{key});
 const rewards=await settle(next);if(!changed&&!energyChanged&&!currency.converted&&!rewards.length&&JSON.stringify(next.fishInfo?.eventStats)===JSON.stringify(player.fishInfo?.eventStats)&&JSON.stringify(next.fishInfo.eventCurrency)===JSON.stringify(player.fishInfo?.eventCurrency))return [];
 const granted=integrity.grant(next,rewards);session.player=next;await integrity.save(session);
 if(config.get('FishSceneConfig')?.[next.fishInfo.scene]?.isActivity&&!await integrity.canUseScene(next,next.fishInfo.scene)&&session._fishRooms){
  await require('../handlers/fish').handleFishChangeScene({id:1},session,0);
 }
 return [{tag:1700,msgUid:0,data:require('../handlers/activity').buildActivityPayload(next.activityInfo)},...syncPackets(next),...granted.packets,...(currency.converted?[balance.syncCounts(next,[2,119])]:[]),...(energyChanged?[balance.syncCounts(next,[65])]:[]),...(rewards.length?[{tag:1202,msgUid:0,data:require('../services/RewardSync').buildRewardItemSync(next,rewards)}]:[])];
}
function sameIdRows(player,id){return (player.activityInfo?.datas||[]).find(r=>r.id===id);}
async function operate(params,session,msgUid){
 const id=Number(params.id),module=Number(params.module),index=Number(params.index||0),w=schedule.active(session.player,id);
 const fail=reason=>({tag:1700,msgUid,data:{result:1,id,reason,rewardInfo:empty()}});
 if(!w)return fail('FISH_EVENT_NOT_ACTIVE');
 await flushBottleOutbox(session.player,w);
 if(!Number.isInteger(module)||!Number.isInteger(index))return fail('FISH_EVENT_REQUEST_INVALID');
 if(module===2||id===6006&&module===1){const result=await rank(session.player,w);return {tag:1700,msgUid,data:{result:0,id,fishRank:result}};}
 if(id!==6006&&module===0)return [...syncPackets(session.player),{tag:1700,msgUid,data:{result:0,id}}];
 const next=integrity.clone(session.player),s=state(next,w),info=next.fishInfo;
 const req=balance.request(info,params,'fishing-event',JSON.stringify([w.key,module,index,params.param||0,params.content||'']));
 if(req.error)return fail(req.error);
 if(req.receipt){await flushBottleOutbox(next,w);return [...syncPackets(next),balance.syncCounts(next,[214,215,216]),{tag:1700,msgUid,data:{...req.receipt.response,replayed:true,rewardInfo:empty()}}];}
 let rewards=[],packets=[];
 if(id===6006){
  if(module!==0)return fail('FISH_EVENT_MODULE_INVALID');
  const conf=config.get('Activity6Config')[id];if(s.round>=conf.turns)return fail('FISH_CONTEST_COMPLETE');
  if(!conf.taskIds.every(t=>s.taskClaimed.includes(t)))return fail('FISH_CONTEST_TASKS_REQUIRED');
  rewards=conf.rewards;s.round++;s.taskClaimed=[];
 }else{
  const row=config.get('Activity33Config')[id];
  if(module===1){
   if(row.type!==1||![1,2,3].includes(index)||s.games[index]<1)return fail('FISH_MINIGAME_TICKET_REQUIRED');
   let completed=true;
   if(index===3){
    // Custom authoritative hit outcome, not the caller's claimed cursor accuracy.
    const hit=game.draw(10000),damage=row.attackRate[hit<1000?0:hit<4000?1:2];
    s.fightDamage ||= [];s.fightDamage.push(damage);
    completed=s.fightDamage.reduce((n,v)=>n+v,0)>=10000;
    if(completed)s.fightDamage=[];
   }
   if(completed){s.games[index]--;s.gameClaims++;}
   const cfgs=Object.values(config.get('Activity33RewardConfig')?.[id]||{}).sort((a,b)=>a.count-b.count);
   if(!cfgs.length)return fail('FISH_EVENT_REWARD_MISSING');rewards=completed?cfgs[Math.min(s.gameClaims-1,cfgs.length-1)].rewards:[];
  }else if(row.type===3&&module>=10&&module<=15){
   const Bottle=require('../db/models/FishingBottle');if(s.day!==day()){s.day=day();s.praises=0;s.throws=0;}
   const content=String(params.content||'').trim();if([10,12].includes(module)&&(!content||Array.from(content).length>40))return fail('FISH_BOTTLE_CONTENT_INVALID');
   const token=crypto.createHash('sha256').update(session.userId+'|'+req.key).digest('hex');
   if(module===10){
    if(s.bottle||s.throws>=game.rules.events.bottleDailyThrows)return fail('FISH_BOTTLE_LIMIT');if(Number(next.items[214]||0)<1)return fail('FISH_BOTTLE_ITEM_REQUIRED');
    next.items[214]--;s.throws++;s.bottleOutbox ||= [];s.bottleOutbox.push({kind:'throw',requestKey:req.key,document:{_id:token,instance:w.key,owner:session.userId,name:next.name,content,expireAt:new Date(w.endTime)}});
   }else if(module===11){
    if(s.bottle)return fail('FISH_BOTTLE_PENDING');if(Number(next.items[215]||0)<1)return fail('FISH_BOTTLE_NET_REQUIRED');
    let found=await Bottle.findOne({instance:w.key,holder:session.userId,status:'held'}).lean();
    if(!found)found=await Bottle.findOneAndUpdate({instance:w.key,owner:{$ne:session.userId},status:'available',expireAt:{$gt:new Date()}},{$set:{holder:session.userId,requestKey:req.key,status:'held'}},{new:true,sort:{createdAt:1}}).lean();
    next.items[215]--;s.bottle=found?{bottleId:found._id,title:found.name,content:found.content,textId:0,score:found.praises.length,titles:found.replies.map(r=>r.name),contents:found.replies.map(r=>r.content),hit:0}:null;
    packets.push({tag:1781,msgUid:0,data:found?{type:1,bottle:s.bottle}:{type:4}});
    if(found)s.reservedBottle=found._id;
   }else{
    if(!s.bottle)return fail('FISH_BOTTLE_PENDING_REQUIRED');
    const found=await Bottle.findOne({_id:s.bottle.bottleId,holder:session.userId,status:'held',instance:w.key}).lean();if(!found)return fail('FISH_BOTTLE_EXPIRED');
    s.bottleOutbox ||= [];
    if(module===12){if(s.bottle.hit&2||found.replies.some(r=>r.userId===session.userId))return fail('FISH_BOTTLE_ALREADY_REPLIED');s.bottle.hit|=2;s.bottle.titles.push(next.name);s.bottle.contents.push(content);s.bottleOutbox.push({kind:'reply',bottleId:found._id,holder:session.userId,value:{userId:session.userId,name:next.name,content,requestKey:req.key}});}
    if(module===13){if(s.bottle.hit&1||found.praises.includes(session.userId))return fail('FISH_BOTTLE_ALREADY_PRAISED');if(s.praises>=config.get('Activity33BaseConfig').bottlePriseDailyMax)return fail('FISH_BOTTLE_DAILY_LIMIT');s.bottle.hit|=1;s.bottle.score++;s.praises++;s.score++;rewards=config.get('Activity33BottleConfig')[id].priseRewards;s.bottleOutbox.push({kind:'praise',bottleId:found._id,holder:session.userId});}
    if(module===14){const counts=config.get('Activity33BottleConfig')[id].bottleRewards;rewards=[{id:216,count:game.range(counts)}];s.bottle=null;s.bottleOutbox.push({kind:'return',bottleId:found._id,holder:session.userId});}
    if(module===15)return [{tag:1782,msgUid:0,data:s.bottle},{tag:1700,msgUid,data:{result:0,id,module}}];
   }
  }else return fail('FISH_EVENT_MODULE_INVALID');
 }
 const granted=integrity.grant(next,rewards),response=balance.record(info,req,{result:0,id,module,rewardInfo:granted.rewardInfo});
 session.player=next;
 try{await integrity.save(session);}catch(e){
  // Do not release an ambiguous committed reservation: fresh login/claim resumes it.
  throw e;
 }
 await flushBottleOutbox(next,w);
 const sync=require('./RewardSync').buildRewardItemSync(next,rewards);
 const costId=module===10?214:module===11?215:0;
 if(costId){sync.items.push({id:costId,count:-1});sync.changed.push({id:costId,count:Number(next.items[costId]||0)});}
 return [...syncPackets(next),...packets,...granted.packets,{tag:1202,msgUid:0,data:sync},{tag:1700,msgUid,data:response}];
}
async function flushBottleOutbox(player,w){
 const s=player.fishInfo.eventStats?.[w.key];if(!s?.bottleOutbox?.length)return;
 const Bottle=require('../db/models/FishingBottle');
 for(const op of s.bottleOutbox){
  if(op.kind==='throw')await Bottle.updateOne({_id:op.document._id},{$setOnInsert:op.document},{upsert:true});
  if(op.kind==='reply')await Bottle.updateOne({_id:op.bottleId,holder:op.holder},{$addToSet:{replies:op.value}});
  if(op.kind==='praise')await Bottle.updateOne({_id:op.bottleId,holder:op.holder},{$addToSet:{praises:op.holder}});
  if(op.kind==='return')await Bottle.updateOne({_id:op.bottleId,holder:op.holder},{$set:{status:'returned',holder:'',requestKey:''}});
 }
 // Durable operations are idempotent. Cleared outbox is saved with the next player transaction.
 s.bottleOutbox=[];
}
async function claimTasks(params,session,msgUid){
 const ids=Array.isArray(params.ids)?params.ids:[params.taskId||params.id];
 if(!ids.some(id=>Number(id)>=60601&&Number(id)<=60608))return null;
 const fail=reason=>({tag:1000,msgUid,data:{result:1,reason,ids:[],rewardInfo:empty()}});
 if(ids.some(id=>!Number.isInteger(id)||id<60601||id>60608)||new Set(ids).size!==ids.length)return fail('FISH_CONTEST_TASK_INVALID');
 const w=schedule.active(session.player,6006);if(!w)return fail('FISH_EVENT_NOT_ACTIVE');
 const next=integrity.clone(session.player),s=state(next,w),rewards=[];
 for(const id of ids){const c=config.get('TaskConfig')[id];if(s.taskClaimed.includes(id)||s.casts-s.round*3000<c.taskValue1||s.round>=4)return fail('FISH_CONTEST_TASK_NOT_READY');rewards.push(...c.reward);s.taskClaimed.push(id);}
 const granted=integrity.grant(next,rewards);session.player=next;await integrity.save(session);
 return [...syncPackets(next),...granted.packets,{tag:1202,msgUid:0,data:require('./RewardSync').buildRewardItemSync(next,rewards)},{tag:1000,msgUid,data:{result:0,type:6006|(1<<30),ids,rewardInfo:granted.rewardInfo}}];
}
module.exports={onCatch,heartbeat,operate,claimTasks,syncPackets,rank};
