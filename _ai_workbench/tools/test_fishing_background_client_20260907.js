'use strict';
// Execute the shipped methods with a deterministic timer/RPC harness. No UI or network writes.
const {extract,src,root}=require('./inspect_fishing_background_20260907');
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const clone=v=>JSON.parse(JSON.stringify(v)),OUT=path.join(root,'_ai_workbench/temp/fishing_background_audit_20260907');fs.mkdirSync(OUT,{recursive:true});
const markers={click:['a.onClick=function',766000],close:['a.OnClose=function',770000],back:['r.backExit=function',1702000],remove:['r.RemoveAllEntity=function',1648000],raidStart:['r.startFishing=function',1702000],calc:['Abt.calWaitCount=function',1702000],start:['u.startAutoFish=function',4590000],send:['u.sendFishing=function',4590000],deal:['u.autoDealAllFish=function',4590000],power:['u.sendAutoPowerFish=function',4590000],effects:['u.playAutoPowerFishEffects=function',4590000],getDeal:['u.getDealMap=function',4590000],regularDeal:['u.sendDealFishMutl=function',4590000],reconnect:['u.reconnectSuccess=function',4590000],leave:['u.cs_fish_map_leave=function',4590000],pending:['u.isHaveNotDeadFish=function',4650000],silent:['u.isNeedSlientMode=function',4609000],mapUpdate:['_.updateMapRaidTime=function',7275000],fishUpdate:['_.updateFishMapRaidTime=function',7275000],update:['_.UpdateTime=function',7275000],enterMap:['_.EnterMapRaid=function',7278000],setNext:['_.SetNextMapRaid=function',7277000]};
const methods=Object.fromEntries(Object.entries(markers).map(([k,[m,p]])=>[k,extract(m,p)]));
function fixture(power=true,empty=false){
 let now=100000,nextTimer=1,energy=50;const queue=[],rpc=[],tips=[],trace=[],timers=new Map(),received={cast:[],deal:[]};let manual=false,hold=false,fault=false;
 function later(ms,fn,owner){const id=nextTimer++;const timer={id,due:now+Math.max(0,ms),fn,owner};timers.set(id,timer);queue.push(timer);return id;}
 const timer={doTimer:(ms,n,fn,obj)=>later(ms,fn,obj),doNext:(fn,obj)=>later(0,fn,obj),removeAll:obj=>{for(const[id,t]of timers)if(t.owner===obj)timers.delete(id);}};
 const ui={returnBtn:{},model:null,equipListTip:{},closeFishRoomPicker(){trace.push('closePicker');},CloseSelf(){trace.push('hideFishingUI');ui.OnClose();}};
 const raids={m_LastMapTime:now,m_LastFishTime:now,updateBattleRaidTime(){trace.push('monsterBattleTick');},updateCrossRivalMapRaidTime(){},FishMapClear(){timer.removeAll(this.mFishRaid);this.mFishRaid=null;}};
 const ctx={O:Math,U9:{autoConfig:{fishing_autoEquipPower:power,fishing_silentMode:true}},B:{deepCopy:clone,strformatByLangId:()=>'',ConvertLanguageToText:()=>''},
  y:{ins:()=>timer},A:{ins:()=>({dispatch(){}})},E:{},T:{get serverTimeMilli(){return now;}},
  en:{Anim_Config:{a_1:1,a_2:400,a_3:1000,a_4:600,a_5:700,a_6:500,a_7:900,a_8:1000,a_9:800,a_10:500,a_11:500,a_12:300}},
  yD:{FishEscapeState:{Scuess:2,Taotuo:1,konggan:0},Fish_AnimConfig:{0:{huigan:'a_2',wait:'a_3',have:['a_4','a_5'],scuess:'a_6',fail:'a_10',konggan:'a_12'}},FishDealType:{putIn:0,submit:1,shell:2}},
  Abt:{},S:{ins:()=>({showTips:m=>tips.push(m),showTipsByLangId:id=>tips.push(id)})},F:{removeTweens(){}},AppInfo:{params:{}},platform:{},
  P:{ins:()=>({isShow:()=>false,getView:()=>null,open(){trace.push('openPanel');return{};}})},Er:{Open(){},OpenWithItems(){}},yx:{},Gy:{},dc:{push(){}},
  rc:{Clamp:(n,min,max)=>Math.max(min,Math.min(max,n)),GetArray:Object.values},
  egret:{setTimeout:(fn,obj,ms)=>later(ms,fn,obj),clearTimeout:id=>timers.delete(id)},
  Y:{RaidMgr:raids,SoundManager:{playMapBgm(){}},ActorModel:{actorID:'fixture'},CuriosModel:{taskCheck(){}},OldTrekFishingModel:{},FishRoomModel:{isInFishRoom:()=>!!raids.mFishRaid?.fishMainView,getFishWin:()=>({})},Config:{AssetsConfig:{},FishConfig:{}},
     ItemModel:{checkItemEnough:()=>energy>0,GetItemCount:()=>energy}}};
 const context=vm.createContext(ctx),fns=Object.fromEntries(Object.entries(methods).map(([k,r])=>[k,vm.runInContext('('+r.source+')',context)]));ctx.Abt.calWaitCount=fns.calc;
 const raid={mMapId:101,fishMainView:ui,mEntityList:{self:{Dispose(){trace.push('disposeVisualEntity');}}},GetEntity(id){return this.mEntityList[id];},getMyEntity(){return this.mEntityList.self;},DoUpdate(){trace.push('fishingBackgroundTick');},RemoveAllEntity:fns.remove,backExit:fns.back,startFishing:fns.raidStart};
 raids.mFishRaid=raid;Object.assign(raids,{updateMapRaidTime:fns.mapUpdate,updateFishMapRaidTime:fns.fishUpdate,UpdateTime:fns.update,EnterMapRaid:fns.enterMap,SetNextMapRaid:fns.setNext});
 const m={isAutoFish:true,fishing:false,fishInfo:{scene:101,level:28,food:5501,exp:0,balanceRevision:0,slots:{},orders:[],pics:{},fishTypeQualityPic:{},fishResult:{fishInfos:[],items:[]}},
  parseFishInfo(){},parseDoubleFish(){},unlockPic(){},getAutoMutlFishCount:()=>1,isFishSpeedAdd:()=>false,unlockNewSceneId:()=>0,checkFishBaitBagTryToUpdate(){},checkFishItemTryOpen(){},openFishRewardPanel(){trace.push('heldFishPanel');},checkFishEnoughAutoFish:()=>manual,checkFishIsInOrders:()=>[],isPlayingMiniGame:()=>false,
  Rpc(tag,params,callback){rpc.push({tag,params:clone(params),uiVisible:!!raid.fishMainView});
   later(0,()=>{let response;
    if(tag===4000){energy--;const uid=1000+rpc.filter(r=>r.tag===4000).length;response=fault?{result:1,reason:'FISH_ENERGY_NOT_ENOUGH'}:{result:0,level:28,exp:0,food:5501,foodBag:[],balanceRevision:m.fishInfo.balanceRevision+1,bigger:0,fishResult:{time:now+1000,escapes:[],items:[],fishInfos:empty?[]:[{id:5011,uid,type:1,quality:2}],fashion:[]}};received.cast.push(clone(response));}
    else if(tag===4008){response={result:0,balanceRevision:m.fishInfo.balanceRevision+1,orders:[],fails:[],rewards:[],state:{slots:{},fishResult:{fishInfos:hold?clone(m.fishInfo.fishResult.fishInfos):[],items:[]},pics:{},fishTypeQualityPic:{}}};received.deal.push(clone(response));}
    else if(tag===4051)response={result:0};else throw Error('UNEXPECTED_RPC_'+tag);
    callback(response);
   },m);
  }};
 Object.assign(m,{startAutoFish:fns.start,sendFishing:fns.send,autoDealAllFish:fns.deal,sendAutoPowerFish:fns.power,playAutoPowerFishEffects:fns.effects,getDealMap:fns.getDeal,sendDealFishMutl:fns.regularDeal,isHaveNotDeadFish:fns.pending,reconnectSuccess:fns.reconnect,cs_fish_map_leave:fns.leave,isNeedSlientMode:fns.silent});
 ctx.Y.FishingModel=m;ui.model=m;ui.OnClose=fns.close;ui.onClick=fns.click;
 function tick(){queue.sort((a,b)=>a.due-b.due||a.id-b.id);const t=queue.shift();if(!t)return false;if(!timers.has(t.id))return true;timers.delete(t.id);now=t.due;t.fn.call(t.owner);raids.UpdateTime(now);return true;}
 function pumpTo(casts,max=150){for(let i=0;i<max&&rpc.filter(r=>r.tag===4000).length<casts;i++)if(!tick())break;}
 return {m,raid,raids,ui,ctx,rpc,tips,trace,received,timers,tick,pumpTo,back(){ui.onClick({currentTarget:ui.returnBtn});},setEnergy:n=>energy=n,setManual:v=>manual=v,setHold:v=>hold=v,setFault:v=>fault=v};
}
const tests=[];function test(name,fn){fn();tests.push(name);}
test('return while auto calls backExit not4051; no timer removed',()=>{const f=fixture();f.m.startAutoFish();const timers=f.timers.size;f.back();assert.equal(f.m.isAutoFish,true);assert.equal(f.raid.fishMainView,null);assert.equal(f.raids.mFishRaid,f.raid);assert.equal(f.timers.size,timers);assert(!f.rpc.some(r=>r.tag===4051));});
test('auto-power completes3newcasts after UI hidden incl pending firstACK',()=>{const f=fixture();f.m.startAutoFish();f.back();f.pumpTo(4);assert.equal(f.rpc.filter(r=>r.tag===4000).length,4);assert.equal(f.received.deal.length,3);assert(f.rpc.filter(r=>r.tag===4000).slice(1).every(r=>!r.uiVisible));assert.equal(f.m.isAutoFish,true);});
test('regular auto-sale completes3hidden continuation cycles',()=>{const f=fixture(false);f.m.startAutoFish();f.back();f.pumpTo(4);assert.equal(f.rpc.filter(r=>r.tag===4000).length,4);assert.equal(f.received.deal.length,3);});
test('empty catch schedules next without visible entity',()=>{const f=fixture(true,true);f.m.startAutoFish();f.back();f.pumpTo(4);assert.equal(f.rpc.filter(r=>r.tag===4000).length,4);assert.equal(f.received.deal.length,0);});
test('monster map transition and battle ticks preserve fishing controller',()=>{const f=fixture();f.m.startAutoFish();f.back();let entered=0;f.raids.EnterMapRaid({OnEnter(){entered++;},DoUpdate(){}});f.pumpTo(4);assert.equal(entered,1);assert.equal(f.raids.mFishRaid,f.raid);assert(f.trace.includes('monsterBattleTick'));assert(f.trace.includes('fishingBackgroundTick'));assert.equal(f.rpc.filter(r=>r.tag===4000).length,4);});
test('return with auto disabled sends4051 and clears controller',()=>{const f=fixture();f.m.isAutoFish=false;f.back();assert.equal(f.rpc[0].tag,4051);f.tick();assert.equal(f.raids.mFishRaid,null);});
test('reconnect turns auto off and ignores stale catchACK',()=>{const f=fixture();f.m.startAutoFish();f.back();f.m.reconnectSuccess();f.pumpTo(2);assert.equal(f.m.isAutoFish,false);assert.equal(f.rpc.filter(r=>r.tag===4000).length,1);});
test('insufficient energy stops hidden loop',()=>{const f=fixture();f.m.startAutoFish();f.back();f.setEnergy(0);f.pumpTo(2);assert.equal(f.m.isAutoFish,false);assert.equal(f.rpc.filter(r=>r.tag===4000).length,1);});
test('protected/equal fish stops auto-power while outside',()=>{const f=fixture();f.setHold(true);f.m.startAutoFish();f.back();f.pumpTo(2);assert.equal(f.m.isAutoFish,false);assert.equal(f.rpc.filter(r=>r.tag===4000).length,1);assert(f.trace.includes('heldFishPanel'));});
test('manual filter retains pending fish and prevents newcasts',()=>{const f=fixture(false);f.setManual(true);f.m.startAutoFish();f.back();f.pumpTo(2);assert.equal(f.rpc.filter(r=>r.tag===4000).length,1);assert.equal(f.m.fishInfo.fishResult.fishInfos.length,1);assert(f.trace.includes('heldFishPanel'));});
test('silent mode recognizes outside-fishing UI but keeps loop enabled',()=>{const f=fixture();assert.equal(f.m.isNeedSlientMode(),false);f.back();assert.equal(f.m.isNeedSlientMode(),true);assert.equal(f.m.isAutoFish,true);});
test('server error disables hidden auto instead of retryspam',()=>{const f=fixture();f.setFault(true);f.m.startAutoFish();f.back();f.pumpTo(2);assert.equal(f.m.isAutoFish,false);assert.equal(f.rpc.filter(r=>r.tag===4000).length,1);});
const result={result:'PASS',tests:tests.length,names:tests,sourceSha256:crypto.createHash('sha256').update(src).digest('hex'),readOnly:true,limits:'Actual functions; timers/RPC/animation timings are fixture adapters. No live account/browser interaction.'};
fs.writeFileSync(path.join(OUT,'client-tests.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(OUT,'client-methods.json'),JSON.stringify(methods,null,2));console.log(JSON.stringify(result));
