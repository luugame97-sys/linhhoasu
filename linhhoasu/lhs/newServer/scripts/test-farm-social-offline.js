'use strict';
// Reuse the existing memory persistence harness; execute in the same realm so
// RNG fault injection and strict equality exercise the actual imported code.
const fs=require('node:fs'),path=require('node:path');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..');
process.env.FEATURE_APP=app;
const old=fs.readFileSync(process.env.FARM_BASE_TEST||path.join(__dirname,'test-farm-alchemy-fix.js'),'utf8');
const setup=old.slice(0,old.indexOf("test('normal seeds"));
const tests=String.raw`
const guildDocs=new Map();
let guildFailure=false;
stub('db/models/Guild.js',{
  findOne(q){return {lean:async()=>clone(guildDocs.get(q.guildId)||null)};},
  async updateOne(q,u){
    if(guildFailure)throw Error('GUILD_WRITE_FAILURE');
    const g=guildDocs.get(q.guildId);if(!g)return {acknowledged:true,matchedCount:0};
    const uid=q['assistRecords.uid'],at=g.assistRecords.findIndex(r=>r.uid===(uid?.$ne||uid));
    if(u.$set){if(at<0)return {acknowledged:true,matchedCount:0};g.assistRecords[at]=clone(u.$set['assistRecords.$']);}
    if(u.$push){if(at>=0)return {acknowledged:true,matchedCount:0};g.assistRecords.push(...clone(u.$push.assistRecords.$each));}
    return {acknowledged:true,matchedCount:1};
  }
});
const social=requireApp('services/FarmSocialService'),offline=requireApp('services/FarmOfflineService');
const pol=requireApp('services/FarmPolicyService').policy;
ws.pushToUser=(id,tag,data)=>pushes.push({id,tag,data:clone(data)});
function party(){const owner=fresh(),helper=fresh(),robber=fresh();const gid=++nextId+100;
  const members=[owner,helper,robber].map(s=>{s.player.serverId=1001;s.player.guildInfo={guildId:gid};db.set(s.userId,clone(s.player));return {userId:s.userId,playerId:s.player.playerId};});
  guildDocs.set(gid,{guildId:gid,members,assistRecords:[]});return {owner,helper,robber,gid};}
async function request(o,type=2,robber){
  if(type===2)o.player.farmInfo.buildUpgrade[1]=Date.now()+300000;
  db.set(o.userId,clone(o.player));
  const r=type===2?await farm.handleBuildAssist({index:1},o,11):await farm.handleFightAssist({index:0,dbid:robber.player.playerId},o,11);
  const a=ack(r,type===2?2414:2415);assert.equal(a.result,0,JSON.stringify(a));return a.record;
}
const claim=(o,h,row)=>social.claim({playerId:o.player.playerId,type:row.assistData.type,index:row.assistData.type===2?1:0,uid:row.uid},h,12);
function reload(s){s.player=clone(db.get(s.userId));}
function offPlayer(){const s=fresh();s.player.systemUnlockInfo={unlockedSystem:[303]};s.player.rechargeInfo.monthCards[11000012]=Date.now()+86400000;assert.equal(offline.configure(s.player,{enabled:true,harvest:true,cook:true,seed:29}).result,0);return s;}
test('social create rejects nonmember and invalid state',async()=>{
 const {owner,gid}=party();assert.notEqual(ack(await farm.handleBuildAssist({index:999},owner,1),2414).result,0);
 guildDocs.get(gid).members=[];assert.notEqual(ack(await farm.handleBuildAssist({index:1},owner,2),2414).result,0);
});
test('one request per upgrade and duplicate helpers only reduce once',async()=>{
 const {owner,helper}=party(),r=await request(owner),again=await farm.handleBuildAssist({index:1},owner,3);
 assert.equal(ack(again,2414).record.uid,r.uid);const before=owner.player.farmInfo.buildUpgrade[1];
 const results=await Promise.all(Array.from({length:8},()=>claim(owner,helper,r)));
 assert.ok(results.every(x=>ack(x,1519).result===1));assert.equal(before-owner.player.farmInfo.buildUpgrade[1],1500);
 assert.equal(helper.player.farmInfo.socialQuota.uids.length,1);
});
test('membership stale uid self and cross-server helpers rejected',async()=>{
 const {owner,helper,gid}=party(),r=await request(owner);const before=owner.player.farmInfo.buildUpgrade[1];
 assert.equal(ack(await claim(owner,owner,r),1519).result,0);
 assert.equal(ack(await claim(owner,helper,{...r,uid:'old'}),1519).result,0);
 helper.player.serverId=1002;assert.equal(ack(await claim(owner,helper,r),1519).result,0);helper.player.serverId=1001;
 guildDocs.get(gid).members=guildDocs.get(gid).members.filter(m=>m.userId!==helper.userId);
 assert.equal(ack(await claim(owner,helper,r),1519).result,0);assert.equal(owner.player.farmInfo.buildUpgrade[1],before);
});
test('three helpers per cycle enforced under concurrency',async()=>{
 const {owner,gid}=party(),r=await request(owner),before=owner.player.farmInfo.buildUpgrade[1];const hs=[];
 for(let i=0;i<4;i++){const h=fresh();h.player.serverId=1001;h.player.guildInfo={guildId:gid};guildDocs.get(gid).members.push({userId:h.userId,playerId:h.player.playerId});hs.push(h);}
 const result=await Promise.all(hs.map(h=>claim(owner,h,r)));assert.equal(result.filter(x=>ack(x,1519).result===1).length,3);assert.equal(before-owner.player.farmInfo.buildUpgrade[1],4500);
});
test('ten helper attempts per day persist after reload',async()=>{
 const {owner,helper}=party();for(let i=0;i<11;i++){owner.player.farmInfo.socialRequests={};const r=await request(owner);const a=ack(await claim(owner,helper,r),1519);assert.equal(a.result,i<10?1:0);}
 reload(helper);assert.equal(helper.player.farmInfo.socialQuota.uids.length,10);
});
test('owner commit then timeout retries without second reduction',async()=>{
 const {owner,helper}=party(),r=await request(owner),before=owner.player.farmInfo.buildUpgrade[1];fail={id:owner.userId,mode:'commit-throw'};
 await assert.rejects(claim(owner,helper,r),/SAVE_UNKNOWN/);reload(owner);reload(helper);
 assert.equal(ack(await claim(owner,helper,r),1519).result,1);assert.equal(before-owner.player.farmInfo.buildUpgrade[1],1500);
});
test('owner write rejection consumes no effect, retry uses same reservation',async()=>{
 const {owner,helper}=party(),r=await request(owner),before=owner.player.farmInfo.buildUpgrade[1];fail={id:owner.userId,mode:'throw'};
 await assert.rejects(claim(owner,helper,r),/SAVE_FAILURE/);reload(owner);reload(helper);assert.equal(owner.player.farmInfo.buildUpgrade[1],before);
 await claim(owner,helper,r);assert.equal(helper.player.farmInfo.socialQuota.uids.length,1);assert.equal(before-owner.player.farmInfo.buildUpgrade[1],1500);
});
test('guild mirror failure cannot double apply completed owner action',async()=>{
 const {owner,helper}=party(),r=await request(owner),before=owner.player.farmInfo.buildUpgrade[1];guildFailure=true;
 try{await assert.rejects(claim(owner,helper,r),/GUILD_WRITE_FAILURE/);}finally{guildFailure=false;}
 await claim(owner,helper,r);assert.equal(before-owner.player.farmInfo.buildUpgrade[1],1500);
 assert.ok((await social.guildRecords(owner.player.guildInfo.guildId)).some(row=>row.uid===r.uid));
});
for(const win of [false,true])test('fight actual lease '+win+' with replay',async()=>{
 const {owner,helper,robber}=party();mature(owner);await farm.handlePlantLevelOrRob({dbid:owner.player.playerId,index:0,count:1},robber,1);
 const r=await request(owner,3,robber),battle=requireApp('services/BattleService'),orig=battle.simulateBattle;let calls=0;battle.simulateBattle=()=>{calls++;return {win};};
 try{assert.equal(ack(await claim(owner,robber,r),1519).result,0);await claim(owner,helper,r);await claim(owner,helper,r);
 assert.equal(calls,1);assert.equal(!!block(owner).robber,!win);assert.equal(robber.player.farmInfo.roblist.length,win?0:1);
 }finally{battle.simulateBattle=orig;}
});
test('replayed fight must not remove a newer mouse dispatch from client',async()=>{
 const {owner,helper,robber}=party();mature(owner);await farm.handlePlantLevelOrRob({dbid:owner.player.playerId,index:0,count:1},robber,1);
 const r=await request(owner,3,robber),battle=requireApp('services/BattleService'),old=battle.simulateBattle;battle.simulateBattle=()=>({win:true});
 try {await claim(owner,helper,r);await farm.handlePlantLevelOrRob({dbid:owner.player.playerId,index:0,count:1},robber,2);
 const n=pushes.length;await claim(owner,helper,r);assert.equal(pushes.slice(n).filter(x=>x.packet?.tag===2406).length,0);assert.equal(robber.player.farmInfo.roblist.length,1);
 }finally{battle.simulateBattle=old;}
});
test('expired card may disable offline without losing cached rewards',()=>{
 const s=offPlayer();s.player.rechargeInfo.monthCards[11000012]=1;s.player.farmInfo.cacheOffline=[{id:4,count:10}];
 assert.equal(offline.configure(s.player,{enabled:false,harvest:true,cook:true,seed:29}).result,0);
 assert.equal(s.player.farmInfo.offlineManager.enabled,false);assert.equal(s.player.farmInfo.cacheOffline[0].count,10);
});
test('offline opt-in and time scope required; disabled old accounts untouched',()=>{
 const s=fresh(),before=JSON.stringify(s.player);assert.equal(offline.settle(s.player),false);assert.equal(JSON.stringify(s.player),before);
 assert.equal(offline.configure(s.player,{enabled:true,harvest:true,cook:true,seed:29}).result,2);
});
test('offline crop seed cost reward cache survives replay and claim',async()=>{
 const s=offPlayer(),p=s.player,from=Date.now()-3*3600000;p.farmInfo.offlineManager.checkpoint=from;
 p.farmInfo.blockInfo=p.farmInfo.blockInfo.filter(b=>b.index===0);Object.assign(block(s),{rewardId:38,curCount:40,seedId:29,finishTime:from+1000,robber:null});
 const seed=p.items[29],before=p.items[34];offline.settle(p);assert.ok(p.farmInfo.cacheOffline.some(r=>r.id===34));assert.ok(p.items[29]<seed);assert.equal(p.items[34],before);
 const cache=JSON.stringify(p.farmInfo.cacheOffline);offline.settle(p);assert.equal(JSON.stringify(p.farmInfo.cacheOffline),cache);
 db.set(s.userId,clone(p));await farm.handleOfflineReward({},s,4);assert.ok(s.player.items[34]>before);const after=s.player.items[34];await farm.handleOfflineReward({},s,5);assert.equal(s.player.items[34],after);
});
test('disconnect uses close time and reconnect does not settle earlier online time',()=>{
 const s=offPlayer(),p=s.player,now=Date.now(),from=now-3*3600000;
 p.farmInfo.offlineManager.checkpoint=from;p.farmInfo.offlineManager.closedAt=0;
 offline.close(p,now);offline.settle(p,now+2000);
 assert.equal(p.farmInfo.offlineManager.lastSettlement.from,now);
 assert.equal(p.farmInfo.offlineManager.lastSettlement.to,now+2000);
});
test('offline eight hours only no currency spend or auto steal',()=>{
 const s=offPlayer(),p=s.player,from=Date.now()-24*3600000;p.farmInfo.offlineManager.checkpoint=from;
 const cash=clone(p.currencies),corn=p.items[101],mice=p.items[104];offline.settle(p);
 assert.equal(p.farmInfo.offlineManager.lastSettlement.to,from+8*3600000);assert.deepEqual(p.currencies,cash);assert.equal(p.items[101],corn);assert.equal(p.items[104],mice);
});
test('offline expiry, online takeover, no seeds, midnight',()=>{
 const s=offPlayer(),p=s.player,now=Date.parse('2026-09-10T01:00:00Z'),from=Date.parse('2026-09-09T16:00:00Z');p.farmInfo.offlineManager.checkpoint=from;p.rechargeInfo.monthCards[11000012]=from+2*3600000;
 p.items[29]=0;offline.settle(p,now);assert.equal(p.farmInfo.offlineManager.lastSettlement.to,from+2*3600000);assert.equal(p.items[29],0);assert.equal(p.farmInfo.cookDayKey,20260910);
 const cache=JSON.stringify(p.farmInfo.cacheOffline);p.farmInfo.offlineManager.checkpoint=from;offline.settle(p,now,true);assert.equal(JSON.stringify(p.farmInfo.cacheOffline),cache);
});
test('offline settings via real RPC persist and reject invalid seed',async()=>{
 const s=offPlayer();assert.equal(ack(await farm.handleOfflineSettings({enabled:true,harvest:true,cook:false,seed:999},s,1),2429).result,1);
 assert.equal(ack(await farm.handleOfflineSettings({enabled:true,harvest:true,cook:false,seed:100},s,2),2429).result,0);reload(s);assert.equal(s.player.farmInfo.offlineManager.seed,100);
});
async function main(){const results=[];for(const t of tests){try{await t.fn();results.push({name:t.name,pass:true});}catch(e){results.push({name:t.name,pass:false,error:e.stack});}finally{fail=null;guildFailure=false;}}
 const report={result:results.every(t=>t.pass)&&!networkAttempts?'PASS':'FAIL',count:results.length,networkAttempts,productionWrites:0,results};
 if(process.env.FEATURE_REPORT)fs.writeFileSync(process.env.FEATURE_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:results.filter(t=>!t.pass)},null,2));if(report.result!=='PASS')process.exitCode=1;}
main();`;
new Function('require','__dirname',setup+tests.replace('=','='))(require,path.join(app,'scripts'));
