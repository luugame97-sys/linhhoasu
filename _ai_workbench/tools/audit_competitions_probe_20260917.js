'use strict';
// Installed source/config, synthetic players and RAM persistence only.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const app=process.cwd(), clone=v=>JSON.parse(JSON.stringify(v));
let networkAttempts=0,memorySaves=0,memoryLogWrites=0;
const deny=()=>{networkAttempts++;throw Error('AUDIT_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny; require('tls').connect=deny;
for(const p of ['http','https']){require(p).request=deny;require(p).get=deny;} global.fetch=deny;
function stub(rel,exports){const file=require.resolve(path.join(app,rel));require.cache[file]={id:file,filename:file,loaded:true,exports};}
const messages=[];
stub('src/logger',{info(){},debug(){},warn(m){messages.push(String(m));},error(m){messages.push(String(m));}});
stub('src/services/PlayerService',{savePlayer:async(_id,p)=>{memorySaves++;return clone(p);},drainPendingSaves:async()=>{}});
stub('src/services/RuntimeBus',{getWsServer:()=>null});
const redisData=new Map();
stub('src/db/redis',{getClient:()=>({
 async set(k,v,...args){if(args.includes('NX')&&redisData.has(k))return null;redisData.set(k,v);return 'OK';},
 async get(k){return redisData.get(k)||null;},async del(k){redisData.delete(k);return 1;}
})});
let rankValue=1;
stub('src/services/RankService',{getTopN:async()=>[],getRank:async()=>rankValue,updateScore:async()=>{}});
let crossRows=[];const crossWrites=[];
stub('src/db/models/CrossEventEntry',{find:()=>({sort(){return this;},limit(){return this;},lean(){return this;},exec:async()=>clone(crossRows)}),
 updateOne:(_q,u)=>({exec:async()=>{crossWrites.push(clone(u.$set));return {matchedCount:1};}})});
let accountRows=[],playerRows=[];
function query(rows){let fields=null;return {select(f){fields=f;return this;},limit(){return this;},maxTimeMS(){return this;},sort(){return this;},
 async lean(){return clone(rows).map(r=>fields?Object.fromEntries(Object.entries(r).filter(([k])=>k==='_id'||fields[k]||Object.keys(fields).some(f=>f.startsWith(k+'.')))):r);}};}
stub('src/db/models/Account',{find:()=>query(accountRows)});
stub('src/db/models/Player',{find:()=>query(playerRows),findOne:()=>({select(){return this;},lean:async()=>null}),
 updateOne:()=>({exec:async()=>{throw Error('UNEXPECTED_PLAYER_WRITE');}})});
stub('src/db/models/ArenaFightLog',{find:()=>query([]),create:async()=>{memoryLogWrites++;},
 updateOne:()=>({exec:async()=>{memoryLogWrites++;return {matchedCount:1};}})});
const config=require('./src/services/ConfigService'),tables=config.loadAllTables();
const langPath='/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';
const lang=config.decodeTables(fs.readFileSync(langPath)).LanguageConfig;
const battle=require('./src/services/BattleService'),arena=require('./src/handlers/arena'),raid=require('./src/handlers/raid');
const cross=require('./src/services/CrossServerEventService'),appearance=require('./src/services/RoleAppearanceService');
const router=require('./src/router');
router.register(2300,raid.handleStartFight);router.register(4603,arena.handleTopCombatFirstReward);router.register(4604,arena.handleTopCombatSweepReward);
let seq=0;
function player(){const n=++seq;return {_id:String(n).padStart(24,'0'),userId:'audit_ram_'+n,playerId:'audit_ram_'+n,name:'RAM audit',serverId:1001,level:120,
 roleInfo:{kungfuId:4,subJob:0,stage:1,stageId:1},boxInfo:{level:1},equipInfo:{curIndex:0,equipSetMap:{0:{1:{attrs:{1:1e12,2:1e12,3:1e10,4:99999}}}}},
 fashionInfo:{},petInfo:{pets:[]},items:{88:0,10:3},currencies:{diamond:0,silver:0,gold:0},systemUnlockInfo:{unlockedSystem:[],rewardedSystem:[],settings:{}}};}
const session=p=>({userId:p.userId,serverId:1001,player:p});
const ack=(r,t)=>(Array.isArray(r)?r:[r]).find(x=>x.tag===t)?.data;
const name=id=>lang[tables.AssetsConfig[id]?.name]?.cn||'';
const result={at:new Date().toISOString(),scope:'installed source/config; RAM fixtures; no native login',findings:[],controls:[],
 system315:{...tables.SystemConfig[315],label:lang[tables.SystemConfig[315].name]},languageNames:Object.entries(lang).filter(([k,v])=>
 /vo dao hoi|dinh phong dien vo/i.test(JSON.stringify(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D'))).slice(0,15),
 config:{top:tables.TopCombatConfig,assets:[88,89,71].map(id=>({id,name:name(id),restore:tables.AssetsRefreshConfig?.[id]}))},hashes:{arena:crypto.createHash('sha256').update(fs.readFileSync('./src/handlers/arena.js')).digest('hex')}};
(async()=>{
 {const p=player(),s=session(p);const r=ack(await arena.handleTopCombatChallengeInfo({},s,1),4600);
  result.controls.push({id:'TOP_INFO_SHAPE',result:r.result,rank:r.challengeInfo.rank,count:r.challengeInfo.challengeList.length,
   unlocked315:p.systemUnlockInfo.unlockedSystem.includes(315)});
  const first=ack(await router.route(4603,2,{index:1},s),4603);
  const invalid=ack(await router.route(4603,3,{index:11},s),4603);
  result.findings.push({id:'TOP_FIRST_REWARD_NO_RANK_OR_CONFIG_GATE',rank:p.topCombatInfo.maxRank,
   configured:tables.TopCombatFirstRewardConfig[1],first,unknownIndexConfigured:!!tables.TopCombatFirstRewardConfig[11],invalid,wallet:p.currencies});}
 {const p=player(),s=session(p);await arena.handleTopCombatChallengeInfo({},s,1);
  const before=p.topCombatInfo.rank,r1=ack(await router.route(4604,4,{count:2},s),4604),afterFirst=p.topCombatInfo.rank;
  const firstWallet=clone(p.currencies),firstItems=clone(p.items),r2=ack(await router.route(4604,4,{count:2},s),4604);
  result.findings.push({id:'TOP_SWEEP_FREE_RANK_AND_DUPLICATE_REWARD',before,afterFirst,afterReplay:p.topCombatInfo.rank,
   first:r1.rewardInfo,replay:r2.rewardInfo,tickets:p.items[88],firstWallet,wallet:p.currencies,firstItems,items:p.items});}
 {const p=player(),s=session(p);const c=ack(await arena.handleTopCombatChallengeInfo({},s,1),4600).challengeInfo;
  const before=p.topCombatInfo.rank,request={type:10,index:1,enemyid:String(c.infoMap[1].dbid)};
  const r1=ack(await router.route(2300,5,request,s),2300),firstSilver=p.currencies.silver;
  const r2=ack(await router.route(2300,5,request,s),2300);
  result.findings.push({id:'TOP_FIGHT_UNLISTED_TARGET_NO_TICKET_AND_REPLAY',before,targetInChallenge:c.challengeList.includes(1),
   result:r1.result,win:r1.fightResult?.win,after:p.topCombatInfo.rank,tickets:p.items[88],firstSilver,afterReplaySilver:p.currencies.silver,
   rewards:r1.rewards,replayResult:r2.result,entities:r1.fightResult?.entitys?.length,simulator:'real installed BattleService'});}
 {const p=player(),s=session(p);await arena.handleTopCombatChallengeInfo({},s,1);
  const a=ack(await arena.handleTopCombatRefreshChallenge({},s,2),4601),b=ack(await arena.handleTopCombatRefreshChallenge({},s,3),4601);
  result.findings.push({id:'TOP_REFRESH_FREE_AND_SAME_LIST',results:[a.result,b.result],diamonds:p.currencies.diamond,
   sameList:JSON.stringify(a.challengeInfo.challengeList)===JSON.stringify(b.challengeInfo.challengeList),
   seconds:Math.round(b.challengeInfo.refreshtime-Date.now()/1000),configured:tables.TopCombatConfig.combatRefreshTime});}
 {const a=player(),b=player();a.topCombatInfo={protocolVersion:2,rank:1,maxRank:1};b.topCombatInfo={protocolVersion:2,rank:1,maxRank:1};
  const ra=ack(await arena.handleTopCombatRankInfo({},session(a),1),4602),rb=ack(await arena.handleTopCombatRankInfo({},session(b),1),4602);
  result.findings.push({id:'TOP_RANK_PERSONAL_ROBOTS_NOT_SHARED',rankA:ra.rank,rankB:rb.rank,top1A:ra.rankMap[1].dbid,top1B:rb.rankMap[1].dbid,
   robotsA:Object.values(ra.rankMap).filter(x=>/^\d{1,6}$/.test(x.dbid)).length,count:ra.count});}
 {const p=player(),s=session(p);const old=Math.floor(Date.now()/1000)-3600;p.topCombatInfo={protocolVersion:2,rank:9999,maxRank:9999,matchEndTime:old,matchStatus:1};
  const r=ack(await arena.handleTopCombatChallengeInfo({},s,1),4600);
  result.findings.push({id:'TOP_EXPIRED_SEASON_EXTENDED_BY_QUERY',old,now:Math.floor(Date.now()/1000),returned:r.matchEndTime,status:r.matchStatus});}
 {const p=player(),s=session(p);const info=ack(await arena.handleArenaInfo({},s,10),2600),row=info.challengelist.find(x=>x.isRobot);
  if(!row)throw Error('NO_ARENA_ROBOT_FIXTURE');
  const request={type:2,enemyid:row.dbid,challengeVersion:row.challengeVersion,requestId:'audit-arena-retry-1'};
  const before=p.items[10],r1=ack(await arena.handleArenaFight2300(request,s,11),2300),after=p.items[10];
  const r2=ack(await arena.handleArenaFight2300(request,s,12),2300);
  const native=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js','utf8'),addon=fs.readFileSync('/linhhoasu/webgame/game/js/lhs-arena-v1.js','utf8');
  const sent=[],notices=[],timers=new Map();let timerId=0;
  function Base(){}Base.prototype.Rpc=function(tag,data,ok,fail){sent.push({tag,data,ok,fail});};
  function ArenaModel(){}ArenaModel.prototype=Object.create(Base.prototype);ArenaModel.prototype.constructor=ArenaModel;
  function RaidModel(){}RaidModel.prototype=Object.create(Base.prototype);RaidModel.prototype.constructor=RaidModel;
  RaidModel.prototype.sendStartFightPart=function(data){this.Rpc(2300,data,r=>{this.battle=r;});};
  function ArenaRankView(){}ArenaRankView.prototype.updateUI=function(){};
  const c={m:ArenaModel.prototype,A:{ins:()=>({dispatch(){}})},E:{},Object,Array,Number,String,Function,Date,Math,
   console:{warn:m=>notices.push(String(m))},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
   UserInfo:{UserID:'audit',ServerID:1001},GlobalManager:{ArenaModel,RaidInfoModel:RaidModel,ArenaRankView}};
  c.window=c;vm.createContext(c);
  const start=native.indexOf('m.onArenaInfoUpdate=function'),end=native.indexOf('hNe.getArenaTicketMax=function',start);
  vm.runInContext(native.slice(start,end).replace(/,$/,';'),c);vm.runInContext(addon,c);
  const am=c.GlobalManager.ArenaModel=new ArenaModel(),rm=c.GlobalManager.RaidInfoModel=new RaidModel();
  am.onArenaInfo({score:1000,challengelist:[row],loglist:[]});rm.sendStartFightPart({type:2,enemyid:row.dbid});sent.pop().ok(r2);
  result.findings.push({id:'ARENA_REPLAY_INCOMPLETE_FOR_CLIENT',firstResult:r1.result,replayResult:r2.result,recovered:r2.recovered,
   firstEntities:r1.fightResult?.entitys?.length,replayEntities:r2.fightResult?.entitys?.length,
   ticketsBefore:before,ticketsAfter:after,ticketsAfterReplay:p.items[10],score:p.arenaScore,
   clientAcceptsReplay:!!r2.fightResult&&Array.isArray(r2.fightResult.entitys)&&r2.fightResult.entitys.length>=2,
   actualAddonInstalled:!!c.LhsArenaContractV1?.installed,addonOpenedBattle:!!rm.battle,addonNotices:notices});
  result.controls.push({id:'ARENA_FIRST_FIGHT_TICKET_AND_DUPLICATE_DEBIT',pass:r1.result===0&&before-after===1&&p.items[10]===after});
  const wrong=ack(await arena.handleArenaFight2300({...request,requestId:'audit-invalid-target',enemyid:'absent'},s,13),2300);
  result.controls.push({id:'ARENA_INVALID_TARGET_DENIED',result:wrong.result,code:wrong.code});}
 {const p=player(),q=player();q.items={...q.items,...Object.fromEntries(Object.keys(tables.HomelandSkinConfig||{}).map(id=>[id,1]))};
  q.homelandInfo={lv:1,buildingLv:Object.fromEntries(Object.keys(tables.HomelandBuildingConfig||{}).map(id=>[id,10]))};
  q.equipInfo={curIndex:0,equipSetMap:{0:{}}};appearance.ensureRoleAppearance(q);
  const whole=battle.calcPlayerPower(q),power=battle.calcPowerScore(whole);
  accountRows=[{roles:[{serverId:1001,userId:q.userId,lastLoginTime:Date.now()}]}];playerRows=[q];
  const random=Math.random;let rows;
  try{Math.random=()=>0.999999;rows=await arena.buildArenaChallengeList(session(p),p,5,{force:true});}finally{Math.random=random;}
  const row=rows.find(r=>r.playerId===q.playerId);
  if(!row)throw Error('ARENA_REAL_OPPONENT_FIXTURE_MISSING');
  result.findings.push({id:'ARENA_OPPONENT_PROJECTION_DROPS_HOMELAND_ITEMS',fullPower:power,challengePower:row.power,
   fullHp:whole[1],snapshotHp:row.robotAttrs[1],skinIds:Object.keys(tables.HomelandSkinConfig||{})});}
 // Mapping is verified from the served language pack. TopCombat belongs to a
 // different feature and must never be included as a Dinh Phong finding.
 result.outOfScopeFindings=result.findings.filter(f=>f.id.startsWith('TOP_'));
 result.findings=result.findings.filter(f=>!f.id.startsWith('TOP_'));
 result.featureMapping=[305,317].map(id=>({id,label:lang[tables.SystemConfig[id].name]?.cn}));
 result.config.cross=tables.CrossArenaBaseConfig;result.currentCycle=cross.cycleAt();
 result.routeRegistrations=fs.readFileSync('./src/handlers/index.js','utf8').split('\n').filter(s=>/router\.register\((2300|5000|5001|5002),/.test(s)).map(s=>s.trim());
 accountRows=[];playerRows=[];
 {const p=player(),s=session(p);p.items[110]=0;rankValue=42;
  const r=ack(await arena.handleCrossArenaInfo({},s,20),5000),row=r.challengelist[0];
  const request={type:16,enemyid:row.dbid,requestId:'audit-cross-duplicate'};
  // Control only win/loss to make the reward/idempotency checks deterministic.
  const realSimulate=battle.simulateBattle;
  battle.simulateBattle=(a,b,options)=>({...realSimulate(a,b,options),win:true});
  let r1,r2,first;
  try{r1=ack(await router.route(2300,21,request,s),2300);first=clone(p);r2=ack(await router.route(2300,21,request,s),2300);}
  finally{battle.simulateBattle=realSimulate;}
  result.findings.push({id:'CROSS_OFFCYCLE_FREE_TICKET_REPLAY_WRONG_REWARDS',activeCycle:cross.cycleAt().event,
   outcomeControlled:'win for both reward-path calls; simulation still computed by installed engine',
   firstResult:r1.result,replayResult:r2.result,win:r1.win,ticketsAfter:p.items[110],scoreFirst:first.crossArenaInfo.score,
   scoreReplay:p.crossArenaInfo.score,firstRewards:r1.rewards,replayRewards:r2.rewards,firstWallet:first.currencies,wallet:p.currencies,
   firstItems:first.items,items:p.items,logCount:p.crossArenaInfo.loglist.length,dailyCount:p.crossArenaInfo.dailyCount,
   rosterWrites:crossWrites.map(r=>({event:r.event,cycleKey:r.cycleKey,score:r.score}))});
  result.findings.push({id:'CROSS_RANK_FROM_LOCAL_CHALLENGE_NOT_GLOBAL',expectedFixtureGlobalRank:rankValue,
   infoRank:r.rank,infoRankRows:r.ranklist.length,challengeRows:r.challengelist.length,fightRank:r1.rank});
  const refresh1=ack(await arena.handleCrossArenaRefresh({},s,22),5001),refresh2=ack(await arena.handleCrossArenaRefresh({},s,23),5001);
  result.findings.push({id:'CROSS_REFRESH_FREE_NO_COOLDOWN',results:[refresh1.result,refresh2.result],diamonds:p.currencies.diamond,
   sameList:JSON.stringify(refresh1.challengelist)===JSON.stringify(refresh2.challengelist),configuredCost:tables.CrossArenaBaseConfig.arenaRefreshCost});
  const dayNow=Date.now;try{Date.now=()=>dayNow()+86400000;
   const afterDay=ack(await arena.handleCrossArenaInfo({},s,24),5000);
   result.findings.push({id:'CROSS_DAILY_COUNT_NOT_RESET',before:p.crossArenaInfo.dailyCount,nextDay:afterDay.dailyCount,maxCount:afterDay.maxCount});
  }finally{Date.now=dayNow;}}
 {const p=player(),s=session(p),dateNow=Date.now;
  crossRows=[{_id:'1234567890abcdef1234567890abcdef',playerId:'other_server_player',userId:'other_server_user',serverId:1002,
   name:'RAM Cross opponent',level:120,score:1234,payload:{roleInfo:{kungfuId:4}}}];
  const begin=messages.length;
  try{Date.now=()=>Date.parse(cross.schedule.anchor)+7*86400000+1000;
   const r=ack(await arena.handleCrossArenaInfo({},s,30),5000);
   result.findings.push({id:'CROSS_SHARED_ROSTER_REJECTED_MISSING_DBID',activeCycle:cross.cycleAt().event,rosterRows:crossRows.length,
    actualIds:r.challengelist.map(x=>x.dbid),includedRemote:r.challengelist.some(x=>x.playerId==='other_server_player'),
    warnings:messages.slice(begin)});
  }finally{Date.now=dateNow;}}
 {const appSource=fs.readFileSync('./src/app.js','utf8'),start=appSource.indexOf('const tickCross = async () => {'),
  end=appSource.indexOf('crossEventTimer = setInterval',start),source=appSource.slice(start,end);
  const steps=[];
  for(const day of [7,14]){const now=Date.parse(cross.schedule.anchor)+day*86400000+1000,current=cross.cycleAt(now),expected=cross.cycleAt(current.startTime-1);
   let actual;const context=vm.createContext({require:()=>({cycleAt:()=>current}),ConfigService:config,
    crossEventSettlement:{settleCycle:async c=>{actual=c;}}});
   await vm.runInContext(source+';tickCross()',context);
   steps.push({current:current.event,previousExpected:expected.event,previousActual:actual.event,cycleKey:actual.key});}
  result.findings.push({id:'CROSS_SETTLEMENT_WRONG_PREVIOUS_EVENT',steps});}
 result.networkAttempts=networkAttempts;result.productionWrites=0;result.memorySaves=memorySaves;result.memoryLogWrites=memoryLogWrites;
 result.messages=messages.slice(-12);console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
