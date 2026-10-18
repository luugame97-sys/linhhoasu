'use strict';
// Isolated tests against the hash-verified deployed source. No RPC/DB writes.
const fs=require('fs'),path=require('path'),vm=require('vm');
const prefix=fs.readFileSync(path.join(__dirname,'test_pet_safety_20261017.js'),'utf8').split('const cases=[];')[0];
const cases=String.raw`
(async()=>{
const findings=[],checks=[];
tables.PetQualityConfig={10:{id:10,passiveSkillCount:7,composeSuccessRate:0,consumes:[{id:36,count:250}],addConsumes:[{id:36,count:180}]},7:{id:7,passiveSkillCount:6}};
tables.PetBaseConfig.speedUpScale=[0,20,40];tables.PetBaseConfig.speedUpLevel=[1,5,10];
const bundle=fs.readFileSync(path.join(dir,'candidate/main.js'),'utf8');
function extract(marker,endMarker){let start=bundle.indexOf(marker);assert(start>=0,marker);start=bundle.indexOf('function',start);let end=bundle.indexOf(endMarker,start);assert(end>start,endMarker);return '('+bundle.slice(start,end+1)+')';}
const nativeUpgrade=extract('a.sendUpgrade=function(t,e)','},a.sendLockSkill=');
const panelUpgrade=extract('a.sendUpgrade=function(){var t=this;if(this._nowLevelUpCost','},a.onClickResetBtn=');
let callbacks=[],animations=0,sounds=0,requests=[],notices=[],clientPet={uid:1,id:810101,level:21,slot:-1};
const model={_petInfo:{pets:[clientPet]},nowUpgradeTimes:20,getPetDataByUid:()=>clientPet,getPetLevelMax:()=>260,updatePetData:p=>{clientPet=p;},Rpc(tag,params,cb,ctx,fail){requests.push({tag,params});callbacks.push({cb,fail});}};
function View(){}View.prototype.onTouchEnd=function(){};
const g={PetModel:model,Config:tables,SoundManager:{PlayEffect(){sounds++;}},CuriosModel:{taskCheck(){}},ItemModel:{checkItemEnough:(id,count)=>count<=20000}};
const root={GlobalManager:g,PetMainView:View,UserTips:{ins:()=>({showTips:t=>notices.push(t)})},MessageDef:{},MessageCenter:{ins:()=>({dispatch(){}})},setTimeout(){throw Error('unexpected install wait');}};
const ctx={Y:g,A:{ins:()=>({dispatch(){}})},E:{},Math};
model.sendUpgrade=vm.runInNewContext(nativeUpgrade,ctx);
vm.runInNewContext(fs.readFileSync(path.join(dir,'candidate/safety.js'),'utf8'),{window:root,Number,Array});
const view={_petUId:1,_nowLevelUpCost:{id:36,count:3850},compSpine:{visible:false,setAnimation(){animations++;return{waitPlayEnd:()=>Promise.resolve()};}}};
const panelFn=vm.runInNewContext(panelUpgrade,ctx);
panelFn.call(view);assert.equal(requests[0].params.lv,5);assert.equal(animations,1);
let p=fixture();p.petInfo.pets[0].level=21;p.items[36]=20000;
let before=copy(p),session={userId:'qa',player:p};mode='success';let result=await mod.exports.handlePetUpgrade({uid:1,lv:5},session,1);
assert.equal(result.data.result,-1);assert.deepEqual(p,before);
callbacks.shift().cb(result.data);assert.equal(sounds,0);assert.equal(model.nowUpgradeTimes,20);
findings.push({id:'upgrade_cost_mismatch',clientRequired:3850*5,serverRequired:[21,22,23,24,25].reduce((a,l)=>a+250+180*(l-1),0),owned:20000,serverResult:result.data.result});
findings.push({id:'upgrade_animation_before_ack',animationsBeforeResponse:animations,soundsAfterReject:sounds});
checks.push('rejection leaves real-shaped player fixture unchanged; callback guard blocks sound/counter');
requests=[];callbacks=[];for(let i=0;i<10;i++)panelFn.call(view);assert.equal(requests.length,10);assert.equal(callbacks.length,10);
findings.push({id:'no_inflight_upgrade_limit',outstandingRequests:callbacks.length});
// Valid success preserves cap, consumption, source identity, binding and skills.
for(const slot of [-1,-2,-3,15]){p=fixture();p.petInfo.pets[0].slot=slot;session={userId:'qa',player:p};result=await mod.exports.handlePetEat({matUid:2,targetUid:1},session,2);assert.equal(result.data.result,0);assert.equal(p.petInfo.pets[0].level,260);assert.equal(p.petInfo.pets[0].slot,slot);assert.equal(p.other_attr_info.petSoulInfo.petSouls[0].petUid,1);assert.equal(p.petInfo.pets.length,1);}
checks.push('EXP feeding succeeds in main/support1/support2/ground slots, cap and binding preserved');
// Simulate commit succeeded but transport reports timeout: never replay automatically.
const raw=deps['../services/PlayerService'];const oldSave=raw.savePlayer;let database;
raw.savePlayer=async(id,draft)=>{database=copy(draft);throw Error('SIMULATED_COMMIT_UNKNOWN');};
p=fixture();before=copy(p);session={userId:'qa',player:p};result=await mod.exports.handlePetEat({matUid:2,targetUid:1},session,3);
assert.equal(result.data.result,-1);assert.equal(session.player,null);assert.deepEqual(p,before);assert.equal(database.petInfo.pets.length,1);
checks.push('commit-unknown retains original object, invalidates session and requires DB reconciliation');raw.savePlayer=oldSave;
// Auto uses its older exception path: invalid session asks the client to retry forever.
deps['../services/FeatureReceiptService'].read=()=>null;deps['../services/FeatureReceiptService'].record=()=>{};
p=fixture();session={userId:'qa',player:p};before=copy(p);mode='null';
await assert.rejects(()=>mod.exports.handlePetAutoCompose({quality:7,requestId:'isolated'},session,4));assert.equal(session.player,null);assert.deepEqual(p,before);
result=await mod.exports.handlePetAutoCompose({quality:7,requestId:'isolated'},session,5);assert.equal(result.data.code,'PET_AUTO_SESSION_REQUIRED');assert.equal(result.data.retryable,true);
// The live router intercepts this even earlier with this exact unauthenticated shape.
result={data:{result:-1,msg:'not logged in'}};
let timers=[],autoReplies=0,autoNotices=[];
const autoModel={_petInfo:{},sendAutoCompose(q,ok,fail){autoReplies++;fail(result.data);return true;}};
const autoRoot={GlobalManager:{PetModel:autoModel},UserTips:{ins:()=>({showTips:t=>autoNotices.push(t)})},setTimeout:(f)=>{timers.push(f);return timers.length;},clearTimeout(){}};
vm.runInNewContext(fs.readFileSync(path.join(dir,'candidate/grid.js'),'utf8'),{window:autoRoot,Number,Array});timers=[];
let autoView={};autoRoot.LhsPetGrid48V1.startRun(autoView,true,7,0);
for(let i=0;i<3;i++){const f=timers.shift();assert(f);f();}
assert.equal(autoReplies,3);assert.equal(timers.length,1);assert(autoView.__lhsAutoRun);
findings.push({id:'auto_retry_invalid_session_after_save_failure',routerReply:result.data,retriesObserved:autoReplies,stillScheduled:true,notice:autoNotices[0]});
timers=[];autoNotices=[];autoModel.sendAutoCompose=(q,ok)=>{ok({summary:{composeCount:0,expMergeCount:0,canContinue:false,stopReason:'BOARD_FULL',blockedExpCap:true}});return true;};
autoRoot.LhsPetGrid48V1.startRun(autoView,true,7,0);timers.shift()();assert.equal(autoNotices.length,1);assert(!autoNotices[0].includes('EXP'));
findings.push({id:'full_board_hides_exp_stop_reason',notice:autoNotices[0]});
mode='success';
const out={at:new Date().toISOString(),status:'AUDIT_COMPLETED',productionWrites:0,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),checks,findings,limits:'Actual source/native functions with fixture persistence and UI event stubs. No real Mongo write, login/reconnect E2E, or real pet consumption.'};
const outdir=path.resolve(__dirname,'../temp/pet_retest_20261018');fs.mkdirSync(outdir,{recursive:true});fs.writeFileSync(path.join(outdir,'tests.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInNewContext(prefix+cases,{require,__dirname,console,process},{filename:__filename});
