'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{performance}=require('perf_hooks');
const task=path.resolve(__dirname,'../temp/shop_essence_max_20261017'),candidate=task+'/candidate';
const {BinJsonUtil,ByteArray}=require(task+'/live/src/protocol/BinJsonUtil');
const service=require(candidate+'/src/services/EssenceBulkShopService'),ID=service.GOODS_ID,CAP=service.MAX_COUNT;
const goods={id:ID,payId:0,cost:[{id:1,count:100}],costAgain:[],rewards:[{id:20,count:250}],limit:0};
const config={get:n=>n==='ShopConfig'?{[ID]:goods}:{}};
const clone=x=>JSON.parse(JSON.stringify(x));
const session=(money=1e12,owned=0)=>({userId:'fixture',player:{currencies:{diamond:money},items:{20:owned},shopInfo:{buyRecords:{}},rechargeInfo:{records:[]},other_attr_info:{}}});
const params=n=>({require:{[ID]:n},requestId:Date.now()+'-fixture0000000001'});
const response=r=>(Array.isArray(r)?r:[r]).find(p=>p.msgUid===7).data;
let checks=0;function check(fn){fn();checks++;}
const svc=service.createService({config,clock:()=>123});
for(const count of [1,9999,10000,1e6,CAP])check(()=>{const s=session(),start=performance.now(),r=response(svc.execute(params(count),s,7));assert.equal(r.result,0);assert.equal(s.player.currencies.diamond,1e12-100*count);assert.equal(s.player.items[20],250*count);assert.equal(r.rewardInfo.items.length,1);assert.equal(r.items.length,1);assert(performance.now()-start<100);const ba=new ByteArray(undefined,4096);BinJsonUtil.json2bin(r,ba);const decoded=BinJsonUtil.readFullJson(new ByteArray(Buffer.from(ba.buffer)));assert.equal(decoded.rewardInfo.items[0].count,250*count);assert.equal(decoded.changed.find(x=>x.id===1).count,1e12-100*count);});
for(const count of [0,-1,1.5,CAP+1,Infinity,NaN])check(()=>{const s=session(),before=clone(s.player);assert.equal(response(svc.execute(params(count),s,7)).result,-1);assert.deepEqual(s.player,before);});
check(()=>{const s=session(99);assert.equal(response(svc.execute(params(1),s,7)).code,'ESSENCE_NOT_ENOUGH');assert.equal(s.player.currencies.diamond,99);});
check(()=>{const s=session(100,Number.MAX_SAFE_INTEGER-249);assert.equal(response(svc.execute(params(1),s,7)).code,'ESSENCE_CAPACITY');});
check(()=>{const s=session(),p=params(10000);delete p.requestId;assert.equal(response(svc.execute(p,s,7)).result,-1);});
check(()=>{const s=session(),p=params(1);p.require[1000001]=1;const before=clone(s);assert.equal(response(svc.execute(p,s,7)).result,-1);assert.deepEqual(s,before);});
check(()=>{const s=session();goods.limit=2;s.player.shopInfo.buyRecords[ID]=2;assert.equal(response(svc.execute(params(1),s,7)).result,-1);goods.limit=0;});
check(()=>{const s=session();goods.costAgain=[[{id:1,count:200}]];assert.equal(response(svc.execute(params(1),s,7)).result,-1);goods.costAgain=[];});
// Real FarmShop transaction/receipt flow with RAM-only I/O, real role lock and receipt implementation.
const receiptModule={exports:{}};vm.runInNewContext(fs.readFileSync(task+'/live/src/services/FeatureReceiptService.js','utf8'),{module:receiptModule,require,Date,JSON,Error});
const mutationModule={exports:{}};vm.runInNewContext(fs.readFileSync(task+'/live/src/services/PlayerMutationService.js','utf8'),{module:mutationModule,require,Promise,Set,Map,Error});
let saves=0,failSave=false;
const farmModule={exports:{}};
vm.runInNewContext(fs.readFileSync(task+'/live/src/services/FarmShopService.js','utf8'),{module:farmModule,Date,JSON,Object,Number,Map,Error,require:n=>{
 const map={'./ConfigService':config,'./PlayerMutationService':mutationModule.exports,'./FeatureReceiptService':receiptModule.exports,'./PlayerService':{drainPendingSaves:async()=>{},savePlayer:async()=>{saves++;if(failSave)throw Error('fixture-save-failed');return true;}},'./RuntimeBus':{getWsServer:()=>({invalidatePlayerForMutation(){}})},'./FarmDayService':{synchronize:async()=>[]},'./GameDayService':{key:()=>1},'./CrossServerEventService':{cycleFor:()=>null},'./CurrencySync':{buildClientItemList:()=>[]}};if(!(n in map))throw Error('IMPORT:'+n);return map[n];}});
