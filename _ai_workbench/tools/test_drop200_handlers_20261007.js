'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),app=process.env.DROP200_APP||path.join(root,'linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH=process.env.CONFIG_BIN_PATH||path.join(root,'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
process.env.SERVER_ID='1001';process.env.DROP_LEVEL_100_ENABLED='1';process.env.ROLE_LEVEL_2000_ENABLED='1';
const cfg=require(path.join(app,'src/services/ConfigService'));cfg.loadAllTables();
const sourceMap=JSON.parse(process.env.DROP200_CANDIDATE_MAP||'{}');
const read=p=>fs.readFileSync(sourceMap[p]||p,'utf8');
let now=1791300000000;class Clock extends Date{static now(){return now;}}
function mod(p,deps={},extra={}){const m={exports:{}};vm.runInNewContext(read(p),{module:m,exports:m.exports,require:n=>{if(n in deps)return deps[n];if(n.startsWith('node:'))return require(n);throw Error('UNMOCKED:'+n)},Date:Clock,process:{env:process.env},console:{log(){},info(){},warn(){},error(){}},setTimeout,clearTimeout,Buffer,...extra},{filename:p});return m.exports;}
const currency=require(path.join(app,'src/services/CurrencySync'));
const equip=mod(path.join(app,'src/services/EquipService.js'),{'./ConfigService':cfg,'./CurrencySync':currency,'./RoleAppearanceService':{unlockEquipAppearance(){}}});
const compact=require(path.join(app,'src/services/DropCompactSaleService')).createService(equip);
let saves=0,durable=null,failSave=false;
const players={drainPendingSaves:async()=>{},savePlayer:async(_id,p)=>{saves++;if(failSave)return null;durable=JSON.parse(JSON.stringify(p));return p;},savePlayerDeferred:async(_id,p)=>{saves++;durable=JSON.parse(JSON.stringify(p));return p;}};
const box=mod(path.join(app,'src/handlers/box.js'),{
 '../services/PlayerService':players,'../services/ConfigService':cfg,'../services/BattleService':{},'../services/ArenaReadModelService':{},'../services/EquipService':equip,
 './raid':{addRewardToPlayer(p,id,count){p.items[id]=(p.items[id]||0)+count;if(id===2)p.currencies.silver=p.items[2];}},
 '../services/MainTaskProgressService':{addBagelConsume(){},addEliteMonsterKillCount(){}},'../services/RealmTaskProgressService':{addBagelConsume(){}},
 '../services/RoleAppearanceService':{},'../logger':{info(){},warn(){},debug(){}},'../services/RuntimeBus':{getWsServer(){return null;}},
 '../services/MapMonsterService':{},'../services/AlchemyMaterialDropService':{},'../services/RewardSync':{buildRewardItemSync(p,items){return{items};}},'../services/DropCompactSaleService':compact,
});
const locks=require(path.join(app,'src/services/PlayerMutationService'));
const timing=require(path.join(app,'src/services/DropProgressionTimingService'));
const upgrade=mod(path.join(app,'src/services/DropLevel46Service.js'),{
 './ConfigService':cfg,'./PlayerService':players,'./PlayerMutationService':locks,'./CurrencySync':currency,
 '../utils/boxTiming':require(path.join(app,'src/utils/boxTiming')),'../config/dropLevel46':{isEnabled:()=>false},'../config/dropLevel100':require(path.join(app,'src/config/dropLevel100')),
 './MainTaskProgressService':{refreshMainTaskProgress(){}},'./RuntimeBus':{getWsServer:()=>({invalidatePlayerForMutation(){}})},'./DropProgressionTimingService':timing,
});
function player(){return{serverId:1001,level:2000,items:{1:100000000,2:1e12,4:1000,6:1e9},currencies:{silver:1e12,gold:1e9,diamond:100000000},boxInfo:{level:100,tier:200,exp:0,tierExp:0},equipInfo:{equipList:[],openListMap:{0:[]},equipSetMap:{0:{}},curIndex:0}};}
function data(r,tag){return(Array.isArray(r)?r:[r]).find(p=>p.tag===tag&&p.msgUid>0)?.data;}
let checks=0;async function test(name,fn){await fn();checks++;console.log(JSON.stringify({name,status:'PASS'}));}
(async()=>{
 await test('timer migration preserves paid progress and runs once',()=>{const p=player();p.boxInfo.level=99;p.boxInfo.tier=99;p.boxInfo.exp=5;p.boxInfo.tierExp=5;const old=cfg.get('BoxConfig')[99].dropTimingOldTimeCost;p.boxInfo.upgradeFinishTime=now+old*500;const money=JSON.stringify(p.items);assert(timing.migratePlayer(p,now));assert.equal(p.boxInfo.upgradeFinishTime,now+cfg.get('BoxConfig')[99].timeCost*500);assert.equal(p.boxInfo.exp,5);assert.equal(p.boxInfo.level,99);assert.equal(JSON.stringify(p.items),money);const snapshot=JSON.stringify(p);assert.equal(timing.migratePlayer(p,now+1000),false);assert.equal(JSON.stringify(p),snapshot);});
 await test('server rejects exceeding authoritative tier',()=>{const p=player();p.boxInfo.tier=101;assert.equal(box.getAuthoritativeDelegateCount(p,200),101);p.boxInfo.tier=200;assert.equal(box.getAuthoritativeDelegateCount(p,99999),200);});
 for(const sellAll of [true,false])await test('claim200 exact rewards, manual='+!sellAll,async()=>{const p=player();const old=equip.createEquipFromTemplateId(cfg.get('DropEquipTemplateConfig')[99][1],100,p);equip.addOpenEquip(p,old);const session={userId:'ram_only',player:p,pendingBoxReward:{count:200,lv:2000,items:[{id:200199101,count:100},{id:200198112,count:100},{id:3,count:2000},{id:2001,count:9}],sellAllEquipments:sellAll}};const r=await box.handleBoxReward({},session,1),reward=data(r,2001).rewardInfo;assert.equal(reward.items.find(x=>x.id===3).count,2000);assert.equal(p.items[2001],9);assert.equal(new Set(p.equipInfo.equipList.map(e=>e.uid)).size,p.equipInfo.equipList.length);assert(p.equipInfo.equipList.some(e=>e.uid===old.uid));if(sellAll){assert.equal(reward.equips.length,0);assert.equal(reward.compactEquipment.sold,200);const sum=100*(199*25+2000*5)+100*(198*25+2000*5);assert.equal(reward.items.find(x=>x.id===2).count,sum);assert.equal(p.items[2],1e12+sum);assert.equal(p.equipInfo.equipList.length,1);}else{assert.equal(reward.equips.length,200);assert.equal(p.equipInfo.equipList.length,201);}const before=JSON.stringify(p);await box.handleBoxReward({},session,2);assert.equal(JSON.stringify(p),before);assert.deepEqual(JSON.parse(JSON.stringify(durable)),JSON.parse(JSON.stringify(p)));});
 await test('100->200 500 payments,100timers,single cap',async()=>{const s={userId:'ram_upgrade',player:player()};s.player.boxInfo.tier=100;let uid=1;for(let lv=100;lv<200;lv++){const row=cfg.get('BoxConfig')[lv],before=s.player.currencies.silver;for(let j=0;j<5;j++){const r=await upgrade.handle(2100,{},s,uid++);assert.equal(data(r,2100).result,0);}assert.equal(before-s.player.currencies.silver,row.levelUpCost.reduce((a,b)=>a+b,0));assert.equal(s.player.boxInfo.upgradeFinishTime-now,row.timeCost*1000);const count=Math.ceil(row.timeCost/300);const r=await upgrade.handle(2101,{count},s,uid++);assert.equal(data(r,2101).level,lv+1);assert.equal(s.player.boxInfo.exp,0);}assert.equal(s.player.boxInfo.level,200);assert.equal(data(await upgrade.handle(2100,{},s,uid++),2100).result,-2);});
 await test('concurrent duplicate at199 charges once',async()=>{const s={userId:'ram_dupe',player:player()};s.player.boxInfo.level=199;saves=0;await Promise.all(Array.from({length:10},()=>upgrade.handle(2100,{},s,777)));assert.equal(saves,1);assert.equal(s.player.boxInfo.exp,1);});
 await test('unconfirmed save fails without optimistic level',async()=>{const s={userId:'ram_failure',player:player()};const original=s.player;failSave=true;await assert.rejects(()=>upgrade.handle(2100,{},s,888));failSave=false;assert.equal(original.boxInfo.exp,0);assert.equal(s.player,null);});
 console.log(JSON.stringify({result:'PASS',checks,productionWrites:0,networkAttempts:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
