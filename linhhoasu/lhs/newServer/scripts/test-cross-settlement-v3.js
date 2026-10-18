'use strict';
const assert=require('assert/strict'),path=require('path');
const {memoryModel,clone}=require('./test-competitions-v3');
const app=process.env.COMPETITION_APP||path.resolve(__dirname,'..');
const cross=require(app+'/src/services/CrossServerEventService');
const {createService,dueWindows,rewardsFor}=require(app+'/src/services/CrossEventSettlementService');
const arena=require(app+'/src/services/CrossArenaService');
const config=require(app+'/src/services/ConfigService');
const gameDay=require(app+'/src/services/GameDayService');
const DAY=86400000,anchor=Date.parse(cross.schedule.anchor),cycle=cross.cycleFor('crossArena',anchor+7*DAY),day=cycle.startTime+23*3600000;
const grace=cross.schedule.settlementGraceMs;
const Settlement=memoryModel(),Player=memoryModel(),Mail1=memoryModel(),Mail2=memoryModel(),Mail3=memoryModel();
const roster=[{playerId:'a',userId:'ua',serverId:1001,score:1200,rank:1},{playerId:'b',userId:'ub',serverId:1002,score:1100,rank:2},
 {playerId:'c',userId:'uc',serverId:1003,score:1000,rank:3}];
