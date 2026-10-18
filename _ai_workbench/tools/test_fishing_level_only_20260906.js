'use strict';
// New availability policy + audit-only auto FX probes. No sockets or real player writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),net=require('net');
const root=path.resolve(process.argv[2]),app=path.join(root,'app');
const acorn=require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
net.Socket.prototype.connect=()=>{throw Error('LEVEL_ONLY_TEST_NETWORK_FORBIDDEN');};
const clone=x=>JSON.parse(JSON.stringify(x));
function stub(rel,exports){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports};}
let saves=0,durable,mode='ok',ageReads=0;
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{async savePlayer(id,p){saves++;if(mode==='null')return null;if(mode==='throw')throw Error('TEST_SAVE_FAIL');durable=clone(p);return p;},wasRecentlySaved:()=>false});
stub('src/db/models/GameServer',{findOne(){ageReads++;throw Error('LEVEL_ONLY_MUST_NOT_READ_SERVER_AGE');}});
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables();
const integrity=require(path.join(app,'src/services/FishingIntegrityService')),fish=require(path.join(app,'src/handlers/fish'));
const main=fs.readFileSync(path.join(root,'main.fixed.js'),'utf8'),original=fs.readFileSync(path.join(root,'main.js'),'utf8');
const cases=[],audit=[];const normal=Object.values(tables.FishSceneConfig).filter(r=>!r.isActivity),events=Object.values(tables.FishSceneConfig).filter(r=>r.isActivity);
function extract(marker,source=main,from=0){const p=source.indexOf(marker,from);assert(p>=0,marker);let n=acorn.parseExpressionAt(source,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];assert.equal(n.type,'FunctionExpression');return source.slice(n.start,n.end);}
function base(level=28){saves=0;mode='ok';const p={userId:'level-memory',playerId:'level-role',serverId:1001,level:116,name:'QA Level',roleInfo:{kungfuId:4,subJob:0},items:{65:100,68:100,5534:100},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},taskInfo:{},fishInfo:{level,scene:1,food:5534,foodBag:[5534]},systemUnlockInfo:{unlockedSystem:[215,221],settings:{}},rechargeInfo:{monthCards:{}}};fish.ensureFishInfo(p);durable=clone(p);return {p,s:{userId:p.userId,player:p,_fishRoomMapId:1}};}
const rows=r=>Array.isArray(r)?r:[r],ack=(r,uid)=>rows(r).find(p=>p.msgUid===uid).data;
async function check(name,fn,target=cases){try{target.push({name,status:'PASS',evidence:await fn()});}catch(e){target.push({name,status:'FAIL',error:e.stack});}}
function native(level,day,source=main){const model={fishInfo:{level,scene:1}};
  const ctx={Y:{Config:tables,FishingModel:model},T:{serverOpenDay:day},rc:{GetArray:Object.values},
    B:{strformatByLangId:(id,value)=>id===30035813?'Câu cá đạt cấp '+value:'SERVER_DAY_'+value,ConvertLanguageToText:id=>id===30035816?' mở khóa':String(id)},
    U:{ArrayCollection:class{constructor(items){this.items=items;}}}};
  const unlock=vm.runInNewContext('('+extract('H_e.isSceneUnlock=function',source)+')',ctx);ctx.ED={isSceneUnlock:unlock};
  const next=vm.runInNewContext('('+extract('u.unlockNewSceneId=function',source)+')',ctx);
  const update=vm.runInNewContext('('+extract('a.UpdateContent=function',source,source.indexOf('i(pmt,'))+')',ctx);
  const view=id=>{const p={sceneLevel:id,_cfgList:normal,getUnLockListData:()=>[],getTruckListData:()=>[],updateRed(){}};
    for(const k of ['lockGr','sceneImg','lockDesc','sceneName','fishList','truckList','gotoBtn','curSceneDesc','leftBtn','rightBtn'])p[k]={};update.call(p);return p;};
  return {ctx,model,unlock,next,view};
}
function entity(uid,type,value){const id=5001+type*10;return {id,uid,type,quality:tables.FishConfig[id].quality,multi:10000,attrs:[{type:1,level:1,value}],skills:[],tempSkills:{},lock:0,dead:0};}
function clientFx(info){const trace={saleFlights:0,equipFlights:0,coinPulses:0,events:[],starts:0,rpcs:[]};
  const rewardPanel={newNameLab:{}},view={playSellIconFlyAnim(){trace.saleFlights++;},playPutInIconFlyAnim(){trace.equipFlights++;}};
  const model={fishInfo:clone(info),isAutoFish:true,parseFishInfo(){},unlockPic(){},isHaveNotDeadFish(){return this.fishInfo.fishResult.fishInfos.length>0;},startAutoFish(){trace.starts++;},openFishRewardPanel(){},isPlayingMiniGame:()=>false,isNeedSlientMode:()=>false};
  const ctx={B:{deepCopy:clone},Y:{Config:tables,FishingModel:model,OldTrekFishingModel:{},CuriosModel:{taskCheck(){}},FishRoomModel:{getFishWin:()=> 'main'},RaidMgr:{mFishRaid:{getMyEntity:()=>({})}}},
    P:{ins:()=>({getView:type=>type==='main'?view:rewardPanel})},yx:{},yD:{FishDealType:{putIn:0,submit:1,shell:2}},
    S:{ins:()=>({showTips(){}})},A:{ins:()=>({dispatch:(...a)=>trace.events.push(a)})},E:{ATTR_CHANGE:'attr',FISH_ILLUS_UPDATE:'atlas',FISH_DEAL_UPDATE:'deal'},
    y:{ins:()=>({doNext:fn=>fn(),doTimer(){}})},Er:{OpenWithItems(){}}};
  model.Rpc=(tag,data,callback)=>trace.rpcs.push({tag,data,callback});
  return {model,trace,auto:vm.runInNewContext('('+extract('u.sendAutoPowerFish=function')+')',ctx),legacy:vm.runInNewContext('('+extract('u.sendDealFishMutl=function')+')',ctx)};
}
async function run(){
  await check('oracle_normal_maps_and_original_day_requirements',async()=>{assert.equal(normal.length,7);assert.equal(tables.FishSceneConfig[6].cond,25);assert.equal(tables.FishSceneConfig[6].openDay,43);assert.equal(tables.FishSceneConfig[7].cond,28);assert.equal(tables.FishSceneConfig[7].openDay,71);return normal.map(r=>({id:r.id,level:r.cond,oldDays:r.openDay}));});
  for(const scene of normal)await check('server_and_client_level_boundary_map_'+scene.id,async()=>{
    for(const level of [Math.max(1,scene.cond-1),scene.cond,scene.cond+1]){
      const {p}=base(level),expected=level>=scene.cond;
      assert.equal(await integrity.canUseScene(p,scene.id),expected);
      for(const day of [0,1,2,42,43,70,71,999])assert.equal(native(level,day).unlock(scene.id),expected);
    }
  });
  await check('no_server_calendar_database_reads',async()=>{assert.equal(ageReads,0);});
  await check('native_old_build_reproduces_day_gate_new_build_opens_at_level',async()=>{
    for(const id of [6,7]){const level=tables.FishSceneConfig[id].cond;assert.equal(native(level,1,original).unlock(id),false);assert.equal(native(level,1).unlock(id),true);}
  });
  await check('level_panel_no_day_text_locked_until_required_level',async()=>{
    for(const id of [6,7]){const level=tables.FishSceneConfig[id].cond,locked=native(level-1,1).view(id),open=native(level,1).view(id);
      assert.equal(locked.lockGr.visible,true);assert.equal(locked.gotoBtn.visible,false);assert.equal(locked.lockDesc.text,'Câu cá đạt cấp '+level+' mở khóa');
      assert.equal(open.lockGr.visible,false);assert.equal(open.gotoBtn.visible,true);assert.equal(open.lockDesc.visible,false);
      assert(!locked.lockDesc.text.includes('SERVER_DAY'));}
  });
  await check('automatic_level_unlock_uses_level_without_waiting_for_days',async()=>{
    for(const [oldLv,newLv,scene]of [[24,25,6],[27,28,7],[24,28,7],[28,28,0]])assert.equal(native(newLv,1).next(oldLv,newLv),scene);
    assert.equal(native(25,1,original).next(24,25),0);
  });
  await check('activity_scene_server_rejection_and_native_day_rule_unchanged',async()=>{
    for(const r of events){const{p}=base(99);assert.equal(await integrity.canUseScene(p,r.id),false);for(const day of [0,1,99])assert.equal(native(99,day).unlock(r.id),native(99,day,original).unlock(r.id));}
    return {activityScenes:events.map(r=>r.id)};
  });
  await check('map_6_and_7_entry_and_catch_accept_at_level_no_item_cost_to_move',async()=>{
    for(const id of [6,7]){const{p,s}=base(tables.FishSceneConfig[id].cond),before=clone(p.items);
      const r=await fish.handleFishChangeScene({id},s,501);assert.equal(ack(r,501).result,0);assert.equal(rows(r)[1].data.mapId,id);assert.deepEqual(s.player.items,before);assert.equal(s._fishRoomMapId,id);
      // Existing gameplay uses the union of unlocked grounds, not only the selected ground.
      const pool=new Set(normal.filter(r=>r.cond<=p.fishInfo.level).flatMap(r=>r.fishes));
      const balance=require(path.join(app,'src/services/FishingBalanceService')),pick=balance.pick;let observed=[];
      balance.pick=(rows,...rest)=>{observed=rows.map(r=>r.id);return pick(rows,...rest);};
      let caught;try{caught=ack(await fish.handleFishCatch({count:1},s,502),502);}finally{balance.pick=pick;}
      assert.equal(caught.result,0);assert.equal(caught.fishResult.fishInfos.length,1);assert(pool.has(caught.fishResult.fishInfos[0].id));
      const catchable=[...pool].filter(id=>id>=5000&&id<5900&&tables.FishConfig[id]?.type>=1&&tables.FishConfig[id]?.type<=10);
      assert.deepEqual(observed,catchable);assert(tables.FishSceneConfig[id].fishes.some(f=>observed.includes(f)));}
  });
  await check('below_level_move_or_catch_refused_without_consumption',async()=>{
    for(const id of [6,7]){const{p,s}=base(tables.FishSceneConfig[id].cond-1),before=clone(p.items);assert.equal(ack(await fish.handleFishChangeScene({id},s,503),503).result,1);
      p.fishInfo.scene=id;assert.equal(ack(await fish.handleFishCatch({count:1},s,504),504).reason,'FISH_SCENE_LOCKED');assert.deepEqual(p.items,before);assert.equal(saves,0);}
  });
  for(const failure of ['null','throw'])await check('level_only_transition_save_'+failure+'_still_fail_closed',async()=>{const{p,s}=base(28);mode=failure;await assert.rejects(()=>fish.handleFishChangeScene({id:7},s,505));assert.equal(s.player,null);assert.equal(s._fishRoomMapId,1);assert.equal(p.fishInfo.scene,1);assert.equal(durable.fishInfo.scene,1);});
  await check('only_three_client_functions_changed_auto_and_speed_byte_identical',async()=>{
    const meta=JSON.parse(fs.readFileSync(path.join(root,'client-build.json'),'utf8'));assert.equal(meta.changes.length,3);let restored=main;
    for(const c of meta.changes.slice().reverse()){assert.equal(restored.split(c.after).length-1,1);restored=restored.replace(c.after,c.before);}assert.equal(restored,original);
    for(const name of ['u.sendAutoPowerFish=function','u.autoDealAllFish=function','u.sendDealFishMutl=function','u.isFishSpeedAdd=function','r.startFishing=function'])assert.equal(extract(name),extract(name,original));
  });
  await check('only_canUseScene_server_function_changed',async()=>{
    const strip=s=>{const ast=acorn.parse(s,{ecmaVersion:'latest'});return ast.body.filter(n=>!(n.type==='FunctionDeclaration'&&n.id.name==='canUseScene')).map(n=>s.slice(n.start,n.end)).join('\n');};
    assert.equal(strip(fs.readFileSync(path.join(app,'src/services/FishingIntegrityService.js'),'utf8')),strip(fs.readFileSync(path.join(root,'integrity.before.js'),'utf8')));
    assert.equal(fs.readFileSync(path.join(app,'src/handlers/fish.js'),'utf8'),fs.readFileSync(path.join(root,'fish.before.js'),'utf8'));
  });
  await check('auto_power_equips_and_sells_but_invokes_neither_native_flight',async()=>{
    const{p,s}=base(28);p.fishInfo.slots[1]=entity(7001,1,100);p.fishInfo.slots[2]=entity(7002,2,10000);
    p.fishInfo.fishResult.fishInfos=[entity(7003,1,100000),entity(7004,2,10)];
    const h=clientFx(p.fishInfo);h.auto.call(h.model,true);const request=h.trace.rpcs[0];assert.equal(request.tag,4008);
    const result=await fish.handleFishDealMulti(request.data,s,506),r=ack(result,506);assert.equal(r.result,0);assert.equal(r.equipped.length,1);assert.equal(r.soldUids.length,2);
    const inv=rows(result).find(p=>p.tag===1202);assert(inv);assert(inv.data.items.some(x=>x.id===68&&x.count>0));assert(s.player.items[68]>100);assert.equal(durable.fishInfo.slots[1].uid,7003);
    request.callback(clone(r));assert.equal(h.model.fishInfo.slots[1].uid,7003);assert.equal(h.model.fishInfo.fishResult.fishInfos.length,0);
    assert.equal(h.trace.saleFlights,0);assert.equal(h.trace.equipFlights,0);assert(h.trace.events.some(e=>e[0]==='deal'));
    return {classification:'CONFIRMED_MISSING_VISUAL_CALLS',equipped:1,sold:2,coinDelta:s.player.items[68]-100,inventory1202:true,nativeSaleFlightCalls:0,nativeEquipFlightCalls:0,stateSaved:true};
  },audit);
  for(const kind of ['sale','equip'])await check('legacy_'+kind+'_does_call_native_flight_with_same_UI_targets',async()=>{
    const{p,s}=base(28);p.fishInfo.fishResult.fishInfos=[entity(7101,1,100)];const h=clientFx(p.fishInfo);
    h.legacy.call(h.model,{[kind==='sale'?2:0]:[7101]},null,true,kind==='sale');
    const request=h.trace.rpcs[0],r=ack(await fish.handleFishDealMulti(request.data,s,507),507);assert.equal(r.result,0);request.callback(clone(r));
    assert.equal(h.trace[kind==='sale'?'saleFlights':'equipFlights'],1);return {nativeFlightCalls:1};
  },audit);
  await check('native_sale_and_equip_helpers_use_asset_flights_and_coin_pulse',async()=>{
    const effects=[];const ctx={Y:{Config:tables},sc:{onePosToOtherPos:(from,to,data,cb)=>{effects.push({from,to,data});if(cb)cb();},coinFlyBtnAnim:()=>effects.push({coinPulse:true})},F:{get:x=>x}};
    const start=main.indexOf('i(Ggt,'),sale=vm.runInNewContext('('+extract('a.playSellIconFlyAnim=function',main,start)+')',ctx),equip=vm.runInNewContext('('+extract('a.playPutInIconFlyAnim=function',main,start)+')',ctx);
    const view={powerCurrency1:{data:{itemId:68},animGr:'coin68'},powerCurrency2:{data:{itemId:69},animGr:'coin69'},fishEquipPartView:{getEquipItemByType:t=>'slot'+t}};
    sale.call(view,'actor',[{id:68,count:2}],true);equip.call(view,'actor',entity(7102,1,100));assert.equal(effects.filter(e=>e.coinPulse).length,1);
    assert(effects.some(e=>e.to==='coin68'));assert(effects.some(e=>e.to==='slot1'));
    return {nativeHelpersExist:true,coinPulse:true,saleAndEquipFlight:true,fxChanged:false};
  },audit);
  const output={result:cases.concat(audit).every(t=>t.status==='PASS')?'PASS':'FAIL',count:cases.length,auditCount:audit.length,ageReads,nativeVisual:false,cases,autoEffectsAudit:audit};
  fs.writeFileSync(path.join(root,'level-only-tests.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));if(output.result!=='PASS')process.exitCode=1;
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
