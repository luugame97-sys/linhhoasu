'use strict';
// Reuse the native-panel audit harness, with positive regression expectations.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const file=path.join(__dirname,'test_fishing_gear_fix_20260906.js');let s=fs.readFileSync(file,'utf8');
s=s.slice(0,s.indexOf('async function mainWork(){'));
s=s.replace("// Production snapshot only. No network and every save is captured in memory.","// Candidate only. No network; all writes are captured in memory.");
s=s.replace("require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'))","require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'))");
s=s.replace("path.join(root,'main.js')","path.join(root,'main.fixed.js')");
s=s.replace("activityInfo:{datas:[]}","activityInfo:{datas:[]},systemUnlockInfo:{unlockedSystem:[215,223]}");
s+=String.raw`
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
  for(const state of initial)for(const action of ['level','fast','grade'])for(const funds of [0,1,row.gradeUpCost?.count||5,100000]){
   const{p,s}=base(kind,rank,state.level,state.exp,funds,funds),before=clone(p),ui=clientPanel(kind,p),r=await upgrade(s,kind,action);
   const full=state.level===row.level&&state.exp===row.exp;
   const cost=action==='grade'?row.gradeUpCost:row.levelUpCost;
   const allowed=!(full&&rank===10)&&(action==='grade'===full)&&!!cost&&funds>=cost.count;
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
await probe('raft_mastery_exact_rank_bonus_plus_wash_cap_and_unlock',async()=>{const{p}=base('raft',10,1,0);p.fishInfo.rodAttrs=[];assert.equal(service.raftMastery(p.fishInfo,p),1500);assert(balance.skipCost(p.fishInfo,'bait',()=>1499,p));assert(!balance.skipCost(p.fishInfo,'bait',()=>1500,p));p.fishInfo.rodAttrs=[{type:104,value:600}];assert(balance.skipCost(p.fishInfo,'bait',()=>2099,p));assert(!balance.skipCost(p.fishInfo,'bait',()=>2100,p));p.fishInfo.rodAttrs=[{type:104,value:9000}];assert(!balance.skipCost(p.fishInfo,'bait',()=>2500,p));p.fishInfo.rodAttrs=[];p.systemUnlockInfo.unlockedSystem=[];assert.equal(service.raftMastery(p.fishInfo,p),0);assert(!balance.skipCost(p.fishInfo,'bait',()=>0,p));return{base:1500,withWash:2100,cap:2500,locked:0};});
await probe('real_catch_uses_raft_mastery_without_making_energy_free',async()=>{const{p,s}=base('raft',10,1,0);p.items[65]=3;p.items[5512]=1;p.fishInfo.foodBag=[5512];const original=require('crypto').randomInt;require('crypto').randomInt=()=>0;try{const r=ack(await fish.handleFishCatch({count:1},s,50),4000);assert.equal(r.result,0);assert.equal(p.items[5512],1);assert.equal(p.items[65],2);return{baitSaved:true,energyUsed:1};}finally{require('crypto').randomInt=original;}});
await probe('newgrade_attributes_never_reduce_at_all_boundaries',async()=>{let count=0;for(const kind of ['rod','raft'])for(let rank=1;rank<10;rank++){const row=cfg(kind)[rank],next=cfg(kind)[rank+1];for(const id of Object.keys(row.fullLevelAttrs)){const before=row.fullLevelAttrs[id]+(row.levelUpAttrs[id]||0)*row.level,after=next.fullLevelAttrs[id]+(next.levelUpAttrs[id]||0);assert(after>=before);count++;}}return{attributeComparisons:count};});
const snapshotPath=process.env.GEAR_BASELINE_RUNTIME||path.resolve(__dirname,'../temp/fishing_audit_20260906T003428Z/runtime.json');
if(fs.existsSync(snapshotPath))await probe('historical_profiles_no_rank_level_exp_or_attrs_migration',async()=>{const runtime=JSON.parse(fs.readFileSync(snapshotPath)),out={};for(const[db,d]of Object.entries(runtime)){let n=0;for(const p of d.players){for(const kind of ['rod','raft']){if(p.fishInfo[kind+'Rank']==null)continue;const copy=clone(p.fishInfo),before=clone(copy);service.read(copy,kind);assert.deepEqual(copy,before);n++;}}out[db]=n;}return out;});
const output={generatedAt:new Date().toISOString(),result:cases.every(x=>x.status==='PASS')?'PASS':'FAIL',count:cases.length,matrixCases:matrix,cases};fs.writeFileSync(path.join(root,'gear-tests.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));if(output.result!=='PASS')process.exitCode=1;
}
mainWork().catch(e=>{console.error(e.stack);process.exitCode=1;});
`;
// Avoid JavaScript chained equality: compare whether action is grade to readiness.
s=s.replace("(action==='grade'===full)","((action==='grade')===full)");
fs.writeFileSync(file,s);
