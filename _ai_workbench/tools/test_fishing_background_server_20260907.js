'use strict';
// Real handler integration with in-memory persistence; outbound sockets prohibited.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),net=require('net'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'linhhoasu/lhs/newServer'),OUT=path.join(root,'_ai_workbench/temp/fishing_background_audit_20260907');
process.env.CONFIG_BIN_PATH=path.join(root,'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');process.env.LOG_DIR='';process.env.NODE_ENV='test';
net.Socket.prototype.connect=()=>{throw Error('AUDIT_NETWORK_DENIED');};let now=Date.parse('2026-09-07T10:00:00+07:00'),stored;Date.now=()=>now;
const clone=v=>JSON.parse(JSON.stringify(v));
function stub(rel,value){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports:value};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/net/Session',{renew:async()=>{}});
stub('src/services/PlayerService',{drainPendingSaves:async()=>{},savePlayer:async(id,p)=>{stored=clone(p);return p;},savePlayerDeferred:async(id,p)=>{stored=clone(p);return p;},wasRecentlySaved:()=>false});
stub('src/db/models/Player',{find:()=>({sort(){return this;},limit(){return this;},select(){return this;},lean:async()=>[]})});
const cfg=require(path.join(app,'src/services/ConfigService')),fish=require(path.join(app,'src/handlers/fish')),basic=require(path.join(app,'src/handlers/basic')),schedule=require(path.join(app,'src/services/FishingEventSchedule'));
const{FishingRoomService}=require(path.join(app,'src/services/FishingRoomService'));
crypto.randomInt=max=>Math.floor(max/2);
function base(sid=1001){now=Date.parse('2026-09-07T10:00:00+07:00');const p={userId:'background-audit',playerId:'background-audit',serverId:sid,level:100,exp:0,name:'Fixture',items:{65:100},currencies:{gold:0,diamond:0,silver:0},roleInfo:{kungfuId:4,subJob:0},taskInfo:{},other_attr_info:{},fishInfo:{scene:101,level:28},systemUnlockInfo:{unlockedSystem:[215,221,223]},rechargeInfo:{monthCards:{}},activityInfo:{datas:[]}};fish.ensureFishInfo(p);schedule.sync(p);return {userId:p.userId,player:p,_fishRooms:new FishingRoomService(),_fishConnected:true,_mapId:10001};}
function ack(r,tag){return(Array.isArray(r)?r:[r]).find(p=>p&&p.tag===tag&&p.data?.result!=null)?.data;}
const tests=[],details=[];async function test(name,fn){await fn();tests.push(name);}
(async()=>{
for(const sid of[1001,1002])await test('server '+sid+' normalmap transition preserves fishing scene and accepts subsequent cast',async()=>{
 const s=base(sid);await fish.handleFishEnterMap({id:101},s,1);const room=s._fishRoomId;assert(room>0);assert.equal(s._fishRoomMapId,101);
 const map=Number(Object.keys(cfg.get('MapConfig')).find(id=>Number(id)>=10001&&Number(id)<20000));basic.handleEnterMap({mapId:map},s,2);
 assert.equal(s._mapId,map);assert.equal(s._fishRoomId,room);assert.equal(s._fishRoomMapId,101);assert.equal(s.player.fishInfo.scene,101);
 const before=s.player.items[65],w=schedule.active(s.player,6006);let previousUid=0;
 for(let i=0;i<3;i++){
  const params={count:1,requestId:'background_cast_'+sid+'_'+i,expectedRevision:s.player.fishInfo.balanceRevision||0};const r=await fish.handleFishCatch(params,s,10+i);const data=ack(r,4000);assert.equal(data.result,0);assert.equal(s.player.items[65],before-i-1);
  const rows=s.player.fishInfo.fishResult.fishInfos;assert(rows.length);assert(rows[0].uid>previousUid);previousUid=rows[0].uid;
  assert.equal(s.player.fishInfo.eventStats[w.key].casts,i+1);
  const sell=await fish.handleFishDealMulti({dealMap:{2:rows.map(f=>f.uid)},integrityVersion:1,auto:1},s,20+i);assert.equal(ack(sell,4008).result,0);assert.equal(s.player.fishInfo.fishResult.fishInfos.length,0);now+=10000;
 }
 assert.equal(stored.fishInfo.scene,101);details.push({serverId:sid,normalMap:map,fishingScene:s.player.fishInfo.scene,casts:3,energyUsed:before-s.player.items[65],lastFishUid:previousUid,roomPreserved:true});
});
await test('heartbeat outside map recovers/settles but does not cast new fish',async()=>{const s=base();basic.handleEnterMap({mapId:10001},s,1);const before=clone(s.player.fishInfo),energy=s.player.items[65];for(let i=0;i<5;i++){now+=16000;await basic.handleHeartbeat({},s,11+i);}assert.equal(s.player.items[65],energy);assert.equal(s.player.fishInfo.fishUidSeq,before.fishUidSeq);assert.deepEqual(s.player.fishInfo.fishResult,before.fishResult);const w=schedule.active(s.player,6006);assert.equal(s.player.fishInfo.eventStats[w.key].casts,0);});
await test('explicit fish leave4051 releases room and sets normal fishing scene1',async()=>{const s=base();await fish.handleFishEnterMap({id:101},s,1);assert(s._fishRooms.members.has(s));const r=await fish.handleFishLeaveMap({},s,2);assert.equal(ack(r,4051).result,0);assert.equal(s.player.fishInfo.scene,1);assert.equal(s._fishRoomMapId,0);assert(!s._fishRooms.members.has(s));});
const result={result:'PASS',tests:tests.length,names:tests,details,productionWrites:0,readOnlyAudit:true,limits:'In-memory session/save fixture; not live account telemetry or actual monster combat.'};fs.writeFileSync(path.join(OUT,'server-tests.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
