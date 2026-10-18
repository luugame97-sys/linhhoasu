'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const TASK=path.resolve(__dirname,'../temp/baodian_reset_20261017'),CAND=TASK+'/candidate',day=require(TASK+'/baseline/src/services/GameDayService');
const clone=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));let checks=0;
function load(imports={}){const module={exports:{}};vm.runInNewContext(fs.readFileSync(CAND+'/src/services/TowerDailyResetService.js','utf8'),{module,require:n=>n==='./GameDayService'?day:imports[n],Date,Object,Number,Math,JSON,Error});return module.exports;}
const service=load(),midnight=Date.parse('2026-10-17T17:00:00Z');
function player(){return{userId:'QA_ONLY',playerId:'QA_ROLE',items:{60:10,61:2},currencies:{diamond:100},swordInfo:{towerDay:20261017,curlayer:800,maxlayer:800,dailyCount:800,score:3204000,skills:[1,2],slotlist:[{id:1,lv:2}],skillCount:1,autoSelect:1,autoPriority:[1,2,3,4,5],data:[{id:22506,uid:1,star:5,skills:[{id:106,quality:6,level:2}],passiveRecoveryV1:{added:4}}],equippedUid:1,unlockedSwords:[22506],nextUid:2}};}
function test(name,fn){fn();checks++;}
test('GMT7 boundary',()=>{assert.equal(day.key(midnight-1),20261017);assert.equal(day.key(midnight),20261018);assert.equal(day.end(midnight-1),midnight);});
for(const now of [midnight,midnight+1,midnight+86400000*30])test('daily rollover '+now,()=>{const p=player(),before=clone(p);assert(service.prepare(p,now));assert.equal(p.swordInfo.curlayer,0);assert.equal(p.swordInfo.maxlayer,800);assert.equal(p.swordInfo.dailyCount,0);assert.equal(p.swordInfo.skillCount,0);equal(p.swordInfo.skills,[]);equal(p.swordInfo.slotlist,[]);for(const k of ['score','data','equippedUid','unlockedSwords','nextUid','autoSelect','autoPriority'])equal(p.swordInfo[k],before.swordInfo[k]);equal(p.items,before.items);equal(p.currencies,before.currencies);const once=clone(p);assert(!service.prepare(p,now));equal(p,once);assert.equal(p.swordInfo.towerResetV1.before.curlayer,800);});
test('before midnight no change',()=>{const p=player(),old=clone(p);assert(!service.prepare(p,midnight-1));equal(p,old);});
test('clock backwards no reset',()=>{const p=player(),old=clone(p);assert(!service.prepare(p,midnight-86400000));equal(p,old);});
test('legacy one-time repair',()=>{const p=player();delete p.swordInfo.towerDay;assert(service.prepare(p,midnight-1));assert(p.swordInfo.towerResetV1.legacy);assert.equal(p.swordInfo.maxlayer,800);assert(!service.prepare(p,midnight-1));});
test('missing player safe',()=>assert(!service.needsReset(null,midnight)));
test('new role stamps day',()=>{const p={userId:'new'};assert(service.prepare(p,midnight));assert.equal(p.swordInfo.towerDay,20261018);assert.equal(p.swordInfo.curlayer,0);});
test('preserve high water if old max absent',()=>{const p=player();delete p.swordInfo.maxlayer;service.prepare(p,midnight);assert.equal(p.swordInfo.maxlayer,800);});
test('snapshot next reset valid',()=>{const p=player();service.prepare(p,midnight);const s=service.snapshot(p,midnight);assert.equal(s.dayKey,20261018);assert.equal(s.nextResetAt,midnight+86400000);assert.equal(s.maxlayer,800);});
// Exact installed tower ensure function baseline proves absence of rollover.
const beforeSrc=fs.readFileSync(TASK+'/baseline/src/handlers/tower.js','utf8'),start=beforeSrc.indexOf('function ensureTowerInfo('),end=beforeSrc.indexOf('\n// Tower fight',start);
const ensure=vm.runInNewContext('('+beforeSrc.slice(start,end).trim()+')',{toSafeInt:(v,f=0)=>Number.isFinite(Number(v))?Math.floor(Number(v)):f,normalizeTowerSlotlist:clone,normalizeTowerOptionalSkills:clone,normalizeTowerAutoPriority:clone,Math,Array});
test('baseline reproduces stale800',()=>{const p=player();ensure(p);assert.equal(p.swordInfo.curlayer,800);assert.equal(p.swordInfo.towerDay,20261017);});
let database=player(),updates=0;const collection={updateOne:async(filter,update)=>{updates++;if(JSON.stringify(filter.swordInfo.$eq)!==JSON.stringify(database.swordInfo))return{matchedCount:0};database.swordInfo=clone(update.$set.swordInfo);return{matchedCount:1};}};
async function asyncTests(){const p=player();await service.recoverLoaded(p,collection,midnight);assert.equal(p.swordInfo.curlayer,0);await service.recoverLoaded(p,collection,midnight);assert.equal(updates,1);checks++;
 const stale=player();await assert.rejects(service.recoverLoaded(stale,collection,midnight),/CAS/);assert.equal(stale.swordInfo.curlayer,800);checks++;
 let seq=Promise.resolve();const mutation={run:(_id,fn)=>{const next=seq.then(fn);seq=next.catch(()=>{});return next;}},svc=load({'./PlayerMutationService':mutation,'./PlayerService':{drainPendingSaves:async()=>{},loadPlayer:async()=>clone(database)}}),session={userId:database.userId,player:player()};
 // Use today's date for the real runtime wrapper, without faking the global clock.
 database=player();database.swordInfo.towerDay=20000101;service.prepare(database,Date.now());session.player.swordInfo.towerDay=20000101;const r=await svc.synchronize(session);assert.equal(r[0].tag,3700);assert.equal(session.player.swordInfo.curlayer,0);assert.equal(session.player.swordInfo.maxlayer,800);checks++;
 assert.equal((await svc.synchronize(session)).length,0);checks++;
 const snap=await svc.handleSnapshot({},session,9);assert.equal(snap.at(-1).tag,3704);assert.equal(snap.at(-1).msgUid,9);checks++;
}
function clientTests(){const callbacks=[],events=[],m={initData(r){this.towerInfo=r;},Rpc(tag,data,callback){callbacks.push({tag,callback});}},root={W:{ClimbingTowerModel:m,ActorModel:{actorID:'QA'}},UserInfo:{ServerID:1010,UserID:'QA'},setTimeout:()=>1,clearTimeout(){},MessageCenter:{ins:()=>({dispatch:(...args)=>events.push(args)})},egret:{getDefinitionByName:()=>null}};
 vm.runInNewContext(fs.readFileSync(CAND+'/web/js/lhs-tower-daily-v1.js','utf8'),{window:root,Date,Number,Math});assert.equal(callbacks[0].tag,3704);checks++;
 const snapshot=service.snapshot({swordInfo:{curlayer:0,maxlayer:800}});callbacks[0].callback(snapshot);assert.equal(m.towerInfo.curlayer,0);assert.equal(m.towerInfo.maxlayer,800);assert(events.length);checks++;
 assert.equal(root.LhsTowerDaily.dayKey(midnight-1),20261017);assert.equal(root.LhsTowerDaily.dayKey(midnight),20261018);checks++;
 const raid=fs.readFileSync(CAND+'/src/handlers/raid.js','utf8');assert(raid.includes('floor !== towerInfo.curlayer + 1'));assert(raid.includes('withReset(params, session, msgUid, handleTowerStartFightUnlocked)'));checks++;
 const index=fs.readFileSync(CAND+'/web/index.html','utf8');assert(index.includes('20261017_mount_star_progress_v1'));assert(index.includes('20261017_number_kmbt_v1'));checks++;
}
(async()=>{await asyncTests();clientTests();const report={status:'PASS',checks,productionWrites:0,networkCalls:0,baselineReproduced:true,resetTimezone:'GMT+7 00:00',preserved:'mounts, high-water maxlayer, auto preferences, currencies, first-clear ownership'};fs.writeFileSync(TASK+'/tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
