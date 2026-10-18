'use strict';
// App modules above are loaded from the staged bundle; other dependencies come
// from the current VPS. Only this unique QA database is writable by the suite.
const assert=require('assert/strict'),mongoose=require('mongoose');
const config=require('./src/services/ConfigService');config.loadAllTables();
const rules={...require('./src/services/CrossRivalRules'),allowed:()=>true,MAINTENANCE:false};
const cross=require('./src/services/CrossServerEventService'),players=require('./src/services/PlayerService');
const mutation=require('./src/services/PlayerMutationService'),readModel=require('./src/services/ArenaReadModelService');
const battle=require('./src/services/BattleService'),hash=require('./src/services/CrossRivalEconomyService').hash;
const clone=x=>JSON.parse(JSON.stringify(x));
let now=Date.parse('2026-10-15T12:00:00+07:00'),counter=0;
const checks=[],sessions=new Map(),clients=new Map(),pushes=[],clock=()=>now,request=()=>`r2_${now}_${(++counter).toString(16).padStart(32,'0')}`;
const runtime={getWsServer:()=>({getPlayerForMutation:id=>sessions.get(id)?.player,
  invalidatePlayerForMutation:id=>{if(sessions.has(id))sessions.get(id).player=null;},pushToUser(userId,tag,data){pushes.push({userId,tag,data});},clients})};
