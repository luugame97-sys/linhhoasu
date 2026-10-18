'use strict';
// Production source in a VM; every DB/write/network boundary is replaced in RAM.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'_ai_workbench/temp/oldtrek_recovery_20261002');
const cfg=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService'));
const tables=cfg.decodeTables(fs.readFileSync(path.join(root,'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin')));
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function harness(mode='candidate',opts={}) {
 const modules=new Map(),logs=[],casMisses=[],writes=[];let stored=null,deferred=null,clock=Date.parse('2026-10-02T22:45:00+07:00'),drains=0,writeMode='ok';
 class Clock extends Date {constructor(...a){super(...(a.length?a:[clock]));} static now(){return clock;}}
 const ps={async drainPendingSaves(){drains++;if(deferred){stored=copy(deferred);deferred=null;}},async loadPlayer(){if(writeMode==='unreadable')throw Error('READ_FAILED');return copy(stored)},async savePlayer(uid,p,options={}){
   const miss=[];for(const [key,val] of Object.entries(options.oldTrekCAS||{})){const actual=key==='oldTrekInfo'?stored?.other_attr_info?.oldTrekInfo:stored?.[key];if(JSON.stringify(actual)!==JSON.stringify(val))miss.push(key)}
   if(miss.length){casMisses.push(miss);return null;}
   if(writeMode==='throw-before')throw Error('FIXTURE_DB_FAILURE');
   if(writeMode==='null')return null;
   stored=copy(p);writes.push(copy(p.other_attr_info.oldTrekInfo));
   if(['throw-after','unreadable'].includes(writeMode))throw Error('FIXTURE_DB_TIMEOUT');
   return p;
 }};
 function load(rel){
   if(modules.has(rel))return modules.get(rel);
   const candidate=path.join(dir,'candidate/server',rel),baseline=path.join(dir,'baseline/server',rel),file=mode==='candidate'&&fs.existsSync(candidate)?candidate:baseline;
   const m={exports:{}};modules.set(rel,m.exports);
   const logger={info:x=>logs.push(x),warn:x=>logs.push(x),error:x=>logs.push(x),debug(){}};
   const context={module:m,exports:m.exports,process:{env:{OLD_TREK_EVENT_ENGINE_ENABLED:'1'}},Buffer,Date:Clock,setTimeout,clearTimeout,console,
    require(name){
     if(name==='node:crypto')return {...crypto,randomInt:n=>0};if(name==='node:async_hooks')return require(name);
     const res=path.posix.normalize(path.posix.join(path.posix.dirname(rel),name));
     if(res==='src/services/ConfigService')return {get:n=>tables[n]||{}};
     if(res==='src/services/PlayerService')return ps;
     if(res==='src/logger')return logger;
     if(res==='src/handlers/raid')return{addRewardToPlayer(p,id,n){p.items[id]=(p.items[id]||0)+n}};
     if(res==='src/handlers/chat')return{buildSummary:p=>({dbid:p.playerId,name:p.name})};
     if(res.endsWith('.json'))return JSON.parse(fs.readFileSync(path.join(dir,'baseline/server',res),'utf8'));
     if(name.startsWith('.'))return load(res+'.js');throw Error('NETWORK_OR_DEPENDENCY_BLOCKED:'+name);
    }};
   vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});modules.set(rel,m.exports);return m.exports;
 }
 const h=load('src/handlers/old-trek.js');
 const player={userId:'OLDTREK_RECOVERY_RAM',playerId:'000000000000000000000001',name:'RAM',level:185,exp:0,roleInfo:{stage:1},other_attr_info:{},items:{1:10000,2:1000,6:0,321:1000,325:20,331:200},currencies:{diamond:10000,silver:1000,gold:0}};
 h.ensureOldTrekInfo(player);
 const s={userId:player.userId,player},i=player.other_attr_info.oldTrekInfo;
 i.sailorList=[340101,340102,340103].map(id=>h.buildSailor(id));i.sailorSlotList.forEach((r,k)=>{r.sailorId=i.sailorList[k]?.id||0});i.setMap[0].forEach((r,k)=>{r.slots[0]=i.sailorList[k].id;r.leader=r.slots[0]});
 stored=copy(player);
 const call=(tag,p={})=>tag===7000?h.handleOldTrekInfo(p,s,++call.uid):h.handleOldTrekAction(tag,p,s,++call.uid);call.uid=10;
 function setEvent(id=4017,{expired=true,dist=2000}={}){
   const i=s.player.other_attr_info.oldTrekInfo;i.sailing=true;i.sailInfo.trekData={uid:101,id:1,diff:1,dist,stable:100,stableMax:100,lastUpdateTime:clock,eventPolicyVersion:'compatible-approximation-20260921-v1',nextEventDistance:999999,encounterCount:24,passivePaidSteps:Math.floor(dist/100)};
   i.sailInfo.currentEvent={uid:201,id,pre:-1,createdAt:expired?clock-900001:clock-10000,deadline:expired?clock-1:clock+890000,miniGameType:1,miniGameLevel:37,trekUid:101,season:i.season,rootUid:201,chainStep:0,policyVersion:'compatible-approximation-20260921-v1'};
   stored=copy(s.player);
 }
 return{h,s,call,setEvent,logs,writes,casMisses,ps,load,get drains(){return drains},stored:()=>copy(stored),store:p=>{stored=copy(p||s.player)},queue:p=>{deferred=copy(p)},mode:m=>{writeMode=m},tick:n=>{clock+=n},info:()=>s.player?.other_attr_info?.oldTrekInfo};
}
const packet=(r,tag)=> (Array.isArray(r)?r:[r]).find(x=>x.tag===tag&&x.msgUid)?.data;
async function main(){
 const mode=process.argv[2]||'candidate',results=[];
 async function check(name,f){try{const details=await f();results.push({name,pass:true,...details})}catch(e){results.push({name,pass:false,error:e.stack})}}
 await check('7008_then_7002_no_session_poison',async()=>{const t=harness(mode);t.setEvent(117,{expired:false});delete t.info().sailInfo.currentEvent.miniGameType;delete t.info().sailInfo.currentEvent.deadline;t.store();const a=packet(await t.call(7008,{}),7008);const b=packet(await t.call(7002,{eventUid:201,operate:0,param:0,requestId:'terminal_0001'}),7002);assert.equal(b.result,0);assert(t.s.player);assert.equal(t.casMisses.length,0);return{revision:a.revision}});
 await check('expired_minigame_7008_uses_existing_failure_branch',async()=>{const t=harness(mode);t.setEvent();const before=t.stored();const r=packet(await t.call(7008,{requestId:'snapshot_0001'}),7008);assert(r.expiredRecovery);assert.notEqual(t.info().sailInfo.currentEvent?.uid,201);assert.equal(t.info().eventLedger.filter(e=>e.uid===201).length,1);assert.equal(t.info().eventLedger.find(e=>e.uid===201).operate,1);assert(t.s.player);const once=t.info().eventLedger.length;await t.call(7008,{requestId:'snapshot_0002'});assert.equal(t.info().eventLedger.filter(e=>e.uid===201).length,1);return{nextEvent:t.info().sailInfo.currentEvent?.id,ledger:once}});
 await check('nonexpired_minigame_unchanged',async()=>{const t=harness(mode);t.setEvent(4017,{expired:false});const r=packet(await t.call(7008,{}),7008);assert(!r.expiredRecovery);assert.equal(t.info().sailInfo.currentEvent.uid,201)});
 await check('concurrent_finish_exactly_once',async()=>{const t=harness(mode);t.setEvent(117,{expired:false,dist:2400});t.info().sailInfo.currentEvent=null;t.store();const r=await Promise.all([t.call(7005,{uid:101,requestId:'settle_000001'}),t.call(7005,{uid:101,requestId:'settle_000002'})]);assert.equal(packet(r[0],7005).result,0);assert.equal(packet(r[1],7005).replayed,true);assert.equal(t.info().trekReceipts.filter(r=>r.uid===101).length,1);assert.equal(t.info().totalDistance,2400);assert.equal(t.info().sailing,false);assert.equal(t.info().endCache,true)});
 await check('drain_prior_economy_save',async()=>{const t=harness(mode);t.setEvent(117,{expired:false});t.s.player.items[2]++;t.s.player.currencies.silver++;t.queue(t.s.player);const r=packet(await t.call(7002,{eventUid:201,operate:0,param:0,requestId:'terminal_0002'}),7002);assert.equal(r.result,0);assert(t.s.player);assert.equal(t.casMisses.length,0);assert(t.drains>0)});
 await check('prewrite_exception_preserves_session',async()=>{const t=harness(mode);t.setEvent();const event=t.load('src/services/OldTrekEventService.js');event.resolve=()=>{throw Error('FIXTURE_LOGIC_ERROR')};const before=t.stored();const r=packet(await t.call(7002,{eventUid:201,operate:1,param:0}),7002);assert.equal(r.code,'OLD_TREK_OPERATION_FAILED');assert(t.s.player);assert.deepEqual(t.stored(),before);assert.equal(t.writes.length,0)});
 await check('save_commit_timeout_recovers_receipt',async()=>{const t=harness(mode);t.setEvent(117,{expired:false});t.mode('throw-after');const r=packet(await t.call(7002,{eventUid:201,operate:0,param:0,requestId:'commit_lost_01'}),7002);assert(t.s.player);assert.equal(r.result,0);assert.equal(r.replayed,true);assert.equal(t.info().eventLedger.filter(e=>e.uid===201).length,1)});
 await check('unknown_storage_outcome_stays_fail_closed',async()=>{const t=harness(mode);t.setEvent(117,{expired:false});t.mode('unreadable');const r=packet(await t.call(7002,{eventUid:201,operate:0,param:0,requestId:'commit_lost_02'}),7002);assert.equal(r.result,1);assert.equal(r.code,'OLD_TREK_SAVE_UNKNOWN');assert.equal(t.s.player,null)});
 await check('safe_cas_miss_reconciles_without_reward',async()=>{const t=harness(mode);t.setEvent(117,{expired:false});const newer=t.stored();newer.other_attr_info.oldTrekInfo.stateRevision++;t.store(newer);const before=t.stored();const r=packet(await t.call(7002,{eventUid:201,operate:0,param:0,requestId:'cas_miss_0001'}),7002);assert.equal(r.result,1);assert.equal(r.code,'OLD_TREK_RESYNC_REQUIRED');assert(t.s.player);assert.deepEqual(t.stored(),before);assert.equal(t.writes.length,0)});
 const report={mode,pass:results.every(r=>r.pass),productionWrites:0,networkCalls:0,results};fs.writeFileSync(path.join(dir,mode+'-tests.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={harness,tables,packet,dir,root};
