'use strict';
// Read-only/full in-memory audit of every suit variant and dye unlock path.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..');
const client=process.env.FEATURE_CLIENT||path.resolve(app,'../../webgame/game/js/lhs-fashion-gear-v1.js');
let network=0,writes=0;
const deny=()=>{network++;throw Error('SUIT_AUDIT_NETWORK_DENIED')};require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const n of ['http','https']){require(n).request=deny;require(n).get=deny;}
function stub(rel,exports){const id=require.resolve(path.join(app,rel));require.cache[id]={id,filename:id,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
const playerService=require(path.join(app,'src/services/PlayerService'));const oldSave=playerService.savePlayer,oldDrain=playerService.drainPendingSaves;
playerService.savePlayer=async(_id,p)=>{writes++;return p};playerService.drainPendingSaves=async()=>{};
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables();
const appearance=require(path.join(app,'src/services/RoleAppearanceService'));
const fashion=require(path.join(app,'src/handlers/fashion'));
const boxes=require(path.join(app,'src/services/FashionBoxService'));
const clone=v=>JSON.parse(JSON.stringify(v));
function tableFor(dress){return ['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][dress.isSuit];}
function variantsFor(dress){const table=tableFor(dress), rows=tables[table]?.[dress.id];if(!rows)return[];return dress.isSuit===4?[[0,rows]]:Object.entries(rows).map(([color,row])=>[Number(color),row]);}
function player(role={kungfuId:8,subJob:1}){return {userId:'suit_audit_'+Math.random(),playerId:'suit_audit',level:100,roleInfo:role,items:{},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{}},other_attr_info:{},taskInfo:{}};}
function own(p,ids){ids.forEach(id=>appearance.grantFashionOwnership(p,id));}
function idsFor(dress,color){const row=variantsFor(dress).find(x=>x[0]===color);return row?.[1]?.fashionIds||[];}
function allSuitRows(){const out=[];for(const dress of Object.values(tables.FashionDressConfig)){for(const [color,row] of variantsFor(dress)){if(!Array.isArray(row?.fashionIds)||row.fashionIds.length===0)continue;out.push({dress,color,row,parts:row.fashionIds});}}return out;}
function installNativeFilter(){
 const main=fs.readFileSync(process.env.FEATURE_MAIN||path.resolve(app,'../../webgame/game/js/main.min_drop100.js'),'utf8');
 const acorn=require(process.env.FEATURE_ACORN||path.join(app,'node_modules/acorn'));
 function source(marker,before){const at=before==null?main.indexOf(marker):main.lastIndexOf(marker,before);assert(at>=0,marker);let n=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
 const cfg=clone(tables),ctx=vm.createContext({Y:{Config:cfg,RoleModel:{kungfuId:8,subJob:1}},AppInfo:{inChina:true},T:{serverOpenDay:90},O:Math,
  B:{deepCopy:clone,ConvertLanguageToText:String,getObjectLen:x=>Object.keys(x).length},RES:{hasRes:()=>true},U:{Label:class{}},_t:(a,b)=>a.concat(b),
  x:{ShowTypeToFashionType:{1:301,2:302,3:303,9:309},FashionTypeToEquipType:{},ESuitType:{normal:0,linkage:1,changeColor:2,bathrobe:3,endSkill:4}},it:{wuqi:1,toukui:2,shenti:3,tui:9,pet:12,lian:4},Ni:{CheckToukuiEquipRed:()=>false}});
 vm.runInContext(main.slice(main.indexOf('function lhsComponentInfo'),main.indexOf('function lhsServerStatusOpen')),ctx);
 const native=(marker,before)=>vm.runInContext('('+source(marker,before)+')',ctx);
 class Item{initData(){}getBagItems(){return[];}CheckItemCanUse(){return true}checkBagUseRed(){return false}}
 class Fish{getFishInfo(){return{rodId:5907,raftId:6210}}isUnlockFishRod(id){return id===5907}isUnlockFishRaft(id){return id===6210}}
 class Fashion{constructor(){this._fashionInfo={fashion:{},activateFashion:[],fashionData:[]};}onFashionData(){}sortFashionList(ids){ids.sort((a,b)=>a-b);}ShowTypeIsEquip(){return true;}getOtherKungfuEquip(){return{};}GetInitShowDataByKungfu(){return{};}GetSameResEquipList(){return[];}GetFashionDuration(){return 0;}GetShowServerData(){return{fashionMap:clone(this._fashionInfo.fashion)};}}
 for(const method of ['IsFashionActive','GetFashionList','checkShowType','checkShowTypeOpenDay','GetSuitFashions'])Fashion.prototype[method]=native('f.'+method+'=function');
 class Socket{Rpc(_t,_d,cb){if(cb)cb({result:0})}}
 const fields=['btnSelect','btnActive','costItem','imgUse','groupTitle','labTitle','labDesc','groupAttr','listAttr','labEmptyAttr','groupTime'];
 class Panel{constructor(){this.dataList=[];this.isInHotSpring=false;this.selectId=-1;this.showType=1;this.selected=0;this.activated=0;for(const key of fields)this[key]={visible:true,includeInLayout:true};}updateDataList(){this.dataList=Object.values(cfg.FashionConfig).map(r=>({id:r.id,state:'normal'}));}getCurFashionId(){return manager.FashionModel._fashionInfo.fashion[ctx.x.ShowTypeToFashionType[this.showType]]??-1;}updateUI(){this.rendered=this.dataList.slice();this.preview=this.getCurShowInfo();}getCurShowInfo(){return{fashionMap:{301:this.selectId},standalonePreview:true}}onClickSelect(){this.selected++;}onClickActive(){this.activated++;}}
 const nativeList=native('_ge.updateDataList=function');
 Panel.prototype.getAllBathrobeFashion=native('_ge.getAllBathrobeFashion=function');
 class Rod{constructor(){this.selectId=5907;this.circulateList={updateData(){},refreshByDataList(){},scrollTo(){}}}}
 class Raft extends Rod{}
 const manager=Object.assign(ctx.Y,{FishingModel:new Fish(),FashionModel:new Fashion(),UnlockSystem:{checkConditions:()=>true},ItemModel:new Item()});
 const root={GlobalManager:manager,GameGlobalYDXZ:manager,GameSocket:Socket,ItemModel:Item,FishingModel:Fish,FashionModel:Fashion,
  DisguiseFashionPanel:Panel,FishRodPanel:Rod,FishRaftPanel:Raft,RoleShowSpine:function(){},ERoleShowType:{toukui:2,shenti:3,tui:9},
  RES:{hasRes:()=>true},ResDataPath:{GetImgByID:id=>cfg.AssetsConfig[id]?.icon},eui:{Label:class{}},
  MessageCenter:{ins:()=>({dispatch(){}})},MessageDef:{},UserTips:{ins:()=>({showTips(){}})},setTimeout(){},performance:{now:()=>1000},window:null,console};root.window=root;
 vm.runInNewContext(fs.readFileSync(client,'utf8'),root);assert.equal(root.LhsFashionGearV1.installed,true);
 const panel=new Panel();panel.updateDataList();
 // The real native list builder must also be wrapped, not only the flat test list.
 class NativePanel extends Panel{}
 NativePanel.prototype.updateDataList=nativeList;
 const nativeRoot={...root,DisguiseFashionPanel:NativePanel,LhsFashionGearV1:null};nativeRoot.window=nativeRoot;
 // Use separate inert classes: do not install the unrelated RPC hooks twice.
 nativeRoot.GameSocket=class{Rpc(){}};nativeRoot.ItemModel=class{};nativeRoot.FashionModel=class{};
 nativeRoot.FishRodPanel=class{};nativeRoot.FishRaftPanel=class{};
 vm.runInNewContext(fs.readFileSync(client,'utf8'),nativeRoot);
 return {root,panel,Panel,NativePanel,nativeList,manager,fields,ctx};
}
(async()=>{try{
 const rows=allSuitRows(),errors=[],counts={variants:rows.length,dyeVariants:0,dyePass:0,parts:0,filtered:0,standaloneKept:0,boxes:0};
 const parentIds=new Set(Object.values(tables.FashionDressConfig).map(d=>d.id));
 for(const row of rows){counts.parts+=row.parts.length;for(const id of row.parts){const f=tables.FashionConfig[id];if(!f||f.dressId!==row.dress.id||!f.type)errors.push({type:'MEMBERSHIP',dress:row.dress.id,color:row.color,id});}}
 for(const dress of Object.values(tables.FashionDressConfig))if(dress.id!==28000&&[0,2,3].includes(dress.isSuit)){for(const [color,variant] of variantsFor(dress)){if(color<=0||!variant.cost)continue;counts.dyeVariants++;const base=player(),baseParts=idsFor(dress,0);own(base,baseParts);const cost=variant.cost;base.items[cost.id]=cost.count+100;const s={userId:base.userId,player:base};let result;
   try{result=await fashion.handleSuitColorUnlock({id:dress.id,color,replace:0},s,++writes);}catch(e){errors.push({type:'DYE_THROW',dress:dress.id,color,error:e.message});continue;}
   const packets=Array.isArray(result)?result:[result],ack=packets.find(p=>p.tag===1803)?.data; if(!ack||ack.result!==0||!packets.some(p=>p.tag===1800))errors.push({type:'DYE_ACK',dress:dress.id,color,ack,tags:packets.map(p=>p.tag)});else {counts.dyePass++;for(const id of variant.fashionIds)if(!appearance.hasFashionOwnership(base,id))errors.push({type:'DYE_OWNERSHIP',dress:dress.id,color,id});}
 }}
 const {root,panel,Panel,NativePanel,nativeList,manager,fields,ctx}=installNativeFilter();const allIds=Object.values(tables.FashionConfig).map(r=>r.id);const after=new Set(panel.dataList.map(r=>r.id));
 const expected=new Set(rows.filter(r=>[1,2,4].includes(Number(r.dress.isSuit))).flatMap(r=>r.parts));
 for(const id of allIds){const should=expected.has(id);assert.equal(after.has(id),!should,'classification '+id);assert.equal(root.LhsFashionGearV1.isSuitPiece(id),should,'piece '+id);if(should)counts.filtered++;else counts.standaloneKept++;}
 assert.equal(counts.filtered,expected.size);assert.equal(counts.filtered+counts.standaloneKept,allIds.length);
 // Every real native tab, both genders/regions, empty/partial/full ownership.
 counts.nativeTabCases=0;
 const selections=[{}, {301:28041,302:28042,303:28043,309:28049}, {301:28341,302:28342,303:28343,309:28349}, {301:29011,302:29012,303:29013,309:29019}];
 for(const inChina of [true,false])for(const role of [{kungfuId:4,subJob:0},{kungfuId:8,subJob:1}])for(const ownership of [[],[28041],allIds])for(const selection of selections){
  ctx.AppInfo.inChina=inChina;manager.RoleModel=role;manager.FashionModel._fashionInfo={fashion:clone(selection),activateFashion:ownership.slice(),fashionData:[]};
  for(const type of [1,2,3,9]){const view=new NativePanel();view.showType=type;view.selectId=view.getCurFashionId(type);const beforeState=JSON.stringify(manager.FashionModel._fashionInfo);
   nativeList.call(view);const original=Array.from(view.dataList,r=>r.id);view.updateDataList();assert.deepEqual(Array.from(view.dataList,r=>r.id),original.filter(id=>!expected.has(id)));
   view.updateUI();assert(view.rendered.every(r=>!expected.has(r.id)));assert.equal(JSON.stringify(manager.FashionModel._fashionInfo),beforeState);counts.nativeTabCases++;
  }
 }
 // A hidden whole-set piece keeps the complete outfit preview. Switching to
 // an ordinary outfit component restores normal standalone actions.
 const transition=new Panel();manager.FashionModel._fashionInfo.fashion=clone(selections[1]);transition.selectId=28041;transition.updateDataList();transition.updateUI();
 assert.deepEqual(transition.preview.fashionMap,selections[1]);for(const key of fields)assert.equal(transition[key].visible,false,key);
 transition.onClickSelect();transition.onClickActive();assert.equal(transition.selected+transition.activated,0);
 transition.selectId=23001;transition.updateUI();for(const key of fields){assert.equal(transition[key].visible,true,key);assert.equal(transition[key].includeInLayout,true,key);}
 transition.onClickSelect();transition.onClickActive();assert.equal(transition.selected,1);assert.equal(transition.activated,1);
 transition.selectId=29011;transition.isInHotSpring=false;transition.updateDataList();transition.updateUI();assert(transition.rendered.some(r=>r.id===29011));assert(transition.btnSelect.visible);
 transition.onClickSelect();assert.equal(transition.selected,2);
 const boxIds=Object.keys(tables.FashionDressConfig).map(Number).filter(boxes.isBox);counts.boxes=boxIds.length;
 // Runtime catalog after CN content overlay: 164 variants / 436 unique whole-set parts.
 assert.equal(errors.length,0,JSON.stringify(errors.slice(0,8)));assert.equal(counts.variants,164);assert.equal(counts.dyeVariants,counts.dyePass,JSON.stringify(counts));assert.equal(counts.filtered,436);assert.equal(counts.nativeTabCases,192);assert.equal(network,0);
 const output={result:'PASS',counts,errors,productionWrites:0,networkAttempts:network,clientFilterImplemented:true};
 if(process.env.FEATURE_AUDIT_OUTPUT)fs.writeFileSync(process.env.FEATURE_AUDIT_OUTPUT,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
  }finally{playerService.savePlayer=oldSave;playerService.drainPendingSaves=oldDrain;}
})().catch(e=>{console.error(e);process.exitCode=1});
