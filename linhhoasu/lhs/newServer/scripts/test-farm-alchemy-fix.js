'use strict';
// Real handler/config/protocol code with in-memory persistence and no network.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const app = process.env.FEATURE_APP || path.resolve(__dirname, '..');
const runtimeRoot = process.env.FEATURE_RUNTIME || app;
const requireApp = p => require(path.join(app, 'src', p));
const clone = x => JSON.parse(JSON.stringify(x));
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('TEST_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny;
for (const key of ['http', 'https']) { require(key).request = deny; require(key).get = deny; }
global.fetch = deny;
function stub(p, exports) { const key = path.join(app,'src',p);require.cache[key] = { id:key,filename:key,loaded:true,exports }; }
stub('logger.js',{info(){},warn(){},error(){},debug(){}});
const db = new Map(), sessions = new Map(), pushes = [], writes = [];
let fail = null, nextId = 0;
const ps = {
  async savePlayer(id,p) {
    writes.push(id);
    const mode=fail?.id === id ? fail.mode : null;
    if (mode === 'null') { fail=null;return null; }
    if (mode === 'throw') { fail=null;throw Error('SAVE_FAILURE'); }
    db.set(id,{...(db.get(id)||{}),...clone(p)});
    if (mode === 'commit-throw') { fail=null;throw Error('SAVE_UNKNOWN'); }
    return p;
  },
  async savePlayerDeferred(id,p) { return this.savePlayer(id,p); },
  async drainPendingSaves(){}, wasRecentlySaved(){return false;},
  async findByPlayerId(id) { const x=[...db.values()].find(p=>p.playerId===id); return x?clone(x):null; },
  async listPlayersBasic(filter,max) { return [...db.values()].filter(x=>x.playerId!==filter?.playerId?.$ne).slice(0,max).map(clone); },
};
stub('services/PlayerService.js',ps);
const ws={clients:new Map(),getPlayerForMutation:id=>sessions.get(id)?.player,
  invalidatePlayerForMutation(id){if(sessions.has(id))sessions.get(id).player=null;},
  sendResponse(socket,packet){pushes.push({socket,packet:clone(packet)});},
};
stub('services/RuntimeBus.js',{getWsServer:()=>ws});
const cfg=requireApp('services/ConfigService'), tables=cfg.loadAllTables();
for (const name of ['AssetsConfig','ShopConfig','AlchemyFormulaConfig','PlantConfig','PlantMagicConfig']) assert.ok(tables[name] && Object.keys(tables[name]).length, 'MISSING_TEST_CONFIG_'+name);
assert.equal(Object.keys(tables.AlchemyFormulaConfig).length,148);
const farm=requireApp('handlers/farm'), alchemy=requireApp('handlers/alchemy'), item=requireApp('handlers/item');
const locks=requireApp('services/PlayerMutationService'), receipt=requireApp('services/FeatureReceiptService');
const craft=requireApp('services/AlchemyCraftService').craft;
const packet=requireApp('protocol/PacketManager'),codec=requireApp('protocol/Codec');
let requestSeq=0;
const requestId=()=>Date.now()+'-fix_test_'+(++requestSeq);
function fresh(){const id='feature_test_'+(++nextId),p={userId:id,playerId:id,name:'fixture',level:30,exp:0,roleInfo:{stage:1,kungfuId:4},
  items:{29:10,30:10,31:10,100:3,27:10,28:10,32:10,34:10000,33:100,104:3,120101:1,120131:1,2001:100,2101:100,102:1},
  currencies:{diamond:1000,silver:10000,gold:100},farmInfo:{lv:25,exp:0,blockInfo:[],buildLv:{1:1,2:1,3:1}},
  alchemyInfo:{lv:1,level:1,exp:0,dayCount:0},other_attr_info:{},taskInfo:{},rechargeInfo:{records:[],monthCards:{}},shopInfo:{buyRecords:{}}};
  farm.ensureFarmInfo(p);alchemy.ensureAlchemyInfo(p);requireApp('services/FarmDayService').prepare(p);const s={userId:id,player:p};sessions.set(id,s);ws.clients.set(id,{session:s,ws:id});db.set(id,clone(p));return s;}
const rows=r=>Array.isArray(r)?r:[r];
function ack(r,tag){return rows(r).filter(p=>p.tag===tag&&p.msgUid>0).at(-1)?.data;}
const block=(s,index=0)=>s.player.farmInfo.blockInfo.find(b=>b.index===index);
function mature(s,index=0,reward=38,count=40){Object.assign(block(s,index),{rewardId:reward,curCount:count,finishTime:Date.now()-600000,robber:null});db.set(s.userId,clone(s.player));}
async function rng(value,fn){const old=Math.random;Math.random=()=>value;try{return await fn()}finally{Math.random=old;}}
const tests=[];
function test(name,fn){tests.push({name,fn});}
test('normal seeds produce Linh thuc crops, not diamond fallback',async()=>{
  for(const [seed,id]of[[29,38],[30,39],[31,40]]){const s=fresh();const r=await farm.handlePlantInfo({seed,index:0,requestId:requestId()},s,1);assert.equal(ack(r,2400).result,0);assert.equal(block(s).rewardId,id);assert.equal(s.player.items[seed],9);}
});
test('mystery seed uses approved policy and preserves result across reload',async()=>{
  const s=fresh();const r=await farm.handlePlantInfo({seed:100,index:0},s,1);assert.equal(ack(r,2400).result,0);assert.equal(s.player.items[100],2);assert.ok([1,2,4,101].includes(block(s).rewardId));const id=block(s).rewardId;farm.ensureFarmInfo(s.player);assert.equal(block(s).rewardId,id);
});
test('invalid item seed, fractional and locked index rejected',async()=>{
  for(const data of[{seed:2101,index:0},{seed:38,index:0},{seed:29,index:999},{seed:29,index:0.5}]){const s=fresh();const r=await farm.handlePlantInfo(data,s,1);assert.notEqual(ack(r,2400).result,0);assert.equal(s.player.items[29],10);}
});
test('ripe and growing crop cannot be overwritten',async()=>{
  const s=fresh();mature(s);assert.notEqual(ack(await farm.handlePlantInfo({seed:30,index:0},s,1),2400).result,0);assert.equal(block(s).rewardId,38);
});
test('single harvest clears authoritative block; repeat never grants',async()=>{
  const s=fresh();mature(s);const r=await farm.handlePlantHarvest({index:0,requestId:requestId()},s,1);assert.equal(ack(r,2401).result,0);assert.equal(block(s).rewardId,0);const after=s.player.items[34];
  for(let i=0;i<20;i++)assert.notEqual(ack(await farm.handlePlantHarvest({index:0},s,i+2),2401).result,0);assert.equal(s.player.items[34],after);
});
test('concurrent harvest requests serialize',async()=>{
  const s=fresh();mature(s);const r=await Promise.all(Array.from({length:12},(_,i)=>farm.handlePlantHarvest({index:0},s,i+1)));assert.equal(r.filter(x=>ack(x,2401).result===0).length,1);assert.equal(s.player.items[34],10040);
});
test('harvest receipt replay remains safe after replant',async()=>{
  const s=fresh();mature(s);const req={index:0,requestId:requestId()};await farm.handlePlantHarvest(req,s,1);await farm.handlePlantInfo({index:0,seed:29},s,2);await farm.handlePlantHarvest(req,s,3);assert.equal(block(s).rewardId,38);assert.equal(s.player.items[34],10040);
});
test('magic claim uses separate table and cannot repeat without regrow config',async()=>{
  const s=fresh();mature(s,100,1,20);const r=await farm.handlePlantHarvest({index:100},s,1);assert.deepEqual(ack(r,2401).rewards,[{id:2,count:1000}]);assert.notEqual(ack(await farm.handlePlantHarvest({index:100},s,2),2401).result,0);
});
test('normal harvest-all and cache rewards claim once',async()=>{
  const s=fresh();mature(s);await farm.handlePlantHarvestAll({cache:true},s,1);assert.equal(s.player.items[34],10000);assert.equal(s.player.farmInfo.cacheRecover[0].count,40);
  const r=await farm.handleGetCacheReward({},s,2);assert.equal(s.player.items[34],10040);assert.ok(rows(r).some(p=>p.tag===2408));assert.notEqual(ack(await farm.handleGetCacheReward({},s,3),2421).result,0);
});
test('fertilizer unknown/free/fractional requests rejected',async()=>{
  const s=fresh();await farm.handlePlantInfo({seed:29,index:0},s,1);const time=block(s).finishTime;
  for(const data of[{index:0,itemId:0,count:10},{index:0,itemId:2101,count:1},{index:0,itemId:27,count:0},{index:0,itemId:27,count:1.5}])assert.notEqual(ack(await farm.handlePlantSpeedUp(data,s,2),2406).result,0);
  assert.equal(block(s).finishTime,time);
});
test('fertilizer valid cost and grow bonus',async()=>{
  const s=fresh();s.player.farmInfo.buildLv={1:10,2:10,3:10};const start=Date.now();await farm.handlePlantInfo({seed:29,index:0},s,1);assert.ok(block(s).finishTime-start<7200000);const old=block(s).finishTime;
  await farm.handlePlantSpeedUp({index:0,itemId:27,count:1},s,2);assert.equal(old-block(s).finishTime,1800000);assert.equal(s.player.items[27],9);
});
test('legacy free planting unavailable',async()=>{const s=fresh();assert.notEqual(ack(await farm.handlePlantMonth({seed:40,index:0},s,1),2420).result,0);assert.equal(block(s).rewardId,0);});
test('building uses current-level time and five minutes per ticket',async()=>{
  const s=fresh(),before=Date.now();await farm.handleBuildUpgrade({index:1},s,1);assert.ok(Math.abs(s.player.farmInfo.buildUpgrade[1]-before-30000)<100);
  s.player.farmInfo.buildUpgrade[1]=Date.now()+3600000;const old=s.player.farmInfo.buildUpgrade[1];await farm.handleBuildSpeedup({index:1,count:1},s,2);assert.equal(old-s.player.farmInfo.buildUpgrade[1],300000);
});
test('completed building settles before next upgrade',async()=>{const s=fresh();s.player.farmInfo.buildUpgrade[1]=Date.now()-1;await farm.handleBuildUpgrade({index:1},s,1);assert.equal(s.player.farmInfo.buildLv[1],2);});
test('daily support requires feature unlock, shares quota, gives correct seeds',async()=>{
  const s=fresh(),ad=requireApp('handlers/commerce-compat');assert.notEqual(ack(await ad.handleAdReward({adId:1},s,1),1220).result,0);
  s.player.systemUnlockInfo={unlockedSystem:[303]};
  for(let i=0;i<2;i++){if(s.player.other_attr_info.adInfo?.timeRecords)s.player.other_attr_info.adInfo.timeRecords[1]=Date.now()-31000;assert.equal(ack(await ad.handleAdReward({adId:1,requestId:requestId()},s,i+2),1220).result,0);}
  assert.equal(s.player.items[29],16);assert.notEqual(ack(await ad.handleAdReward({adId:1},s,4),1220).result,0);
});
test('build daily support reduces configured seconds and requires unlock',async()=>{
  const s=fresh();s.player.farmInfo.buildUpgrade[1]=Date.now()+3600000;const old=s.player.farmInfo.buildUpgrade[1];assert.notEqual(ack(await farm.handleBuildSpeedup({index:1,ad:1},s,1),2413).result,0);assert.equal(s.player.farmInfo.buildUpgrade[1],old);
  s.player.systemUnlockInfo={unlockedSystem:[303]};await farm.handleBuildSpeedup({index:1,ad:1},s,2);assert.equal(old-s.player.farmInfo.buildUpgrade[1],1800000);
});
test('self steal, missing mice, protected remainder rejected',async()=>{
  const a=fresh(),b=fresh();mature(a);mature(b);assert.notEqual(ack(await farm.handlePlantLevelOrRob({dbid:a.userId,index:0,count:1},a,1),2402).result,0);
  a.player.items[104]=0;assert.notEqual(ack(await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:1},a,2),2402).result,0);assert.equal(a.player.items[104],0);
  a.player.items[104]=3;mature(b,0,38,12);assert.notEqual(ack(await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:1},a,3),2402).result,0);
});
test('two thieves cannot reserve same plot',async()=>{
  const a=fresh(),b=fresh(),owner=fresh();mature(owner);
  const r=await Promise.all([farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},a,1),farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},b,2)]);
  assert.equal(r.filter(x=>ack(x,2402).result===0).length,1);
});
test('opposite direction locking has no deadlock',async()=>{
  const a=fresh(),b=fresh();mature(a);mature(b);await Promise.all([farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:1},a,1),farm.handlePlantLevelOrRob({dbid:a.userId,index:0,count:1},b,2)]);
});
test('cancellation only by owning thief; second plot same owner rejected',async()=>{
  const a=fresh(),b=fresh(),owner=fresh();mature(owner);mature(owner,1);await farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},a,1);
  assert.notEqual(ack(await farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:0},b,2),2402).result,0);
  assert.notEqual(ack(await farm.handlePlantLevelOrRob({dbid:owner.userId,index:1,count:1},a,3),2402).result,0);
});
test('steal settlement pays Linh thuc, not hidden crop id',async()=>{
  const a=fresh(),owner=fresh();mature(owner);await farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},a,1);
  a.player.farmInfo.roblist[0].finishtime=Date.now()-1;block(owner).finishTime=Date.now()-1;db.set(a.userId,clone(a.player));db.set(owner.userId,clone(owner.player));
  await farm.handlePlantFightLogCheck({},a,2);assert.equal(a.player.items[34],10004);assert.equal(a.player.items[38],undefined);assert.equal(block(owner).curCount,36);
  await farm.handlePlantFightLogCheck({},a,3);assert.equal(a.player.items[34],10004);
});
test('settlement outbox recovers after claimant save failure',async()=>{
  const a=fresh(),owner=fresh();mature(owner);await farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},a,1);
  a.player.farmInfo.roblist[0].finishtime=Date.now()-1;block(owner).finishTime=Date.now()-1;db.set(a.userId,clone(a.player));db.set(owner.userId,clone(owner.player));
  fail={id:a.userId,mode:'throw'};await assert.rejects(farm.handlePlantFightLogCheck({},a,2));assert.equal(a.player,null);
  a.player=clone(db.get(a.userId));await farm.handlePlantFightLogCheck({},a,3);assert.equal(a.player.items[34],10004);assert.equal(block(owner).curCount,36);
});
test('view another farm performs no write; online inventory authoritative',async()=>{
  const a=fresh(),owner=fresh(),n=writes.length;owner.player.items[2101]=999;
  await farm.handlePlantEnemyUpdate({dbid:owner.userId},a,1);assert.equal(writes.length,n);assert.equal(owner.player.items[2101],999);
});
test('shop ladder, cache invalidate and herb chain',async()=>{
  const s=fresh();await item.handleGetItems({},s,1);await item.handleGetItems({id:6000003,count:1,requestId:requestId()},s,2);assert.equal(s._itemListCache,null);assert.equal(s.player.items[2101],101);
  await item.handleGetItems({id:6000001,count:1},s,3);assert.equal(s.player.currencies.diamond,990);
  await item.handleGetItems({id:6000001,count:1},s,4);assert.equal(s.player.currencies.diamond,965);
});
test('shop null/failed save invalidates session; no success ACK',async()=>{for(const mode of ['null','throw','commit-throw']){const s=fresh();fail={id:s.userId,mode};await assert.rejects(item.handleGetItems({id:6000003,count:1},s,1));assert.equal(s.player,null);}});
test('shop receipt replay after lost ACK does not spend twice',async()=>{const s=fresh(),p={id:6000003,count:1,requestId:requestId()};await item.handleGetItems(p,s,1);s.player=clone(db.get(s.userId));await item.handleGetItems(p,s,2);assert.equal(s.player.items[2101],101);assert.equal(s.player.items[34],9950);});
test('alchemy normal level push and actual pills',async()=>{const s=fresh();const r=await rng(0,()=>alchemy.handleGenerate({id:120101,count:5,requestId:requestId()},s,1));assert.equal(s.player.alchemyInfo.level,2);assert.equal(s.player.items[110102],5);assert.ok(rows(r).some(p=>p.tag===2500&&p.msgUid===0&&p.data.level===2));});
test('alchemy full failure costs, no pill; invalid id and auto routing',async()=>{
  const s=fresh();const r=await rng(.999,()=>alchemy.handleAutoGenerate({id:120131,count:1,exchange:0},s,1));assert.equal(ack(r,2501).failed,1);assert.equal(s.player.items[110131],undefined);
  assert.ok(ack(await alchemy.handleGenerate({id:120131,count:1},s,2),2500).rejected);assert.ok(ack(await alchemy.handleGenerate({id:999,count:1},s,3),2500).rejected);
});
test('alchemy privileged cap 22 and auto stop code',async()=>{
  const s=fresh(),echo=cfg.get('CuriosEchoConfig')[9010];s.player.other_attr_info.curiosInfo={curiosData:echo.suit.map(id=>({id,star:9}))};s.player.items[110131]=20;
  const r=await rng(0,()=>alchemy.handleAutoGenerate({id:120131,count:5,exchange:1},s,1));assert.equal(ack(r,2501).count,2);assert.equal(ack(r,2501).result,1);assert.equal(s.player.items[110131],22);
});
test('alchemy commit-then-throw replay uses persisted receipt',async()=>{
  const s=fresh(),p={id:120101,count:1,requestId:requestId()};fail={id:s.userId,mode:'commit-throw'};await assert.rejects(rng(0,()=>alchemy.handleGenerate(p,s,1)));assert.equal(s.player,null);s.player=clone(db.get(s.userId));
  const herb=s.player.items[2001];await alchemy.handleGenerate(p,s,2);assert.equal(s.player.items[110102],1);assert.equal(s.player.items[2001],herb);
});
test('alchemy daily quota concurrency and relog',async()=>{
  const s=fresh();s.player.alchemyInfo.dayCount=cfg.get('AlchemyBaseConfig').alchemyDailyCount-1;
  const r=await Promise.all([alchemy.handleGenerate({id:120101,count:1},s,1),alchemy.handleGenerate({id:120101,count:1},s,2)]);assert.equal(r.filter(x=>!ack(x,2500).rejected).length,1);
  const restored=clone(db.get(s.userId));alchemy.ensureAlchemyInfo(restored);assert.equal(restored.alchemyInfo.dayCount,cfg.get('AlchemyBaseConfig').alchemyDailyCount);
});
test('148 recipes with configured cost and reward',async()=>{
  for(const formula of Object.values(tables.AlchemyFormulaConfig)){const s=fresh();s.player.roleInfo.stage=formula.stageId;s.player.items[formula.id]=1;
    for(const row of formula.consumes)if(![1,2,6].includes(row.id))s.player.items[row.id]=row.count*3;
    const r=craft(s.player,{id:formula.id,count:1,exchange:0},tables.AssetsConfig[formula.id].subType===3,()=>0);assert.equal(r.count,1);assert.equal(tables.AssetsConfig[r.items[0].id].type,8);}
});
test('unsafe herb use denied and pill stage conditions checked',async()=>{const s=fresh();assert.notEqual(ack(await item.handleUseItem({index:2101,count:1},s,1),1300).result,0);s.player.items[110231]=1;assert.notEqual(ack(await item.handleUseItem({index:110231,count:1},s,2),1300).result,0);});
test('invalid level preserved as legacy and safe client level',async()=>{const s=fresh();s.player.alchemyInfo.level=100;alchemy.ensureAlchemyInfo(s.player);assert.equal(s.player.alchemyInfo.level,60);assert.equal(s.player.alchemyInfo.legacyLevel,100);});
test('receipt bounded eviction and request hash conflict',async()=>{
  const s=fresh(),p={requestId:requestId(),count:1};receipt.record(s.player,2500,p,{count:1});assert.throws(()=>receipt.read(s.player,2500,{...p,count:2}));
  for(let i=0;i<100;i++)receipt.record(s.player,2500,{requestId:requestId(),count:1},{count:1});assert.equal(s.player.other_attr_info.featureReceipts.rows.length,64);assert.throws(()=>receipt.read(s.player,2500,p));
});
test('native packet encode/decode for normal rewards',async()=>{
  const s=fresh(),r=await rng(0,()=>alchemy.handleGenerate({id:120101,count:1},s,1));for(const p of rows(r)){const b=packet.packSingle(p.tag,p.data,p.msgUid);assert.deepEqual(codec.Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length))[0].data,p.data);}
});
test('recovery honors elapsed hours without inventing daily seed grants',async()=>{
  const s=fresh(),recovery=requireApp('services/FarmRecoveryService');s.player.items[27]=0;s.player.farmInfo.foodRestoreTime=Date.now()-7200000;
  recovery.settle(s.player);assert.equal(s.player.items[27],2);s.player.farmInfo.resourceDay=20000101;s.player.items[29]=0;recovery.settle(s.player);assert.equal(s.player.items[29],0);
  s.player.farmInfo.resourceDay=20000101;s.player.items[29]=20;recovery.settle(s.player);assert.equal(s.player.items[29],20);
});
test('missing farm target does not become empty fake player',async()=>{const s=fresh();assert.notEqual(ack(await farm.handlePlantEnemyUpdate({dbid:'missing'},s,1),2404).result,0);});
test('fight resolves from battle service and rejects absent robber',async()=>{
  const a=fresh(),b=fresh();mature(a);assert.notEqual(ack(await farm.handleFightRobber({index:0,dbid:b.userId},a,1),2412).result,0);
  await farm.handlePlantLevelOrRob({dbid:a.userId,index:0,count:1},b,2);
  const battle=requireApp('services/BattleService'),old=battle.simulateBattle;
  try {for(const win of [false,true]){battle.simulateBattle=()=>({win});const r=await farm.handleFightRobber({index:0,dbid:b.userId},a,3);assert.equal(ack(r,2412).fightResult.win,win?1:0);assert.equal(!!block(a).robber,!win);}}
  finally{battle.simulateBattle=old;}
});
test('paid drive away limit and unowned skin rejected',async()=>{
  const a=fresh(),b=fresh();mature(a);await farm.handlePlantLevelOrRob({dbid:a.userId,index:0,count:1},b,1);
  assert.notEqual(ack(await farm.handleDriveAway({index:0,dbid:b.userId},a,2),2422).result,0);
  a.player.rechargeInfo.monthCards[11000012]=Date.now()+86400000;assert.equal(ack(await farm.handleDriveAway({index:0,dbid:b.userId},a,3),2422).result,0);
  const skin=Object.keys(tables.PlantThiefConfig).map(Number).find(x=>x>0);if(skin)assert.notEqual(ack(await farm.handleRatSkinChange({id:skin},a,4),2423).result,0);
});
test('source native callbacks + packet dispatch reach bag and alchemy model',async()=>{
  const mainPath=process.env.FEATURE_MAIN || path.resolve(runtimeRoot,'../../webgame/game/js/main.min_a6195824.js');const main=fs.readFileSync(mainPath,'utf8');
  const acorn=require(process.env.FEATURE_ACORN || path.join(runtimeRoot,'node_modules/acorn'));
  function fn(marker){const at=main.indexOf(marker);assert.ok(at>=0);let n=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];assert.equal(n.type,'FunctionExpression');return main.slice(n.start,n.end);}
  const s=fresh(),events=[],errors=[],itemModel={_itemMap:clone(s.player.items),_timeRecords:{},_composeIdDict:{},getItemType:id=>tables.AssetsConfig[id]?.type,isFreeze:false};
  const alchemyModel={_lv:1,_dayCount:0},land={_cacheUseItem:{29:1},getLv:()=>1},Y={Config:tables,ItemModel:itemModel,AlchemyModel:alchemyModel,LandModel:land,CuriosModel:{taskCheck(){}},MessageCenter:{dispatch(){}},RepeatRpcBlockModel:{setRpcRecord(){}}};
  let timer=0;const ctx=vm.createContext({m:itemModel,C:alchemyModel,l:{},Y,E:new Proxy({},{get:(_,x)=>String(x)}),A:{ins:()=>({dispatch:(...args)=>events.push(args)})},S:{ins:()=>({showTipsByLangId(){}})},console:{error:x=>errors.push(String(x))},clearTimeout(){},setTimeout(){return ++timer}});
  for(const name of ['onItemChange','SetItemCount','GetItemCount'])vm.runInContext('m.'+name+'='+fn('m.'+name+'=function'),ctx);
  for(const name of ['sendGenerate','sendAutoGenerate','onLvUpdate','setDayCount'])vm.runInContext('C.'+name+'='+fn('C.'+name+'=function'),ctx);
  vm.runInContext('l.onSocketRead='+fn('l.onSocketRead=function'),ctx);
  let pending=[];const socket=Object.assign(ctx.l,{recvPack:{length:0},socket_:{readBytes(){}},_lhsRpcTimerMap:{},_resListenerMap:{},_resListenerErrorMap:{},Unpack:()=>pending.splice(0),localNetMsgLog(){},m_RpcReqHandlerDict:{1202:d=>itemModel.onItemChange(d),2500:d=>alchemyModel.onLvUpdate(d)}});
  let callbackData;alchemyModel.Rpc=(tag,p,cb)=>{socket._resListenerMap[100]=cb;};alchemyModel.sendGenerate(120101,5,d=>callbackData=d);
  const r=await rng(0,()=>alchemy.handleGenerate({id:120101,count:5},s,100));
  for(const p of rows(r)){const b=packet.packSingle(p.tag,p.data,p.msgUid);pending.push(...codec.Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)));}
  socket.onSocketRead();assert.equal(errors.length,0);assert.equal(itemModel.GetItemCount(110102),5);assert.equal(alchemyModel._lv,2);assert.equal(callbackData.count,5);
});
test('client guard keeps unrelated RPC intact and releases failed reservations',async()=>{
  const code=fs.readFileSync(process.env.FEATURE_PATCH || path.resolve(app,'../../webgame/game/js/lhs-farm-alchemy-v2.js'),'utf8');const calls=[],tips=[];
  function GameSocket(){}GameSocket.prototype.Rpc=function(tag,p,cb,ctx,err){calls.push({tag,p,cb,ctx,err});};const original=GameSocket.prototype.Rpc;
  const land={_cacheUseItem:{29:1}},Y={Config:tables,LandModel:land,RepeatRpcBlockModel:{setRpcRecord(){}}};const window={GameSocket,W:Y,UserTips:{ins:()=>({showTips:x=>tips.push(x)})}};
  vm.runInNewContext(code,{window,Date,Math});const socket=new GameSocket();const cb=()=>{};socket.Rpc(4010,{id:1},cb);assert.equal(calls[0].cb,cb);assert.ok(!calls[0].p.requestId);
  let run=0;socket.Rpc(2400,{seed:29,index:0},()=>run++);assert.equal(calls[1].tag,2499);const player=fresh().player;const epoch=receipt.createEpoch(player);calls[1].cb(epoch);
  assert.ok(calls[2].p.requestId);receipt.read(player,2400,calls[2].p);calls[2].cb({result:1});assert.equal(run,0);assert.equal(land._cacheUseItem[29],0);
  const wrapped=GameSocket.prototype.Rpc;vm.runInNewContext(code,{window,Date,Math});assert.equal(GameSocket.prototype.Rpc,wrapped);assert.notEqual(wrapped,original);
});
test('mixed farm and unrelated shop request rejected atomically',async()=>{
  const s=fresh(),before=JSON.stringify(s.player);const outsider=Object.values(tables.ShopConfig).find(x=>x.payId===0&&!requireApp('services/FarmShopService').scoped(x.id));assert.ok(outsider);
  const r=await item.handleMultiBuyItem({require:{6000003:1,[outsider.id]:1}},s,1);assert.equal(ack(r,1202).code,'MIXED_FARM_SHOP_REQUEST');assert.equal(JSON.stringify(s.player),before);
});
test('month-card alias routes preserve tag and require entitlement',async()=>{
  const s=fresh();assert.equal(ack(await farm.handleCardAction(2428,{index:0},s,1),2428).result,2);
  s.player.rechargeInfo.monthCards[11000012]=Date.now()+86400000;
  const r=await farm.handleCardAction(2428,{index:0,requestId:requestId()},s,2);assert.equal(ack(r,2428).result,0);assert.ok(s.player.farmInfo.cookInfo[0].finishTime>Date.now());
});
test('normal second cooker requires manager card',async()=>{
  const s=fresh();
  const r=await farm.handleCook({index:1,requestId:requestId()},s,3);
  assert.equal(ack(r,2416).result,2);
  assert.equal(ack(r,2416).code,'FARM_MANAGER_CARD_REQUIRED');
  assert.equal(s.player.farmInfo.cookInfo[1].reward,0);
  s.player.rechargeInfo.monthCards[11000012]=Date.now()+86400000;
  const ok=await farm.handleCook({index:1,requestId:requestId()},s,4);
  assert.equal(ack(ok,2416).result,0);
});
test('read-only self auto poll does not persist magic-field materialization',async()=>{
  const s=fresh();
  s.player.farmInfo.blockInfo=s.player.farmInfo.blockInfo.filter(b=>b.index<100);
  db.set(s.userId,clone(s.player));
  const writesBefore=writes.length;
  await farm.handlePlantDetailAuto({dbid:s.player.playerId},s,5);
  assert.equal(writes.length,writesBefore);
  assert.equal(db.get(s.userId).farmInfo.blockInfo.some(b=>b.index>=100&&b.rewardId>0),false);
  assert.equal(s.player.farmInfo.blockInfo.filter(b=>b.index>=100&&b.rewardId>0).length,0);
});
test('manager privilege can double dumpling reward server-side',async()=>{
  const s=fresh();
  s.player.rechargeInfo.monthCards[11000012]=Date.now()+86400000;
  const old=Math.random;let rolls=[0.99,0];
  Math.random=()=>rolls.shift() ?? 0;
  try {
    const r=await farm.handleCook({index:0,requestId:requestId()},s,6);
    assert.equal(ack(r,2416).result,0);
    assert.equal(ack(r,2416).cookReward,50);
  } finally { Math.random=old; }
});
test('neighbor feed reduces another farm plot with bounded daily quota',async()=>{
  const sender=fresh(),owner=fresh();
  Object.assign(block(owner),{rewardId:38,curCount:40,finishTime:Date.now()+3600000,robber:null});
  db.set(owner.userId,clone(owner.player));
  const before=block(owner).finishTime;
  for(let i=0;i<5;i++){
    const r=await farm.handlePlantSpeedUp({dbid:owner.userId,index:0,itemId:32,count:1,requestId:requestId()},sender,20+i);
    assert.equal(ack(r,2406).result,0);
  }
  assert.equal(sender.player.items[32],5);
  assert.equal(db.get(owner.userId).farmInfo.blockInfo.find(b=>b.index===0).finishTime,before-1500000);
  const blocked=await farm.handlePlantSpeedUp({dbid:owner.userId,index:0,itemId:32,count:1,requestId:requestId()},sender,30);
  assert.equal(ack(blocked,2406).code,'NEIGHBOR_FEED_LIMIT');
});
test('new mystery weights respected only in their correct namespace',async()=>{
  const base=tables.PlantBaseConfig,old=base.seedRewards,oldMagic=base.magicFieldRewards;
  try {
    base.seedRewards={100:[{id:101,weight:5}]};base.magicFieldRewards=[{id:12,weight:1}];
    const s=fresh();await farm.handlePlantInfo({index:0,seed:100},s,1);assert.equal(block(s).rewardId,101);assert.equal(block(s,100).rewardId,12);
    assert.equal(block(s,100).curCount,1);
  } finally { if(old===undefined)delete base.seedRewards;else base.seedRewards=old;if(oldMagic===undefined)delete base.magicFieldRewards;else base.magicFieldRewards=oldMagic; }
});
test('growing/locked/thief plots excluded from harvest-all',async()=>{
  const s=fresh();s.player.farmInfo.lv=1;mature(s,5);Object.assign(block(s),{rewardId:38,curCount:40,finishTime:Date.now()+10000});
  const r=await farm.handlePlantHarvestAll({},s,1);assert.deepEqual(ack(r,2407).indexs,[]);assert.equal(s.player.items[34],10000);
});
test('after successful settlement outbox cleaned; failed claim leaves it recoverable',async()=>{
  const a=fresh(),owner=fresh();mature(owner);await farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},a,1);
  a.player.farmInfo.roblist[0].finishtime=Date.now()-1;block(owner).finishTime=Date.now()-1;db.set(a.userId,clone(a.player));db.set(owner.userId,clone(owner.player));
  await farm.handlePlantFightLogCheck({},a,2);assert.equal(owner.player.farmInfo.stealOutbox.length,0);assert.equal(db.get(owner.userId).farmInfo.stealOutbox.length,0);
});
test('same-role lock reentry supported, lock upgrade rejected without deadlock',async()=>{
  let n=0;await locks.run('lock-fixture',()=>locks.run('lock-fixture',()=>n++));assert.equal(n,1);
  await assert.rejects(locks.run('lock-fixture',()=>locks.runMany(['lock-fixture','other'],()=>n++)),/LOCK_UPGRADE_DENIED/);assert.equal(n,1);
});
async function main(){const results=[];for(const t of tests){try{await t.fn();results.push({name:t.name,pass:true});}catch(e){results.push({name:t.name,pass:false,error:e.stack});}finally{fail=null;}}
  const failed=results.filter(r=>!r.pass);const report={result:failed.length?'FAIL':'PASS',count:tests.length,productionWrites:0,networkAttempts,failed};console.log(JSON.stringify(report,null,2));if(failed.length||networkAttempts)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
