'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const client=process.env.COMPETITION_CLIENT_ROOT||path.resolve(__dirname,'../../../webgame/game');
const native=fs.readFileSync(process.env.COMPETITION_MAIN||path.join(client,'js/main.min_drop100.js'),'utf8');
const patch=fs.readFileSync(path.join(client,'js/lhs-cross-events-v2.js'),'utf8');
const sent=[],notices=[],events=[],timers=new Map();let serial=0,now=Date.parse('2026-09-18T12:00:00+07:00');
function nativeFn(symbol){const start=native.indexOf(symbol+'=function');assert(start>=0,symbol);const at=start+symbol.length+1;let depth=0,quote='';for(let i=native.indexOf('{',at);i<native.length;i++){const c=native[i];if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&!--depth)return '('+native.slice(at,i+1)+')';}throw Error('UNTERMINATED_NATIVE');}
function Base(){}Base.prototype.Rpc=function(tag,data,ok,error){sent.push({tag,data,ok,error});};
function Rival(){this._crossRivalInfo={stage:2,campInfoMap:{1:{camp:1}},endTime:now+86400000};}Rival.prototype=Object.create(Base.prototype);Rival.prototype.constructor=Rival;
Rival.prototype.getCrossRivalCampNum=()=>1;Rival.prototype.doCrossRivalInfo=function(x){this._crossRivalInfo=x;};
function Top(){}Top.prototype=Object.create(Base.prototype);Top.prototype.constructor=Top;
Top.prototype.onInfoUpdate=function(x){this.info=x.info;this.playerInfo=x.playerInfo;};
function Arena(){}Arena.prototype=Object.create(Base.prototype);Arena.prototype.constructor=Arena;
function CrossView(){}CrossView.openCheck=()=>true;
function CrossIcon(){}CrossIcon.prototype.checkShowIcon=function(){this.tar.setUnlock(true);return true;};
function RivalIcon(){}RivalIcon.prototype._updateIconRule=function(){};
const T={get serverTimeMilli(){return now;}},Y={Config:{},UnlockSystem:{isSystemUnlock:()=>true,getSystemUnlockTip:()=>''}};
const c={Object,Array,Number,String,Function,Math,Date:{now:()=>now},T,Y,AppInfo:{params:{topArenaOpen:0}},
 setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
 MessageDef:{SYSTEM_UNLOCK_UPDATE:'unlock'},MessageCenter:{ins:()=>({dispatch:(...x)=>events.push(x)})},
 UserTips:{ins:()=>({showTips:x=>notices.push(x)})},UserInfo:{UserID:'qa',ServerID:1001},
 CrossArenaRankView:CrossView,CrossArenaIconRule:CrossIcon,CrossRivalIconRule:RivalIcon,
 GlobalManager:{ActorModel:{actorID:'actor1'},ArenaModel:new Arena(),CrossRivalModel:new Rival(),TopArenaModel:new Top(),Config:Y.Config}};
c.window=c;vm.createContext(c);Rival.prototype.checkActivityIsOpen=vm.runInContext(nativeFn('c.checkActivityIsOpen'),c);
Top.prototype.IsTopArenaOpen=vm.runInContext(nativeFn('m.IsTopArenaOpen'),c);Top.prototype.IsAuditionOpen=vm.runInContext(nativeFn('m.IsAuditionOpen'),c);
Top.prototype.GetAuditionEndTime=vm.runInContext(nativeFn('m.GetAuditionEndTime'),c);Top.prototype.getCurMatchId=function(){return this.info.matchId;};
Y.TopArenaModel=c.GlobalManager.TopArenaModel;Y.CrossRivalModel=c.GlobalManager.CrossRivalModel;
vm.runInContext(patch,c);const api=c.LhsCrossEvents,checks=[];const check=(n,f)=>{f();checks.push(n);};
const end=Date.parse('2026-09-21T00:00:00+07:00'),week=7*86400000;
function payload(top=false){return{result:0,version:'cross-parallel-v2',serverTime:now,serverId:1001,events:{
 crossArena:{open:true,eligible:true,reason:'',cycle:{key:top?'W1':'W0',startTime:now-1000,endTime:top?end+week:end,index:top?1:0}},
 crossRival:{open:!top,eligible:true,reason:top?'CLOSED':'',cycle:top?null:{key:'C0',startTime:now-1000,endTime:end,index:0},matchConfig:{id:10000,startTime:now-1000,endTime:end}},
 topArena:{open:top,eligible:true,reason:top?'':'CLOSED',cycle:top?{key:'C1',startTime:now-1000,endTime:end+week,index:1}:null,
 matchConfig:{id:10001,startTime:end,endTime:end+week,promotionStartTime:end+2*86400000,gamePassStartTime:end+86400000}}}};}