async function check(name,fn){await fn();checks.push(name);}
(async()=>{
 await mongoose.connect(env.MONGO_URI,{dbName:input.db,serverSelectionTimeoutMS:5000,maxPoolSize:8,autoIndex:false});
 const db=mongoose.connection.db;
 if(db.databaseName!==input.db||(await db.listCollections().toArray()).length)throw Error('QA_DATABASE_NOT_EMPTY');
 await db.collection('qa_owner').insertOne({_id:'cross-rival-integration',database:input.db,createdAt:new Date()});
 await check('QA access expires, rejects other users/servers and cannot mix with public',()=>{
   const actual=require('./src/services/CrossRivalRules'),r=actual.release;
   if(!r.qaActors.length)return;
   assert(actual.qaConfigured());const a=r.qaActors[0],t=r.qaStartAt+1;
   assert(actual.allowed(a.serverId,a.userId,t));assert(!actual.allowed(a.serverId,'ordinary-player',t));
   assert(!actual.allowed(9999,a.userId,t));assert(!actual.allowed(a.serverId,a.userId,r.qaUntil));
   assert(!actual.publicOpen(t));const enabled=r.enabled;
   try{r.enabled=true;assert(!actual.allowed(a.serverId,a.userId,t));}finally{r.enabled=enabled;}
 });
 await check('QA world/fight/lease/settlement namespaces and native phase stay separate',()=>{
   const actual=require('./src/services/CrossRivalRules'),r=actual.release;
   if(!r.qaActors.length)return;
   const cycle=cross.cycleFor('crossRival',r.qaStartAt+1),qa=actual.qaCycle(cycle);
   assert(qa.key.startsWith('QA_'));assert.notEqual(qa.key,cycle.key);assert(!cycle.qa);
   for(const kind of ['worlds','fights','leases','settlements'])assert.equal(actual.collection(kind),'cross_rival_qa_'+kind+'_v2');
   assert.equal(actual.phase(qa,r.qaStartAt+1).stage,2);assert.equal(actual.phase(qa,r.qaBattleAt).stage,4);
   assert.equal(actual.phase(qa,r.qaEndAt).stage,0);
 });
 const a={userId:'QA_RIVAL_A',serverId:1001},b={userId:'QA_RIVAL_B',serverId:1002};
 for(const s of [a,b]){
   s.player=await players.createPlayer(s.userId,s.userId,{serverId:s.serverId,level:100,
     items:{310:50,311:0,312:5,313:5,314:5,315:5,316:5,317:5,318:5},currencies:{diamond:10000,silver:0,gold:0}});
   sessions.set(s.userId,s);
 }
 const worlds=db.collection('worlds'),fights=db.collection('fights');
 const economy=require('./src/services/CrossRivalEconomyService').createService({players,mutation,runtime,clock});
 const loadProfile=async p=>db.collection('players').findOne({userId:p.userId,playerId:p.playerId});
 const adapter=require('./src/services/CrossRivalBattleAdapter').createService({collection:fights,loadProfile,battle,readModel,
   buildPacket:(...args)=>require('./src/handlers/arena').competitionHelpers.buildCompetitionFightResult(...args)});
 const make=sid=>require('./src/services/CrossRivalRuntimeService').createService({config,rules,cross,worlds,players,mutation,runtime,battles:adapter,economy,readModel,loadProfile,clock,serverId:sid});
 const one=make(1001),two=make(1002);
 const controller=require('./src/services/CrossRivalHandlerService').create({buildPlayer500Data:require('./src/handlers/playerPayload').buildPlayer500Data},
   {rules,get:()=>one,clock,safe:{},logger:{warn(){}}});
 const cmd=(svc,s,kind,extra={},id=request())=>svc.command(s,id,{kind,...extra});
 let worldId;
 await check('real PlayerService CAS debits one ticket; repeated request is free',async()=>{
   const id=request(),first=await cmd(one,a,'enter',{camp:2,line:0},id);worldId=first.world._id;
   assert.equal(first.result.result,0);assert.equal(a.player.items[310],49);
   await cmd(one,a,'enter',{camp:2,line:0},id);assert.equal(a.player.items[310],49);
   assert.equal((await players.loadPlayer(a.userId)).items[310],49);
   assert.equal(Object.keys(a.player.crossRivalWallet.receipts).length,1);
 });
 await check('two independent server instances observe one authoritative room',async()=>{
   const centre=config.get('CrossRivalBaseConfig').mapCenter,position={x:centre.x+700,y:centre.y};
   await cmd(two,b,'enter',{camp:2,line:0,position});const w=await two.engine.snapshot(worldId);
   assert.deepEqual(w.players[two.engine.actorKey(b.player)].position,position);
   assert.equal(Object.values(w.players).filter(p=>p.room==='2_0').length,2);
   const me=w.players[two.engine.actorKey(b.player)];
   assert.equal(two.wire.enter(w,me).players.length,1);
   assert.equal(two.wire.enter(w,me).players[0].serverId,1001);
 });
 await check('native wallet is absolute, HP is basis points and lobby leave emits no settlement',async()=>{
   const sync=require('./src/services/CrossRivalEconomyService').inventory(a.player);
   assert.equal(sync.items.find(i=>i.id===310).count,49);assert.equal(sync.changed.find(i=>i.id===310).count,49);
   assert.equal(sync.changed.find(i=>i.id===101310).count,0);
   const state=await one.state(a),map=one.wire.mapInfo(state.world,2,0);
   assert(map.coreInfo.every(r=>r.hp===10000));assert.equal(map.flagInfo.hp,10000);
   const leave=await controller.handleCrossRivalLeave({},a,904);
   assert.equal(leave.tag,6561);assert.equal(leave.msgUid,904);assert.equal(leave.data.result,0);
   assert.equal(await controller.handleCrossRivalLeave({},a,0),null);
 });
 await check('native handlers acknowledge reads and reject forged IDs with valid payload shapes',async()=>{
   const names=['Enter','CampInfo','CampRankInfo','PlayerRankInfo','PlayerDefRankInfo'];
   for(const name of names){const packets=await controller['handleCrossRival'+name]({},a,44),list=Array.isArray(packets)?packets:[packets];assert(list.some(r=>r.msgUid===44));}
   const count=await controller.handleCrossRivalMapPlayerCount({camp:2},a,45);assert.equal(count.data.count[0],2);
   const map=await controller.handleCrossRivalMapEnter({campId:999,line:0,requestId:request()},a,46);assert.equal(map.data,null);
   const task=await controller.handleCrossRivalTaskReward({type:999,requestId:request()},a,47);assert.equal(task.data.result,-1);assert.deepEqual(task.data.taskIds,[]);
   const missing=await controller.handleCrossRivalStartFight({targetId:'forged',raidType:61,requestId:request()},a,0);assert.equal(missing,null);
   const info=await one.state(a);assert.equal(one.wire.init(info.world,info.p).lineCount,1);
   const unopened=await cmd(one,a,'enter',{camp:2,line:5});assert.equal(unopened.result.code,'CROSS_RIVAL_LINE_NOT_OPEN');
 });
 await check('per-session map baselines prevent duplicate joins and replayed gain after reconnect',async()=>{
   clients.set(a.userId,{ws:{readyState:1},session:a});
   const enter=()=>controller.handleCrossRivalMapEnter({campId:2,line:0,requestId:request()},a,48);
   const packet=(await enter()).find(p=>p.tag===6551&&p.msgUid===48);
   assert.equal(packet.data.players.length,1);pushes.length=0;
   await one.tick();assert.equal(pushes.filter(p=>p.tag===6550).length,0);
   await cmd(two,b,'leave');await one.tick();assert.equal(pushes.filter(p=>p.tag===6551&&p.data.id===b.player.playerId).length,1);
   pushes.length=0;await cmd(two,b,'enter',{camp:2,line:0});await one.tick();
   assert.equal(pushes.filter(p=>p.tag===6550&&p.data.mapPlayer.id===b.player.playerId).length,1);
   await worlds.updateOne({_id:worldId},{$set:{['players.'+one.engine.actorKey(a.player)+'.lastGain']:{at:now-1000,type:3,score:120}},$inc:{revision:1}});
   a._crossRivalView=null;await enter();pushes.length=0;await one.tick();
   assert.equal(pushes.filter(p=>[6550,6559,6576,6578].includes(p.tag)).length,0);
   await controller.handleCrossRivalMapLeave({requestId:request()},a,49);assert.equal(a._crossRivalView,null);
   pushes.length=0;await one.tick();assert.equal(pushes.filter(p=>[6550,6551,6560,6562].includes(p.tag)).length,0);
   await enter();clients.clear();
 });
 await check('unpaid rejected commands cannot grow refund outbox',async()=>{
   const before=Object.keys((await one.engine.snapshot(worldId)).outbox).length;
   for(let i=0;i<40;i++){now++;const bad=await cmd(one,a,'fly',{position:{x:1e9,y:1e9}});assert.equal(bad.result.code,'CROSS_RIVAL_POSITION_INVALID');}
   assert.equal(Object.keys((await one.engine.snapshot(worldId)).outbox).length,before);
 });
 await check('one broken recovery identity does not block another pending player',async()=>{
   const state=await one.state(a),id=request();
   await one.engine.reserve(worldId,state.actor,id,{kind:'enter',camp:2,line:0});
   const pending=await one.engine.snapshot(worldId);
   pending.players={broken:{key:'broken',playerId:'QA_MISSING',userId:'QA_MISSING',serverId:1001,pending:{command:{}}},...pending.players};
   await one.recover(pending);
   assert.equal((await one.engine.snapshot(worldId)).players[one.engine.actorKey(a.player)].pending,null);
 });
 await check('buff items use real inventory; 314 speeds movement and 315 speeds collection',async()=>{
   const first=await cmd(one,a,'use',{itemId:314});assert.equal(a.player.items[314],4);assert.equal(first.result.effects[3],now+30000);
   await cmd(one,a,'use',{itemId:315});assert.equal(a.player.items[315],4);
   const pos=config.get('CrossRivalPositionConfig')[1][1].position;
   await cmd(one,a,'fly',{position:pos});const start=await cmd(one,a,'start',{entity:'1_1'});
   assert(Math.abs(start.result.endsAt-now-10000/1.5)<1);await cmd(one,a,'cancel');
 });
 await check('insufficient inventory aborts without negative balance or pending lock',async()=>{
   const id=hash('qa_drain');await economy.apply(a,id,[{id:318,count:-5}],{kind:'fixture'});
   const result=await cmd(one,a,'use',{itemId:318});assert.equal(result.result.result,-1);assert.equal(a.player.items[318],0);
   assert.equal(result.p.pending,null);
 });
 await check('real defenders slow core attack; prop 317 bypasses only that penalty',async()=>{
   now+=65000;
   const pos={...config.get('CrossRivalPositionConfig')[3][1].position};pos.x+=300;
   await cmd(one,a,'fly',{position:pos});await cmd(two,b,'fly',{position:pos});
   const defended=await cmd(one,a,'start',{entity:'3_1'});assert(Math.abs(defended.result.endsAt-now-10000/0.85)<1);
   await cmd(one,a,'cancel');await cmd(one,a,'use',{itemId:317});assert.equal(a.player.items[317],4);
   const bypass=await cmd(one,a,'start',{entity:'3_1'});assert.equal(bypass.result.endsAt-now,10000);await cmd(one,a,'cancel');
   const s=await one.state(a),guards=one.wire.mapInfo(s.world,2,0).coreInfo[0].defenders;
   assert.equal(guards[0].playerId,b.player.playerId);assert.equal(guards.filter(g=>!g.empty).length,1);
 });
 await check('stealth blocks attacks; buff 316 boost and weakness are applied to battle attributes',async()=>{
   await cmd(two,b,'use',{itemId:312});assert.equal(b.player.items[312],4);
   const failed=await cmd(one,a,'fight',{target:two.engine.actorKey(b.player),raidType:61});assert.equal(failed.result.code,'CROSS_RIVAL_OPPONENT_HIDDEN');
   const used=await cmd(one,a,'use',{itemId:316});assert.equal(a.player.items[316],4);
   const attrs={1:1000,2:100,3:100,4:100};assert.equal(adapter.attrs(attrs,used.p,now,0)[2],130);
   assert.equal(adapter.attrs(attrs,used.p,now+61000,0)[2],80);assert.equal(adapter.attrs(attrs,used.p,now+91000,0)[2],100);
   now+=31000;
 });
 await check('payment committed but battlefield fails is tombstoned and refunded once',async()=>{
   await cmd(one,a,'leave');const state=await one.state(a),id=request(),reservation=await one.engine.reserve(worldId,state.actor,id,{kind:'enter',camp:3,line:0});
   const debit=one.debitId(worldId,state.actor,reservation.command.seq),before=a.player.items[310];
   await economy.apply(a,debit,[{id:310,count:-1}],{cycleKey:state.world.cycle.key,kind:'charge',seq:reservation.command.seq});
   await one.engine.abort(worldId,state.actor,reservation.command,'CROSS_RIVAL_PHASE_CLOSED',debit);
   await one.deliver(worldId,a);await one.deliver(worldId,a);assert.equal(a.player.items[310],before);
   const delayed=await one.engine.execute(worldId,state.actor,reservation.command);assert.equal(delayed.result,-1);
 });
 await check('ambiguous wallet commit recovers after reconnect without a second debit',async()=>{
   const state=await one.state(a),id=request(),reservation=await one.engine.reserve(worldId,state.actor,id,{kind:'enter',camp:3,line:0});
   const debit=one.debitId(worldId,state.actor,reservation.command.seq),before=a.player.items[310];
   const uncertain=require('./src/services/CrossRivalEconomyService').createService({players:{...players,savePlayer:async(...args)=>{await players.savePlayer(...args);throw Error('INJECTED_AFTER_COMMIT');}},mutation,runtime,clock});
   await assert.rejects(()=>uncertain.apply(a,debit,[{id:310,count:-1}],{cycleKey:state.world.cycle.key,kind:'charge',seq:reservation.command.seq}),/COMMIT_UNKNOWN/);
   assert.equal(a.player,null);a.player=await players.loadPlayer(a.userId);
   const recovered=await cmd(one,a,'enter',{camp:3,line:0},id);assert.equal(recovered.result.result,0);assert.equal(a.player.items[310],before-1);
 });
 await check('real BattleService generates both outcomes and one durable native animation',async()=>{
   await cmd(one,a,'enter',{camp:2,line:0});
   const centre={...config.get('CrossRivalBaseConfig').mapCenter};centre.x+=600;now+=11000;await cmd(one,a,'fly',{position:centre});
   await cmd(two,b,'fly',{position:centre});
   const w=await one.engine.snapshot(worldId),ak=one.engine.actorKey(a.player),bk=one.engine.actorKey(b.player),id=request();
   const first=await cmd(one,a,'fight',{target:bk,raidType:61},id);
   assert.equal(first.result.result,0,JSON.stringify(first.result));assert.equal(typeof first.result.win,'boolean');assert.equal(await fights.countDocuments(),1);
   const packet=await adapter.packet(first.result.fightId);assert.equal(packet.type,61);assert(packet.events.length>0);assert.equal(packet.entitys.length,2);
   await cmd(one,a,'fight',{target:bk,raidType:61},id);assert.equal(await fights.countDocuments(),1);
   const rng=require('./src/services/CrossRivalBattleAdapter').seeded;
   const weak={1:100,2:1,3:0,4:1},strong={1:1e7,2:1e6,3:1e5,4:1000};
   assert.equal(battle.simulateBattle(weak,strong,{isPvp:true,rng:rng('loss')}).win,false);
   assert.equal(battle.simulateBattle(strong,weak,{isPvp:true,rng:rng('win')}).win,true);
   assert.equal(first.world.players[ak].wins+first.world.players[bk].wins,1);
   const loser=first.result.loser===ak?a:b,owner=loser===a?one:two,before=loser.player.currencies.diamond,rid=request();
   await cmd(owner,loser,'revive',{type:1},rid);await cmd(owner,loser,'revive',{type:1},rid);
   assert.equal(loser.player.currencies.diamond,before-50);
   await cmd(one,a,'finish');
 });
 await check('healing and one-use explosion consume items with durable effects',async()=>{
   const key=one.engine.actorKey(a.player);
   await worlds.updateOne({_id:worldId},{$set:{['players.'+key+'.bloodPer']:5000},$inc:{revision:1}});
   const healed=await cmd(one,a,'use',{itemId:313});assert.equal(healed.p.bloodPer,9000);assert.equal(a.player.items[313],4);
   await economy.apply(a,hash('qa_restore_explosion'),[{id:318,count:1}],{kind:'fixture'});
   const armed=await cmd(one,a,'use',{itemId:318});assert.equal(armed.p.effects[7],1);assert.equal(a.player.items[318],0);
 });
 await check('task reward is delivered to actual bag once, not just an outbox flag',async()=>{
   now+=40000;await one.engine.advance(worldId);await cmd(one,a,'enter',{camp:3,line:0});
   const core={...config.get('CrossRivalPositionConfig')[3][1].position};core.x+=300;
   await cmd(one,a,'fly',{position:core});
   for(let i=0;i<21;i++){await cmd(one,a,'start',{entity:'3_1'});now+=10000;await one.engine.advance(worldId);}
   const id=request(),before=a.player.items[311]||0,result=await cmd(one,a,'claim',{type:1},id);
   assert.deepEqual(result.result.taskIds,[1]);assert.equal(a.player.items[311],before+100);
   assert.equal(result.world.outbox[result.result.deliveryId].state,'delivered');
   await cmd(one,a,'claim',{type:1},id);assert.equal((await players.loadPlayer(a.userId)).items[311],before+100);
 });
 await check('two OS processes resolve the same deadline once in real MongoDB',async()=>{
   const pos={...config.get('CrossRivalPositionConfig')[3][2].position};pos.x+=300;now+=11000;
   await cmd(one,a,'fly',{position:pos});const state=await one.state(a),command={kind:'start',entity:'3_2',seq:state.p.seq+1};
   const payload={db:input.db,engine:input.sources['src/services/CrossRivalBattlefieldService.js'],tables:Object.fromEntries(Object.keys(config.loadAllTables()).filter(n=>/^CrossRival/.test(n)).map(n=>[n,config.get(n)])),worldId,actor:state.actor,command,now};
   const source=`const input=${JSON.stringify(payload)};
     const {MongoClient}=require('mongodb'),Module=require('module');
     const m=new Module('/linhhoasu/lhs/newServer/src/services/qa_world.js');m.filename=m.id;m.paths=module.paths;m._compile(input.engine,m.filename);
     const client=new MongoClient(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000});
     (async()=>{if(!/^lhs_qa_rival_20261015_/.test(input.db))throw Error('QA_GUARD');await client.connect();
       const e=m.exports.createService({store:m.exports.mongoStore(client.db(input.db).collection('worlds')),config:{get:n=>input.tables[n]},rules:require('./src/services/CrossRivalRules'),clock:()=>input.now});
       const result=await e.execute(input.worldId,input.actor,input.command);console.log(JSON.stringify(result));await client.close();
     })().catch(async e=>{console.error(e.message);await client.close();process.exitCode=1;});`;
   const run=()=>new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,['-'],{cwd:process.cwd(),env:process.env,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out)));p.stdin.end(source);});
   const [first,second]=await Promise.all([run(),run()]);assert.equal(first.endsAt,second.endsAt);
   const before=(await one.engine.snapshot(worldId)).players[state.p.key].score;now+=10000;
   await Promise.all([one.engine.advance(worldId),two.engine.advance(worldId)]);
   assert.equal((await one.engine.snapshot(worldId)).players[state.p.key].score,before+120);
 });
 await check('flag is phase-gated; completed capture changes shared bonus and transfers points once',async()=>{
   const rejected=await cmd(one,a,'start',{entity:'4_1'});assert.equal(rejected.result.code,'CROSS_RIVAL_FLAG_PHASE_CLOSED');
   now=Date.parse('2026-10-15T20:00:00+07:00');await one.engine.advance(worldId);await cmd(one,a,'enter',{camp:2,line:0});
   const flag={...config.get('CrossRivalPositionConfig')[4][1].position};flag.x+=400;await cmd(one,a,'fly',{position:flag});
   await worlds.updateOne({_id:worldId},{$set:{'rooms.2_0.entities.4_1.hp':1500,'campScores.2':1000},$inc:{revision:1}});
   const before=(await one.engine.snapshot(worldId)).campScores[1];await cmd(one,a,'start',{entity:'4_1'});now+=10000;
   await one.engine.advance(worldId);await two.engine.advance(worldId);const w=await one.engine.snapshot(worldId);
   assert.equal(w.campScores[1],before+500);assert.equal(w.campScores[2],500);assert.equal(w.flagBonuses[1],1000);
 });
 await check('three deterministic mail streams survive replay and claimed-mail removal',async()=>{
   // Fixture-only defence eligibility; the genuine fight above independently
   // proved the BattleService path, regardless of which equal-power actor won.
   await worlds.updateOne({_id:worldId},{$set:{['players.'+two.engine.actorKey(b.player)+'.defKill']:1},$inc:{revision:1}});
   now=(await one.engine.snapshot(worldId)).cycle.endTime;
   const rewards=require('./src/services/CrossRivalRewardService'),settlements=db.collection('settlements'),mails=db.collection('mails');
   const opts={config,settlements,mails,players:db.collection('players'),clock,objectId:id=>new mongoose.Types.ObjectId(id)};
   const s1=rewards.createService({...opts,serverId:1001}),s2=rewards.createService({...opts,serverId:1002});
   await Promise.all([s1.settle(one.engine,worldId),s2.settle(two.engine,worldId)]);
   const count=await mails.countDocuments();assert(count>=4);
   const docs=await mails.find().toArray();assert.equal(new Set(docs.map(d=>d.eventKey.split(':').slice(-3,-2)[0])).size,3);
   const claimed=docs[0];await db.collection('players').updateOne({userId:claimed.userId},{$addToSet:{mailClaimLedger:String(claimed._id)}});
   await mails.deleteOne({_id:claimed._id});await settlements.updateOne({_id:worldId},{$pull:{delivered:String(claimed._id)}});
   await s1.settle(one.engine,worldId);await s2.settle(two.engine,worldId);
   assert.equal(await mails.countDocuments(),count-1);assert.equal((await settlements.findOne({_id:worldId})).state,'done');
 });
 const owned=await db.collection('qa_owner').findOne({_id:'cross-rival-integration',database:input.db});
 const roles=await db.collection('players').find({},{projection:{userId:1}}).toArray();
 if(!owned||roles.length!==2||roles.some(r=>!['QA_RIVAL_A','QA_RIVAL_B'].includes(r.userId)))throw Error('QA_CLEANUP_OWNERSHIP');
 await db.dropDatabase();
 console.log(JSON.stringify({result:'PASS',checks:checks.length,names:checks,database:input.db,qaDatabaseRemoved:true,
   realPlayerService:true,realBattleService:true,realMongoDB:true,serverInstances:2,concurrentOSProcesses:2,nativeHandlerContracts:true,nativeBrowserE2E:false,productionPlayerWrites:0}));
 await mongoose.disconnect();
})().catch(async error=>{console.error(JSON.stringify({result:'FAIL',error:error.stack,database:input.db,fixturesPreserved:true,checks}));await mongoose.disconnect();process.exitCode=1;});
