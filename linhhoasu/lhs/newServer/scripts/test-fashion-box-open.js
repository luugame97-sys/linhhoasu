'use strict';
// Real native click/tips/use/model callbacks + actual server handler; no live DB.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..'),game=process.env.FEATURE_GAME||path.resolve(app,'../../webgame/game');
const main=fs.readFileSync(process.env.FEATURE_MAIN||path.join(game,'js/main.min_drop100.js'),'utf8');
const gear=fs.readFileSync(process.env.FEATURE_CLIENT||path.join(game,'js/lhs-fashion-gear-v1.js'),'utf8');
const boxPatch=fs.readFileSync(process.env.FASHION_BOX_PATCH||path.join(game,'js/lhs-fashion-box-v1.js'),'utf8');
const acorn=require(process.env.FEATURE_ACORN||path.join(app,'node_modules/acorn'));
let network=0;const deny=()=>{network++;throw Error('TEST_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const k of ['http','https']){require(k).request=deny;require(k).get=deny;}
const log=require.resolve(path.join(app,'src/logger'));require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables(),clone=x=>JSON.parse(JSON.stringify(x));
const players=require(path.join(app,'src/services/PlayerService'));let saveMode='ok',saved=null,saves=0;
players.drainPendingSaves=async()=>{};players.savePlayer=async(_id,p)=>{if(saveMode==='null')return null;if(saveMode==='throw')throw Error('SAVE_FAIL');saved=clone(p);saves++;if(saveMode==='ambiguous')throw Error('SAVE_UNCERTAIN');return p;};
const itemHandler=require(path.join(app,'src/handlers/item')),fashionHandler=require(path.join(app,'src/handlers/fashion'));
const boxes=require(path.join(app,'src/services/FashionBoxService')),receipts=require(path.join(app,'src/services/FeatureReceiptService'));
const requests=[],opened=[],messages=[],events=[],rewardPopups=[];
function visible(node,value){node.visible=!!value;node.includeInLayout=!!value;}
const ctx=vm.createContext({Y:{Config:tables,RoleModel:{kungfuId:8,subJob:1},ActorModel:{actorID:'test-owner'},UnlockSystem:{isSystemUnlock:()=>true,checkConditions:()=>true}},
 B:{ConvertLanguageToText:String,strformatByLangId:String,generateTextFlowByLangId:()=>[],setIncludeInLayoutVisible:visible},D:{setIncludeInLayoutVisible:visible,setPopupTipsPos(){}},nO:{setLabelQualityStyle(){}},ec:{overLength:String},
 AppInfo:{testMode:false},O:Math,x:{ESuitType:{normal:0,linkage:1,changeColor:2,bathrobe:3,endSkill:4},INITIAL_ROLE_SUIT:28000},_t:(a,b)=>a.concat(b),
 A:{ins:()=>({dispatch:(...args)=>events.push(args)})},E:new Proxy({},{get:(_,key)=>String(key)}),S:{ins:()=>({showTips:x=>messages.push(x),showTipsByLangId:x=>messages.push(x)})}});
function native(marker,from=0){const at=main.indexOf(marker,from);assert(at>=0,marker);let n=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return vm.runInContext('('+main.slice(n.start,n.end)+')',ctx);}
class Socket{Rpc(tag,data,cb,owner,err){requests.push({tag,data,cb,owner,err});return true;}}
const socket=new Socket();socket._host='qa';Socket.ins=()=>socket;
class Item {constructor(){this._itemMap={};this._itemUseRecords={};}GetItemCount(id){return this._itemMap[id]||0;}GetItemUseRecord(){return 0;}initData(){}}
for(const name of ['getBagItems','CheckItemCanUse','checkBagUseRed'])Item.prototype[name]=native('m.'+name+'=function');
class Icon {constructor(){this._isShowInfo=true;}}
Icon.prototype.onClickItem=native('pOt.onClickItem=function(){if(this._isShowInfo');
class Collection{constructor(rows=[]){this.source=rows;}replaceAll(rows){this.source=rows;}}
class Num{constructor(){this.visible=true;this.includeInLayout=true;}set data(value){this._data=value;this.nowNum=value.initNum;}get data(){return this._data;}}
class Tips {constructor(){for(const key of ['itemIcon','nameLabel','countLabel','descLabel','itemWayBtn','btnDetail','useBtn','sellBtn','zhanshaIcon','zhanshaPlayBtn'])this[key]={};}validateNow(){}}
const tipsAt=main.indexOf('i(vre,Voe=n)');for(const name of ['OnOpen','onClickUseBtn','onClickDetail'])Tips.prototype[name]=native('.'+name+'=function',tipsAt);
class Use {constructor(){this.commonWin={OnAdded(){}};this.itemIcon={descLabel:{}};this.labUseDesc={};this.groupCount={};this.useBtn={enabled:true,label:'native'};this.numInput=new Num();this.list={dataProvider:new Collection(),parent:{parent:{height:492}}};this.currentState='chooseBox';this.closed=false;}validateNow(){}CloseSelf(){this.closed=true;}refreshByDropBox(){this.currentState='dropBox';}}
const useAt=main.indexOf('i(fie,Nee=n)');for(const name of ['OnOpen','onClickUseBtn'])Use.prototype[name]=native('.'+name+'=function',useAt);
class Fashion {constructor(){this._fashionInfo={activateFashion:[],fashionData:[],dress:[],fashion:{}};}onlyUnlockFahion(id){if(!this._fashionInfo.activateFashion.includes(id))this._fashionInfo.activateFashion.push(id);}updateCehckFashionTimer(){}IsFashionActive(id){return this._fashionInfo.activateFashion.includes(id);}}
for(const name of ['onFashionData','GetSuitFashions','IsSuitActive','getFashionStarLevel'])Fashion.prototype[name]=native('f.'+name+'=function');
class Rod{}class Preview{}class Choice{constructor(){this.itemIcon={};this.nameLabel={};this.numInput=new Num();this.imgHave={};this.imgAwake={};this.imgMaxStar={};}}
Choice.prototype.dataChanged=native('uie.prototype.dataChanged=function');
ctx.P=ctx.ViewManager={ins:()=>({open:(view,...args)=>opened.push({view,args})})};ctx.ok=ctx.FashionInfoView=Preview;ctx.uk=ctx.ItemTipsView=Tips;ctx.wA=ctx.ItemUseView=Use;ctx.TA=class{};
const item=new Item(),fashion=new Fashion();Object.assign(ctx.Y,{ItemModel:item,FashionModel:fashion});
Object.assign(ctx,{GlobalManager:ctx.Y,ItemIcon:Icon,ItemModel:Item,GameSocket:Socket,FashionModel:Fashion,FishRodPanel:Rod,ChooseItemIcon:Choice,
 eui:{ArrayCollection:Collection},RES:{hasRes:()=>true},ResDataPath:{},UserTips:ctx.S,MessageCenter:ctx.A,MessageDef:ctx.E,
 GetRewardView:{Open:r=>rewardPopups.push(r),CheckOpenSpGetView(){}},performance:{now:()=>1000},setTimeout(){}});ctx.window=ctx;
vm.runInContext(gear,ctx);vm.runInContext(boxPatch,ctx);assert(ctx.LhsFashionGearV1.installed&&ctx.LhsFashionBoxV1.installed);
let session;
function fresh(id,count=2){const p={userId:'box-open-test',playerId:'box-open-test',level:120,roleInfo:{kungfuId:8,subJob:1},items:{[id]:count},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]}};
 session={userId:p.userId,player:p};item._itemMap={[id]:count};item._lhsBoxOpenJob=null;item._itemUseRecords={};fashion._fashionInfo=clone(p.fashionInfo);socket._lhsFeatureEpoch=null;saveMode='ok';requests.length=opened.length=rewardPopups.length=0;return p;}
