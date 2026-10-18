'use strict';
// Reproduce shipped click/use UI contract without player/network mutations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const wb=path.resolve(__dirname,'..'),app=path.join(wb,'../linhhoasu/lhs/newServer'),game=path.join(wb,'../linhhoasu/webgame/game');
let network=0;const deny=()=>{network++;throw Error('AUDIT_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const key of ['http','https']){require(key).request=deny;require(key).get=deny;}
const logger=require.resolve(path.join(app,'src/logger'));require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const service=require(path.join(app,'src/services/ConfigService')),config=service.loadAllTables();
const configTableHashes=Object.fromEntries(['AssetsConfig','AssetsUseConfig','FashionConfig','FashionDressConfig','FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'].map(n=>[n,crypto.createHash('sha256').update(JSON.stringify(config[n])).digest('hex')]));
const lang=service.decodeTables(fs.readFileSync(path.join(game,'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const main=fs.readFileSync(path.join(game,'js/main.min_a6195824.js'),'utf8'),patch=fs.readFileSync(path.join(game,'js/lhs-fashion-gear-v1.js'),'utf8');
const boxPatchPath=process.env.FASHION_BOX_PATCH||'';const boxPatch=boxPatchPath?fs.readFileSync(boxPatchPath,'utf8'):'';const patched=!!boxPatch;
const acorn=require(path.join(app,'node_modules/acorn'));
function native(marker,from=0){const at=main.indexOf(marker,from);assert(at>=0,marker);let node=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:2022});if(node.type==='SequenceExpression')node=node.expressions[0];return vm.runInContext('('+main.slice(node.start,node.end)+')',ctx);}
const opened=[],sent=[],refresh=[];
function visible(view,value){view.visible=!!value;view.includeInLayout=!!value;}
const ctx=vm.createContext({Y:{Config:config,RoleModel:{kungfuId:8,subJob:1},UnlockSystem:{isSystemUnlock:()=>true,checkConditions:()=>true}},
 P:{ins:()=>({open:(view,...args)=>opened.push({view,args}),isShow:()=>false})},ok:'FashionInfoView',uk:'ItemTipsView',wA:'ItemUseView',TA:'ArtifactItemUseView',
 B:{ConvertLanguageToText:String,strformatByLangId:String,generateTextFlowByLangId:()=>[],deepCopy:x=>JSON.parse(JSON.stringify(x)),setIncludeInLayoutVisible:visible},D:{setIncludeInLayoutVisible:visible,setPopupTipsPos(){}},nO:{setLabelQualityStyle(){}},ec:{overLength:String},AppInfo:{testMode:false},S:{ins:()=>({showTips(){},showTipsByLangId(){}})}});
class ItemModel {GetItemCount(id){return this._itemMap[id]||0;}GetItemUseRecord(){return 0;}initData(){}}
ItemModel.prototype.getBagItems=native('m.getBagItems=function');ItemModel.prototype.CheckItemCanUse=native('m.CheckItemCanUse=function');ItemModel.prototype.checkBagUseRed=native('m.checkBagUseRed=function');
ItemModel.prototype.sendUseItem=function(...args){sent.push(args);if(this._lhsFashionBoxResult)this._lhsFashionBoxResult(this.responseOk!==false,{result:this.responseOk!==false?0:-1});};
const item=new ItemModel();item._itemMap={};ctx.Y.ItemModel=item;
class ItemIcon{}
ItemIcon.prototype.onClickItem=native('pOt.onClickItem=function(){if(this._isShowInfo');
class BagItemIcon extends ItemIcon{}
class Tips{constructor(){for(const key of ['nameLabel','countLabel','descLabel','itemWayBtn','btnDetail','useBtn','sellBtn','zhanshaIcon','zhanshaPlayBtn','itemIcon'])this[key]={};}validateNow(){}}
const tipsStart=main.indexOf('i(vre,Voe=n)');assert(tipsStart>0);
Tips.prototype.OnOpen=native('yre.OnOpen=function',tipsStart);Tips.prototype.onClickUseBtn=native('yre.onClickUseBtn=function',tipsStart);
class Use{constructor(){this.commonWin={OnAdded(){}};this.itemIcon={descLabel:{}};this.labUseDesc={};this.groupCount={};this.useBtn={};this.numInput={nowNum:1};this._nowUseType=101;this._nowMaxNum=-1;this._nowChooseCount=0;this.currentState='default';}CloseSelf(){this.closed=true;}}
const useStart=main.indexOf('i(fie,Nee=n)');assert(useStart>0);
Use.prototype.OnOpen=native('Ane.OnOpen=function',useStart);Use.prototype.onClickUseBtn=native('Ane.onClickUseBtn=function',useStart);
for(const name of ['refreshByChooseBox','refreshByDropBox','refreshByPill','refreshByHomelandPack','refreshByOldTrekSailorSelect'])Use.prototype[name]=function(){refresh.push(name);};
class Socket{Rpc(){throw Error('NO_GAME_RPC_EXPECTED');}}
class Fashion{onFashionData(){}}
class Rod{}
const root={window:null,GlobalManager:ctx.Y,GameSocket:Socket,FashionModel:Fashion,FishRodPanel:Rod,ItemModel,ItemIcon,BagItemIcon,ItemTipsView:Tips,ItemUseView:Use,
 ViewManager:{ins:()=>({open:(view,...args)=>opened.push({view,args})})},RES:{hasRes:()=>true},ResDataPath:{},setTimeout(){}};root.window=root;
vm.runInNewContext(patch,root);assert(root.LhsFashionGearV1.installed);if(patched){vm.runInNewContext(boxPatch,root);assert(root.LhsFashionBoxV1.installed);}
const allBoxes=Object.values(config.AssetsConfig).filter(a=>a.type===100&&a.useType===105);
const boxes=allBoxes.filter(a=>config.AssetsUseConfig[a.id]?.type===105&&config.FashionDressConfig[a.id]);
const unsupported=allBoxes.filter(a=>!boxes.includes(a)).map(a=>({id:a.id,name:lang[a.name]?.cn||String(a.id),
 missingDress:!config.FashionDressConfig[a.id],missingParts:(config.AssetsUseConfig[a.id]?.rewards||[]).filter(r=>!config.FashionConfig[r.id]).map(r=>r.id)}));
item._itemMap=Object.fromEntries(boxes.map(b=>[b.id,1]));
const bag=item.getBagItems(),results=[];
for(const box of boxes){
 const row=bag.find(r=>r.id===box.id);assert(row&&row.isOwner&&row.canUse===1);assert(item.CheckItemCanUse(box.id));
 const icon=new BagItemIcon();icon._isShowInfo=true;icon.data=row;
 opened.length=0;icon.onClickItem();if(patched){assert.equal(opened[0].view,Tips);}else{assert.equal(opened[0].view,'FashionInfoView');}
 const preview=opened[0].view;opened.length=0;
 const tip=new Tips();tip.OnOpen({...row},icon);assert.equal(tip.useBtn.visible,true);tip.onClickUseBtn();assert.equal(opened[0].view,'ItemUseView');
 const use=new Use();refresh.length=0;sent.length=0;use.OnOpen(...opened[0].args);if(patched){assert.equal(use._lhsFashionBox,true);assert.equal(use._nowUseType,105);assert.equal(use._nowChooseCount,1);item.responseOk=true;use.onClickUseBtn();assert.deepEqual(sent[0].slice(0,3),[box.id,1,null]);assert.equal(use.closed,true);item.responseOk=false;const failed=new Use();failed.OnOpen(...opened[0].args);failed.onClickUseBtn();assert.notEqual(failed.closed,true);item.responseOk=true;}else{use.onClickUseBtn();assert.equal(use._nowUseType,105);assert.equal(refresh.length,0);assert.equal(sent.length,0);}
 results.push({id:box.id,name:lang[box.name]?.cn||String(box.id),isSuit:config.FashionDressConfig[box.id].isSuit,
   visibleInBag:true,canUse:true,clickOpens:patched?'ItemTipsView':'FashionInfoView',forcedTipsShowsUse:true,forcedUseInitializes:patched,forcedUseSends1300:patched});
 // Preview contexts stay preview; the eventual fix must not consume here.
 icon.data={id:box.id,count:1,isOwner:false};opened.length=0;icon.onClickItem();assert.equal(opened[0].view,'FashionInfoView');
 for(const opts of [{_isShowInfo:false,data:{...row}},{_isShowInfo:true,data:{...row,blockClick:true}}]){Object.assign(icon,opts);opened.length=0;icon.onClickItem();assert.equal(opened.length,0);}
}
assert.equal(boxes.length,56);assert.equal(network,0);
const output={result:patched?'PASS':'REPRODUCED',mode:patched?'NATIVE_PATCHED_AUDIT':'AUDIT_ONLY',productionWrites:0,networkAttempts:network,patchVersion:root.LhsFashionGearV1.version,
 sourceHashes:Object.fromEntries(['js/main.min_a6195824.js','js/lhs-fashion-gear-v1.js','index.html'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(game,p))).digest('hex')])),
 configTableHashes,
 count:boxes.length,totalCatalog:allBoxes.length,unsupported,bySuitType:results.reduce((a,r)=>(a[r.isSuit]=(a[r.isSuit]||0)+1,a),{}),results,
 conclusion:patched?'All 56 owned fixed suit boxes route to ItemTips, initialize type105 and send one tag1300; preview/non-owned remains read-only.':'All 56 visible/useable suit boxes route to preview. Even a forced ItemTips->ItemUse flow lacks type105 initialization and submission. No gameplay implementation edited.'};
