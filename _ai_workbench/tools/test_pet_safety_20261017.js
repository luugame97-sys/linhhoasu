'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const dir=path.resolve(__dirname,'../temp/pet_safety_20261017'),source=fs.readFileSync(path.join(dir,'candidate/pet.js'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const tables={PetBaseConfig:{levelMax:200,breakLimitPetQuality:[7,9,10],initialField:48},PetConfig:{810101:{id:810101,quality:10,tag:1},87001:{id:87001,quality:7,tag:2}},PetSoulConfig:{210301:{quality:7}},PetSoulUpgradeConfig:{7:{7:{coercion:4445}}},CoercionConfig:{19:{stage:19,coercion:4200,limitLevelUp:60}}};
function fixture(){return {petInfo:{pets:[{uid:1,id:810101,level:2,slot:-1,locked:0,passiveSkills:[1,2],lockSkills:[0]},{uid:2,id:87001,level:260,slot:2,locked:0,passiveSkills:[]}]},other_attr_info:{petSoulInfo:{petSouls:[{id:210301,star:7,petUid:1}]}},items:{36:123}};}
let mode='success',saved,invalidated=0,saves=0;
const deps={'../services/ConfigService':{get:k=>tables[k]},'../services/PlayerService':{drainPendingSaves:async()=>{},savePlayer:async(id,p)=>{saves++;if(mode==='null')return null;if(mode==='throw')throw Error('timeout');saved=copy(p);return p;}},'../logger':{warn(){}},'../services/PlayerMutationService':{run:async(id,f)=>f()},'../services/FeatureReceiptService':{},'../services/RuntimeBus':{getWsServer:()=>({invalidatePlayerForMutation(){invalidated++;}})},'../services/MainTaskProgressService':{refreshMainTaskProgress:()=>false},'./raid':{}};
let mod={exports:{}};vm.runInNewContext(source,{module:mod,exports:mod.exports,require:k=>{assert(k in deps,k);return deps[k];},console,Date,Math,process:{env:{}}});
const cases=[];
(async()=>{
for(const m of ['null','throw']){mode=m;let p=fixture(),before=copy(p),session={userId:'qa',player:p};let r=await mod.exports.handlePetEat({matUid:2,targetUid:1},session,1);assert.equal(r.data.result,-1);assert.equal(r.data.code,'PET_SAVE_UNCONFIRMED');assert.deepEqual(p,before);assert.equal(session.player,null);cases.push('save '+m+' leaves original intact and invalidates');}
mode='success';let p=fixture(),session={userId:'qa',player:p};let r=await mod.exports.handlePetEat({matUid:2,targetUid:1},session,2);assert.equal(r.data.result,0);assert.equal(p.petInfo.pets.length,1);assert.equal(p.petInfo.pets[0].level,260);assert.equal(p.petInfo.pets[0].slot,-1);assert.equal(p.other_attr_info.petSoulInfo.petSouls[0].petUid,1);assert.deepEqual(copy(p),saved);cases.push('equipped soul-bound recipient saved before publication');
let before=copy(p),count=saves;r=await mod.exports.handlePetEat({matUid:2,targetUid:1},session,3);assert.equal(r.data.result,-1);assert.deepEqual(copy(p),before);assert.equal(saves,count);cases.push('duplicate consumed UID rejected');
p=fixture();p.petInfo.pets[1].locked=1;before=copy(p);r=await mod.exports.handlePetEat({matUid:2,targetUid:1},{userId:'qa',player:p},4);assert.equal(r.data.result,-1);assert.deepEqual(p,before);cases.push('locked material protected');
for(const tag of [3301,3310]){mode='null';p=fixture();before=copy(p);session={userId:'qa',player:p};let fn=tag===3301?'handlePetChangeSlot':'handlePetLock';r=await mod.exports[fn]({uid:1,slot:4,lock:1},session,5);assert.equal(r.data.result,-1);assert.deepEqual(p,before);cases.push('draft guard route'+tag);}
let reply={result:-1,data:null},success=0,fail=0,events=[],notices=[];
const pets=fixture().petInfo.pets;
const model={Rpc(tag,params,cb,ctx,err){cb(reply);},getPetDataByUid:uid=>pets.find(p=>p.uid===uid),deletePet:uid=>events.push(['delete',uid]),updatePetData:p=>events.push(['update',p.uid]),getPetEquips:()=>[1],getPetComposes:()=>[-1,-1,2]};
function View(){}View.prototype.onTouchEnd=function(){events.push(['native']);};
const root={GlobalManager:{PetModel:model,Config:tables},PetMainView:View,UserTips:{ins:()=>({showTips:s=>notices.push(s)})},MessageDef:new Proxy({},{get:(o,k)=>k}),MessageCenter:{ins:()=>({dispatch:(...a)=>events.push(a)})},setTimeout(){throw Error('unexpected retry');}};
vm.runInNewContext(fs.readFileSync(path.join(dir,'candidate/safety.js'),'utf8'),{window:root,Number,Array});assert(root.LhsPetSafety.installed);
for(let tag of [3304,3305,3306,3307,3308,3309,3310,3312,3313]){model.Rpc(tag,{},()=>success++,null,()=>fail++);}assert.equal(success,0);assert.equal(fail,9);cases.push('nine failed RPC routes never call success');
reply={result:0,data:{uid:1},costUid:[]};model.Rpc(3312,{},()=>success++);assert.equal(success,1);cases.push('valid success callback preserved');
reply={result:0,data:{uid:1,slot:-1,level:260},rewards:{items:[]}};model.sendPetEat(2,1,2,-1);assert(events.some(e=>e[0]==='ATTR_CHANGE'));assert(events.some(e=>e[0]==='PET_DATA_UPDATE'));assert(!events.some(e=>e[0]==='PET_COMP_UPDATE'));cases.push('equipped eat refreshes board and attributes without ground animation');
let view=new View();Object.assign(view,{_touchData:{uid:2},_composeItems:[],_equipItems:[{data:{isUnlock:true}}],tempSpine:{parent:{globalToLocal:()=>({x:0,y:0})}},isTouchEquipGroup:()=>true,getTouchEquipIndex:()=>0});events=[];view.onTouchEnd({stageX:0,stageY:0},false);assert(!events.some(e=>e[0]==='native'));assert(events.some(e=>e[0]==='delete'&&e[1]===2));cases.push('EXP drag to equipped slot feeds rather than swaps');
const files={};for(let f of ['pet.js','main.js','grid.js','safety.js','index.html'])files[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'candidate',f))).digest('hex');
const out={status:'PASS',cases,files,limitations:'mock persistence and client models; not native live E2E'};fs.writeFileSync(path.join(dir,'tests.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});