async function transactionTests(){const live=service.createService({config,farmShop:farmModule.exports}),s=session(),p=params(1e6);
 const results=await Promise.all([live.handle(p,s,7),live.handle(p,s,7)]);assert.equal(saves,1);assert.equal(s.player.items[20],250e6);assert(results.every(r=>response(r).result===0));checks++;
 const f=session(),before=clone(f.player);failSave=true;await assert.rejects(live.handle(params(10000),f,7));assert.equal(f.player,null);assert.equal(before.items[20],0);checks++;
}
// Client addon install, affordability, Max selection and panel reuse with zero outbound purchases.
let money=1e12,owned=0,bought=0,network=0;
function Panel(){this.input={_nowNum:1,data:{initNum:1,maxNum:9999},input:{size:30,maxChars:9},maxBtn:{skinName:'native',enabled:true},minBtn:{},validateNow(){},setMaxBtnClickEvent(fn){this.onMax=fn;},updateNumLabel(){}};Object.defineProperty(this.input,'nowNum',{get(){return this._nowNum;},set(v){this._nowNum=v;this.panel.setBuyCount(v);}});this.input.panel=this;this.buyBtn={enabled:true};}
Panel.prototype.OnOpen=function(id){this._shopId=id;this.input._nowNum=1;this.input.data={initNum:1,maxNum:9999};};Panel.prototype.setBuyCount=function(n){this._buyCount=n;};
function Shop(){}Shop.prototype.Rpc=function(){network++;return Array.from(arguments);};
const root={GlobalManager:{CommonBuyItemPanel:Panel,ShopModel:new Shop(),Config:{ShopConfig:{[ID]:goods}},ItemModel:{GetItemCount:id=>id===1?money:owned},RechargeModel:{getBuyCount:()=>bought}},crypto:require('crypto').webcrypto,eui:{Skin:function(){},Rect:function(){},Label:function(){}},setTimeout(){},egret:{getDefinitionByName(){return null;}}};
vm.runInNewContext(fs.readFileSync(candidate+'/web/js/lhs-essence-buy-max-v1.js','utf8'),{window:root,Date,Number,Math,Uint8Array,Object,Array});
const api=root.LhsEssenceBuyMax;check(()=>assert(api.installed));
for(const [cash,expected]of [[0,0],[99,0],[100,1],[999999,9999],[1000000,10000],[1e12,CAP]])check(()=>{money=cash;assert.equal(api.maximum(),expected);const p=new Panel();p.OnOpen(ID);p.input.onMax();assert.equal(p._buyCount,expected);assert.equal(p.buyBtn.enabled,expected>0);assert.equal(network,0);p.OnOpen(1000001);assert.equal(p.input.input.size,30);assert.equal(p.input.maxBtn.skinName,'native');assert.equal(p.buyBtn.enabled,true);});
check(()=>{money=1e12;owned=Number.MAX_SAFE_INTEGER-500;assert.equal(api.maximum(),2);owned=0;});
check(()=>{goods.limit=10;bought=7;assert.equal(api.maximum(),3);bought=0;goods.limit=0;});
check(()=>{const p=new Panel();money=1e6;p.OnOpen(ID);money=200;p.input.onMax();assert.equal(p._buyCount,2);});
check(()=>{const out=root.GlobalManager.ShopModel.Rpc(1200,{id:ID,count:10000});assert(/^\d{13}-[a-f0-9]{24}$/.test(out[1].requestId));});
(async()=>{await transactionTests();const report={status:'PASS',checks,codecMaxCount:CAP,codecMaxReward:CAP*250,fixtureSaves:saves,productionWrites:0,nativeBrowserExecuted:false};fs.writeFileSync(task+'/tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
