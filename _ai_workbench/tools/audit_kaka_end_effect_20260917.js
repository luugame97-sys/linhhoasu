'use strict';
// Diagnosis only: native click/request replay and installed server handler, RAM persistence.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const app='/linhhoasu/lhs/newServer',client='/linhhoasu/webgame/game/js';
let memorySaves=0,networkAttempts=0;
const deny=()=>{networkAttempts++;throw Error('AUDIT_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;require('tls').connect=deny;global.fetch=deny;
for(const k of ['http','https']){require(k).request=deny;require(k).get=deny;}
function stub(rel,exports){const filename=require.resolve(path.join(app,rel));require.cache[filename]={id:filename,filename,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{savePlayer:async(_id,p)=>{memorySaves++;return JSON.parse(JSON.stringify(p));},drainPendingSaves:async()=>{}});
stub('src/services/RuntimeBus',{getWsServer:()=>null});
const cfg=require(path.join(app,'src/services/ConfigService')),tables=cfg.loadAllTables();
const appearance=require(path.join(app,'src/services/RoleAppearanceService'));
const fashion=require(path.join(app,'src/handlers/fashion'));
const main=fs.readFileSync(path.join(client,'main.min_drop100.js'),'utf8');
// Extracted locally with Acorn; exact-byte assertions bind these functions to live main.
const nativeDefinitions={
 onClickESCheckBox:'function(){var t=Y.Config.FashionEndDressConfig[this.selectId];Y.FashionModel.IsFashionActive(t.endEffectId)?Y.FashionModel.GetCurFashionSkin(304)==t.endEffectId?Y.FashionModel.sendChangeFshion(-1,304):Y.FashionModel.sendChangeFshion(t.endEffectId,304):(S.ins().showTips(B.ConvertLanguageToText(30033352)),this.updateEndSkill())}',
 sendChangeFshion:'function(t,e,i){var n=this,t=(i=-1==(i=void 0===i?-1:i)?this.getCurSetId():i,{id:t,type:e,set:i=-1==Y.Config.FashionBaseConfig.planPart.indexOf(e)?-1:i});this.Rpc(1801,t,function(t){n._fashionInfo.fashion[t.type]=t.id,A.ins().dispatch(E.CHANGE_IDLE_MAP_ROLE_SHOW),A.ins().dispatch(E.EQUIP_FASHION_CHANGE)})}'
};
function source(name){assert(main.includes('.'+name+'='+nativeDefinitions[name]),'LIVE_NATIVE_METHOD_CHANGED:'+name);return nativeDefinitions[name];}
const clickSource=source('onClickESCheckBox'),requestSource=source('sendChangeFshion');
function player(id){return{userId:'kaka_ram_'+id,playerId:'kaka_ram',level:120,roleInfo:{kungfuId:8,subJob:1},items:{},currencies:{diamond:100000,silver:100000,gold:100000},fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]}};}
const ack=(r,tag)=>(Array.isArray(r)?r:[r]).find(x=>x.tag===tag)?.data;
const results={at:new Date().toISOString(),scope:'exact live client methods and server code; no gameplay RPC or DB access',clientMethods:{onClickESCheckBox:clickSource,sendChangeFshion:requestSource},cases:[]};
async function run(){
 for(const dressId of [28320,28330]){
  const end=tables.FashionEndDressConfig[dressId],effectId=end.endEffectId;
  for(const mode of ['full-suit-and-effect','effect-only','full-suit-without-effect','take-off']){
   const p=player(dressId+'_'+mode),ids=mode==='effect-only'?[effectId]:mode==='full-suit-without-effect'?end.fashionIds:[...end.fashionIds,effectId];
   ids.forEach(id=>appearance.grantFashionOwnership(p,id));appearance.ensureRoleAppearance(p);
   const session={userId:p.userId,player:p};
   let wearResult=null;
   if(mode==='full-suit-and-effect')wearResult=ack(await fashion.handleChangeSuit({id:dressId,color:0,set:0},session,1802),1802)?.result;
   const requests=[],tips=[];
   const model={getCurSetId:()=>0,GetCurFashionSkin:()=>mode==='take-off'?effectId:-1,IsFashionActive:id=>appearance.hasFashionOwnership(p,id),Rpc:(tag,data)=>requests.push({tag,data})};
   const ctx=vm.createContext({Y:{Config:tables,FashionModel:model},S:{ins:()=>({showTips:v=>tips.push(v)})},B:{ConvertLanguageToText:id=>String(id)},A:{ins:()=>({dispatch(){}})},E:{}});
   model.sendChangeFshion=vm.runInContext('('+requestSource+')',ctx);
   const click=vm.runInContext('('+clickSource+')',ctx);click.call({selectId:dressId,updateEndSkill(){}});
   const before=JSON.stringify(p),savesBefore=memorySaves;
   let reply=null;
   if(requests.length)reply=ack(await fashion.handleChangeFashion(requests[0].data,session,1801),1801);
   const row={dressId,effectId,mode,ownsEffect:appearance.hasFashionOwnership(p,effectId),ownsAllParts:end.fashionIds.every(id=>appearance.hasFashionOwnership(p,id)),wearResult,requests,tips,reply,savesDuringEffect:memorySaves-savesBefore,unchanged:before===JSON.stringify(p)};
   if(mode==='full-suit-and-effect'||mode==='effect-only'){
    assert.equal(requests.length,1);assert.equal(requests[0].data.id,effectId);assert.equal(requests[0].data.type,304);
    assert.equal(reply.result,-1);assert.equal(reply.code,'FASHION_WHOLE_SUIT_REQUIRED');assert(row.unchanged);assert.equal(row.savesDuringEffect,0);
    if(mode==='full-suit-and-effect')assert.equal(wearResult,0);
   }else if(mode==='full-suit-without-effect'){assert.equal(requests.length,0);assert.equal(tips.length,1);}
   else{assert.equal(reply.result,0);assert.equal(p.fashionInfo.fashion[304],-1);}
   results.cases.push(row);
  }
 }
 const p=player('opening_control');appearance.grantFashionOwnership(p,28416);const r=ack(await fashion.handleChangeFashion({id:28416,type:306,set:0},{userId:p.userId,player:p},1801),1801);
 assert.equal(r.result,0);results.control306={id:28416,result:r.result};
 results.codeHashes=Object.fromEntries([path.join(app,'src/handlers/fashion.js'),path.join(app,'src/services/RoleAppearanceService.js'),path.join(client,'main.min_drop100.js'),path.join(client,'lhs-fashion-gear-v1.js')].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
 results.effectConfig=[28320,28330].map(id=>({dressId:id,kind:tables.FashionDressConfig[id].isSuit,end:tables.FashionEndDressConfig[id],effect:tables.FashionConfig[tables.FashionEndDressConfig[id].endEffectId],boxRewards:tables.AssetsUseConfig[id].rewards}));
 results.memorySaves=memorySaves;results.networkAttempts=networkAttempts;results.productionWrites=0;
 assert.equal(networkAttempts,0);process.stdout.write(JSON.stringify(results));
}
run().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
