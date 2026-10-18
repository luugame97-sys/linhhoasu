'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert/strict'),net=require('net'),vm=require('vm'),crypto=require('crypto');
const {extract,root}=require('./inspect_fishing_background_20260907'),app=path.join(root,'linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH=path.join(root,'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');process.env.LOG_DIR='';process.env.NODE_ENV='test';
net.Socket.prototype.connect=()=>{throw Error('AUDIT_NETWORK_DENIED');};let stored;const clone=v=>JSON.parse(JSON.stringify(v));
function stub(rel,value){const p=require.resolve(path.join(app,rel));require.cache[p]={id:p,filename:p,loaded:true,exports:value};}
stub('src/logger',{info(){},warn(){},debug(){},error(){}});stub('src/services/PlayerService',{savePlayer:async(id,p)=>{stored=clone(p);return p;},wasRecentlySaved:()=>false});
const tables=require(path.join(app,'src/services/ConfigService')).loadAllTables(),item=require(path.join(app,'src/handlers/item')),fashion=require(path.join(app,'src/handlers/fashion'));
const ctx=vm.createContext({Y:{Config:tables,UnlockSystem:{isSystemUnlock:()=>true}},x:{ESuitType:{normal:0,linkage:1,changeColor:2,bathrobe:3,endSkill:4},INITIAL_ROLE_SUIT:-1},T:{serverTime:Date.now()/1000},B:{getObjectLen:o=>Object.keys(o).length}});
function client(marker,start){return vm.runInContext('('+extract(marker,start).source+')',ctx);}
const fmodel={_fashionInfo:{activateFashion:[],fashionData:[]},IsFashionActive:client('IsFashionActive=function',6052000),IsSuitActive:client('IsSuitActive=function',6041000),GetSuitFashions:client('GetSuitFashions=function',6042000)};
const getBag=client('m.getBagItems=function',6127000),useCfg=tables.AssetsUseConfig[29040],ids=useCfg.rewards.map(x=>x.id);assert.deepEqual(ids,[29041,29042,29043,29049]);
function base(){return {userId:'fashion-audit',playerId:'fashion-audit',serverId:1001,level:100,items:{},currencies:{diamond:0,gold:0,silver:0},roleInfo:{kungfuId:4,subJob:0},fashionInfo:{activateFashion:[],fashionData:[]},other_attr_info:{},taskInfo:{}};}
(async()=>{
 const p=base(),s={userId:p.userId,player:p},received=item.addRewardRowsToPlayer(p,[{id:29040,count:1}],1);fmodel._fashionInfo=p.fashionInfo;
 const direct={bagCount:p.items[29040]||0,ifShow:tables.AssetsConfig[29040].ifShow,rewardFashion:received.rewardInfo.fashion||[],active:fmodel.IsSuitActive(29040),visibleInBag:getBag.call({_itemMap:p.items}).some(x=>x.id===29040)};
 assert.equal(direct.bagCount,1);assert.equal(direct.active,false);assert.equal(direct.visibleInBag,false);assert.equal(direct.rewardFashion.length,0);
 const ack=await item.handleUseItem({index:29040,count:1},s,1),packets=Array.isArray(ack)?ack:[ack];assert.equal(packets.find(x=>x.tag===1300).data.result,0);
 fmodel._fashionInfo=p.fashionInfo;assert(fmodel.IsSuitActive(29040));assert.equal(p.items[29040]||0,0);assert(packets.some(x=>x.tag===1800&&ids.every(id=>x.data.fashion.includes(id))));
 const afterUse={bagCount:p.items[29040]||0,active:fmodel.IsSuitActive(29040),ownedComponents:ids.filter(id=>p.fashionInfo.activateFashion.includes(id)),packetTags:packets.map(x=>x.tag)};
 const reloaded=clone(stored);fmodel._fashionInfo=reloaded.fashionInfo;assert(fmodel.IsSuitActive(29040));
 const equip=await fashion.handleChangeSuit({id:29040,color:0,set:0},{userId:reloaded.userId,player:reloaded},2);assert.equal(equip.data.result,0);
 const duplicate=await item.handleUseItem({index:29040,count:1},s,3);assert.equal((Array.isArray(duplicate)?duplicate:[duplicate]).find(x=>x.tag===1300).data.result,-1);
 const partial=base();item.addRewardRowsToPlayer(partial,[useCfg.rewards[0]],1);fmodel._fashionInfo=partial.fashionInfo;assert.equal(fmodel.IsSuitActive(29040),false);
 const carp=base(),originalRandom=crypto.randomInt;let carpReward;try{crypto.randomInt=n=>n===10000?9999:0;carpReward=item.addRewardRowsToPlayer(carp,[{id:94501,count:1}],1);}finally{crypto.randomInt=originalRandom;}
 fmodel._fashionInfo=carp.fashionInfo;assert.equal(carp.items[29040],1);assert.equal(fmodel.IsSuitActive(29040),false);
 const result={result:'REPRODUCED_HIDDEN_UNOPENED_SUIT',id:29040,name:'Thời đại hàng hải',direct,afterUse,relogActive:true,equipAfterUseResult:equip.data.result,duplicateUseRejected:true,oneComponentDoesNotActivateWholeSuit:true,forcedCarpRareReward:{box94501:0,hiddenSuit29040:carp.items[29040],active:false,rewardItems:carpReward.rewardInfo.items},sourceCase:'Raw parent reward29040, including configured shop reward and forced rare carp pool. Does not prove reported account received it from this source.',productionWrites:0};
 const out=path.join(root,'_ai_workbench/temp/player_power_fashion_audit_20260907');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'fashion.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
