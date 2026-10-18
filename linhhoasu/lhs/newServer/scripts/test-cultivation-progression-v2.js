'use strict';
// Execute real gameplay functions with storage/network denied and in-memory CAS.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const clone=x=>JSON.parse(JSON.stringify(x));
process.env.ROLE_LEVEL_2000_ENABLED='1';process.env.SERVER_ID='1001';
let networkAttempts=0;
const deny=()=>{networkAttempts++;throw Error('TEST_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;
for(const mod of ['http','https']){require(mod).request=deny;require(mod).get=deny;}global.fetch=deny;
const app=path.resolve(__dirname,'..');
function stub(rel,value){const p=path.join(app,'src',rel);require.cache[p]={id:p,filename:p,loaded:true,exports:value};}
stub('logger.js',{info(){},warn(){},error(){},debug(){}});
let persisted={},writes=0,failSave=false,casConflict=false,invalidations=0;
const owned=['level','exp','roleInfo','items','currencies','other_attr_info','taskInfo'];
stub('services/PlayerService.js',{
  async drainPendingSaves(){},async loadPlayer(){return clone(persisted);},
  async savePlayer(_id,patch,opts){
    if(failSave)throw Error('fixture-save-failed');
    assert(opts.cultivationCAS,'new path missing CAS');
    if(casConflict)return false;
    for(const k of owned)assert.deepEqual(opts.cultivationCAS[k],persisted[k],'CAS '+k);
    require('../src/services/CurrencySync').syncCurrencyItems(patch);
    persisted={...persisted,...clone(patch)};writes++;return true;
  }, async savePlayerDeferred(){throw Error('DEFERRED_SAVE_NOT_ALLOWED');}
});
stub('services/RuntimeBus.js',{getWsServer:()=>({invalidatePlayerForMutation(){invalidations++;}})});
stub('services/ServerConfigService.js',{findServerConfig:async()=>({openTime:Date.now()-864000000})});
const load=Module._load;
class Schema{constructor(){this.statics={};this.methods={};}index(){}pre(){}}
Schema.Types={Mixed:class{}};
Module._load=function(req,parent,main){
 if(req==='mongoose'){const connection={models:{},model:()=>({}),useDb(){return this;}};return {Schema,model:connection.model,connection};}
 if(req==='ioredis')return class{};
 return load.call(this,req,parent,main);
};
const config=require('../src/services/ConfigService'),tables=config.loadAllTables();
const raid=require('../src/handlers/raid'),upgrade=require('../src/handlers/upgrade'),payload=require('../src/handlers/playerPayload'),mutation=require('../src/services/PlayerMutationService');
const combat=require('../src/services/BattleService'),equipment=require('../src/services/EquipService'),drops=require('../src/services/AlchemyMaterialDropService');
const policy=require('../src/config/roleLevel2000');
const packets=x=>Array.isArray(x)?x:[x];
const ack=x=>packets(x).find(p=>p.tag===3103)?.data;
let count=0,requestSequence=0;
function fresh(stage=45){
 const row=tables.RoleStageConfig[stage],need=tables.RoleLevelConfig[row.levelMax].exp;
 const p={_id:'111111111111111111111111',userId:'cultivation_fixture',playerId:'cultivation_fixture',name:'fixture',level:row.levelMax,exp:need,
  items:{3:need,4:10000,111512:5,111502:5},currencies:{diamond:0,silver:0,gold:0},
  roleInfo:{stage,stageId:stage,stageFailedTime:0,rewardedStage:45,kungfuId:4},raidInfo:{level:700,chapter:1},
  boxInfo:{level:100,tier:10},taskInfo:{tasks:{},tasksMap:{}},other_attr_info:{realmTaskProgress:{bagelConsume:10000}},
  petInfo:{pets:[]},equipInfo:{curIndex:0,equipSetMap:{0:{}},openListMap:{0:[]}}};
 persisted=clone(p);writes=0;failSave=false;casConflict=false;return {userId:p.userId,serverId:1001,player:p};
}
const request=(stage,extra={})=>({stage,cultivationVersion:policy.VERSION,requestId:'realm_fixture_'+(++requestSequence),items:[],...extra});
async function test(name,work){try{await work();count++;}catch(e){e.message=name+': '+e.message;throw e;}}
const oldRandom=Math.random;
(async()=>{
 await test('metadata in real login packet without mutating input',()=>{
  const s=fresh(),before=clone(s.player),wire=payload.buildPlayer500Data(s.player);
  assert.equal(wire.cultivation.version,policy.VERSION);assert.deepEqual(s.player,before);
 });
 await test('reject old client, skip, missing request and resources before any save',async()=>{
  for(const kind of ['client','skip','request','level','exp','task','pill','duplicatePill','unknownPill']){
   const s=fresh();const r=request(46);
   if(kind==='client')delete r.cultivationVersion;if(kind==='skip')r.stage=48;if(kind==='request')delete r.requestId;
   if(kind==='level')s.player.level=1304;if(kind==='exp'){s.player.exp=1;s.player.items[3]=1;}if(kind==='task')s.player.other_attr_info.realmTaskProgress.bagelConsume=0;
   if(kind==='pill')r.items=[{id:111512,count:10}];if(kind==='duplicatePill')r.items=[{id:111512,count:1},{id:111512,count:1}];if(kind==='unknownPill')r.items=[{id:1,count:1}];
   persisted=clone(s.player);const before=clone(persisted);const a=ack(await upgrade.handleStageUpgrade(r,s,1));
   assert.equal(a.result,-1,kind);assert.equal(writes,0,kind);assert.deepEqual(persisted,before);assert.deepEqual(s.player,before);
  }
 });
 await test('all three new breakthroughs, exact debit, durable replay, no duplicate reward',async()=>{
  Math.random=()=>0;
  for(const stage of [45,46,47]){
   const s=fresh(stage),p=s.player,row=tables.RoleStageConfig[stage],pill=row.itemIds[0],r=request(stage+1,{items:[{id:pill,count:1}]});
   const pre=int(p.items[pill]);const first=await upgrade.handleStageUpgrade(r,s,2);
   assert.equal(ack(first).result,0);assert.equal(p.roleInfo.stage,stage+1);assert.equal(p.roleInfo.stageId,stage+1);
   assert.equal(p.items[pill],pre-1);assert.equal(p.other_attr_info.realmTaskProgress.bagelConsume,0);assert.equal(writes,1);
   assert.deepEqual(persisted.roleInfo,p.roleInfo);const after=clone(persisted);
   const repeat=await upgrade.handleStageUpgrade(r,s,3);assert.equal(ack(repeat).recovered,true);assert.equal(writes,1);assert.deepEqual(persisted,after);
   const relog={...s,player:clone(persisted)};assert.equal(ack(await upgrade.handleStageUpgrade(r,relog,4)).recovered,true);assert.equal(writes,1);
   p.roleInfo.rewardedStage=45;const noDouble=await upgrade.handleClaimStageReward({},s,5);assert.equal(noDouble.data.code,'CULTIVATION_REWARD_ON_BREAKTHROUGH');assert.equal(writes,1);
  }
 });
 await test('failure pity and receipt do not reroll or consume twice',async()=>{
  Math.random=()=>0.999999;const s=fresh(),r=request(46,{items:[{id:111512,count:1}]});
  assert.equal(ack(await upgrade.handleStageUpgrade(r,s,1)).result,-1);assert.equal(s.player.roleInfo.stageFailedTime,1);
  const w=writes;assert.equal(ack(await upgrade.handleStageUpgrade(r,s,2)).recovered,true);assert.equal(writes,w);
  for(let i=0;i<4;i++)assert.equal(ack(await upgrade.handleStageUpgrade(request(46),s,3+i)).result,-1);
  assert.equal(s.player.roleInfo.stageFailedTime,5);assert.equal(ack(await upgrade.handleStageUpgrade(request(46),s,8)).result,0);
 });
 await test('same request in concurrent sessions pays once',async()=>{
  Math.random=()=>0;const s=fresh(),r=request(46);const second={...s,player:s.player};
  const a=await Promise.all([upgrade.handleStageUpgrade(r,s,1),upgrade.handleStageUpgrade(r,second,2)]);
  assert.equal(writes,1);assert.equal(a.filter(x=>ack(x).recovered).length,1);
 });
 await test('save failure and CAS conflict leave original intact',async()=>{
  for(const conflict of [false,true]){Math.random=()=>0;const s=fresh(),before=clone(s.player);failSave=!conflict;casConflict=conflict;
   const a=ack(await upgrade.handleStageUpgrade(request(46),s,9));assert.equal(a.code,'CULTIVATION_COMMIT_UNKNOWN');assert.equal(s.player,null);assert.deepEqual(persisted,before);assert.equal(writes,0);
  }
 });
 await test('max2000 and legacy tag600 cannot bypass terminal',async()=>{
  const s=fresh(48);assert.equal(ack(await upgrade.handleStageUpgrade(request(49),s,2)).code,'CULTIVATION_MAX_STAGE');
  const res=await upgrade.handleStageBreak({},s,4);assert.equal(res.data.result,-1);assert.equal(s.player.roleInfo.stage,48);assert.equal(writes,0);
  s.player.exp=1e12;s.player.items[3]=1e12;raid.checkLevelUp(s.player);assert.equal(s.player.level,2000);assert.equal(s.player.roleInfo.stage,48);
 });
  await test('level-up and breakthrough retain EXP surplus',()=>{
   const p={level:1,exp:250,items:{3:250},roleInfo:{stage:1,stageId:1}};
   raid.checkLevelUp(p);
   assert.equal(p.level,3);assert.equal(p.exp,30);assert.equal(p.items[3],30);
   const capped={level:5,exp:600,items:{3:600},roleInfo:{stage:1,stageId:1}};
   raid.checkLevelUp(capped);
   assert.equal(capped.level,5);assert.equal(capped.exp,600);assert.equal(capped.items[3],600);
   capped.roleInfo.stage=capped.roleInfo.stageId=2;
   raid.checkLevelUp(capped);
   assert.equal(capped.level,8);assert.equal(capped.exp,0);
  });
 await test('actual levelling stops at every realm gate then advances to2000',()=>{
  const s=fresh(46);
  for(const [stage,start,end]of [[46,1305,1500],[47,1500,1750],[48,1750,2000]]){
   s.player.roleInfo.stage=s.player.roleInfo.stageId=stage;s.player.level=start;
   for(let n=start;n<end;n++){s.player.exp=tables.RoleLevelConfig[n].exp;s.player.items[3]=s.player.exp;raid.checkLevelUp(s.player);assert.equal(s.player.level,n+1);}
   s.player.exp=tables.RoleLevelConfig[end].exp;s.player.items[3]=s.player.exp;raid.checkLevelUp(s.player);assert.equal(s.player.level,end);assert.equal(s.player.roleInfo.stage,stage);
  }
 });
 await test('stage48 material fallback, generated gear, finite PK/PVE',()=>{
  const s=fresh(48);assert.equal(drops.currentTier(s.player),15);
  const e=equipment.createEquipFromTemplateId(75101,2000,s.player);assert.equal(e.lv,2000);for(const n of Object.values(e.attrs))assert(Number.isSafeInteger(n)&&n>=0);
  const stats=combat.calcPlayerPower(s.player);for(const n of Object.values(stats))assert(Number.isFinite(n)&&n>=0);
  const enemy=combat.getMonsterAttrs(200048);for(const options of [{},{isPvp:true,formulaVersion:'custom-pvp-v1'}]){const f=combat.simulateBattle(stats,enemy,options);assert(Number.isFinite(f.playerHPLeft));}
 });
 assert.equal(networkAttempts,0);
 console.log(JSON.stringify({result:'PASS',groups:count,networkAttempts,productionWrites:0,invalidations,cap:2000,stage:48}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{Math.random=oldRandom;Module._load=load;});
function int(v){return Math.max(0,Number(v)||0);}
