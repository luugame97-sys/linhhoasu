'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=process.env.DROP46_ROOT||path.resolve(__dirname,'../temp/drop46_release_20260914');
const app=process.env.DROP46_APP||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
const base=root+'/linhhoasu/lhs/newServer',cand=root+'/candidate';
const clone=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>assert.deepEqual(clone(a),clone(b));
function mod(file,deps={},extra={}) {
  const m={exports:{}};
  const context=vm.createContext({module:m,exports:m.exports,console:{log(){},info(){},warn(){},error(){}},
    require(n){if(n in deps)return deps[n];if(n.startsWith('node:')||['fs','path','zlib','crypto'].includes(n))return require(n);throw Error('UNMOCKED '+n+' in '+file);},
    process:{env:{SERVER_ID:'1001',DROP_LEVEL_46_ENABLED:'1'}},Buffer,Date,setTimeout,clearTimeout,...extra});
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});return {value:m.exports,context};
}
const bins=require(app+'/src/protocol/BinJsonUtil');
const decoder=mod(base+'/src/services/ConfigService.js',{'../protocol/BinJsonUtil':bins,'../logger':{info(){}}},{__dirname:path.dirname(base+'/src/services/ConfigService.js')}).value;
const baseline=decoder.decodeTables(fs.readFileSync(root+'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'));
const cfg=clone(baseline),policy=mod(cand+'/src/config/dropLevel46.js').value; policy.apply(cfg);
const config={get:n=>cfg[n],loadAllTables:()=>cfg};
const locks=require(base+'/src/services/PlayerMutationService');
const currencies=require(app+'/src/services/CurrencySync');
let mode='ok',durable=null,saves=0,invalidated=0,now=1790000000000;
class Clock extends Date {static now(){return now;}}
const ps={drainPendingSaves:async()=>{},savePlayer:async(id,p)=>{
  assert(locks.holds(id));saves++;await Promise.resolve();
  if(mode==='null')return null;if(mode==='throw')throw Error('TEST_SAVE_ERROR');
  durable=clone(p);if(mode==='commit-throw')throw Error('TEST_COMMIT_TIMEOUT');return p;
}};
const pilot=mod(cand+'/src/services/DropLevel46Service.js',{'./ConfigService':config,'./PlayerService':ps,
  './PlayerMutationService':locks,'./CurrencySync':currencies,'../utils/boxTiming':require(base+'/src/utils/boxTiming'),
  '../config/dropLevel46':policy,'./MainTaskProgressService':{refreshMainTaskProgress(){}},
  './RuntimeBus':{getWsServer:()=>({invalidatePlayerForMutation(){invalidated++;}})}},{Date:Clock}).value;
function session(extra={}){mode='ok';saves=0;return {userId:'drop46_fixture',player:{userId:'drop46_fixture',serverId:1001,level:100,
  currencies:{silver:340000000,gold:87120,diamond:123},items:{4:17,20:11},boxInfo:{level:45,exp:0,upgradeFinishTime:0,tier:10,tierExp:4},
  settings:{keep:true},equipInfo:{untouched:true},...extra}};}
