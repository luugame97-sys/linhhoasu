'use strict';
// Replay shipped Role/Gem callbacks in the login packet order, no network or game mutation.
const {extract,src,root}=require('./inspect_fishing_background_20260907');
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),net=require('net');
net.Socket.prototype.connect=()=>{throw Error('AUDIT_NETWORK_DENIED');};
process.env.LOG_DIR='';const tables=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService')).loadAllTables();
const clone=v=>JSON.parse(JSON.stringify(v)),events=[],ctx={O:Math,E:{ATTR_CHANGE:'ATTR_CHANGE',Gem_Info_Update:'Gem_Info_Update',ROLE_ATTR_UPDATE:'ROLE_ATTR_UPDATE'},Y:{Config:tables},T:{serverTimeMilli:1000},sht:{RegDate:0},So:{MS_PER_DAY:86400000},S:{ins:()=>({showPowerTip(){}})},platform:{onGameEvent(){}},ec:{copyDataHandler:clone},eO:{attrAddition:(a,b)=>{const r={...a};for(const[k,v]of Object.entries(b||{}))r[k]=(r[k]||0)+v;return r;}}};
const context=vm.createContext(ctx);function method(marker,offset){return vm.runInContext('('+extract(marker,offset).source+')',context);}
const role={_roleInfo:{kungfuId:4},_oldPower:0,_mapAttrs:{},_allAttrs:{},_modifyAttrs:{},getStageAttr:()=>({})};
for(const name of ['changeAllAttr','changeAttr','integrationAttrs','attrModify','calRolePower','calAllPower','getAllAttr','getEmptyAttrList'])role[name]=method('C.'+name+'=function',6263000);
role.onPowerChange=function(){this._oldPower=this.calAllPower();};
ctx.A={ins:()=>({dispatch:(name,...args)=>{events.push({name,args});if(name==='ATTR_CHANGE')role.changeAttr(...args);}})};
ctx.eO.calPowerByAttr=method('calPowerByAttr=function',4840000);
for(const name of ['EquipModel','MountModel','FormationModel','PetModel','FashionModel','ItemModel','ArtifactModel','SpiritModel','GemModel','FateModel','FishingModel','ValhallaModel','BloodlineModel','CuriosModel','ElfModel','HomelandModel','ValhallaFormationModel','PetSoulModel','OldTrekModel','SpecSpiritModel'])ctx.Y[name]={getAttrs:()=>({}),getAllAttrs:()=>({}),calPrivilegeMap(){}};
ctx.Y.EquipModel.getAttrs=()=>({1:10000,2:100});ctx.Y.FishingModel.getAttrs=()=>({1:5000,2:50});ctx.Y.RoleModel=role;
const gem={_info:null,_testList:[]};ctx.Y.GemModel=gem;
for(const name of ['initData','handleTestList','getAttrs','getPlacedGemAttrMap','getPlacedGemDataList','getPlacedGemPosList','getPlacedGemPos','getAllGem','getEchoLv','getPlacedTotalScore','checkGemFull'])gem[name]=method('m.'+name+'=function',6086400);
assert(src.includes('t._info=null,t._gemBlockPool=[],t._testList=[]'),'GEM_CONSTRUCTOR_BASELINE');
const login=fs.readFileSync(path.join(root,'linhhoasu/lhs/newServer/src/handlers/account.js'),'utf8');
const packet500=login.indexOf('messages.push(player500Message);'),packet3900=login.indexOf('tag: 3900,',packet500),packet6900=login.indexOf('tag: 6900,',packet500);assert(packet500>0&&packet3900>packet500&&packet6900>packet500);
const playerInit=extract('m.onPlayerInfo=function',6224000).source;assert(playerInit.includes('A.ins().dispatch(E.ATTR_CHANGE)'));
const gemPacket={plan:{id:1,positions:[{uid:1,row:0,col:0}]},gems:[{uid:1,id:25051,shapeId:103}],exchangeTimes:0,fieldCount:30};
ctx.A.ins().dispatch('ATTR_CHANGE');const after500=role.calAllPower(),gemCacheAt500=clone(role._mapAttrs[10]);
gem.initData(clone(gemPacket));const after3900=role.calAllPower(),gemActual=gem.getAttrs();
assert.equal(after500,after3900);assert(Object.values(gemActual).some(x=>x>0));assert.notDeepEqual(role._mapAttrs[10],gemActual);
// Same rod id is deliberate: the ACK triggers a full recalculation without adding gear.
const rod={fishInfo:{rodId:5901},startCheckMonthCardTimer(){},Rpc:(tag,params,done)=>done({result:0,id:params.id})};ctx.Y.RaidMgr={mFishRaid:null};ctx.Y.CuriosModel.taskCheck=()=>{};
const switchRod=method('u.sendRodSwitch=function',4630000);switchRod.call(rod,5901);const afterRod=role.calAllPower();assert(afterRod>after3900);assert.deepEqual(role._mapAttrs[10],gemActual);
const ownedGemSnapshot=clone(gem._info);ctx.A.ins().dispatch('ATTR_CHANGE');const stableSecondRefresh=role.calAllPower();assert.equal(afterRod,stableSecondRefresh);assert.deepEqual(gem._info,ownedGemSnapshot);
const petInit=extract('a.sc_pet_soul_info=function',1033400).source;
const result={result:'REPRODUCED',sourceSha256:crypto.createHash('sha256').update(src).digest('hex'),packetOrder:{fullRefreshAt500:true,gem3900After500:true,petSoul6900After500:true},gem:{id:25051,shapeId:103,constructorTestListEmpty:true,cachedAt500:gemCacheAt500,attrs:gemActual},power:{after500,after3900,afterSameRodACK:afterRod,recoveredDelta:afterRod-after3900,secondRefresh:stableSecondRefresh},events,petSoulInitHasAttrChange:petInit.includes('E.ATTR_CHANGE'),limits:'Actual Role/Gem/rod callback functions and constructor state; other model attrs are controlled fixture values. Demonstrates stale client cache, not identification of reported player or exact real power loss.'};
async function serverProbe(){
 const app=path.join(root,'linhhoasu/lhs/newServer'),playerService=require.resolve(path.join(app,'src/services/PlayerService'));
 require.cache[playerService]={id:playerService,filename:playerService,loaded:true,exports:{savePlayer:async(id,p)=>clone(p),wasRecentlySaved:()=>false}};
 const battle=require(path.join(app,'src/services/BattleService')),fish=require(path.join(app,'src/handlers/fish')),payload=require(path.join(app,'src/handlers/playerPayload'));
 const p={userId:'power-fixture',playerId:'power-fixture',serverId:1001,level:100,exp:0,items:{5902:1},currencies:{diamond:0,gold:0,silver:0},roleInfo:{kungfuId:4,subJob:0},other_attr_info:{},systemUnlockInfo:{unlockedSystem:[215,223]},taskInfo:{},rechargeInfo:{monthCards:{}},fishInfo:{level:28,rodId:5901,rodRank:2,rodLevel:3,rodAttrs:[{type:101,value:1000}],raftId:6201,raftRank:1,raftLevel:0,slots:{1:{id:5011,uid:1001,type:1,quality:2,multi:10000,attrs:[{type:1,value:1000,level:1},{type:2,value:200,level:1}],skills:[],tempSkills:{},lock:0,dead:0}}}};
 Object.assign(p,payload.buildPlayer500Data(p));fish.ensureFishInfo(p);const score=player=>battle.calcPowerScore(battle.calcPlayerPower(player));const before=score(p),saved=clone(p),reloaded=clone(saved),loginPayload=payload.buildPlayer500Data(reloaded),s={userId:p.userId,player:reloaded};
 const beforeSwitch=score(s.player),response=await fish.handleFishRodSwitch({id:5902},s,1),afterSwitch=score(s.player);
 assert.equal(response.data.result,0);assert.equal(before,beforeSwitch);assert.equal(beforeSwitch,afterSwitch);assert.equal(loginPayload.power,before);assert.deepEqual(saved.fishInfo.slots,s.player.fishInfo.slots);assert.deepEqual(saved.fishInfo.rodAttrs,s.player.fishInfo.rodAttrs);
 return {result:'PASS',normalizedFixture:true,beforeSave:before,afterJSONReload:beforeSwitch,afterRodSwitch:afterSwitch,loginPacketPower:loginPayload.power,fishSlotsAndRodAttrsPreserved:true,productionWrites:0};
}
serverProbe().then(server=>{result.serverFixture=server;const out=path.join(root,'_ai_workbench/temp/player_power_fashion_audit_20260907');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'power-client.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}).catch(e=>{console.error(e.stack);process.exitCode=1;});
