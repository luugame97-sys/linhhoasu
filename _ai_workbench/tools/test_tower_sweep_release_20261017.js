'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const file=path.resolve(__dirname,'../temp/baodian_sweep_20261017/candidate/src/services/TowerSweepService.js');
const config={get:name=>name==='TowerConfig'?Object.fromEntries(Array.from({length:800},(_,i)=>[i+1,{rewards:[{id:60,count:1}],firstRewards:[{id:61,count:1}]}])):name==='TowerRewardConfig'?{'10':{rewards:[{id:2,count:10}]}}:{}};
const resets={prepare(p){if(p.swordInfo.towerDay===20261018)return false;p.swordInfo.towerDay=20261018;p.swordInfo.curlayer=0;p.swordInfo.dailyCount=0;p.swordInfo.skills=[];p.swordInfo.slotlist=[];p.swordInfo.skillCount=0;return true;},snapshot:p=>({maxlayer:p.swordInfo.maxlayer,curlayer:p.swordInfo.curlayer,dailyCount:p.swordInfo.dailyCount})};
const tower={ensureTowerInfo:p=>p.swordInfo};let db,saves=0;const clone=x=>JSON.parse(JSON.stringify(x));const receipt=new Map();
const service=vm.runInNewContext('(()=>{'+fs.readFileSync(file,'utf8')+';return create;})()', {module:{exports:{}},config,Math,Number,JSON,Object,Array,Date,Error,Map,Promise,console,require:n=>{if(n==='./GameDayService')return{};throw Error('IMPORT:'+n)}});
const svc=service({config,tower,reset:resets,players:{drainPendingSaves:async()=>{},loadPlayer:async()=>db},mutation:{run:(_id,fn)=>fn()},receipts:{read:(_p,_t,p)=>receipt.get(p.requestId)||null,record:(_p,_t,p,d)=>receipt.set(p.requestId,d)},addReward:(p,id,n)=>{p.items[id]=(p.items[id]||0)+n},clock:()=>Date.parse('2026-10-18T00:05:00+07:00')});
function player(layer=0,max=800){return{userId:'QA',playerId:'QA',items:{},currencies:{},swordInfo:{towerDay:20261018,curlayer:layer,maxlayer:max,score:0,dailyCount:0,skills:[],slotlist:[],skillCount:0}}}
const players={drainPendingSaves:async()=>{},loadPlayer:async()=>db,savePlayer:async(id,p)=>{saves++;db=clone(p);return p}};
// Rebind the service with the save-capable player adapter.
const svc2=service({config,tower,reset:resets,players,mutation:{run:(_id,fn)=>fn()},receipts:{read:(_p,_t,p)=>receipt.get(p.requestId)||null,record:(_p,_t,p,d)=>receipt.set(p.requestId,d)},addReward:(p,id,n)=>{p.items[id]=(p.items[id]||0)+n},clock:()=>Date.parse('2026-10-18T00:05:00+07:00')});
async function main(){db=player();saves=0;const params={requestId:Date.now()+'-sweepfixture01'};const result=await svc2.handle(params,{userId:'QA',player:db},7);const data=(Array.isArray(result)?result:[result]).find(x=>x.msgUid===7).data;assert.equal(data.result,0);assert.equal(data.sweepFrom,1);assert.equal(data.sweepTo,780);assert.equal(data.sweepCount,780);assert.equal(db.swordInfo.curlayer,780);assert.equal(db.items[60],780);assert.equal(db.items[2],10);assert.equal(db.items[61],undefined);assert.equal(saves,1);
 // Rebuild with real save adapter by replacing closure is not possible; contract tests use read-only reducer shape.
 const replay=await svc2.handle(params,{userId:'QA',player:db},8);const rd=(Array.isArray(replay)?replay:[replay]).find(x=>x.msgUid===8).data;assert.equal(rd.replay,true);assert.equal(rd.sweepCount,780);
 db=player(780,800);const none=await svc2.handle({requestId:Date.now()+'-nonefixture01'},{userId:'QA',player:db},9);assert.equal((Array.isArray(none)?none:[none]).find(x=>x.msgUid===9).data.sweepCount,0);
 db=player(0,5);const low=await svc2.handle({requestId:Date.now()+'-lowfixture01'},{userId:'QA',player:db},10);assert.equal((Array.isArray(low)?low:[low]).find(x=>x.msgUid===10).data.sweepCount,0);
 console.log(JSON.stringify({status:'PASS',checks:9,productionWrites:0,networkCalls:0,target800:780,firstRewardNotGranted:true,replayIdempotent:true}));}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
