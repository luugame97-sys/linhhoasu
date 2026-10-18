const fs = require('fs'), vm = require('vm'), assert = require('assert');
const bundle = fs.readFileSync('linhhoasu/webgame/game/js/main.min_drop100.js','utf8');
function native(marker, from=0) {
 const at=bundle.indexOf(marker,from); assert(at>=0,marker); const start=bundle.indexOf('function',at), open=bundle.indexOf('{',start); let depth=1, quote='', escape=false, end=open+1;
 for(;end<bundle.length;end++){ const c=bundle[end]; if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;} if(c==='"'||c==="'"){quote=c;continue;} if(c==='{')depth++;if(c==='}'&&!--depth)break; }
 return vm.runInContext('('+bundle.slice(start,end+1)+')',ctx);
}
const config={AssetsConfig:{100802:{id:100802,type:99,quality:6,icon:'random_petsoul_02'}},AssetsUseConfig:{},PetSoulConfig:{1:{quality:6,races:1}},PetSoulBaseConfig:{maxUpgradeSlotCount:6,extraValuePercent:0},PetSoulUpgradeMaterialConfig:{271:{id:271,score:100,element:1,sort:1},277:{id:277,score:400,element:1,sort:2},999:{id:999,score:4000,element:1,sort:3}}};
let requireScore=200, stock={271:100,277:999,999:9}, tips=[], rpc=[];
const model={petSoulId:1,getPetSoulData(){return {id:1,star:0}},getUpgradeConfig(){return{require:requireScore}},getStarUpRateFont(){return 'font'}};
const item={GetItemCount(id){return stock[id]||0},checkItemEnough(id,n){return n<=this.GetItemCount(id)},GetItemUseRecord(){return 0},sendUseItem(...a){rpc.push(a)}};
function Select(){} function Star(){} function Detail(){}
const root={GlobalManager:{Config:config,PetSoulModel:model,ItemModel:item,UnlockSystem:{checkConditions(){return true}}},PetSoulInfoStarUpSelectPanel:Select,PetSoulInfoStarUpPanel:Star,PetDetailView:Detail,MessageDef:{PET_SOUL_STAR_UPDATE:'star',PET_SOUL_DATA_UPDATE:'data'},setTimeout(){}};
const ctx=vm.createContext({window:root,Y:root.GlobalManager,S:{ins(){return{showTipsByLangId(id){tips.push(id)}}}},B:{toFixed(n,p){return n.toFixed(p)},getObjectLen(o){return Object.keys(o).length}},Object,Math,Number});
model.getStartUpItemsScore=native('getStartUpItemsScore=function'); model.getOneKeyStarUpSelectItems=native('getOneKeyStarUpSelectItems=function');
item.CheckItemCanUse=native('CheckItemCanUse=function');
const start=bundle.indexOf('this.skinName="PetSoulInfoStarUpSelectPanelSkin"');
// Locate panel implementation by the unique previous class registration.
const panelStart=bundle.indexOf('t(mq=_8e,"PetSoulInfoStarUpResultPanel")');
Select.prototype.initEvent=native('_.initEvent=function',panelStart); Select.prototype.updateRate=native('_.updateRate=function',panelStart); Select.prototype.OnClose=native('_.OnClose=function',panelStart);
Star.prototype.updateUI=function(){this.rateLab.text='200%'}; Detail.prototype.OnOpen=function(){};
function panel(){const p=new Select();Object.assign(p,{_selectItems:{277:1},setBtn:{},oneKeyBtn:{},materialList:{},selectList:{},rateLab:{},AddItemClick(){},AddClick(target,cb){if(target===this.setBtn)this.clickSet=cb},CloseSelf(){this.closed=true;this.OnClose()},_callback(items){this.received=items}});return p;}
const baseline=panel(); baseline.initEvent();baseline.clickSet();assert(!baseline.closed);assert(tips.includes(30108031));assert.equal(item.CheckItemCanUse(100802),false);assert(model.getOneKeyStarUpSelectItems(1)[277] || model.getOneKeyStarUpSelectItems(1)[999]);
vm.runInContext(fs.readFileSync('linhhoasu/webgame/game/js/lhs-petsoul-fix-v1.js','utf8'),ctx);
assert(root.LhsPetSoulFixV1.installed); const p=panel();p.initEvent();p.clickSet();assert(p.closed);assert.equal(p.received[277],1);assert.equal(rpc.length,0);p.updateRate();assert.equal(p.rateLab.text,'100%');
assert.equal(item.CheckItemCanUse(100802),true);assert.equal(config.AssetsConfig[100802].useType,102);
const use={_useItemData:{id:100802,count:55},numInput:{},CloseSelf(){this.closed=true}};use.refresh=native('Ane.refreshByDropBox=function');use.click=native('Ane.onClickUseBtn=function');use.refresh(use._useItemData);assert.equal(use._nowMaxNum,55);use.numInput.nowNum=1;use._nowUseType=102;use.click();assert.equal(rpc.length,1);assert.deepEqual(rpc[0],[100802,1,null]);assert(use.closed);
assert.deepEqual(JSON.parse(JSON.stringify(model.getOneKeyStarUpSelectItems(1))),{271:2});stock={277:1};assert.deepEqual(JSON.parse(JSON.stringify(model.getOneKeyStarUpSelectItems(1))),{277:1});stock={271:1,277:1};assert.deepEqual(JSON.parse(JSON.stringify(model.getOneKeyStarUpSelectItems(1))),{277:1});
const d=new Detail();d.update=function(){};let observed=[];d.observe=(event,cb)=>observed.push([event,cb]);d.OnOpen();assert.equal(observed.length,2);
console.log('PASS: native baseline reproduces overfill block + unavailable box; candidate closes via native callback, no gameplay RPC, caps display, opens box via native 1300 route, minimizes obvious material waste, refreshes PetDetail.');
// Verify the shipped table shapes and actual material scores from fresh live preflight.
const zlib=require('zlib'),crypto=require('crypto');
const {BinJsonUtil,ByteArray}=require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const liveBuffer=fs.readFileSync('_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin'), reader=new ByteArray(liveBuffer), live={};
while(reader.position<reader.length){const name=reader.readUTFBytes(reader.readUnsignedByte()),length=reader.readUnsignedInt(),raw=liveBuffer.subarray(reader.position,reader.position+length);reader.position+=length;if(['PetSoulConfig','PetSoulUpgradeConfig','PetSoulUpgradeMaterialConfig','PetSoulBaseConfig','AssetsConfig','AssetsUseConfig'].includes(name))live[name]=BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));}
assert.equal(live.AssetsUseConfig[100802],undefined);assert.equal(live.PetSoulUpgradeMaterialConfig[277].score,4000);
Object.assign(config,live);root.LhsPetSoulFixV1.install();assert(item.CheckItemCanUse(100802));
const pet=Object.values(live.PetSoulConfig)[0];model.petSoulId=pet.id;model.getPetSoulData=id=>({id,star:0});model.getUpgradeConfig=(quality,star)=>config.PetSoulUpgradeConfig[quality][star];stock={};Object.keys(config.PetSoulUpgradeMaterialConfig).forEach(id=>stock[id]=100000);
const selected=model.getOneKeyStarUpSelectItems(pet.id), selectedScore=model.getStartUpItemsScore(pet.id,selected), required=model.getUpgradeConfig(pet.quality,0).require;
assert(selectedScore>=required);assert(selectedScore<required+12);assert(Object.keys(selected).length<=config.PetSoulBaseConfig.maxUpgradeSlotCount);
// Native 6901 refuses max-star and insufficient materials before RPC; sufficient
// high score invokes the normal callback. No global reject interception is assumed.
model.getPetSoulMaxStar=()=>100;let starRpc=0,callbackCount=0;model.updatePetSoul=()=>{};ctx.A={ins(){return{dispatch(){}}}};ctx.E=root.MessageDef;model.Rpc=(tag,payload,cb)=>{assert.equal(tag,6901);starRpc++;cb({result:0,data:{id:pet.id,star:1}})};
model.cs_pet_soul_star_up=native('cs_pet_soul_star_up=function');assert.equal(model.cs_pet_soul_star_up(pet.id,{277:1},()=>callbackCount++),true);assert.equal(callbackCount,1);assert.equal(starRpc,1);
model.getPetSoulMaxStar=()=>0;assert.equal(model.cs_pet_soul_star_up(pet.id,{277:1}),false);assert.equal(starRpc,1);
model.getPetSoulMaxStar=()=>100;stock={};assert.equal(model.cs_pet_soul_star_up(pet.id,{277:1}),false);assert.equal(starRpc,1);
console.log('PASS fresh-live-config: '+crypto.createHash('sha256').update(liveBuffer).digest('hex')+'; actual 277=4000, box route absent baseline/present patched, low-waste selection, native 6901 bounds and callback.');
