(async function(){
 'use strict';
 const status=document.createElement('pre');status.style='position:fixed;bottom:0;left:0;right:0;height:12%;margin:0;overflow:auto;background:#11212b;color:white;z-index:100;font:12px Arial';document.body.appendChild(status);
 const errors=[],warnings=[],checks=[],sent=[];let lastView=null,qaRoot=null,mouseClicks=0;
 const nativeWarn=console.warn;console.warn=function(...args){warnings.push(args.map(String).join(' '));nativeWarn.apply(console,args);};
 document.addEventListener('mousedown',e=>{if(e.isTrusted)mouseClicks++;},true);
 window.addEventListener('error',e=>{errors.push(e.message);status.textContent=e.message;});window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason?.stack||e.reason));status.textContent=errors.at(-1);});
 const [cfg,resources,skins,p]=await Promise.all(['/config.json','/resources.json','/skins.json','/player.json'].map(p=>fetch(p).then(r=>r.json()))),textures={},pending={};
 async function texture(name){if(textures[name])return textures[name];if(pending[name])return pending[name];const src=resources[name]||resources[name+'_png'];if(!src)throw Error('IMAGE_MISSING_'+name);return pending[name]=new Promise((resolve,reject)=>{const loader=new egret.ImageLoader();loader.addEventListener(egret.Event.COMPLETE,()=>{const t=new egret.Texture();t._setBitmapData(loader.data);textures[name]=t;resolve(t);},null);loader.addEventListener(egret.IOErrorEvent.IO_ERROR,()=>reject(Error('IMAGE_LOAD_'+name)),null);loader.load(src);});}
 RES.hasRes=n=>!!resources[n]||!!SpineHelper.skelPackData?.[n]||!!SpineHelper.atlasPackData?.[n];RES.nameSelector=n=>n.replace(/\.png$/,'');RES.getRes=n=>textures[n];RES.destroyRes=()=>true;RES.getResourceInfo=n=>({images:SpineHelper.atlasPackData?.[n]?.images||[]});
 RES.getResAsync=async n=>{if(SpineHelper.skelPackData?.[n])return SpineHelper.skelPackData[n];if(SpineHelper.atlasPackData?.[n]){const a=SpineHelper.atlasPackData[n];await Promise.all(a.images.map(i=>texture(RES.nameSelector(i))));return a.atlas;}const src=resources[n];if(!src)throw Error('RESOURCE_MISSING_'+n);if(/\.(png|jpg)$/.test(src))return texture(n);const r=await fetch(src);if(/\.json$/.test(src))return r.json();const data=await r.arrayBuffer();if(new Uint8Array(data)[0]===0x78){const b=new zlib.Inflate(new Uint8Array(data)).decompress();return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}return data;};
 egret.registerImplementation('eui.IAssetAdapter',{getAsset(n,cb,obj){texture(n).then(t=>cb.call(obj,t,n)).catch(()=>cb.call(obj,null,n));}});JSONParseClass.setData(skins);
 SpineHelper.skelPackData={};SpineHelper.atlasPackData={};await SpineHelper.loadSingleSkelPack('skel_pack_bin');await SpineHelper.loadSingleAtlasPack('atlas_pack_bin');
 Object.defineProperty(GlobalManager,'Config',{get:()=>cfg,configurable:true});GlobalManager.LanguageConfig=cfg.LanguageConfig;
 const item=Object.create(ItemModel.prototype);Object.assign(item,{_itemMap:p.items,_itemUseRecords:{},_timeRecords:{},_composeIdDict:{},isFreeze:false});
 const fashion=Object.create(FashionModel.prototype);fashion._fashionInfo=p.fashionInfo;fashion.checkAutoChangeFashion=()=>{};fashion.updateCehckFashionTimer=()=>{};
 Object.assign(GlobalManager,{ItemModel:item,FashionModel:fashion,ActorModel:{actorID:p.playerId},RoleModel:{kungfuId:8,subJob:1},MessageCenter:MessageCenter.ins(),UnlockSystem:{isSystemUnlock:()=>true,checkConditions:()=>true},SoundManager:{PlayEffect(){}},RedManager:{updateAllTree(){}},UserTips:{showTips:t=>status.textContent=t}});
 UserTips.ins=()=>({showTips:t=>status.textContent=t});GetRewardView.Open=()=>{};GetRewardView.CheckOpenSpGetView=()=>{};
 const socket={_host:'localqa'};GameSocket.ins=()=>socket;
 GameSocket.prototype.Rpc=function(tag,data,cb,owner,err){sent.push({tag,data:JSON.parse(JSON.stringify(data))});fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag,data})}).then(r=>r.json()).then(rows=>{if(!Array.isArray(rows))throw Error(rows.error);for(const row of rows){if(row.tag===1202)item.onItemChange(row.data);if(row.tag===1800)fashion.onFashionData(row.data);}const ack=rows.find(r=>r.tag===tag);cb&&cb.call(owner,ack.data);}).catch(e=>{errors.push(e.message);err&&err.call(owner,e);});};
 for(const file of ['lhs-fashion-gear-v1.js','lhs-fashion-box-v1.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/'+file;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 socket.Rpc=GameSocket.prototype.Rpc;
 if(!LhsFashionBoxV1.installed)throw Error('PATCH_NOT_INSTALLED');
 const views=[];function open(Type,...args){if(!qaRoot)throw Error('ROOT_MISSING');const view=new Type();qaRoot.addChild(view);view.validateNow();view.AddClick=(node,fn)=>node.addEventListener(egret.TouchEvent.TOUCH_TAP,fn,view);view.AddItemClick=(node,fn)=>node.addEventListener(eui.ItemTapEvent.ITEM_TAP,fn,view);view.CloseSelf=()=>{if(view.parent)view.parent.removeChild(view);};if(view.commonWin)view.commonWin.OnAdded=()=>{};if(view.initUI)view.initUI();view.OnOpen(...args);view.validateNow();views.push(view);lastView=view;return view;}
 ViewManager.ins=()=>({open,isShow:()=>false});
 window.VisualMain=function(){const self=eui.UILayer.call(this)||this;self.addEventListener(egret.Event.ADDED_TO_STAGE,self.ready,self);return self;};__extends(VisualMain,eui.UILayer);
 VisualMain.prototype.ready=async function(){try{qaRoot=this;Main.getInstance=()=>qaRoot;Object.defineProperty(Main,'Instance',{get:()=>qaRoot,configurable:true});qaRoot.stageTopSafe=0;qaRoot.stageBottomSafe=0;this.stage.frameRate=60;
  const title=new eui.Label();title.text='QA MỞ RƯƠNG BỘ · dữ liệu RAM';title.size=25;title.x=35;title.y=80;this.addChild(title);
  const rows=item.getBagItems(),icons=[];for(let i=0;i<rows.length;i++){const icon=new BagItemIcon();icon.x=60+(i%4)*170;icon.y=180+Math.floor(i/4)*200;this.addChild(icon);icon.validateNow();icon.data=rows[i];icon.validateNow();icons.push(icon);}
  const button=new eui.Button();button.skinName='BtnYellow0Skin';button.label='Chạy chuỗi QA';button.x=190;button.y=700;button.width=340;this.addChild(button);
  button.addEventListener(egret.TouchEvent.TOUCH_TAP,async()=>{button.enabled=false;try{
   for(const id of [28350,28040,29010,28340,29800,28320]){
    const icon=icons.find(i=>i.data.id===id);const before=sent.length;icon.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,true);if(!(lastView instanceof ItemTipsView))throw Error('CLICK_ROUTE_'+id);const tip=lastView;if(!tip.useBtn.visible)throw Error('NO_OPEN_BUTTON_'+id);if(sent.length!==before)throw Error('PREVIEW_MUTATED');
    tip.useBtn.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,true);const use=lastView;if(!(use instanceof ItemUseView))throw Error('USE_ROUTE');
    await new Promise(r=>egret.callLater(r,null));use.validateNow();use.list.validateNow();
    if(!use.useBtn.visible||!use.useBtn.enabled)throw Error('USE_BUTTON_BLOCKED');
    const labels=[];for(let i=0;i<use.list.numChildren;i++){const child=use.list.getChildAt(i);if(child.nameLabel)labels.push(child.nameLabel.text);}
    if(labels.length!==use.list.dataProvider.length||labels.some(t=>!String(t||'').trim()))throw Error('REWARD_NAME_EMPTY_'+id);
    const bounds=use.useBtn.getTransformedBounds(egret.MainContext.instance.stage);checks.push({id,parts:use.list.dataProvider.source.map(r=>r.itemData.id),labels,buttonY:bounds.y,buttonBottom:bounds.bottom,visible:use.useBtn.visible});
    use.useBtn.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,true);use.useBtn.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,true);
    const start=Date.now();while(use.parent&&Date.now()-start<5000)await new Promise(r=>setTimeout(r,20));
    if(use.parent||!fashion.IsSuitActive(id,0))throw Error('OPEN_DID_NOT_ACTIVATE_'+id);tip.CloseSelf();
    checks.at(-1).active=true;checks.at(-1).openCalls=sent.slice(before).filter(x=>x.tag===1300).length;if(checks.at(-1).openCalls!==1)throw Error('DOUBLE_OPEN');
    const ack=await new Promise((r,j)=>socket.Rpc(1802,{id,color:0,set:0},r,socket,j));if(ack.result!==0)throw Error('WEAR_FAIL');checks.at(-1).wear=true;
   }
   const reloaded=await fetch('/relog.json').then(r=>r.json());fashion._fashionInfo=reloaded.fashionInfo;checks.push({relog:true,active: fashion.IsSuitActive(28350,0),boxCount:reloaded.items[28350]});
   const result={result:errors.length?'FAIL':'PASS',errors,warnings:[...new Set(warnings)],checks,requestCount:sent.length,mouseClicks,viewport:{width:innerWidth,height:innerHeight}};status.textContent=JSON.stringify(result);await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
  }catch(e){errors.push(e.stack);status.textContent=e.stack;await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result:'FAIL',errors,checks})});}},this);
  status.textContent='Bấm một rương để xem UI, hoặc bấm Chạy chuỗi QA. Không kết nối người chơi.';
 }catch(e){status.textContent=e.stack;}};egret.runEgret({renderMode:'webgl',audioType:0});
})().catch(e=>{console.error(e);});
