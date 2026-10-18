'use strict';
// Isolated feasibility probe; all config changes and gameplay writes are RAM-only.
const app='/linhhoasu/lhs/newServer',clone=x=>JSON.parse(JSON.stringify(x));
let saves=0,networkAttempts=0;
const deny=()=>{networkAttempts++;throw Error('QA_NETWORK_DENIED')};
require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
function stub(rel,exports){const p=require.resolve(app+'/'+rel);require.cache[p]={id:p,filename:p,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{savePlayer:async()=>{saves++;return true},savePlayerDeferred:async()=>true});
stub('src/services/MainTaskProgressService',{refreshMainTaskProgress:()=>false,addPetComposeCount:()=>false,addPetWashCount:()=>false});
const cfg=require(app+'/src/services/ConfigService'),tables=cfg.loadAllTables();
const pet=require(app+'/src/handlers/pet');
const base=tables.PetBaseConfig,original=clone(base);
function p(field){return{userId:'RAM_GRID',level:120,roleInfo:{stage:1,kungfuId:4},items:{36:100000},currencies:{diamond:1000,silver:1000,gold:0},other_attr_info:{},petInfo:{field,pets:[],nextUid:100,unlockAtlas:[],rewardedAtlas:[],wishMap:{},timeRecords:{}}};}
const ack=(x,tag)=>(Array.isArray(x)?x:[x]).find(x=>x.tag===tag)?.data;
async function main(){
 const current=p(16),atCap=ack(await pet.handlePetBuyField({}, {userId:current.userId,player:current},1),3308);
 base.fieldMax=48;
 const expanded=p(16),before=expanded.currencies.diamond;
 const next=ack(await pet.handlePetBuyField({}, {userId:expanded.userId,player:expanded},2),3308);
 const candidates=Object.values(tables.PetConfig).filter(r=>r.quality===2&&r.tag!==2);
 const basic=candidates[0].id;const quality9=Object.values(tables.PetConfig).find(r=>r.quality===9&&r.tag!==2).id;
 const state=p(48);state.petInfo.pets=Array.from({length:30},(_,i)=>({uid:i+1,id:basic,level:1,slot:i,locked:0,passiveSkills:[]}));
 state.petInfo.pets.push({uid:31,id:basic,level:1,slot:31,locked:1,passiveSkills:[]},{uid:32,id:basic,level:20,slot:32,locked:0,passiveSkills:[]},{uid:33,id:basic,level:1,slot:-1,locked:0,passiveSkills:[]},{uid:34,id:quality9,level:1,slot:47,locked:0,passiveSkills:[]});
 const old=Math.random;Math.random=()=>0;
 let auto;try{auto=ack(await pet.handlePetAutoCompose({quality:5},{userId:state.userId,player:state},3),3314)}finally{Math.random=old;Object.assign(base,original)}
 const preserved=[31,32,33,34].every(uid=>state.petInfo.pets.some(r=>r.uid===uid));
 if(auto.result!==0||!preserved)throw Error('AUTO_PROTECTION_FAILED');
 console.log(JSON.stringify({at:new Date().toISOString(),current:{fieldMax:original.fieldMax,capResult:atCap.result},configOnly48:{field:next.field,result:next.result,chargedDiamond:before-expanded.currencies.diamond,missingPriceIndex:8},auto48:{result:auto.result,beforePets:34,afterPets:state.petInfo.pets.length,lockedLevelledDeployedQuality9Preserved:preserved},memorySaves:saves,productionWrites:0,networkAttempts}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
