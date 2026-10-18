'use strict';
const schedule=require('/linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json');
const cross=require('/linhhoasu/lhs/newServer/src/services/CrossServerEventService');
const sched=require('/linhhoasu/lhs/newServer/src/services/CrossEventScheduleService');
const serverConfig=require('/linhhoasu/lhs/newServer/src/services/ServerConfigService');
const now=Date.now();
(async()=>{
 const out={at:new Date(now).toISOString(),schedule,cycles:{},allowed:cross.getServerIds(),events:{},rosters:{}};
 for(const event of cross.EVENTS){const cycle=cross.cycleFor(event,now);out.cycles[event]=cycle;out.events[event]={};for(const sid of [1001,1002,1003,1004,1005,1006,1007]){let server=null;try{server=await serverConfig.findServerConfig(sid)}catch(e){server={error:e.message}};out.events[event][sid]=sched.describe(event,{level:999,serverId:sid},server,now,sid);}}
 for(const event of cross.EVENTS){const cycle=out.cycles[event];if(!cycle){out.rosters[event]={cycle:null,count:0,serverCounts:{}};continue;}const rows=await cross.top(event,cycle,10000);const counts={};rows.forEach(r=>{const sid=String(r.serverId);counts[sid]=(counts[sid]||0)+1});out.rosters[event]={cycle,count:rows.length,serverCounts:counts,sample:rows.slice(0,5).map(r=>({serverId:r.serverId,playerId:r.playerId,name:r.name,score:r.score}))};}
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
