'use strict';
// Candidate only. No network; all writes are captured in memory.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),net=require('net');
const root=path.resolve(process.argv[2]),app=path.join(root,'app');
const acorn=require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.LOG_DIR='';process.env.NODE_ENV='test';
net.Socket.prototype.connect=()=>{throw new Error('GEAR_AUDIT_NETWORK_FORBIDDEN');};
function stub(rel,exports){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports};}
const clone=x=>JSON.parse(JSON.stringify(x));let durable,saves,saveMode='ok';
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{async savePlayer(id,p){saves++;if(saveMode==='throw')throw new Error('AUDIT_SAVE_FAILURE');if(saveMode==='null')return null;durable=clone(p);return p;},wasRecentlySaved:()=>false});
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables();
const fish=require(path.join(app,'src/handlers/fish')),payload=require(path.join(app,'src/handlers/playerPayload'));
const balance=require(path.join(app,'src/services/FishingBalanceService'));
const main=fs.readFileSync(path.join(root,'main.fixed.js'),'utf8');
function extract(marker,after=0){const at=main.indexOf(marker,after);assert(at>=0,marker);let n=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
const classes={rod:main.indexOf('i(Qgt,'),raft:main.indexOf('i(Xgt,')};
const native={};
for(const kind of ['rod','raft']){native[kind]={update:extract('.updateViewUI=function',classes[kind])};if(kind==='raft')for(const name of ['getBaseAttrListData','getLevelUpListData','getLevelUpCostListData','getFastUpCostListData','getGradeUpCostListData'])native[kind][name]=extract('.'+name+'=function',classes[kind]);}
function clientPanel(kind,p){
 const ctx={Y:{Config:tables,FishingModel:{getFishInfo:()=>p.fishInfo,isUnlockFishRod:()=>true,isUnlockFishRaft:()=>true,getRodResById:()=>'',getRaftResById:()=>''},ItemModel:{GetItemCount:id=>Number(p.items[id]||0)},UnlockSystem:{isSystemUnlock:()=>true}},B:{ConvertLanguageToText:x=>String(x),strformat:(text,...args)=>JSON.stringify(args),strformatByLangId:(id,...args)=>JSON.stringify([id,...args]),setIncludeInLayoutVisible:(o,v)=>o.visible=v},O:Math,U:{ArrayCollection:class{constructor(rows){this.rows=rows;}}},D:{ShowRedPoint(){}},qo:{Prop:1},jgt:{checkFishRodRed:()=>false},Ygt:{checkFishRodRed:()=>false}};
 const panel={selectId:kind==='rod'?5901:6201,InitRod:5901,spFishRod:{setAnimation(){}},expBar:{labelDisplay:{}},updateCirculateList(){}};
 for(const k of ['imgFishRod','imgQuality','labDesc','costItem','btnBuy','btnChange','useImage','btnWatsh','curName','listStageAttr','listLevelAttr','curLv','groupGradeUp','groupFastUp','groupLevelUp','maxImage','lvUpTip','currencyItem1','listLevelUpCost','listFastUpCost','listGradeUpCost','btnLevelUp','btnFastUp','btnGradeUp'])panel[k]={};
 for(const [name,fn]of Object.entries(native[kind]))if(name!=='update')panel[name]=vm.runInNewContext('('+fn+')',ctx);
 vm.runInNewContext('('+native[kind].update+')',ctx).call(panel);
 return {gradeUp:panel.groupGradeUp.visible,levelUp:panel.groupLevelUp.visible,fastUp:panel.groupFastUp.visible,max:panel.maxImage.visible,exp:panel.expBar.value,expMax:panel.expBar.maximum,levelCost:panel.listLevelUpCost.dataProvider?.rows,fastCost:panel.listFastUpCost.dataProvider?.rows,gradeCost:panel.listGradeUpCost.dataProvider?.rows,attrs:panel.listLevelAttr.dataProvider?.rows};
}
function base(kind,rank=1,level=0,exp=0,coins=100000,crystals=100000){saveMode='ok';saves=0;const p={userId:'gear-memory',playerId:'gear-memory-role',name:'in-memory',level:116,serverId:1001,items:{68:coins,69:crystals},currencies:{diamond:0,silver:0,gold:0},fishInfo:{},roleInfo:{kungfuId:4,subJob:0},other_attr_info:{},taskInfo:{},rechargeInfo:{monthCards:{}},activityInfo:{datas:[]},systemUnlockInfo:{unlockedSystem:[215,223]}};fish.ensureFishInfo(p);Object.assign(p.fishInfo,{[kind+'Rank']:rank,[kind+'Level']:level,[kind+'Exp']:exp});durable=clone(p);return{p,s:{userId:p.userId,player:p}};}
const handlers={rod:fish.handleFishRodUpgrade,raft:fish.handleFishRaftUpgrade},tags={rod:4010,raft:4015};
const cfg=kind=>tables[kind==='rod'?'FishRodGradeConfig':'FishRaftGradeConfig'];
function combatGearHp(kind,p){
 const source=fs.readFileSync(path.join(app,'src/services/BattleService.js'),'utf8');
 const n=acorn.parse(source,{ecmaVersion:'latest'}).body.find(x=>x.type==='FunctionDeclaration'&&x.id.name==='addFishingAttrs');
 const base={};const table=kind==='rod'?'FishRodGradeConfig':'FishRaftGradeConfig';
 vm.runInNewContext('('+source.slice(n.start,n.end)+')',{config:{get:k=>k===table?cfg(kind):{}},toSafeInt:(v,d=0)=>Number.isFinite(Number(v))?Math.floor(Number(v)):d,addAttrs:(o,rows,m=1)=>{for(const[k,v]of Object.entries(rows||{}))o[k]=(o[k]||0)+v*m;}})(base,p);
 return base[1];
}
function gear(p,k){return {rank:p.fishInfo[k+'Rank'],level:p.fishInfo[k+'Level'],exp:p.fishInfo[k+'Exp'],coin:p.items[68],crystal:p.items[69]};}
// Rod upgrade emits an unsolicited4010 push before the request ACK.
const ack=(out,tag)=>(Array.isArray(out)?out:[out]).find(row=>row.tag===tag&&row.data?.result!=null)?.data;
const cases=[];async function probe(name,fn){try{cases.push({name,status:'PASS',evidence:await fn()});}catch(e){cases.push({name,status:'PROBE_ERROR',error:e.stack});}}

const service=require(path.join(app,'src/services/FishingGearService'));let nonce=0;
function request(p,kind,action){const info=p.fishInfo;return {requestId:'gear_test_'+(++nonce),expectedRevision:Number(info.balanceRevision||0),action,upgradeAll:action==='fast',expectedState:{rank:info[kind+'Rank'],level:info[kind+'Level'],exp:info[kind+'Exp']}};}
async function upgrade(s,kind,action){return ack(await handlers[kind](request(s.player,kind,action),s,++nonce),tags[kind]);}
function coreState(p,k){const x=gear(p,k);return {rank:x.rank,level:x.level,exp:x.exp};}
const oldProbe=probe;
async function mainWork(){
let matrix=0;
for(const kind of ['rod','raft']){
await probe(kind+'_all10ranks_cost_exp_cap_ready_max_and_native_panel',async()=>{
 const rows=[];
 for(let rank=1;rank<=10;rank++){
  const row=cfg(kind)[rank],initial=[
   {level:1,exp:0}, {level:row.level-1,exp:row.exp-1},
   {level:row.level,exp:0}, {level:row.level,exp:row.exp-1}, {level:row.level,exp:row.exp},
  ];
  for(const state of initial)for(const action of ['level','fast','grade'])for(const funds of [0,1,(row.gradeUpCost?.count||5)-1,row.gradeUpCost?.count||5,row.exp-1,100000]){
   const{p,s}=base(kind,rank,state.level,state.exp,funds,funds),before=clone(p),ui=clientPanel(kind,p),r=await upgrade(s,kind,action);
   const full=state.level===row.level&&state.exp===row.exp;
   const cost=action==='grade'?row.gradeUpCost:row.levelUpCost;
   const allowed=!(full&&rank===10)&&((action==='grade')===full)&&!!cost&&funds>=cost.count;
   if(!allowed){assert.equal(r.result,1,JSON.stringify({kind,rank,state,action,funds,r}));assert.deepEqual(p,before);assert.equal(saves,0);}
   else{
    assert.equal(r.result,0);const next=s.player,steps=action==='fast'?Math.min(row.exp-state.exp,funds):1;
    assert.equal(r.cost.id,action==='grade'?69:68);assert.equal(r.cost.count,cost.count*steps);
    assert.equal(next.items[r.cost.id],funds-r.cost.count);assert.equal(next.items[r.cost.id===68?69:68],funds);
    if(action==='grade'){assert(ui.gradeUp);assert.deepEqual(coreState(next,kind),{rank:rank+1,level:1,exp:0});}
    else{assert(ui.levelUp);const exp=state.exp+steps,nextLevel=exp===row.exp&&state.level<row.level?state.level+1:state.level;assert.equal(next.fishInfo[kind+'Level'],nextLevel);assert.equal(next.fishInfo[kind+'Exp'],nextLevel!==state.level?0:exp);}
    assert.deepEqual(coreState(durable,kind),coreState(next,kind));assert.equal(durable.items[r.cost.id],next.items[r.cost.id]);
    const nextUi=clientPanel(kind,next);assert.equal(!!nextUi.max,!!service.read(next.fishInfo,kind).max);
   }
   matrix++;
  }
  rows.push({rank,cap:row.level,exp:row.exp});
 }
 return {matrixCases:matrix,rows};
});
await probe(kind+'_grade_preview_equals_saved_and_combat_all9boundaries',async()=>{
 const out=[];for(let rank=1;rank<10;rank++){const row=cfg(kind)[rank],{p,s}=base(kind,rank,row.level,row.exp),ui=clientPanel(kind,p),beforeHp=combatGearHp(kind,p),preview=ui.attrs.find(x=>x.id===1).val2;await upgrade(s,kind,'grade');const actual=combatGearHp(kind,s.player);assert.equal(actual,preview);assert(actual>=beforeHp);const login=payload.buildPlayer500Data(clone(durable));assert.equal(login.fishInfo[kind+'Level'],1);assert.equal(login.fishInfo[kind+'Rank'],rank+1);out.push({rank,beforeHp,preview,actual});}return out;
});
await probe(kind+'_old_stuck_state_advances_with_coins_not_crystal',async()=>{
 const rank=kind==='rod'?2:1,row=cfg(kind)[rank],{p,s}=base(kind,rank,row.level,0,99195,0),before=clone(p);
 const r=await upgrade(s,kind,'fast');assert.equal(r.result,0);assert.equal(r.cost.id,68);assert.equal(r.cost.count,row.exp);assert.equal(s.player.items[69],0);assert.deepEqual(coreState(s.player,kind),{rank,level:row.level,exp:row.exp});assert(clientPanel(kind,s.player).gradeUp);const next=clone(s.player);const fail=await upgrade(s,kind,'grade');assert.equal(fail.reason,'FISH_GEAR_FUNDS_NOT_ENOUGH');assert.deepEqual(s.player,next);return {before:coreState(before,kind),after:coreState(s.player,kind),cost:r.cost};
});
await probe(kind+'_partialcap_preview_shows_no_false_stat_gain',async()=>{const row=cfg(kind)[1],{p}=base(kind,1,row.level,0);const ui=clientPanel(kind,p);for(const attr of ui.attrs)assert.equal(attr.val,attr.val2);assert(ui.levelUp);return ui;});
await probe(kind+'_legacy_grade_request_and_bad_booleans_never_debit',async()=>{const row=cfg(kind)[1],{p,s}=base(kind,1,row.level,0);const before=clone(p);for(const params of [{upgradeAll:false},{...request(p,kind,'fast'),upgradeAll:'false'},{...request(p,kind,'level'),upgradeAll:1},{...request(p,kind,'level'),action:'random'},{...request(p,kind,'level'),expectedState:null}]){assert.equal(ack(await handlers[kind](params,s,15),tags[kind]).result,1);assert.deepEqual(p,before);assert.equal(saves,0);}return{unchanged:true};});
await probe(kind+'_stale_action_may_not_become_grade_or_double_charge',async()=>{const row=cfg(kind)[1],{p,s}=base(kind,1,row.level,row.exp-1);const old=request(p,kind,'level');await handlers[kind](old,s,16);const before=clone(s.player);const stale={...request(s.player,kind,'level'),expectedState:old.expectedState};assert.equal(ack(await handlers[kind](stale,s,17),tags[kind]).reason,'FISH_GEAR_STALE');assert.deepEqual(s.player,before);const invalid=await upgrade(s,kind,'fast');assert.equal(invalid.reason,'FISH_GEAR_GRADE_REQUIRED');assert.deepEqual(s.player,before);return{full:coreState(s.player,kind),noCrystalSpent:s.player.items[69]===p.items[69]};});
await probe(kind+'_request_replay_relog_and_oldreceipt_eviction_safe',async()=>{const{p,s}=base(kind,1,1,0);const req=request(p,kind,'level');await handlers[kind](req,s,18);const after=clone(s.player);const repeated=ack(await handlers[kind](req,s,19),tags[kind]);assert(repeated.replayed);assert.deepEqual(s.player,after);s.player=clone(durable);assert(ack(await handlers[kind](req,s,20),tags[kind]).replayed);s.player.fishInfo.balanceReceipts=[];assert.equal(ack(await handlers[kind](req,s,21),tags[kind]).reason,'FISH_BALANCE_STALE');assert.equal(s.player.items[68],after.items[68]);return{replay:true,evictedCannotReplay:true};});
await probe(kind+'_sameid_different_operation_conflict',async()=>{const{p,s}=base(kind,1,1,0),req=request(p,kind,'level');await handlers[kind](req,s,22);const before=clone(s.player);assert.equal(ack(await handlers[kind]({...req,action:'fast',upgradeAll:true},s,23),tags[kind]).reason,'FISH_REQUEST_CONFLICT');assert.deepEqual(s.player,before);return{unchanged:true};});
await probe(kind+'_max_reject_every_action_and_hide_all_buttons',async()=>{const row=cfg(kind)[10],{p,s}=base(kind,10,row.level,row.exp);const before=clone(p);for(const action of ['grade','level','fast'])assert.equal((await upgrade(s,kind,action)).reason,'FISH_GEAR_MAX');assert.deepEqual(p,before);const ui=clientPanel(kind,p);assert(ui.max);assert(!ui.gradeUp&&!ui.levelUp&&!ui.fastUp);return ui;});
await probe(kind+'_locked_feature_and_invalid_state_no_mutation',async()=>{const{p,s}=base(kind);p.systemUnlockInfo.unlockedSystem=[];assert.equal((await upgrade(s,kind,'level')).reason,'FISH_GEAR_LOCKED');p.systemUnlockInfo.unlockedSystem=[215,223];p.fishInfo[kind+'Level']=999999;const before=clone(p);assert.equal((await upgrade(s,kind,'level')).reason,'FISH_GEAR_STATE_INVALID');assert.deepEqual(p,before);return{guarded:true};});
for(const action of ['level','fast','grade'])for(const mode of ['null','throw'])await probe(kind+'_'+action+'_save_'+mode,async()=>{const row=cfg(kind)[1],{p,s}=base(kind,1,action==='grade'?row.level:1,action==='grade'?row.exp:0),before=clone(p);saveMode=mode;await assert.rejects(()=>handlers[kind](request(p,kind,action),s,30));assert.equal(s.player,null);assert.deepEqual(durable,before);assert.deepEqual(p,before);return{durableUnchanged:true,invalidated:true};});
await probe(kind+'_native_requests_separate_grade_and_sync_state_on_reject',async()=>{const{p}=base(kind,1,10,0);let sent;const ctx={Y:{FishingModel:{},OldTrekFishingModel:{},SoundManager:{PlayEffect(){}},CuriosModel:{taskCheck(){}}},A:{ins:()=>({dispatch(){}})},E:{},S:{ins:()=>({showTips(){}})}};const model={fishInfo:p.fishInfo,Rpc(tag,data,callback){assert.equal(tag,tags[kind]);sent=data;callback({result:1,reason:'FISH_GEAR_STALE',rank:1,level:10,exp:cfg(kind)[1].exp,balanceRevision:9});}};const fn=vm.runInNewContext('('+extract('u.send'+(kind==='rod'?'Rod':'Raft')+'Upgrade=function')+')',ctx);fn.call(model,false);assert.equal(sent.action,'level');assert.equal(sent.expectedState.exp,0);assert.equal(model.fishInfo.balanceRevision,9);assert.equal(model.fishInfo[kind+'Exp'],cfg(kind)[1].exp);fn.call(model,false,'grade');assert.equal(sent.action,'grade');fn.call(model,true);assert.equal(sent.action,'fast');return{explicitAction:true,stateSynced:true};});
}
await probe('native_grade_buttons_send_grade_intent_only',async()=>{const sent=[];for(const kind of ['rod','raft']){const row=cfg(kind)[1],{p}=base(kind,1,row.level,row.exp);const ctx={Y:{Config:tables,FishingModel:{getFishInfo:()=>p.fishInfo,sendRodUpgrade:(fast,mode)=>sent.push({kind,fast,mode}),sendRaftUpgrade:(fast,mode)=>sent.push({kind,fast,mode})},ItemModel:{checkItemEnough:()=>true}}};const panel={btnGradeUp:{},btnLevelUp:{},btnFastUp:{},spLevelUpEff1:{setAnimation(){}},playLevelAttrEff(){},playStageAttrEff(){}};const fn=vm.runInNewContext('('+extract(kind==='rod'?'a.onClickGradeUp=function':'a.onClick=function',classes[kind])+')',ctx);fn.call(panel,kind==='raft'?{currentTarget:panel.btnGradeUp}:undefined);}assert.deepEqual(sent,[{kind:'rod',fast:false,mode:'grade'},{kind:'raft',fast:false,mode:'grade'}]);return sent;});
await probe('raft_mastery_exact_rank_bonus_plus_wash_cap_and_unlock',async()=>{const{p}=base('raft',10,1,0);p.fishInfo.rodAttrs=[];assert.equal(service.raftMastery(p.fishInfo,p),1500);assert(balance.skipCost(p.fishInfo,'bait',()=>1499,p));assert(!balance.skipCost(p.fishInfo,'bait',()=>1500,p));p.fishInfo.rodAttrs=[{type:104,value:600}];assert(balance.skipCost(p.fishInfo,'bait',()=>2099,p));assert(!balance.skipCost(p.fishInfo,'bait',()=>2100,p));p.fishInfo.rodAttrs=[{type:104,value:9000}];assert(!balance.skipCost(p.fishInfo,'bait',()=>2500,p));p.fishInfo.rodAttrs=[];p.systemUnlockInfo.unlockedSystem=[];assert.equal(service.raftMastery(p.fishInfo,p),0);assert(!balance.skipCost(p.fishInfo,'bait',()=>0,p));return{base:1500,withWash:2100,cap:2500,locked:0};});
await probe('real_catch_uses_raft_mastery_without_making_energy_free',async()=>{const{p,s}=base('raft',10,1,0);p.items[65]=3;p.items[5512]=1;p.fishInfo.foodBag=[5512];const original=require('crypto').randomInt;require('crypto').randomInt=()=>0;try{const r=ack(await fish.handleFishCatch({count:1},s,50),4000);assert.equal(r.result,0);assert.equal(p.items[5512],1);assert.equal(p.items[65],2);return{baitSaved:true,energyUsed:1};}finally{require('crypto').randomInt=original;}});
await probe('newgrade_attributes_never_reduce_at_all_boundaries',async()=>{let count=0;for(const kind of ['rod','raft'])for(let rank=1;rank<10;rank++){const row=cfg(kind)[rank],next=cfg(kind)[rank+1];for(const id of Object.keys(row.fullLevelAttrs)){const before=row.fullLevelAttrs[id]+(row.levelUpAttrs[id]||0)*row.level,after=next.fullLevelAttrs[id]+(next.levelUpAttrs[id]||0);assert(after>=before);count++;}}return{attributeComparisons:count};});
const snapshotPath=process.env.GEAR_BASELINE_RUNTIME||path.resolve(__dirname,'../temp/fishing_audit_20260906T003428Z/runtime.json');
if(fs.existsSync(snapshotPath))await probe('historical_profiles_no_rank_level_exp_or_attrs_migration',async()=>{const runtime=JSON.parse(fs.readFileSync(snapshotPath)),out={};for(const[db,d]of Object.entries(runtime)){let n=0;for(const p of d.players){for(const kind of ['rod','raft']){if(p.fishInfo[kind+'Rank']==null)continue;const copy=clone(p.fishInfo),before=clone(copy);service.read(copy,kind);assert.deepEqual(copy,before);n++;}}out[db]=n;}return out;});
const output={generatedAt:new Date().toISOString(),result:cases.every(x=>x.status==='PASS')?'PASS':'FAIL',count:cases.length,matrixCases:matrix,cases};fs.writeFileSync(path.join(root,'gear-tests.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));if(output.result!=='PASS')process.exitCode=1;
}
mainWork().catch(e=>{console.error(e.stack);process.exitCode=1;});