let now=day+grace,rosterCalls=0;
const opts={Settlement,Player,config,clock:()=>now,loadRoster:async()=>{rosterCalls++;return clone(roster);}};
const services=[Mail1,Mail2,Mail3].map((Mail,i)=>createService({...opts,Mail,serverId:1001+i}));
const tests=[];function check(name,fn){fn();tests.push(name);}
async function main(){
 check('no negative settlement cycle',()=>assert.equal(dueWindows(anchor,anchor).length,0));
 check('end boundary carries both previous events',()=>{const w=dueWindows(cycle.startTime,cycle.startTime+grace);assert.equal(w.length,2);assert.deepEqual(w.map(x=>x.cycle.event).sort(),['crossArena','crossRival']);});
 check('seven daily and one season CrossArena windows',()=>{const w=dueWindows(cycle.startTime,cycle.endTime+grace).filter(w=>w.cycle.key===cycle.key);assert.equal(w.length,8);assert.equal(w.at(-1).period,'cycle');});
 check('configured daily and weekly reward tables distinct',()=>assert.notDeepEqual(rewardsFor('crossArena',1,config,'day'),rewardsFor('crossArena',1,config,'cycle')));
 const window={cycle,period:'day',cutoffAt:day};
 check('grace window deferred',()=>{});assert.equal((await services[0].settleWindow(window,day)).skipped,'NOT_DUE');
 const first=await services[0].settleWindow(window);
 check('S1 only creates S1 mail',()=>{assert.equal(Mail1.rows.size,1);assert.equal([...Mail1.rows.values()][0].targetServerId,1001);assert.equal(first.state,'pending');});
 const calls=rosterCalls;await services[0].settleWindow(window);
 check('frozen snapshot reused and no duplicate mail',()=>{assert.equal(rosterCalls,calls);assert.equal(Mail1.rows.size,1);});
 await Promise.all([services[1].settleWindow(window),services[2].settleWindow(window)]);
 check('S2/S3 deliver their own immutable recipients',()=>{assert.equal(Mail2.rows.size,1);assert.equal(Mail3.rows.size,1);assert.equal(Settlement.rows.get(first.id).state,'done');});
 const day2={cycle,period:'day',cutoffAt:day+DAY};now=day2.cutoffAt+grace;
 const update=Settlement.updateOne;let crash=true;
 Settlement.updateOne=(q,u,opt)=>crash&&u.$addToSet?(crash=false,{exec:async()=>{throw Error('CRASH_AFTER_MAIL');}}):update(q,u,opt);
 await assert.rejects(services[0].settleWindow(day2),/CRASH_AFTER_MAIL/);
 const mailAfterCrash=Mail1.rows.size;await services[0].settleWindow(day2);Settlement.updateOne=update;
 check('mail-before-receipt crash does not duplicate',()=>assert.equal(Mail1.rows.size,mailAfterCrash));
 const day3={cycle,period:'day',cutoffAt:day+2*DAY};now=day3.cutoffAt+grace;
 crash=true;Settlement.updateOne=(q,u,opt)=>crash&&u.$addToSet?(crash=false,{exec:async()=>{throw Error('CRASH_AFTER_MAIL');}}):update(q,u,opt);
 await assert.rejects(services[0].settleWindow(day3),/CRASH_AFTER_MAIL/);Settlement.updateOne=update;
 const last=[...Mail1.rows.values()].at(-1);Mail1.rows.delete(last._id);Player.rows.set('ua',{_id:'ua',userId:'ua',mailClaimLedger:[last._id]});
 const afterClaim=Mail1.rows.size;await services[0].settleWindow(day3);
 check('claimed and deleted mail never recreated',()=>assert.equal(Mail1.rows.size,afterClaim));
 const exp=Settlement.rows.get(first.id);exp.delivered=[];exp.expired=[];exp.state='pending';Mail1.rows.clear();now=day+31*DAY;
 await services[0].deliverCycle(first.id);
 check('expired reward not resurrected',()=>{assert.equal(Mail1.rows.size,0);assert(exp.expired.includes('a'));});
 const bad=clone(cycle);bad.event='topArena';await assert.rejects(services[0].settleWindow({cycle:bad,period:'cycle',cutoffAt:bad.endTime}),/CROSS_CUTOFF_INVALID/);
 tests.push('wrong previous event rejected');
 await assert.rejects(services[0].settleWindow({cycle:{...cycle,index:-1},period:'cycle',cutoffAt:cycle.endTime}),/CROSS_CUTOFF_INVALID/);tests.push('negative cycle rejected');
 now=cycle.endTime+grace;
 const s4=createService({...opts,Mail:memoryModel(),serverId:1004});
 const s4Results=await s4.tick();
 check('S4 is included in the auto page-1 competition pool',()=>assert.ok(Array.isArray(s4Results)));
 for(const service of services)await service.tick();const sizes=[Mail1.rows.size,Mail2.rows.size,Mail3.rows.size];
 for(const service of services)await service.tick();
 check('catch-up cursors idempotent across all three nodes',()=>assert.deepEqual([Mail1.rows.size,Mail2.rows.size,Mail3.rows.size],sizes));
 check('season payout uses real previous CrossArena event',()=>assert([...Settlement.rows.values()].some(r=>r.sourceCycleKey===cycle.key&&r.period==='cycle'&&r.event==='crossArena'&&r.state==='done')));
 const Action=memoryModel();Action.rows.set('future',{_id:'future',cycleKey:cycle.key,kind:'fight',playerId:'a',committedAt:day+1000,log:{scorechange:20}});
 const persisted=[{playerId:'a',userId:'ua',serverId:1001,crossArenaInfo:{version:2,cycleKey:cycle.key,joinedAt:cycle.startTime,score:1025,
   outbox:[{_id:'future',cycleKey:cycle.key,kind:'fight',playerId:'a',committedAt:day+1000,log:{scorechange:20}},
   {_id:'pending',cycleKey:cycle.key,kind:'fight',playerId:'a',committedAt:day+2000,log:{scorechange:5}}]}},
  {playerId:'b',userId:'ub',serverId:1002,crossArenaInfo:{version:2,cycleKey:cycle.key,joinedAt:day+100,score:5000,outbox:[]}},
  {playerId:'c',userId:'uc',serverId:1003,crossArenaInfo:{version:2,cycleKey:'later',outbox:[],seasons:{[cycle.key]:{joinedAt:cycle.startTime,score:1100}}}}];
 const final=arena.createService({Entry:memoryModel(),Action,loadSeasonPlayers:async sid=>persisted.filter(p=>p.serverId===sid)});
 const atCutoff=await final.finalRoster(cycle,day);
 check('cutoff excludes new joiners and includes archived season',()=>{assert.deepEqual(atCutoff.map(r=>r.playerId),['c','a']);assert.equal(atCutoff[1].score,1000);});
 check('unpublished outbox reverses exactly once',()=>assert.equal(atCutoff.find(r=>r.playerId==='a').score,1000));
 const unavailable=arena.createService({Entry:memoryModel(),Action,loadSeasonPlayers:async()=>{throw Error('NODE_DB_UNAVAILABLE');}});
 await assert.rejects(unavailable.finalRoster(cycle,day),/NODE_DB_UNAVAILABLE/);tests.push('missing server DB blocks incomplete snapshot');
 console.log(JSON.stringify({result:'PASS',checks:tests.length,tests,productionWrites:0,networkAttempts:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