check('models install and schedule request uses authenticated RPC',()=>{assert(api.installed);assert.equal(sent[0].tag,6199);assert.equal(api.isOpen('crossArena'),false);});
sent.shift().ok(payload());
check('native CrossRival open with server-hydrated config',()=>{assert(Y.CrossRivalModel.checkActivityIsOpen());assert(Y.Config.CrossRivalOpenConfig[10000]);assert.equal(Y.CrossRivalModel._crossRivalInfo.endTime,end);assert.equal(Y.TopArenaModel.IsTopArenaOpen(),false);});
check('CrossArena open concurrently and native unlock retained',()=>{assert(api.isOpen('crossArena'));assert(CrossView.openCheck(false));});
check('same snapshot polling never repeats entrance request',()=>{const n=sent.length;api.apply(payload());assert.equal(sent.length,n);});
const closed=payload();closed.events.crossArena.open=false;closed.events.crossArena.reason='LOCKED';api.apply(closed);
check('server day lock blocks panel and icon without bypass',()=>{assert.equal(CrossView.openCheck(false),false);const icon=new CrossIcon();let unlocked;icon.tar={setUnlock:v=>unlocked=v};icon.checkShowIcon();assert.equal(unlocked,false);});
now=end;api.apply(payload(true));
check('weekly turnover opens native TopArena while CrossArena continues',()=>{assert(api.isOpen('crossArena'));assert(Y.TopArenaModel.IsTopArenaOpen());assert(Y.TopArenaModel.IsAuditionOpen());assert.equal(Y.CrossRivalModel.checkActivityIsOpen(),false);assert.equal(Y.TopArenaModel.info.matchId,10001);assert.equal(Y.TopArenaModel.info.endTime,end+week);assert.equal(c.AppInfo.params.topArenaOpen,1);});
Y.TopArenaModel.onInfoUpdate({info:{stage:1,matchId:1,endTime:1},playerInfo:{round:-1,passRecord:{}}});
check('legacy push cannot restore expired match metadata',()=>{assert.equal(Y.TopArenaModel.info.matchId,10001);assert.equal(Y.TopArenaModel.info.endTime,end+week);assert.equal(Y.TopArenaModel.playerInfo.round,-1);});
Y.TopArenaModel.Rpc(6202,{},()=>{throw Error('UNSAFE_CALLBACK');});let request=sent.pop();request.ok({result:-1,code:'CROSS_EVENT_CLOSED',msg:'Đã đóng',schedule:payload(false)});
check('closed RPC does not reach unsafe native reward callback',()=>assert.equal(notices.at(-1),'Đã đóng'));
api.apply(payload(true));now+=65001;
check('stale schedule fails closed',()=>{assert.equal(api.isOpen('crossArena'),false);assert.equal(Y.TopArenaModel.IsTopArenaOpen(),false);});
api.refresh();request=sent.pop();c.UserInfo.ServerID=1004;request.ok(payload(true));
check('reply from previous server cannot hydrate new identity',()=>assert.notEqual(api.receivedAt,now));
check('schedule inside stale RPC cannot switch server identity',()=>assert.equal(api.apply(payload(true)),false));
api.reset();check('reconnect invalidates cached open state',()=>assert.equal(api.snapshot,null));
const n=sent.length;vm.runInContext(patch,c);check('addon reload idempotent',()=>{assert.equal(sent.length,n);assert.equal(c.LhsCrossEvents,api);});
console.log(JSON.stringify({result:'PASS',checks:checks.length,tests:checks,nativeMethods:true,productionWrites:0},null,2));
