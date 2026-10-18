'use strict';
const assert=require('assert/strict');
const clone=x=>JSON.parse(JSON.stringify(x));
function memoryStore(){
  const docs=new Map();return {
    async createIfAbsent(w){if(!docs.has(w._id))docs.set(w._id,clone(w));},
    async load(id){return docs.has(id)?clone(docs.get(id)):null;},
    async compareAndSwap(id,rev,next){if(docs.get(id)?.revision!==rev)return false;docs.set(id,clone(next));return true;},
  };
}
async function runSuite({engine,rules,tables,store}){
  let now=Date.parse('2026-10-15T12:00:00+07:00'),serial=0;
  const checks=[],config={get:name=>tables[name]},base=tables.CrossRivalBaseConfig;
  const actor=n=>({serverId:1000+n,playerId:'QA_ONLY_'+n,userId:'QA_ONLY_'+n,level:100,name:'QA_ONLY'});
  const a=actor(1),b=actor(2),ally=actor(8);
  function service(options={}){return engine.createService({store,config,rules,clock:()=>now,...options});}
  const paid={verifyAdmission:async()=>true},one=service(paid),two=service(paid);
  async function fresh(){const c={key:'QA_WORLD_'+(++serial),index:4,event:'crossRival',startTime:1791738000000,endTime:1792342800000};
    now=Date.parse('2026-10-15T12:00:00+07:00');return (await one.initialize(c))._id;}
  async function command(s,id,p,kind,extra={}){const w=await s.snapshot(id),seq=(w.players[s.actorKey(p)]?.seq||0)+1;
    return s.execute(id,p,{seq,kind,...extra});}
  const player=(s,w,p)=>w.players[s.actorKey(p)];
  async function check(name,fn){await fn();checks.push(name);}
  let id=await fresh();
  await check('all eight servers map to four stable alliances',()=>{
    assert.deepEqual([1,2,3,4,5,6,7,8].map(n=>rules.camp(1000+n)),[1,2,3,4,4,3,2,1]);
  });
  await check('legacy claimed tasks carry forward without importing fabricated scores',async()=>{
    const migrated={...actor(7),legacyCycleKey:(await one.snapshot(id)).cycle.key,legacyClaims:[1,1,999]};
    await command(one,id,migrated,'enter',{camp:2,line:0});
    const p=player(one,await one.snapshot(id),migrated);assert.deepEqual(p.claims,[1]);assert.equal(p.score,0);
  });
  await check('free own-camp entry; six real cores and configured boxes',async()=>{
    await command(one,id,a,'enter',{camp:1,line:0});const w=await two.snapshot(id),r=w.rooms['1_0'];
    assert.equal(Object.values(r.entities).filter(e=>e.type===3).length,6);
    assert.equal(Object.values(r.entities).filter(e=>e.type===1).length,10);
    assert.equal(Object.values(r.entities).filter(e=>e.type===2).length,4);
    assert.equal(player(one,w,a).until,now+600000);
  });
  await check('forged reEnter flag cannot bypass confirmed ticket adapter',async()=>{
    await assert.rejects(()=>command(service(),id,a,'enter',{camp:2,line:0,reEnter:1}),/TICKET_ADAPTER_REQUIRED/);
    await assert.rejects(()=>command(service({verifyAdmission:async()=>false}),id,a,'enter',{camp:2,line:0,reEnter:1}),/TICKET_NOT_COMMITTED/);
    assert.equal(player(one,await one.snapshot(id),a).room,'1_0');
  });
  await check('invalid camp/line/server/level rejected without side effects',async()=>{
    const before=JSON.stringify(await one.snapshot(id));
    for(const p of [{camp:999,line:0},{camp:2,line:-1},{camp:2,line:999}])await assert.rejects(()=>command(one,id,a,'enter',p),/ROOM_INVALID/);
    await assert.rejects(()=>command(one,id,{...a,serverId:1009},'enter',{camp:1,line:0}),/ACTOR_INVALID/);
    await assert.rejects(()=>command(one,id,{...a,level:99},'enter',{camp:1,line:0}),/ACTOR_INVALID/);
    assert.equal(JSON.stringify(await one.snapshot(id)),before);
  });
  await command(one,id,a,'enter',{camp:2,line:0});
  await check('legitimate same-room reentry does not renew duration or charge again',async()=>{
    const before=player(one,await one.snapshot(id),a).until;now+=1000;
    const result=await command(service(),id,a,'enter',{camp:2,line:0,reEnter:0});
    assert.equal(result.reentered,true);assert.equal(result.until,before);
  });
  await check('invalid targets and far-away interaction rejected',async()=>{
    await assert.rejects(()=>command(one,id,a,'start',{entity:'3_999'}),/TARGET_MISSING/);
    await assert.rejects(()=>command(one,id,a,'start',{entity:'3_1'}),/OUT_OF_RANGE/);
  });
  const core={...tables.CrossRivalPositionConfig[3][1].position};core.x+=300;
  await command(one,id,a,'fly',{position:core});
  await check('fly cooldown and out-of-bounds coordinates enforced',async()=>{
    await assert.rejects(()=>command(one,id,a,'fly',{position:core}),/FLY_COOLDOWN/);
    await assert.rejects(()=>command(one,id,a,'move',{position:{x:1e10,y:1e10}}),/POSITION_INVALID/);
  });
  await check('twenty identical cross-node starts create one timed action',async()=>{
    const w=await one.snapshot(id),c={seq:player(one,w,a).seq+1,kind:'start',entity:'3_1'};
    const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?one:two).execute(id,a,clone(c))));
    assert(results.every(r=>r.endsAt===now+10000));assert.equal(player(one,await one.snapshot(id),a).score,0);
  });
  await check('no score before deadline; two workers complete exactly once',async()=>{
    now+=9999;await one.advance(id);assert.equal(player(one,await one.snapshot(id),a).score,0);
    now+=1;await Promise.all([one.advance(id),two.advance(id)]);const w=await two.snapshot(id);
    assert.equal(player(one,w,a).score,120);assert.equal(w.campScores[1],120);assert.equal(w.rooms['2_0'].entities['3_1'].hp,48500);
    await one.advance(id);assert.equal(player(one,await one.snapshot(id),a).score,120);
  });
  await check('same sequence with changed payload rejected; older sequence rejected',async()=>{
    const p=player(one,await one.snapshot(id),a);
    await assert.rejects(()=>one.execute(id,a,{seq:p.seq,kind:'start',entity:'3_2'}),/REPLAY_CONFLICT/);
    await assert.rejects(()=>one.execute(id,a,{seq:p.seq-1,kind:'leave'}),/SEQUENCE_INVALID/);
  });
  await check('cancelled actions never grant points',async()=>{
    await command(one,id,a,'start',{entity:'3_1'});await command(two,id,a,'cancel');now+=10000;await one.advance(id);
    assert.equal(player(one,await one.snapshot(id),a).score,120);
  });
  await check('same target cannot be claimed by two servers',async()=>{
    await command(one,id,ally,'enter',{camp:2,line:0});await command(one,id,ally,'fly',{position:core});
    await command(one,id,a,'start',{entity:'3_1'});
    await assert.rejects(()=>command(two,id,ally,'start',{entity:'3_1'}),/TARGET_BUSY/);await command(one,id,a,'cancel');
  });
  await check('configured collect timer and respawn lifecycle work',async()=>{
    const p=tables.CrossRivalPositionConfig[1][1].position;await command(one,id,a,'fly',{position:p});
    await command(one,id,a,'start',{entity:'1_1'});now+=10000;await two.advance(id);
    let w=await one.snapshot(id);assert.equal(player(one,w,a).score,170);assert.equal(w.rooms['2_0'].entities['1_1'].hp,0);
    await assert.rejects(()=>command(one,id,a,'start',{entity:'1_1'}),/TARGET_MISSING/);
    now+=30000;await one.advance(id);w=await one.snapshot(id);assert.equal(w.rooms['2_0'].entities['1_1'].hp,1);
  });
  await check('free home camp cannot damage friendly cores',async()=>{
    await command(one,id,b,'enter',{camp:2,line:0});await command(one,id,b,'fly',{position:core});
    await assert.rejects(()=>command(one,id,b,'start',{entity:'3_1'}),/FRIENDLY_TARGET/);
  });
  await check('no self/fake/ally target and no invented PvP result',async()=>{
    await assert.rejects(()=>command(one,id,a,'fight',{target:'NO_TARGET',win:true}),/OPPONENT_INVALID/);
    await assert.rejects(()=>command(one,id,a,'fight',{target:one.actorKey(ally),win:true}),/OPPONENT_INVALID/);
    now+=10000;await command(one,id,a,'fly',{position:core});
    await assert.rejects(()=>command(one,id,a,'fight',{target:one.actorKey(b),win:true}),/BATTLE_ADAPTER_REQUIRED/);
  });
  await check('authoritative loss updates defender win/death, not forced win',async()=>{
    const fighter=service({...paid,simulateBattle:async()=>({win:false})});
    const r=await command(fighter,id,a,'fight',{target:one.actorKey(b),win:true});assert.equal(r.win,false);
    const w=await one.snapshot(id);assert.equal(player(one,w,b).defKill,1);assert.equal(player(one,w,a).deadUntil,now+15000);
    await assert.rejects(()=>command(one,id,a,'start',{entity:'3_1'}),/DEAD/);
  });
  await check('death protection survives reconnect/new worker',async()=>{
    await command(one,id,a,'finish');
    now+=15000;const fighter=service({...paid,simulateBattle:async()=>({win:true})});
    await assert.rejects(()=>command(fighter,id,a,'fight',{target:one.actorKey(b)}),/PROTECTED/);
  });
  await check('membership expires and cannot attack after expiry',async()=>{
    now+=700000;await two.advance(id);assert.equal(player(one,await one.snapshot(id),a).room,null);
    await assert.rejects(()=>command(one,id,a,'start',{entity:'3_1'}),/NOT_IN_MAP/);
  });
  id=await fresh();await command(one,id,a,'enter',{camp:2,line:0});await command(one,id,a,'fly',{position:core});
  await check('max-run/total/camp task progress advances from real completed actions',async()=>{
    for(let i=0;i<21;i++){await command(one,id,a,'start',{entity:'3_1'});now+=10000;await one.advance(id);}
    const w=await one.snapshot(id),p=player(one,w,a),progress=one.taskProgress(w,p);
    assert.equal(progress[1],2520);assert.equal(progress[2],2520);assert.equal(progress[4],2520);
  });
  await check('claim creates one durable outbox receipt; no inventory writes or duplicate delivery',async()=>{
    const w=await one.snapshot(id),c={seq:player(one,w,a).seq+1,kind:'claim',type:1};
    const [x,y]=await Promise.all([one.execute(id,a,c),two.execute(id,a,c)]);
    assert.equal(x.deliveryId,y.deliveryId);assert.equal(x.deliveryState,'pending');assert.deepEqual(x.taskIds,[1]);
    const after=await one.snapshot(id);assert.equal(Object.keys(after.outbox).length,1);
    assert.deepEqual(after.outbox[x.deliveryId].rewards,[{id:311,count:100}]);
    const again=await command(one,id,a,'claim',{type:1});assert.equal(again.deliveryId,null);
  });
  await check('forged claim progress/rewards cannot create entitlement',async()=>{
    const r=await command(one,id,a,'claim',{type:2,score:5000000,reward:[{id:1,count:1e9}],taskIds:[20]});
    assert.equal(r.deliveryId,null);assert.equal(Object.keys((await one.snapshot(id)).outbox).length,1);
  });
  await check('phase/cycle boundaries reject entry and straddling action',async()=>{
    now=Date.parse('2026-10-15T19:55:00+07:00');await assert.rejects(()=>command(one,id,b,'enter',{camp:2,line:0}),/PHASE_CLOSED/);
    now=Date.parse('2026-10-15T20:29:55+07:00');await command(one,id,b,'enter',{camp:1,line:0});
    await command(one,id,b,'fly',{position:core});await assert.rejects(()=>command(one,id,b,'start',{entity:'3_1'}),/NOT_ENOUGH_TIME/);
    now=1792342800000;await assert.rejects(()=>command(one,id,b,'enter',{camp:1,line:0}),/PHASE_CLOSED/);
  });
  await check('store failure cannot be reported as success',async()=>{
    const failing={...store,compareAndSwap:async()=>{throw Error('INJECTED_DB_ERROR');}};
    const broken=engine.createService({store:failing,config,rules,clock:()=>Date.parse('2026-10-15T12:00:00+07:00')});
    await assert.rejects(()=>command(broken,id,b,'leave'),/INJECTED_DB_ERROR/);
  });
  id=await fresh();
  await check('ambiguous commit recovered by identical replay without duplicate entry',async()=>{
    let failOnce=true;
    const ambiguous={...store,async compareAndSwap(...args){const ok=await store.compareAndSwap(...args);if(ok&&failOnce){failOnce=false;throw Error('COMMIT_UNKNOWN');}return ok;}};
    const s=engine.createService({store:ambiguous,config,rules,clock:()=>now});
    const c={seq:1,kind:'enter',camp:1,line:0};await assert.rejects(()=>s.execute(id,a,c),/COMMIT_UNKNOWN/);
    const result=await two.execute(id,a,c);assert.equal(result.until,now+600000);
    assert.equal(Object.keys((await two.snapshot(id)).players).length,1);
  });
  await check('settlement freeze is idempotent; zero-point idle accounts excluded',async()=>{
    await assert.rejects(()=>one.freeze(id),/SETTLEMENT_NOT_DUE/);
    await command(one,id,a,'enter',{camp:2,line:0});await command(one,id,a,'fly',{position:core});
    await command(one,id,a,'start',{entity:'3_1'});now+=10000;await one.advance(id);
    await command(one,id,b,'enter',{camp:2,line:0});
    now=1792342800000;
    const [first,second]=await Promise.all([one.freeze(id),two.freeze(id)]);
    assert.equal(first.hash,second.hash);assert.equal(first.personal.length,1);assert.equal(first.personal[0].score,120);
    assert.equal(first.eligible.length,1);assert.equal(first.defence.length,0);
    await assert.rejects(()=>command(one,id,a,'enter',{camp:2,line:0}),/CYCLE_FROZEN/);
    const before=JSON.stringify(await one.snapshot(id));await two.advance(id);assert.equal(JSON.stringify(await one.snapshot(id)),before);
  });
  return {result:'PASS',checks:checks.length,names:checks,worldsCreated:serial,productionPlayerWrites:0,
    inventoryAdaptersConnected:false,nativeE2E:false};
}
module.exports={runSuite,memoryStore};
if(require.main===module){
  const fs=require('fs'),path=require('path'),task=path.resolve(__dirname,'../temp/cross_rival_20261015');
  const engine=require(path.join(task,'next/src/services/CrossRivalBattlefieldService.js'));
  const rules=require(path.join(task,'candidate/src/services/CrossRivalRules.js'));
  const tables=JSON.parse(fs.readFileSync(path.join(task,'live-audit.json'),'utf8')).config;
  runSuite({engine,rules,tables,store:memoryStore()}).then(result=>{
    fs.writeFileSync(path.join(task,'world-ram-tests.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }).catch(e=>{console.error(e);process.exitCode=1;});
}
