'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),app=process.env.DROP200_APP||path.join(root,'linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH=process.env.CONFIG_BIN_PATH||path.join(root,'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
process.env.SERVER_ID='1001';process.env.DROP_LEVEL_100_ENABLED='1';process.env.ROLE_LEVEL_2000_ENABLED='1';
const sourceMap=JSON.parse(process.env.DROP200_CANDIDATE_MAP||'{}');
const C=require(path.join(app,'src/services/ConfigService')),tables=C.loadAllTables();
const timing=require(path.join(app,'src/utils/boxTiming'));
let now=1791300000000,saves=0,invalidations=0,saveMode='ok';
class Clock extends Date { static now(){return now;} }
const mutation={holds:()=>true,run:async(_id,fn)=>fn()};
const playerService={savePlayer:async(_id,p)=>{saves++;if(saveMode==='throw')throw Error('TEST_SAVE_FAILED');return saveMode==='null'?null:p;},drainPendingSaves:async()=>{}};
const actualPlayers=require(path.join(app,'src/services/PlayerService')),actualRuntime=require(path.join(app,'src/services/RuntimeBus'));
const oldDrain=actualPlayers.drainPendingSaves,oldSave=actualPlayers.savePlayer,oldBus=actualRuntime.getWsServer;
actualPlayers.drainPendingSaves=playerService.drainPendingSaves;actualPlayers.savePlayer=playerService.savePlayer;actualRuntime.getWsServer=()=>({invalidatePlayerForMutation(){invalidations++;}});
const noop=()=>{};
const stub=new Proxy({}, {get:()=>noop});
const runtime={getWsServer:()=>({invalidatePlayerForMutation:()=>{invalidations++;}})};
let payload;
function load(file){const actual=path.join(app,file),module={exports:{}};
  function req(id){
    if(id.endsWith('/ConfigService'))return C;
    if(id.endsWith('/PlayerService'))return playerService;
    if(id.endsWith('/PlayerMutationService'))return mutation;
    if(id.endsWith('/RuntimeBus'))return runtime;
    if(id.endsWith('/boxTiming'))return timing;
    if(id.endsWith('/CurrencySync'))return require(path.join(app,'src/services/CurrencySync'));
    if(id.endsWith('/DropProgressionTimingService'))return require(path.join(app,'src/services/DropProgressionTimingService'));
    if(id.endsWith('/DropTierMutationService'))return require(path.join(app,'src/services/DropTierMutationService'));
    if(id.endsWith('/TaskPerfService'))return {nowNs:()=>0n,recordTaskNormalizeNs:noop};
    if(id.endsWith('/FishingEventSchedule'))return {taskRows:()=>[]};
    if(id==='./playerPayload')return payload;
    if(id==='./dungeon')return {ensureDungeonRaidInfo:noop};
    if(id.endsWith('/MainTaskProgressService'))return {refreshMainTaskProgress:noop};
    if(id==='node:crypto'||id==='crypto')return require(id);
    if(id.includes('mongo')||id.includes('redis')||id.includes('/db/'))throw Error('DB_REQUIRE_BLOCKED:'+id);
    return stub;
  }
  vm.runInNewContext(fs.readFileSync(sourceMap[actual]||actual,'utf8'),{module,exports:module.exports,require:req,Date:Clock,process,console,Buffer,setTimeout,clearTimeout},{filename:actual});
  return module.exports;
}
payload=load('src/handlers/playerPayload.js');
const handlers=load('src/handlers/compat.js');
function fixture(tier){return {userId:'ram-only',player:{level:2000,roleInfo:{stage:48},raidInfo:{demonBossInfo:{stage:48}},other_attr_info:{mainTaskProgress:{dungeonBossMaxMapId:48}},currencies:{diamond:1e9,gold:1e9,silver:0},items:{1:1e9,6:1e9},boxInfo:{level:200,tier,tierExp:0,tierUpTime:0},taskInfo:{tasks:{}}}};}
function response(out,tag){return (Array.isArray(out)?out:[out]).filter(x=>x.tag===tag).at(-1).data;}
let checks=0;
async function test(name,fn){await fn();checks++;console.log(JSON.stringify({name,status:'PASS'}));}
(async()=>{
 await test('real payload derives all tier tasks from authoritative snapshot',async()=>{
  const s=fixture(100),normalized=payload.normalizeTaskInfo(s.player.taskInfo,s.player.roleInfo,s.player);
  for(let t=100;t<=199;t++)for(const id of tables.BoxTierConfig[t].task){const task=normalized.tasks[id];assert(task);assert.equal(task.status,20);assert(task.progress>=task.target);}
 });
 await test('actual 2150/2152 handlers advance every tier99 through200',async()=>{
  const s=fixture(99);
  for(let t=99;t<200;t++){
   const before=s.player.currencies.diamond,cost=tables.BoxTierConfig[t].tierUpCost.reduce((a,b)=>a+b,0);
   for(let step=0;step<5;step++){const result=response(await handlers.handleBoxTierUp2150({},s,1000+t*10+step),2150);assert.equal(result.result,0);assert.equal(s.player.boxInfo.tier,t);assert.equal(s.player.boxInfo.tierExp,step+1);}
   assert.equal(before-s.player.currencies.diamond,cost);
   assert.equal(s.player.boxInfo.tierUpTime-now,tables.BoxTierConfig[t].timeCost*1000);
   now=s.player.boxInfo.tierUpTime;
   assert.equal(response(await handlers.handleBoxTierCheck2152({},s,5000+t),2152).tier,t+1);
   assert.equal(s.player.boxInfo.tierExp,0);assert.equal(s.player.boxInfo.tierUpTime,0);
  }
  const money=s.player.currencies.diamond;
  for(let i=0;i<3;i++)await handlers.handleBoxTierUp2150({},s,9000+i);
  assert.equal(s.player.boxInfo.tier,200);assert.equal(s.player.boxInfo.tierUpTime,0);assert.equal(s.player.currencies.diamond,money);
 });
 await test('unmet level/role/boss requirement rejects without charge',async()=>{
  for(const kind of ['level','role','boss']){
   const s=fixture(199);if(kind==='level')s.player.boxInfo.level=1;if(kind==='role')s.player.level=1;
   if(kind==='boss'){s.player.roleInfo.stage=1;s.player.raidInfo.demonBossInfo.stage=0;s.player.other_attr_info.mainTaskProgress.dungeonBossMaxMapId=0;}
   const before=s.player.currencies.diamond,saveBefore=saves;
   assert.equal(response(await handlers.handleBoxTierUp2150({},s,9100),2150).result,-2);
   assert.equal(s.player.currencies.diamond,before);assert.equal(s.player.boxInfo.tierExp,0);assert.equal(saves,saveBefore);
  }
 });
 await test('insufficient NB no charge or progress',async()=>{
  const s=fixture(199);s.player.currencies.diamond=1;
  assert.equal(response(await handlers.handleBoxTierUp2150({},s,9200),2150).result,-1);
  assert.equal(s.player.currencies.diamond,1);assert.equal(s.player.boxInfo.tierExp,0);
 });
 await test('speedup exact skip cost completes one tier',async()=>{
  const s=fixture(199);for(let i=0;i<5;i++)await handlers.handleBoxTierUp2150({},s,9300+i);
  const before=s.player.currencies.gold,required=Math.ceil(tables.BoxTierConfig[199].timeCost*1000/timing.getBoxSkipUnitMs());
  assert.equal(response(await handlers.handleBoxTierSpeedUp2151({count:required+500},s,9400),2151).result,0);
  assert.equal(before-s.player.currencies.gold,required);assert.equal(s.player.boxInfo.tier,200);assert.equal(s.player.boxInfo.tierUpTime,0);
 });
 const failureObservations=[];
 for(const mode of ['null','throw']){
  const s=fixture(100),before=s.player.currencies.diamond,inv=invalidations;saveMode=mode;let threw=false,out;
  try{out=await handlers.handleBoxTierUp2150({},s,9500);}catch(_err){threw=true;}
  failureObservations.push({mode,threw,ackSuccess:!!out&&response(out,2150).result===0,sessionInvalidated:s.player===null,invalidations:invalidations-inv,sessionCharged:!!s.player&&s.player.currencies.diamond<before});
 }
 saveMode='ok';
 actualPlayers.drainPendingSaves=oldDrain;actualPlayers.savePlayer=oldSave;actualRuntime.getWsServer=oldBus;
 console.log(JSON.stringify({result:'PASS',checks,tiersAdvanced:101,productionWrites:0,mockSaves:saves,failureObservations,limits:'Real compat, mutation receipt and native payload normalization; dungeon reconciliation and unrelated features stubbed.'}));
})().catch(err=>{actualPlayers.drainPendingSaves=oldDrain;actualPlayers.savePlayer=oldSave;actualRuntime.getWsServer=oldBus;console.error(err.stack);process.exitCode=1;});
