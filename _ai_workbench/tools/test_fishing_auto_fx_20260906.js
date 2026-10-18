'use strict';
// Actual auto callback + actual native flight/pulse helpers, detached from game/network.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),net=require('net');
const root=path.resolve(process.argv[2]),app=path.join(root,'app');
const acorn=require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
net.Socket.prototype.connect=()=>{throw Error('AUTO_FX_TEST_NETWORK_FORBIDDEN');};
const clone=x=>JSON.parse(JSON.stringify(x));
function stub(rel,exports){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports};}
let durable,saves;
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{async savePlayer(id,p){saves++;durable=clone(p);return p;},wasRecentlySaved:()=>false});
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables(),fish=require(path.join(app,'src/handlers/fish'));
const main=fs.readFileSync(path.join(root,'main.fixed.js'),'utf8'),original=fs.readFileSync(path.join(root,'main.js'),'utf8');
function extract(marker,source=main,from=0){const p=source.indexOf(marker,from);assert(p>=0,marker);let n=acorn.parseExpressionAt(source,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];return source.slice(n.start,n.end);}
function entity(type,uid,value){return {id:5001+10*type,uid,type,quality:2,multi:10000,attrs:[{type:1,level:1,value}],skills:[],tempSkills:{},lock:0,dead:0};}
function base(kind='mixed'){
  saves=0;const p={userId:'fx-memory',playerId:'fx-role',serverId:1001,level:116,name:'QA FX',roleInfo:{kungfuId:4,subJob:0},items:{65:100,68:100},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},taskInfo:{},fishInfo:{level:28,scene:1},systemUnlockInfo:{unlockedSystem:[215,221]},rechargeInfo:{monthCards:{}}};
  fish.ensureFishInfo(p);
  if(kind==='sell'){p.fishInfo.slots[1]=entity(1,1001,99999);p.fishInfo.fishResult.fishInfos=[entity(1,2001,1)];}
  else if(kind==='equip'){p.fishInfo.fishResult.fishInfos=[entity(1,2001,100)];}
  else if(kind==='multi'){p.fishInfo.fishResult.fishInfos=Array.from({length:10},(_,i)=>entity(i+1,2001+i,100));}
  else if(kind==='held'){p.fishInfo.fishResult.fishInfos=[{...entity(1,2001,100),lock:1}];}
  else {p.fishInfo.slots[1]=entity(1,1001,10);p.fishInfo.slots[2]=entity(2,1002,99999);p.fishInfo.fishResult.fishInfos=[entity(1,2001,1000),entity(2,2002,1)];}
  durable=clone(p);return {p,s:{userId:p.userId,player:p}};
}
function client(info){
  const trace={flights:[],pulses:0,events:[],starts:0,heldPanels:0,requests:[],next:[],tips:[]},stage={};
  const node=id=>({id,stage,parent:stage});const actor=node('actor'),coin=node('coin68'),crystal=node('coin69');
  const slots=Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,node('slot'+(i+1))]));
  const view={...node('view'),fishEquipPartView:{getEquipItemByType:t=>slots[t]},powerCurrency1:{data:{itemId:68},animGr:coin},powerCurrency2:{data:{itemId:69},animGr:crystal}};
  const raid={mMapId:info.scene,fishMainView:view,getMyEntity:()=>actor};
  const model={isAutoFish:true,fishInfo:clone(info),parseFishInfo(){},startAutoFish(){trace.starts++;},openFishRewardPanel(){trace.heldPanels++;},Rpc(tag,data,callback){trace.requests.push({tag,data,callback});}};
  const ctx={Y:{Config:tables,RaidMgr:{mFishRaid:raid},FishingModel:model},E:{ATTR_CHANGE:'attr',FISH_ILLUS_UPDATE:'atlas',FISH_DEAL_UPDATE:'deal'},
    A:{ins:()=>({dispatch:(...x)=>trace.events.push(x)})},S:{ins:()=>({showTips:t=>trace.tips.push(t)})},y:{ins:()=>({doNext:fn=>trace.next.push(fn)})},
    sc:{onePosToOtherPos:(from,to,data,cb)=>{trace.flights.push({from:from.id,to:to.id,data:clone(data),stateUid:model.fishInfo.slots[1]?.uid});if(cb)cb();},coinFlyBtnAnim:()=>trace.pulses++},F:{get:x=>x}};
  const fn=marker=>vm.runInNewContext('('+extract(marker)+')',ctx);
  view.playPutInIconFlyAnim=fn('a.playPutInIconFlyAnim=function');view.playSellIconFlyAnim=fn('a.playSellIconFlyAnim=function');
  model.playAutoPowerFishEffects=fn('u.playAutoPowerFishEffects=function');model.sendAutoPowerFish=fn('u.sendAutoPowerFish=function');model.reconnectSuccess=fn('u.reconnectSuccess=function');
  return {model,view,raid,actor,coin,slots,ctx,trace,flush(){while(trace.next.length)trace.next.shift()();}};
}
const ack=(out,uid)=>(Array.isArray(out)?out:[out]).find(p=>p.msgUid===uid).data;
async function transaction(kind='mixed'){
  const {p,s}=base(kind),h=client(p.fishInfo);h.model.sendAutoPowerFish(true);assert.equal(h.trace.requests.length,1);assert.equal(h.trace.flights.length,0);
  const request=h.trace.requests[0],out=await fish.handleFishDealMulti(request.data,s,600),r=ack(out,600);assert.equal(r.result,0);
  return {p,s,h,request,out,r};
}
const cases=[];
async function test(name,fn){try{cases.push({name,status:'PASS',evidence:await fn()});}catch(e){cases.push({name,status:'FAIL',error:e.stack});}}
async function run(){
  for(const [kind,equips,sales] of [['sell',0,1],['equip',1,0],['mixed',1,1],['multi',10,0]])await test(kind+'_confirmed_auto_ACK_uses_native_flights',async()=>{
    const{h,request,r,s}=await transaction(kind),server=clone(s.player);request.callback(clone(r));
    assert.equal(h.trace.flights.filter(x=>x.to.startsWith('slot')).length,equips);assert.equal(h.trace.flights.filter(x=>x.to==='coin68').length,sales);assert.equal(h.trace.pulses,sales);
    for(const f of h.trace.flights)assert.equal(f.from,'actor');
    for(const e of r.equipped)assert(h.trace.flights.some(x=>x.to==='slot'+e.type&&x.data.iconName===tables.AssetsConfig[e.id].icon));
    assert.deepEqual(s.player,server);assert.equal(saves,1);assert.equal(h.model.fishInfo.slots[1]?.uid,s.player.fishInfo.slots[1]?.uid);
    assert.equal(h.trace.starts,0);h.flush();assert.equal(h.trace.starts,1);return {equipFlights:equips,saleFlights:sales,coinPulses:sales};
  });
  await test('locked_held_fish_no_flight_or_next_cast',async()=>{const{h,r,request}=await transaction('held');request.callback(clone(r));assert.equal(h.trace.flights.length,0);assert.equal(h.trace.heldPanels,1);assert.equal(h.model.isAutoFish,false);h.flush();assert.equal(h.trace.starts,0);});
  await test('partial_held_batch_animates_only_confirmed_successes',async()=>{
    const{p,s}=base();p.fishInfo.fishResult.fishInfos.push({...entity(3,2003,100),lock:1});const h=client(p.fishInfo);h.model.sendAutoPowerFish(true);const request=h.trace.requests[0],r=ack(await fish.handleFishDealMulti(request.data,s,601),601);request.callback(clone(r));
    assert.deepEqual(h.trace.flights.map(x=>x.to),['slot1','coin68']);assert.equal(h.model.fishInfo.fishResult.fishInfos[0].uid,2003);assert.equal(h.trace.heldPanels,1);assert.equal(h.model.isAutoFish,false);
  });
  await test('failed_response_never_starts_effects',async()=>{const{p}=base(),h=client(p.fishInfo);h.model.sendAutoPowerFish(true);h.trace.requests[0].callback({result:1,reason:'FAIL'});assert.equal(h.trace.flights.length,0);assert.equal(h.model.isAutoFish,false);assert.equal(h.trace.starts,0);});
  await test('same_callback_delivered_twice_effects_and_next_cast_once',async()=>{
    const{h,r,request}=await transaction();request.callback(clone(r));const before=clone(h.model.fishInfo);request.callback(clone(r));assert.equal(h.trace.flights.length,2);assert.equal(h.trace.next.length,1);assert.deepEqual(h.model.fishInfo,before);h.flush();assert.equal(h.trace.starts,1);
  });
  await test('server_receipt_replay_no_duplicate_flight_or_reward',async()=>{
    const{h,r,request,s}=await transaction();const coins=s.player.items[68],again=ack(await fish.handleFishDealMulti(request.data,s,602),602);assert(again.replayed);request.callback(clone(again));assert.equal(h.trace.flights.length,0);assert.equal(s.player.items[68],coins);assert.equal(h.model.fishInfo.slots[1].uid,r.equipped[0].uid);
  });
  await test('reconnect_ignores_old_callback_entirely',async()=>{const{h,r,request}=await transaction();h.model.reconnectSuccess();const before=clone(h.model.fishInfo);request.callback(clone(r));assert.deepEqual(h.model.fishInfo,before);assert.equal(h.trace.flights.length,0);assert.equal(h.model._autoPowerPending,false);});
  for(const missing of ['raid','view','stage','parent','actor','new-raid','same-raid-new-view','scene'])await test('stale_or_missing_'+missing+'_skips_FX_but_applies_server_state',async()=>{
    const{h,r,request}=await transaction();
    if(missing==='raid')h.ctx.Y.RaidMgr.mFishRaid=null;
    if(missing==='view')h.raid.fishMainView=null;
    if(missing==='stage')h.view.stage=null;
    if(missing==='parent')h.view.parent=null;
    if(missing==='actor')h.raid.getMyEntity=()=>null;
    if(missing==='new-raid')h.ctx.Y.RaidMgr.mFishRaid={mMapId:1,fishMainView:h.view};
    if(missing==='same-raid-new-view')h.raid.fishMainView={...h.view};
    if(missing==='scene')h.model.fishInfo.scene=2;
    request.callback(clone(r));assert.equal(h.trace.flights.length,0);assert.equal(h.model.fishInfo.slots[1].uid,2001);assert.equal(h.model._autoPowerPending,false);
  });
  await test('request_sent_in_background_cannot_animate_later_opened_view',async()=>{
    const{p,s}=base(),h=client(p.fishInfo);h.raid.fishMainView=null;h.model.sendAutoPowerFish(true);h.raid.fishMainView=h.view;const request=h.trace.requests[0],r=ack(await fish.handleFishDealMulti(request.data,s,603),603);request.callback(clone(r));assert.equal(h.trace.flights.length,0);assert.equal(h.model.fishInfo.slots[1].uid,2001);
  });
  await test('missing_equip_target_does_not_block_sale_or_loop',async()=>{const{h,r,request}=await transaction();h.slots[1].stage=null;request.callback(clone(r));assert.deepEqual(h.trace.flights.map(x=>x.to),['coin68']);h.flush();assert.equal(h.trace.starts,1);});
  await test('missing_coin_target_does_not_block_equip_or_loop',async()=>{const{h,r,request}=await transaction();h.coin.stage=null;request.callback(clone(r));assert.deepEqual(h.trace.flights.map(x=>x.to),['slot1']);h.flush();assert.equal(h.trace.starts,1);});
  await test('native_animation_error_does_not_block_state_or_auto',async()=>{const{h,r,request}=await transaction();h.ctx.sc.onePosToOtherPos=()=>{throw Error('TEST_RENDER_ERROR');};request.callback(clone(r));assert.equal(h.model.fishInfo.slots[1].uid,2001);h.flush();assert.equal(h.trace.starts,1);});
  await test('user_stop_inflight_allows_confirmed_FX_but_no_new_cast',async()=>{const{h,r,request}=await transaction();h.model.isAutoFish=false;request.callback(clone(r));assert.equal(h.trace.flights.length,2);h.flush();assert.equal(h.trace.starts,0);});
  await test('malformed_unmatched_equip_and_unsold_rewards_no_false_FX',async()=>{const{h,r}=await transaction();r.equipped=[{type:1,uid:999,id:5011}];r.soldUids=[];h.model.playAutoPowerFishEffects(r,h.raid,h.view);assert.equal(h.trace.flights.length,0);});
  await test('FX_does_not_mutate_server_reply_or_inventory',async()=>{const{h,r,s}=await transaction();const before=clone(r),coins=s.player.items[68];h.model.playAutoPowerFishEffects(r,h.raid,h.view);assert.deepEqual(r,before);assert.equal(s.player.items[68],coins);assert.equal(saves,1);});
  await test('client_patch_exact_scope_preserves_map_level_only_speed_and_all_other_functions',async()=>{
    const b=JSON.parse(fs.readFileSync(path.join(root,'client-build.json'),'utf8'));let restored=main;
    for(const [a,z]of [[b.helper,''],[b.after,b.before]]){assert.equal(restored.split(a).length-1,1);restored=restored.replace(a,z);}assert.equal(restored,original);
    for(const m of ['H_e.isSceneUnlock=function','u.unlockNewSceneId=function','u.isFishSpeedAdd=function','u.startAutoFish=function','r.startFishing=function','u.sendDealFishMutl=function'])assert.equal(extract(m),extract(m,original));
    assert(!b.helper.includes('Rpc('));assert(!b.helper.includes('setTimeout'));assert(!b.helper.includes('setInterval'));assert(!b.helper.includes('ItemModel'));
  });
  const output={result:cases.every(x=>x.status==='PASS')?'PASS':'FAIL',count:cases.length,nativeVisual:false,cases};fs.writeFileSync(path.join(root,'auto-fx-tests.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));if(output.result!=='PASS')process.exitCode=1;
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