function click(id){const row=item.getBagItems().find(r=>r.id===id);assert(row);const icon=new Icon();icon.data=row;icon.onClickItem();assert.equal(opened.at(-1).view,Tips);const tip=new Tips();tip.OnOpen(...opened.at(-1).args);tip.onClickUseBtn();assert.equal(opened.at(-1).view,Use);const view=new Use();view.OnOpen(...opened.at(-1).args);return{view,tip,icon};}
async function deliver(mode){
 let request;while((request=requests.shift())){
  if(request.tag===2499){request.cb.call(request.owner,receipts.createEpoch(session.player));continue;}
  assert.equal(request.tag,1300);if(mode==='reject'){request.cb.call(request.owner,{result:-1});return request;}
  if(mode==='timeout'){request.err.call(request.owner,{timeout:true});return request;}
  try{const result=await itemHandler.handleUseItem(request.data,session,77);const packets=Array.isArray(result)?result:[result];
   for(const packet of packets){if(packet.tag===1202)for(const row of packet.data.changed||[])item._itemMap[row.id]=row.count;
    if(packet.tag===1800)fashion.onFashionData(packet.data);}
   const ack=packets.find(p=>p.tag===1300).data;
   if(mode==='dropAck')request.err.call(request.owner,{timeout:true});else request.cb.call(request.owner,ack);
   return{request,ack};
  }catch(error){request.err.call(request.owner,error);return request;}
 }
}
async function run(){let cases=0;const catalog=Object.values(tables.AssetsConfig).filter(a=>boxes.isCandidateBox(a.id));const supportedCount=catalog.filter(a=>boxes.isBox(a.id)).length;assert.equal(catalog.length,63);assert.equal(supportedCount,61);
 for(const asset of catalog.filter(a=>boxes.isBox(a.id))){const p=fresh(asset.id);const {view,tip,icon}=click(asset.id);const ids=boxes.rewardsFor(asset.id,1).map(r=>r.id);
  assert.equal(requests.length,0);tip.onClickDetail();assert.equal(opened.at(-1).view,Preview);assert.equal(requests.length,0);
  assert.deepEqual(Array.from(view.list.dataProvider.source,r=>r.itemData.id),ids);assert.equal(view.numInput.nowNum,1);
  view.onClickUseBtn();view.onClickUseBtn();assert.equal(requests.length,1);assert.equal(view.useBtn.enabled,false);await deliver();
  assert(view.closed);assert.equal(p.items[asset.id],1);assert(fashion.IsSuitActive(asset.id,0));assert.equal(rewardPopups.length,1);
  assert(ids.every(id=>p.fashionInfo.activateFashion.includes(id)));const again=click(asset.id).view;again.onClickUseBtn();await deliver();assert.equal(p.items[asset.id],0);
  const wear=await fashionHandler.handleChangeSuit({id:asset.id,color:0,set:0},session,78);assert.equal(wear.find(p=>p.tag===1802).data.result,0);
  const restored=clone(saved);assert(ids.every(id=>restored.fashionInfo.activateFashion.includes(id)));
  icon.data={id:asset.id,count:1,isOwner:false};opened.length=0;icon.onClickItem();assert.equal(opened[0].view,Preview);assert.equal(requests.length,0);
  cases++;
 }
 // Selectable boxes are not fixed suits: missing selection must not consume.
 for(const id of [99001,99002]){assert(!boxes.isBox(id));const p=fresh(id,1),before=clone(p),r=await itemHandler.handleUseItem({index:id,count:1},session,88);assert.equal(r.data.result,-1);assert.deepEqual(p,before);cases++;}
 for(const n of [0,-1,1.5,NaN,Infinity,3]){fresh(28350,2);const view=click(28350).view;view.numInput.nowNum=n;view.onClickUseBtn();assert.equal(requests.length,0);cases++;}
 for(const mode of ['reject','timeout','dropAck']){const p=fresh(28350);const {view}=click(28350);view.onClickUseBtn();const response=await deliver(mode);assert(!view.closed);
  if(mode==='reject'){assert.equal(item._lhsBoxOpenJob,null);assert(view.useBtn.enabled);}else{const oldId=item._lhsBoxOpenJob.request.requestId;view.numInput.nowNum=2;view.onClickUseBtn();assert.equal(requests[0].data.requestId,oldId);assert.equal(requests[0].data.count,1);await deliver();assert(view.closed);assert.equal(p.items[28350],1);assert.equal(rewardPopups.length,mode==='dropAck'?0:1);}
  cases++;
 }
 for(const mode of ['null','throw','ambiguous']){const p=fresh(28350),before=clone(p),view=click(28350).view;saveMode=mode;view.onClickUseBtn();await deliver();assert.equal(session.player,null);before.other_attr_info=clone(p.other_attr_info);assert.deepEqual(p,before);assert(!view.closed);if(mode==='ambiguous'){session.player=clone(saved);saveMode='throw';view.onClickUseBtn();await deliver();assert(view.closed);assert.equal(session.player.items[28350],1);}cases++;}
 {fresh(28350);const view=click(28350).view;view.onClickUseBtn();await deliver('timeout');view.OnOpen({id:28350,count:2,isOwner:true},false);view.onClickUseBtn();await deliver();assert(view.closed);cases++;}
 {const p=fresh(28350,1),view=click(28350).view;view.onClickUseBtn();await deliver('dropAck');assert.equal(p.items[28350],0);const data={id:28350,count:1,isOwner:true};const icon=new Icon();icon.data=data;icon.onClickItem();assert.equal(opened.at(-1).view,Tips);const tip=new Tips();tip.OnOpen(data,icon);tip.onClickUseBtn();const retried=new Use();retried.OnOpen(...opened.at(-1).args);retried.onClickUseBtn();await deliver();assert(retried.closed);assert.equal(p.items[28350],0);cases++;}
 {const p=fresh(28350,3),view=click(28350).view;view.numInput.nowNum=3;view.onClickUseBtn();await deliver();assert.equal(p.items[28350],0);assert.equal(p.currencies.diamond,3000);cases++;}
 {fresh(28350);const view=click(28350).view;view.OnOpen({id:28350,count:2,isOwner:false},false);view.onClickUseBtn();assert.equal(requests.length,0);assert.equal(view.useBtn.visible,false);view.OnOpen({id:28350,count:2,isOwner:true},false);assert(view.useBtn.enabled);cases++;}
 {fresh(28350);const view=click(28350).view;const layout=view.list.parent.parent;view.OnOpen({id:28350,count:1,isOwner:true},false);view.OnOpen({id:94501,count:1,isOwner:true},false);assert.equal(view._lhsBoxId,0);assert.equal(layout.height,492);assert.equal(view.numInput._numChangeEvent,undefined);cases++;}
 {fresh(28350);const view=click(28350).view;const use=tables.AssetsUseConfig[28350],old=use.rewards;use.rewards=[{id:28351,count:4}];const before=clone(session.player);const r=await itemHandler.handleUseItem({id:28350,count:1},session,91);assert.equal(r.data.result,-1);assert.deepEqual(session.player,before);view.onClickUseBtn();assert.equal(requests.length,0);use.rewards=old;cases++;}
 for(const fault of ['conditions','missingUse','foreignPart']){fresh(28350);const old=clone(tables.AssetsUseConfig[28350]),foreign=tables.FashionConfig[28351].dressId;
  if(fault==='conditions')tables.AssetsUseConfig[28350].conditions=[{type:999}];if(fault==='missingUse')delete tables.AssetsUseConfig[28350];if(fault==='foreignPart')tables.FashionConfig[28351].dressId=29040;
  const before=clone(session.player),result=await itemHandler.handleUseItem({id:28350,count:1},session,93);assert.equal(result.data.result,-1);assert.deepEqual(session.player,before);tables.AssetsUseConfig[28350]=old;tables.FashionConfig[28351].dressId=foreign;cases++;}
 {fresh(28350);const view=click(28350).view;view.onClickUseBtn();ctx.Y.ActorModel.actorID='other-owner';await deliver();assert(!view.closed);ctx.Y.ActorModel.actorID='test-owner';cases++;}
 {fresh(28350);let view=click(28350).view;view.onClickUseBtn();await deliver();
  ctx.Y.ActorModel.actorID='other-owner';view=click(28350).view;view.onClickUseBtn();
  assert.equal(requests[0].tag,2499,'New player must obtain its own receipt epoch');await deliver();assert(view.closed);
  ctx.Y.ActorModel.actorID='test-owner';cases++;}
 {fresh(28350);const first=click(28350).view;first.onClickUseBtn();const oldEpoch=requests.shift();
  socket._host='other-server';const current=click(28350).view;current.onClickUseBtn();const newEpoch=requests.shift();
  assert.equal(newEpoch.tag,2499);newEpoch.cb.call(newEpoch.owner,receipts.createEpoch(session.player));const state=socket._lhsFeatureEpoch;
  oldEpoch.cb.call(oldEpoch.owner,receipts.createEpoch(session.player));assert.equal(socket._lhsFeatureEpoch,state);
  assert.equal(requests.length,1);await deliver();assert(current.closed);assert(!first.closed);assert.equal(session.player.items[28350],1);
  socket._host='qa';cases++;}
 {const fn=Icon.prototype.onClickItem;vm.runInContext(boxPatch,ctx);ctx.LhsFashionBoxV1.install();assert.equal(fn,Icon.prototype.onClickItem);cases++;}
 {fresh(28350);const choice=new Choice(),old=ctx.B.ConvertLanguageToText;ctx.B.ConvertLanguageToText=()=>'';
  choice.data=click(28350).view.list.dataProvider.source[0];choice.dataChanged();assert.equal(choice.nameLabel.text,'Vũ khí');
  choice.data={...choice.data,_lhsFashionBoxReward:false};choice.dataChanged();assert.equal(choice.nameLabel.text,'');
  ctx.B.ConvertLanguageToText=old;cases++;}
 assert.equal(network,0);const result={result:'PASS',nativeBoxChains:supportedCount,choiceRequiresSelection:catalog.length-supportedCount,cases,savesInMemory:saves,productionWrites:0,networkAttempts:network,
  clientHash:crypto.createHash('sha256').update(boxPatch).digest('hex'),gearHash:crypto.createHash('sha256').update(gear).digest('hex')};
 if(process.env.FASHION_BOX_TEST_OUTPUT)fs.writeFileSync(process.env.FASHION_BOX_TEST_OUTPUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
