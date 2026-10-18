'use strict';
// Detached fixture: no network or real player writes. Native functions are from the served bundle.
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), vm = require('vm'), net = require('net');
const root = path.resolve(process.argv[2]), app = path.join(root, 'app');
const acorn = require(process.env.FISH_ACORN_PATH || path.resolve(__dirname, '../../linhhoasu/lhs/newServer/node_modules/acorn'));
process.env.CONFIG_BIN_PATH = path.join(root, 'server.bin');
process.env.NODE_ENV = 'test'; process.env.LOG_DIR = '';
net.Socket.prototype.connect = () => { throw Error('MAP_TEST_NETWORK_FORBIDDEN'); };
const clone = x => JSON.parse(JSON.stringify(x));
function stub(rel, exports) { const f = require.resolve(path.join(app, rel)); require.cache[f] = { id:f, filename:f, loaded:true, exports }; }
let durable, saves, mode, checkpoint, serverOpenTime;
stub('src/logger', { info(){}, warn(){}, error(){}, debug(){} });
stub('src/services/PlayerService', { async savePlayer(id, p) {
  saves++; if (checkpoint) checkpoint(p);
  if (mode === 'throw') throw Error('TEST_SAVE_THROW');
  if (mode === 'null') return null;
  durable = clone(p);
  if (mode === 'commit-throw') throw Error('TEST_COMMIT_TIMEOUT');
  return p;
}, wasRecentlySaved: () => false });
stub('src/db/models/GameServer', { findOne: () => ({ select: () => ({ lean: async () => serverOpenTime ? {openTime:serverOpenTime} : null }) }) });
const config = require(path.join(app, 'src/services/ConfigService')), tables = config.loadAllTables();
const fish = require(path.join(app, 'src/handlers/fish'));
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8'), cases = [];
const scenePolicy = process.env.FISH_SCENE_POLICY || 'server-age';
assert(['server-age','level-only'].includes(scenePolicy));
const rows = r => Array.isArray(r) ? r : [r];
const ack = (r, uid) => rows(r).find(x => x.msgUid === uid).data;
const entry = r => rows(r).find(x => x.tag === 4050 && x.msgUid === 0);
function base() {
  saves=0; mode='ok'; checkpoint=null; serverOpenTime=Date.now()-100*86400000;
  const p = {userId:'qa-map-memory', playerId:'qa-map-role', name:'QA Map', serverId:1001, level:116,
    roleInfo:{kungfuId:4,subJob:0}, items:{65:100,68:100,69:31,70:6,5534:100},
    currencies:{diamond:123,silver:456,gold:789}, fishInfo:{level:99,scene:1,food:5534,foodBag:[5534]},
    systemUnlockInfo:{unlockedSystem:[215,221,223],settings:{}}, other_attr_info:{}, rechargeInfo:{monthCards:{}}, taskInfo:{}};
  fish.ensureFishInfo(p); durable=clone(p);
  const events=[], s={userId:p.userId,player:p,_fishRoomMapId:1,_broadcastExceptUser:(tag,data)=>events.push({tag,data:clone(data),savedScene:durable.fishInfo.scene})};
  return {p,s,events};
}
function entity(uid) { return {id:5011,uid,type:1,quality:2,multi:10000,attrs:[{type:1,level:1,value:1000}],skills:[1],tempSkills:{1:[1]},lock:1,dead:0}; }
function protectedState(p) { const x=clone(p.fishInfo); delete x.scene; return {fishInfo:x,items:clone(p.items),currencies:clone(p.currencies),settings:clone(p.systemUnlockInfo)}; }
function enrich(p) {
  p.fishInfo.fishResult.fishInfos=[entity(7001)]; p.fishInfo.slots[1]=entity(7002);
  p.fishInfo.catchResult.infos=[{id:6011,uid:7003,multi:1234,minAddRate:[100,200]}];
  p.fishInfo.fishSoulSlots={1:[{id:6011,uid:7004,multi:2345,minAddRate:[100]}]};
  p.fishInfo.rodTempAttrs=[{type:101,level:1,value:100}];
  p.fishInfo.autoPowerHistory=[{requestId:'map-preserve-1',time:12345,sold:[{uid:6999}],equipped:[],held:[]}];
  p.fishInfo.balanceReceipts=[{key:'map-preserve-1',response:{result:0}}];
  fish.ensureFishInfo(p); durable=clone(p);
}
async function check(name, fn) { try { const evidence=await fn(); cases.push({name,status:'PASS',evidence}); } catch(e) { cases.push({name,status:'FAIL',error:e.stack}); } }
function extract(marker, after=0) {
  const i=main.indexOf(marker,after); assert(i>=0,marker);
  let n=acorn.parseExpressionAt(main,i+marker.indexOf('function'),{ecmaVersion:'latest'});
  if(n.type==='SequenceExpression')n=n.expressions[0]; assert.equal(n.type,'FunctionExpression');
  return main.slice(n.start,n.end);
}
function nativeHarness(info) {
  const trace=[], timers=new Set(), pending=[];
  const model={fishInfo:clone(info),isAutoFish:false};
  const bus={dispatch:e=>trace.push(['event',e]),addListener(){},removeAll(){}};
  const panel={close(view){view.closed=true;onClose.call(view);trace.push(['close',view.mapId]);},
    open(){const view={mapId:model.fishInfo.scene,sceneBg:{},model,entityGr:{}};updateScene.call(view);return view;},
    showCloud:fn=>fn(),hideCloud(){}};
  const ctx={B:{deepCopy:clone},Y:{Config:tables,FishingModel:model,FishRoomModel:{getFishWin:()=>({})},
    FashionModel:{GetShowServerData:()=>({fashionMap:{}})},SoundManager:{playMapBgm(){}},GuideUtil:{continueGuide(){}},MessageCenter:{removeAll(){}}},
    P:{ins:()=>panel},A:{ins:()=>bus},F:{removeTweens(){}},AppInfo:{params:{}},
    E:{FISH_DEAK_TIP_UPDATE:'pending',EQUIP_FASHION_CHANGE:'appearance',FISH_CLOUD_END:'cloud',OLD_TREK_UPDATE_SAILINT_BGM:'bgm'},
    y:{ins:()=>({removeAll:r=>timers.delete(r)})},S:{ins:()=>({showTipsByLangId(){},showTips(){}})}};
  const fn=(marker,after=0)=>vm.runInNewContext('('+extract(marker,after)+')',ctx);
  const onClose=fn('a.OnClose=function',main.indexOf('i(Ggt,')),updateScene=fn('a.updateScene=function',main.indexOf('i(Ggt,'));
  class Raid {
    constructor(){this.m_CreatePlayerList=[];timers.add(this);}
    CreateRoleList(p){this.m_CreatePlayerList=clone(p);}
    RemoveAllEntity(){trace.push(['entities-cleared',this.mMapId]);}
    CreateAllPlayer(){} setSelfAlpha(){} entityPlayEnterAnim(){} getMyEntity(){return {};}
  }
  const raidStart=main.indexOf('i(Abt,'); assert(raidStart>=0);
  Raid.prototype.Init=fn(').Init=function',raidStart);
  for(const key of ['OnEnter','OnExit','Clear'])Raid.prototype[key]=fn('r.'+key+'=function',raidStart);
  ctx.il=Raid;
  const mgr=ctx.Y.RaidMgr={};mgr.FishMapClear=fn('_.FishMapClear=function');mgr.EnterFishMapRaid=fn('_.EnterFishMapRaid=function');
  const room={parseRoleData(){}}; const receive=fn('ESe.sc_fish_map_enter=function');
  model.Rpc=(tag,data,callback)=>pending.push({tag,data,callback});
  model.sendChangeScene=fn('u.sendChangeScene=function');model.cs_fish_map_leave=fn('u.cs_fish_map_leave=function');
  mgr.EnterFishMapRaid(info.scene,[]);
  return {model,mgr,trace,timers,pending,deliver(result){for(const p of rows(result)) {
    if(p.msgUid){const request=pending.shift();assert(request);assert.equal(request.tag,p.tag);request.callback(clone(p.data));}
    else if(p.tag===4050)receive.call(room,clone(p.data));
  }}};
}
async function run() {
  for(const id of [1,2,3,4,5,6,7])await check('change_scene_'+id+'_save_room_and_native_entry',async()=>{
    const {s,events}=base(); checkpoint=()=>assert.equal(s._fishRoomMapId,1);
    const r=await fish.handleFishChangeScene({id},s,100); assert.equal(ack(r,100).result,0);
    assert.equal(s.player.fishInfo.scene,id);assert.equal(durable.fishInfo.scene,id);assert.equal(s._fishRoomMapId,id);
    assert.deepEqual(rows(r).map(p=>[p.tag,p.msgUid]),[[4002,100],[4050,0]]);
    assert.equal(entry(r).data.mapId,id);assert.equal(saves,1);
    assert.deepEqual(events.map(e=>[e.tag,e.data.mapId,e.savedScene]),id===1?[]:[[4052,1,id],[4051,id,id]]);
  });
  await check('invalid_and_locked_maps_reject_without_save_or_mutation',async()=>{
    for(const method of ['handleFishChangeScene','handleFishEnterMap'])for(const id of [-1,0,1.5,'bad',999999,101,201]){
      const {p,s,events}=base(),before=clone(p);const r=await fish[method]({id},s,101);
      assert.equal(ack(r,101).result,1);assert.equal(entry(r),undefined);assert.deepEqual(p,before);assert.equal(saves,0);assert.equal(events.length,0);assert.equal(s._fishRoomMapId,1);
    }
    const {s}=base();s.player.fishInfo.level=1;assert.equal(ack(await fish.handleFishChangeScene({id:2},s,101),101).reason,'FISH_SCENE_LOCKED');assert.equal(saves,0);
  });
  await check('map_open_day_policy_'+scenePolicy,async()=>{
    for(const opened of [null,Date.now(),Date.now()+86400000]){const{s}=base();serverOpenTime=opened;const levelOnly=scenePolicy==='level-only';assert.equal(ack(await fish.handleFishChangeScene({id:7},s,102),102).result,levelOnly?0:1);assert.equal(saves,levelOnly?1:0);}
  });
  await check('entry_4050_uses_same_transition_and_legacy_packet_order',async()=>{
    const{s,events}=base();s._fishRoomMapId=0;s.player.fishInfo.scene=2;
    const r=await fish.handleFishEnterMap({},s,103);assert.deepEqual(rows(r).map(p=>[p.tag,p.msgUid]),[[4050,0],[4050,103]]);
    assert.equal(entry(r).data.mapId,2);assert.equal(s._fishRoomMapId,2);assert.deepEqual(events.map(x=>x.tag),[4051]);
  });
  await check('pending_fish_souls_locks_skills_preview_receipts_and_inventory_preserved',async()=>{
    const{p,s}=base();enrich(p);const before=protectedState(p);
    for(const id of [2,3,1,2])await fish.handleFishChangeScene({id},s,104);
    assert.deepEqual(protectedState(s.player),before);assert.deepEqual(protectedState(durable),before);assert.equal(p.fishInfo.scene,1);
  });
  for(const method of ['handleFishChangeScene','handleFishEnterMap','handleFishLeaveMap'])for(const failure of ['null','throw','commit-throw'])await check(method+'_'+failure+'_does_not_publish_unconfirmed_room',async()=>{
    const{p,s,events}=base();enrich(p);const before=clone(p);mode=failure;
    await assert.rejects(()=>fish[method]({id:2},s,105));assert.equal(s.player,null);assert.equal(s._fishRoomMapId,1);assert.deepEqual(events,[]);assert.deepEqual(p,before);
    assert.deepEqual(protectedState(durable),protectedState(before));
    assert.equal(durable.fishInfo.scene,failure==='commit-throw'&&method!=='handleFishLeaveMap'?2:1);
  });
  await check('native_scene_rebuild_closes_old_view_clears_timers_and_callback_once',async()=>{
    const{p,s}=base();enrich(p);const h=nativeHarness(p.fishInfo),old=h.mgr.mFishRaid;let called=0;
    h.model.isAutoFish=true;h.model.sendChangeScene(2,()=>called++);const before=clone(h.model.fishInfo.fishResult);
    h.deliver(await fish.handleFishChangeScene({id:2},s,106));
    assert.equal(h.mgr.mFishRaid.mMapId,2);assert.equal(h.mgr.mFishRaid.fishMainView.sceneBg.source,tables.FishSceneConfig[2].picture||'fishing_scene_1');
    assert.equal(h.model.isAutoFish,false);assert.equal(h.model.fishInfo.nextFishTime,0);assert.equal(called,1);assert.equal(h.model.changeSceneCallBack,null);
    assert.equal(old.fishMainView,null);assert(!h.timers.has(old));assert(h.timers.has(h.mgr.mFishRaid));assert.equal(h.timers.size,1);
    assert.deepEqual(h.model.fishInfo.fishResult,before);assert(h.trace.some(x=>x[0]==='close'&&x[1]===1));
    return {nativeFunctions:true,nativeVisual:false,map:2,callback:1,autoStopped:true,pendingPreserved:true};
  });
  await check('rapid_map_changes_end_on_latest_raid_without_old_timers',async()=>{
    const{p,s}=base(),h=nativeHarness(p.fishInfo);const ids=[2,3,2,1,3,3,2];for(const id of ids)h.model.sendChangeScene(id);
    for(const id of ids)h.deliver(await fish.handleFishChangeScene({id},s,107));
    assert.equal(h.mgr.mFishRaid.mMapId,2);assert.equal(h.model.fishInfo.scene,2);assert.equal(s._fishRoomMapId,2);assert.equal(h.timers.size,1);assert.equal(h.pending.length,0);
  });
  await check('leave_ack_then_change_fifo_does_not_clear_new_raid',async()=>{
    const{p,s}=base(),h=nativeHarness(p.fishInfo);h.model.cs_fish_map_leave();h.model.sendChangeScene(2);
    h.deliver(await fish.handleFishLeaveMap({},s,108));assert.equal(h.mgr.mFishRaid,null);
    h.deliver(await fish.handleFishChangeScene({id:2},s,109));assert.equal(h.mgr.mFishRaid.mMapId,2);assert.equal(s._fishRoomMapId,2);
  });
  await check('pending_catch_survives_map_and_blocks_second_consumption',async()=>{
    const{s}=base();const caught=await fish.handleFishCatch({count:3},s,110);assert.equal(ack(caught,110).result,0);
    const before=protectedState(s.player);await fish.handleFishChangeScene({id:2},s,111);assert.deepEqual(protectedState(s.player),before);
    const blocked=await fish.handleFishCatch({count:3},s,112);assert.equal(ack(blocked,112).reason,'FISH_PENDING');assert.deepEqual(s.player.items,before.items);
  });
  await check('no_player_fails_closed',async()=>{
    for(const method of ['handleFishChangeScene','handleFishEnterMap','handleFishLeaveMap'])assert.equal(ack(await fish[method]({id:2},{player:null},113),113).result,-1);
  });
  await check('source_scope_map_functions_and_explicit_client_policy',async()=>{
    const beforePath=process.env.MAP_BASE_SOURCE||path.join(root,'fish.before.js');
    const changed=new Set(['handleFishMapTransition','handleFishChangeScene','handleFishEnterMap','handleFishLeaveMap']);
    const withoutMap=source=>{const ast=acorn.parse(source,{ecmaVersion:'latest'});return ast.body.filter(n=>!(n.type==='FunctionDeclaration'&&changed.has(n.id.name))).map(n=>source.slice(n.start,n.end)).join('\n');};
    assert.equal(withoutMap(fs.readFileSync(path.join(app,'src/handlers/fish.js'),'utf8')),withoutMap(fs.readFileSync(beforePath,'utf8')));
    if(fs.existsSync(path.join(root,'main.fixed.js'))){
      let client=fs.readFileSync(path.join(root,'main.fixed.js'),'utf8');
      if(scenePolicy==='level-only'){
        const build=JSON.parse(fs.readFileSync(path.join(root,'client-build.json'),'utf8'));
        assert.deepEqual(build.changes.map(r=>r.marker),['H_e.isSceneUnlock=function','a.UpdateContent=function','u.unlockNewSceneId=function']);
        for(const row of build.changes.slice().reverse()){assert.equal(client.split(row.after).length-1,1);client=client.replace(row.after,row.before);}
      }
      assert.equal(client,main);
    }
  });
  const output={result:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',count:cases.length,nativeVisual:false,cases};
  fs.writeFileSync(path.join(root,'map-test.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
  if(output.result!=='PASS')process.exitCode=1;
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