const reply=(r,tag)=>r.find(x=>x.tag===tag&&x.msgUid!==0)?.data||r.find(x=>x.tag===tag)?.data;
const checks=[];async function test(name,fn){await fn();checks.push(name);}
(async()=>{
await test('binary + overlay limited to cost45 and new46',()=>{for(const n of Object.keys(baseline))if(n!=='BoxConfig')same(cfg[n],baseline[n]);for(let n=1;n<45;n++)same(cfg.BoxConfig[n],baseline.BoxConfig[n]);same(cfg.BoxConfig[45].equipQualityWeight,baseline.BoxConfig[45].equipQualityWeight);assert.equal(cfg.BoxConfig[45].timeCost/86400,302.5);assert.equal(cfg.BoxConfig[46].levelUpCost.length,0);assert.equal(cfg.BoxConfig[46].mapBossShow,204);});
await test('S2/S3 inert including flag accidentally set',()=>{for(const id of ['1002','1003']){const t=clone(baseline),p=mod(cand+'/src/config/dropLevel46.js',{}, {process:{env:{SERVER_ID:id,DROP_LEVEL_46_ENABLED:'1'}}}).value;p.apply(t);same(t,baseline);}});
await test('native client config parity and S1-S2-S1 switching',()=>{const t=clone(baseline),m=mod(root+'/client_drop46_function.js',{}, {Y:{Config:t}}).value,owner={};m.call(owner,1001);same(clone(t.BoxConfig),cfg.BoxConfig);m.call(owner,1002);same(t,baseline);m.call(owner,1001);same(clone(t.BoxConfig),cfg.BoxConfig);m.call(owner,1003);same(t,baseline);});
await test('340m silver + 87120 skips -> level46, receipt and relog',async()=>{const s=session();for(let i=1;i<=5;i++){assert.equal(reply(await pilot.handle(2100,{},s,i),2100).result,0);assert.equal(s.player.boxInfo.exp,i);}assert.equal(s.player.currencies.silver,0);assert.equal(s.player.boxInfo.upgradeFinishTime-now,26136000000);assert.equal(s.player.boxInfo.drop46Receipt.silverSpent,340000000);const result=await pilot.handle(2101,{count:87120},s,6);assert.equal(reply(result,2101).level,46);assert.equal(s.player.currencies.gold,0);assert.equal(durable.boxInfo.level,46);assert.equal(durable.boxInfo.drop46Receipt.skipsSpent,87120);same(s.player.equipInfo,{untouched:true});assert.equal(s.player.items[20],11);const relog={userId:s.userId,player:clone(durable)};assert.equal(reply(await pilot.handle(2102,{},relog,7),2102).level,46);assert.equal(reply(await pilot.handle(2100,{},relog,8),2100).result,-2);});
await test('concurrent duplicate msgUid charged once',async()=>{const s=session();await Promise.all(Array.from({length:20},()=>pilot.handle(2100,{},s,12)));assert.equal(saves,1);assert.equal(s.player.boxInfo.exp,1);assert.equal(s.player.currencies.silver,272000000);});
await test('insufficient silver does not mutate/save',async()=>{const s=session({currencies:{silver:67999999,gold:0,diamond:0}}),before=clone(s.player);assert.equal(reply(await pilot.handle(2100,{},s,1),2100).result,-1);same(s.player,before);assert.equal(saves,0);});
await test('insufficient skips and fractional request cannot consume',async()=>{const s=session();for(let i=1;i<=5;i++)await pilot.handle(2100,{},s,i);s.player.currencies.gold=1;const b=clone(s.player);assert.equal(reply(await pilot.handle(2101,{count:2},s,6),2101).result,-1);same(s.player,b);assert.equal(reply(await pilot.handle(2101,{count:.1},s,7),2101).result,-1);});
await test('partial progress preserved, timer elapsed settles once',async()=>{const s=session();s.player.boxInfo.exp=4;await pilot.handle(2100,{},s,1);assert.equal(s.player.currencies.silver,272000000);now+=26136000000;await pilot.handle(2102,{},s,2);assert.equal(s.player.boxInfo.level,46);await pilot.handle(2102,{},s,3);assert.equal(s.player.boxInfo.level,46);});
for(const failure of ['null','throw','commit-throw']) await test('save '+failure+' cannot ACK success or keep stale session',async()=>{const s=session(),original=s.player;mode=failure;await assert.rejects(()=>pilot.handle(2100,{},s,1));assert.equal(s.player,null);assert.equal(original.boxInfo.exp,0);assert.equal(original.currencies.silver,340000000);});
await test('invalid level/exp rejected',async()=>{for(const box of [{level:47,exp:0},{level:45,exp:9}]){const s=session();Object.assign(s.player.boxInfo,box);await assert.rejects(()=>pilot.handle(2100,{},s,1));assert.equal(saves,0);}});
// Evaluate the exact live box functions without changing their implementation.
const boxSrc=fs.readFileSync(base+'/src/handlers/box.js','utf8');
const boxDeps={'../services/PlayerService':{},'../services/ConfigService':config,'../services/BattleService':{},'../services/EquipService':{},'./raid':{},'../services/MainTaskProgressService':{},'../services/RealmTaskProgressService':{},'../services/RoleAppearanceService':{},'../logger':{},'../services/RuntimeBus':{},'../services/MapMonsterService':{},'../services/AlchemyMaterialDropService':{},'../services/RewardSync':{}};
const bm={exports:{}},bctx=vm.createContext({module:bm,exports:bm.exports,require:n=>{if(n in boxDeps)return boxDeps[n];throw Error(n);},Math:Object.create(Math),Date,console});
vm.runInContext(boxSrc+'\nmodule.exports.test={rollEquipQuality,buildEquipTemplateId,buildOpenInfo};',bctx);const bx=bm.exports.test;
await test('10000 deterministic probability buckets exact + all12 slots',()=>{const counts={};for(let i=0;i<10000;i++){bctx.Math.random=()=> (i+.5)/10000;const q=bx.rollEquipQuality(cfg.BoxConfig[46]);counts[q]=(counts[q]||0)+1;}same(counts,{38:5339,39:3010,40:922,41:461,42:200,43:59,44:8,45:1});for(let q=38;q<=45;q++)for(let s=1;s<=12;s++){const id=bx.buildEquipTemplateId(q,s,cfg.AssetsConfig);assert.equal(cfg.AssetsConfig[id].quality,q);assert.equal(cfg.AssetsConfig[id].subType,s);}});
await test('boss all15 templates quality45, regular drop level stays player level',()=>{bctx.Math.random=()=>.5;let r=bx.buildOpenInfo({level:100,boxInfo:{level:46}},15,{qualityFloor:45,forceQualities:[6,5,4],includeExp:true});assert.equal(r.lv,100);assert.equal(r.items.filter(x=>x.id!==3).reduce((s,x)=>s+x.count,0),15);for(const row of r.items.filter(x=>x.id!==3))assert.equal(cfg.AssetsConfig[row.id].quality,45);});
const equip=mod(base+'/src/services/EquipService.js',{'./ConfigService':config,'./CurrencySync':currencies,'./RoleAppearanceService':{unlockEquipAppearance(){}}},{Date:Clock}).value;
await test('quality45 all slots attrs follow unchanged 14.2x and 95-105% variance',()=>{for(let slot=1;slot<=12;slot++){const e=equip.createEquipFromTemplateId(75100+slot,100,{});assert.equal(e.quailty,45);assert.equal(e.type,slot);assert.equal(e.lv,100);const bases={1:2650,2:820,3:310,4:205};for(const [k,n]of Object.entries(bases)){const b=Math.floor(n*14.2);assert(e.attrs[k]>=Math.floor(b*.95)&&e.attrs[k]<=Math.floor(b*1.05));}assert.equal(Object.keys(e.attrs).length,5);}});
console.log(JSON.stringify({result:'PASS',checks:checks.length,names:checks,productionWrites:0,persistence:'mocked confirmed save + relog copy, not live Mongo',invalidated,config45:cfg.BoxConfig[45],config46:cfg.BoxConfig[46]},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
