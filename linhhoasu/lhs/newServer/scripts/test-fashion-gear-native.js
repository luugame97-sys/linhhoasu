'use strict';
// Execute shipped native carousel/item callbacks plus the overlay, no browser
// emulation of the business decisions and no live game/persistence access.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..');
const main=fs.readFileSync(process.env.FEATURE_MAIN||path.resolve(app,'../../webgame/game/js/main.min_drop100.js'),'utf8');
const patch=fs.readFileSync(process.env.FEATURE_CLIENT||path.resolve(app,'../../webgame/game/js/lhs-fashion-gear-v1.js'),'utf8');
const cfg=require(path.join(app,'src/services/ConfigService')).loadAllTables();
const acorn=require(process.env.FEATURE_ACORN||path.join(app,'node_modules/acorn'));
let network=0;const deny=()=>{network++;throw Error('NATIVE_TEST_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const n of ['http','https']){require(n).request=deny;require(n).get=deny;}
function source(marker){const at=main.indexOf(marker);assert(at>=0,marker);let n=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
const clone=v=>JSON.parse(JSON.stringify(v)),t=clone(cfg),events=[],requests=[],tips=[];
const ctx=vm.createContext({Y:{Config:t},T:{serverOpenDay:1},O:Math,B:{deepCopy:clone},D:{ShowRedPoint(){}},nO:{getItemQualityFrameBg:q=>'frame'+q},
  F:{get(obj){return {to(values){Object.assign(obj,values);return this;},call(fn){fn();return this;}}}},
  A:{ins:()=>({dispatch:n=>events.push(n),dispatchImmediate:n=>events.push(n)})},E:new Proxy({},{get:(_,n)=>String(n)}),KSt:{EVENT_SELECT_CHANGED:'select'},
  x:{FashionBaseConfig:t.FashionBaseConfig,ESuitType:{normal:0,linkage:1,changeColor:2,bathrobe:3,endSkill:4},FASHION_BATH_SET_ID:999},
  AppInfo:{inChina:true},S:{ins:()=>({showTips:x=>tips.push(x)})},_t:(a,b)=>a.concat(b)});
const native=marker=>vm.runInContext('('+source(marker)+')',ctx);
class Item {constructor(){this._itemMap={};this._itemUseRecords={};}initData(){} }
Item.prototype.getBagItems=native('m.getBagItems=function');
Item.prototype.GetItemCount=function(id){return this._itemMap[id]||0;};
Item.prototype.CheckItemCanUse=native('m.CheckItemCanUse=function');Item.prototype.checkBagUseRed=native('m.checkBagUseRed=function');
class Fish {getFishInfo(){return this.fishInfo;} }
Fish.prototype.isUnlockFishRod=native('u.isUnlockFishRod=function');Fish.prototype.isUnlockFishRaft=native('u.isUnlockFishRaft=function');
class Fashion {constructor(){this._fashionInfo={fashion:{301:29041},activateFashion:[],fashionData:[],sets:[],setId:0};}onlyUnlockFahion(id){this._fashionInfo.activateFashion.push(id);}updateCehckFashionTimer(){}getCurSetId(){return this._fashionInfo.setId;} }
Fashion.prototype.sendChangeFshion=native('f.sendChangeFshion=function');Fashion.prototype.sendChangeSuit=native('f.sendChangeSuit=function');Fashion.prototype.onFashionData=native('f.onFashionData=function');
class Socket {Rpc(tag,data,cb){requests.push({tag,data});if(cb)cb(tag===2499?{result:0,epoch:'b'.repeat(32),sequence:0,expiresIn:86400000}:this.reply);} }
class Renderer {constructor(index){this._dataIndex=index;this.width=0;this.x=0;}validateNow(){this.width=110;}dataIndex(){return this._dataIndex;}}
class Carousel {constructor(){Object.assign(this,{itemRenderer:Renderer,_itemList:[],_dataList:[],_showCount:3,_isUseAnim:false,_unselectScale:.6,_unselectAlpha:.6});}addChild(x){return x;}removeChildren(){}dispatchEventWith(...args){if(this.listener)this.listener({data:args[2]});}}
for(const name of ['updateData','refreshByDataList','_clean','_createItem','_changeScaleAndAlpha','_updateSelect','_clearSelect','_getSelectItem','_getOutOfBoundsItem','_calculateItemIndex','_calculateSelectedItemMoveDistance','_moveLeft','_moveRight','_layoutItems','_playBounceAnimation','scrollTo','moveLeft','moveRight'])Carousel.prototype[name]=native('o.'+name+'=function');
class Rod {constructor(id){this.selectId=id;this.circulateList=new Carousel();this.circulateList.listener=e=>this.onSelectChange(e);}updateViewUI(){this.updateCirculateList();}}
class Raft extends Rod {}
Rod.prototype.onSelectChange=native('a.onSelectChange=function(t){t=t.data;this.selectId=t.data.id,this.updateViewUI(),this.updateCirculateList()}');
const item=new Item(),fish=new Fish(),fashion=new Fashion(),socket=new Socket();
const unlock={maxRecursionLockCount:10,isSystemUnlock:()=>true};
unlock.calcSingleConditionType=native('pOt.calcSingleConditionType=function');unlock.checkConditions=native('pOt.checkConditions=function');
const Y=Object.assign(ctx.Y,{ItemModel:item,FishingModel:fish,FashionModel:fashion,RoleModel:{kungfuId:8,subJob:1},UnlockSystem:unlock,RechargeModel:{checkMonthCard:()=>false}});
let loadedDefaults=0;
class Role{loadToukui(){loadedDefaults++;return ['default'];}loadShenti(){loadedDefaults++;return ['default'];}loadTui(){loadedDefaults++;return ['default'];}}
const root={GlobalManager:Y,GameSocket:Socket,ItemModel:Item,FishingModel:Fish,FashionModel:Fashion,FishRodPanel:Rod,FishRaftPanel:Raft,
  RoleShowSpine:Role,ERoleShowType:{toukui:2,shenti:3,tui:9},performance:{now:()=>1000},setTimeout(){},
  ResDataPath:{GetImgByID:id=>t.AssetsConfig[id]?.icon},RES:{hasRes:k=>['head_rs_2834','icon_5907','ui_zb_bm_jiantou'].includes(k)},
  UserTips:{ins:()=>({showTips:x=>tips.push(x)})},MessageCenter:ctx.A,MessageDef:ctx.E};root.window=root;
vm.runInNewContext(patch,root);assert(root.LhsFashionGearV1.installed);
fashion.Rpc=(...args)=>socket.Rpc(...args);
const passed=[];function test(name,fn){fn();passed.push(name);}
test('native bag: all configured fashion boxes visible usable, unrelated hidden items stay hidden',()=>{
  const ids=Object.keys(t.FashionDressConfig).map(Number).filter(id=>t.AssetsConfig[id]?.useType===105);
  assert.equal(ids.length,61);for(const id of [28370,28380,28410])assert(ids.includes(id));item._itemMap=Object.fromEntries(ids.map(id=>[id,1]));item._itemMap[5907]=1;
  const bag=item.getBagItems();for(const id of ids){assert(bag.some(r=>r.id===id&&r.canUse===1));assert(item.CheckItemCanUse(id));}
  assert(!bag.some(r=>r.id===5907));assert(item.checkBagUseRed());
});
test('native carousel: S1/S2 day1/42/43/56/57/60 all18 gear reachable, no blank/offscreen rows',()=>{
  for(const server of [1001,1002])for(const day of [1,42,43,56,57,60])for(const kind of ['rod','raft']){
    ctx.T.serverOpenDay=day;Y.serverId=server;fish.fishInfo={rodId:5907,raftId:6210};item._itemMap={5907:1,6210:1};
    const ids=Object.keys(t[kind==='rod'?'FishRodConfig':'FishRaftConfig']).map(Number);
    for(const selected of ids){const p=kind==='rod'?new Rod(selected):new Raft(selected);p.initCirculateList();
      assert.equal(p.circulateList._dataList.length,ids.length);assert.equal(p.circulateList._getSelectItem().data.id,selected);
      assert(p.circulateList._itemList.some(r=>r.x+r.width>0&&r.x<p.circulateList.width));
      p.updateCirculateList();assert.equal(p.selectId,selected);assert.equal(p.circulateList._getSelectItem().data.id,selected);
      assert(p.circulateList._itemList.every(r=>r.data));
    }
  }
});
test('native carousel: missingID fallback and repeated arrow navigation remain bounded',()=>{
  const p=new Rod(999);p.initCirculateList();assert.equal(p.selectId,5907);
  assert(p.circulateList.scrollTo(r=>r.id===999));assert.equal(p.circulateList._getSelectItem().data.id,5901);
  for(let i=0;i<30;i++)p.circulateList.moveRight();
  assert(p.circulateList._itemList.some(r=>r.x+r.width>0&&r.x<p.circulateList.width));
});
test('gear ownership card and non-day feature gates are not unlocked for free',()=>{
  item._itemMap={};assert.equal(fish.isUnlockFishRod(5907),false);assert.equal(fish.isUnlockFishRaft(6210),false);
  assert.equal(fish.isUnlockFishRod(5903),false);assert(fish.isUnlockFishRod(5901));assert(fish.isUnlockFishRaft(6201));
});
test('native callbacks: rejected wear never overwrites selection',()=>{
  socket.reply={result:-1,id:0,type:301};fashion._fashionInfo.fashion={301:29041};fashion.sendChangeFshion(29001,301,0);
  assert.equal(fashion._fashionInfo.fashion[301],29041);assert(tips.length);
  assert(requests.some(r=>r.tag===1801&&/^v3_b{32}_\d+$/.test(r.data.requestId)));
});
test('selection push and historical replay keep current preset, no historical undo',()=>{
  fashion.onFashionData({result:0,data:[],fashion:[],selection:{301:-1,303:29043},setId:2,sets:[{id:2}]});
  assert.equal(fashion._fashionInfo.fashion[301],-1);assert.equal(fashion._fashionInfo.setId,2);
  socket.reply={result:0,replayed:true,id:29041,type:301,selection:{301:-1},setId:2};fashion.sendChangeFshion(29041,301,0);
  assert.equal(fashion._fashionInfo.fashion[301],-1);assert.equal(fashion._fashionInfo.setId,2);
});
test('renderer explicit hide never loads default body/head/legs',()=>{
  const role=new Role();role.showData={2:-1,3:-1,9:-1};assert.equal(role.loadToukui().length,0);assert.equal(role.loadShenti().length,0);assert.equal(role.loadTui().length,0);assert.equal(loadedDefaults,0);
  role.showData[2]=29042;assert.equal(role.loadToukui()[0],'default');assert.equal(loadedDefaults,1);
});
test('patch idempotent, preserves unrelated RPC callbacks',()=>{
  const before=Socket.prototype.Rpc;vm.runInNewContext(patch,root);assert.equal(before,Socket.prototype.Rpc);
  socket.reply={result:7};let response;socket.Rpc(4011,{id:5907},r=>response=r);assert.equal(response.result,7);
});
assert.equal(network,0);console.log(JSON.stringify({result:'PASS',tests:passed.length,cases:passed,gearMatrix:2*6*18,productionWrites:0,networkAttempts:network}));