// Verify the unsupported path on an isolated player: generic type105 fallback
// currently consumes its box but cannot grant Fashion ownership for absent rows.
(async()=>{
 const players=require(path.join(app,'src/services/PlayerService')),oldSave=players.savePlayer,oldDrain=players.drainPendingSaves,oldDeferred=players.savePlayerDeferred;
 players.savePlayer=async(_id,p)=>p;players.savePlayerDeferred=async(_id,p)=>p;players.drainPendingSaves=async()=>{};
 try{const handler=require(path.join(app,'src/handlers/item'));
  for(const row of unsupported){const p={userId:'invalid-box-audit-'+row.id,playerId:'fixture',level:100,roleInfo:{kungfuId:8,subJob:1},items:{[row.id]:1},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{}};
   const result=await handler.handleUseItem({id:row.id,count:1},{userId:p.userId,player:p},1),packets=Array.isArray(result)?result:[result];
   row.genericUseResult=packets.find(p=>p.tag===1300)?.data?.result;row.boxRemaining=p.items[row.id]||0;
   row.hiddenBagParts=row.missingParts.filter(id=>p.items[id]>0);row.ownedParts=(p.fashionInfo.activateFashion||[]).filter(id=>row.missingParts.includes(id));
   if(patched){assert.equal(row.genericUseResult,-1);assert.equal(row.boxRemaining,1);assert.equal(row.ownedParts.length,0);assert.equal(row.hiddenBagParts.length,0);}
   else{assert.equal(row.boxRemaining,0);assert.equal(row.ownedParts.length,0);assert.equal(row.hiddenBagParts.length,4);}
  }
 }finally{players.savePlayer=oldSave;players.drainPendingSaves=oldDrain;players.savePlayerDeferred=oldDeferred;}
 assert.equal(network,0);
 const out=path.join(wb,'temp/muchen_activation_20260909');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'click-audit.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({...output,configTableHashes:undefined,results:results.filter(r=>[28350,28040,29010,29040,28340].includes(r.id))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
