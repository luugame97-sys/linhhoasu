'use strict';
const config=require('./ConfigService');
const rules=require('../config/fishingGameplayBalance.json');
const rotation=require('./EventRotationRegistry');
const DAY=86400000;
function allIds(){return new Set([6006,6056,...Object.keys(config.get('Activity33Config')||{}).map(Number)]);}
function current(now=Date.now()){
 const schedule=rules.schedule,start=Date.parse(schedule.anchor),end=start+schedule.durationDays*DAY,periodMs=schedule.periodDays*DAY;
 const repeatForever=rotation.isRepeating('fishing');
 if(!schedule.enabled||!Number.isFinite(start)||now<start||(!repeatForever&&now>=end))return [];
 const legacyPeriods=Math.ceil(schedule.durationDays/schedule.periodDays);
 const extraPeriod=repeatForever&&now>=end?Math.floor((now-end)/periodMs):0;
 const period=repeatForever&&now>=end?legacyPeriods+extraPeriod:Math.floor((now-start)/periodMs);
 const from=repeatForever&&now>=end?end+extraPeriod*periodMs:start+period*periodMs;
 const to=repeatForever&&now>=end?from+periodMs:Math.min(end,from+periodMs);
 return [schedule.rotation[period%schedule.rotation.length],schedule.contestId].map(id=>({id,startTime:from,endTime:to,key:`F${id}_${from}`,period}));
}
function enabledFor(player,window){
 if((player.activityInfo?.disabledEntryIds||[]).some(id=>Number(id)===window.id))return false;
 if(window.id===6006)return Number(player.level)>=55;
 return (player.systemUnlockInfo?.unlockedSystem||[]).includes(215);
}
function sync(player,now=Date.now()){
 player.activityInfo ||= {};player.activityInfo.datas ||= [];player.fishInfo ||= {};player.fishInfo.eventStats ||= {};
 const managed=allIds(),active=current(now).filter(w=>enabledFor(player,w));
 const other=player.activityInfo.datas.filter(row=>!managed.has(row.id));
 // Do not hide an already-active non-fishing type6 contest. It owns its native lane.
 const competing=other.some(row=>config.get('ActivityConfig')?.[row.id]?.activityType===6&&row.startTime<=now&&row.endTime>now);
 const result=[];
 for(const window of active){
  if(window.id===6006&&competing)continue;
  let stats=player.fishInfo.eventStats[window.key];
  if(!stats)stats=player.fishInfo.eventStats[window.key]={id:window.id,start:window.startTime,end:window.endTime,score:0,casts:0,round:0,taskClaimed:[],games:{1:0,2:0,3:0},gameClaims:0,day:0,praises:0,throws:0};
   result.push({id:window.id,module:0,index:0,param:0,status:0,startTime:window.startTime,endTime:window.endTime,score:window.id===6006?stats.round:stats.score,record:window.id===6006?stats.casts:(stats.day===Math.floor((now+8*3600000)/DAY)?stats.praises:0),
   records:{...stats.games},recordList:stats.fightDamage||[],buyRecords:window.id===6006?require('./FishingEventShopService').buyRecords(player,window,now):(stats.buyRecords||{}),extra:window.id===6006?{}:stats.bottle?{...stats.bottle,instanceKey:window.key,customBalance:rules.version}:null});
 }
 const previous=JSON.stringify(player.activityInfo.datas);player.activityInfo.datas=[...other,...result];
 return {changed:JSON.stringify(player.activityInfo.datas)!==previous,rows:result};
}
function active(player,id,now=Date.now()){
 const w=current(now).find(w=>w.id===id);if(!w||!enabledFor(player,w))return null;
 const competing=id===6006&&(player.activityInfo?.datas||[]).some(r=>r.id!==6006&&config.get('ActivityConfig')?.[r.id]?.activityType===6&&r.startTime<=now&&r.endTime>now);
 return competing?null:w;
}
function taskRows(player){
 // Public payloads may be built before fishing state is initialized.
 const w=active(player,6006);if(!w)return [];const s=player.fishInfo?.eventStats?.[w.key];if(!s)return [];
 return config.get('Activity6Config')[6006].taskIds.map(id=>{const cfg=config.get('TaskConfig')[id],progress=Math.max(0,s.casts-s.round*3000);return {id,type:6006|(1<<30),progress:Math.min(cfg.taskValue1,progress),status:s.round>=4||s.taskClaimed.includes(id)?30:progress>=cfg.taskValue1?20:10};});
}
module.exports={DAY,current,allIds,sync,active,taskRows};
