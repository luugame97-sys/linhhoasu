/* Actual native checkbox/update/request code plus actual server handler, with RAM player only. */
(async function(){
 'use strict';
 const status=document.createElement('pre');status.id='qa-status';status.style='position:fixed;bottom:0;left:0;right:0;height:17%;margin:0;overflow:auto;background:#11212b;color:white;z-index:100;font:12px monospace';document.body.appendChild(status);
 const errors=[],warnings=[],checks=[],sent=[],animations=[];let mouseClicks=0,view,root,role,busy=false;
 document.addEventListener('mousedown',e=>{if(e.isTrusted)mouseClicks++;},true);
 const line=t=>{status.textContent=t;};
 window.addEventListener('error',e=>{errors.push(e.message);line(e.message);});window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason?.stack||e.reason));line(errors.at(-1));});
 const [cfg,resources,skins,p]=await Promise.all(['/config.json','/resources.json','/skins.json','/player.json'].map(p=>fetch(p).then(r=>r.json())));
 const textures={},pending={};
 async function texture(n){if(textures[n])return textures[n];if(pending[n])return pending[n];const src=resources[n]||resources[n+'_png'];if(!src)throw Error('IMAGE_MISSING_'+n);return pending[n]=new Promise((resolve,reject)=>{const l=new egret.ImageLoader();l.addEventListener(egret.Event.COMPLETE,()=>{const t=new egret.Texture();t._setBitmapData(l.data);textures[n]=t;resolve(t);},null);l.addEventListener(egret.IOErrorEvent.IO_ERROR,()=>reject(Error('IMAGE_LOAD_'+n)),null);l.load(src);});}
 RES.hasRes=n=>!!resources[n]||!!SpineHelper.skelPackData?.[n]||!!SpineHelper.atlasPackData?.[n];RES.nameSelector=n=>n.replace(/\.png$/,'');RES.getRes=n=>textures[n];RES.destroyRes=()=>true;RES.getResourceInfo=n=>({images:SpineHelper.atlasPackData?.[n]?.images||[]});
 RES.getResAsync=async n=>{if(SpineHelper.skelPackData?.[n])return SpineHelper.skelPackData[n];if(SpineHelper.atlasPackData?.[n]){const a=SpineHelper.atlasPackData[n];await Promise.all(a.images.map(i=>texture(RES.nameSelector(i))));return a.atlas;}const src=resources[n];if(!src)throw Error('RESOURCE_MISSING_'+n);if(/\.(png|jpg)$/.test(src))return texture(n);const r=await fetch(src);if(!r.ok)throw Error('RESOURCE_HTTP_'+n);if(/\.json$/.test(src))return r.json();const b=await r.arrayBuffer();if(new Uint8Array(b)[0]===0x78){const d=new zlib.Inflate(new Uint8Array(b)).decompress();return d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength);}return b;};
 egret.registerImplementation('eui.IAssetAdapter',{getAsset(n,cb,obj){texture(n).then(t=>cb.call(obj,t,n)).catch(e=>{warnings.push(e.message);cb.call(obj,null,n);});}});JSONParseClass.setData(skins);
 SpineHelper.skelPackData={};SpineHelper.atlasPackData={};for(const name of ['skel_pack_bin','skel_lang_pack_bin'])if(resources[name])await SpineHelper.loadSingleSkelPack(name);for(const name of ['atlas_pack_bin','atlas_lang_pack_bin'])if(resources[name])await SpineHelper.loadSingleAtlasPack(name);
 Object.defineProperty(GlobalManager,'Config',{get:()=>cfg,configurable:true});GlobalManager.LanguageConfig=cfg.LanguageConfig;
 const fashion=Object.create(FashionModel.prototype);fashion._fashionInfo=p.fashionInfo;fashion.checkAutoChangeFashion=()=>{};fashion.updateCehckFashionTimer=()=>{};
 const item=Object.create(ItemModel.prototype);Object.assign(item,{_itemMap:p.items,_itemUseRecords:{},_timeRecords:{},_composeIdDict:{}});
 Object.assign(GlobalManager,{FashionModel:fashion,ItemModel:item,ActorModel:{actorID:p.playerId},RoleModel:{kungfuId:8,subJob:1},UnlockSystem:{isSystemUnlock:()=>true,checkConditions:()=>true},SoundManager:{PlayEffect(){return null;}},RedManager:{updateAllTree(){}}});
 UserTips.ins=()=>({showTips:t=>{errors.push(t);line(t);}});
 const socket={_host:'local_kaka_qa'};GameSocket.ins=()=>socket;
 GameSocket.prototype.Rpc=function(tag,data,cb,owner,err){sent.push({tag,data});fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag,data})}).then(r=>r.json()).then(rows=>{if(!Array.isArray(rows))throw Error(rows.error);for(const r of rows)if(r.tag===1800)fashion.onFashionData(r.data);const r=rows.find(r=>r.tag===tag);if(r?.data?.result!==0)throw Error('ACK_'+tag+':'+JSON.stringify(r?.data));if(cb)cb.call(owner,r.data);if(view){view.updateEndSkill();view.validateNow();line('Bộ '+view.selectId+' · Đeo: '+view.checkboxEndSkill.selected+' · ACK '+tag+' = 0');}}).catch(e=>{errors.push(e.message);line(e.message);if(err)err.call(owner,e);});};
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-fashion-gear-v1.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});socket.Rpc=GameSocket.prototype.Rpc;
 const rpc=(tag,data)=>new Promise((r,j)=>socket.Rpc(tag,data,r,socket,j));
 function showInfo(){return{kungfuId:8,subJob:1,fashionMap:{...fashion._fashionInfo.fashion},equipMap:{}};}
 function eligible(){BattleTurnDataParse.entitys=[{pos:1,showInfo:showInfo()}];return BattleTurnDataParse.checkIsUseZhanSha(1);}
 async function renderFinisher(id){
  const weapon=cfg.FashionConfig[cfg.FashionEndDressConfig[id].fashionIds.find(i=>cfg.FashionConfig[i].type===301)],a=cfg.AppearanceConfig[weapon.appearIds[0]];
  const e=Object.values(cfg.EffectConfig[a.wuqiEffectId][a.wuqiType]).find(e=>e.onlyCrit===2);if(!e||!eligible())throw Error('FINISHER_NOT_ELIGIBLE');
  const animation=role.tuiModel?.skeletonData?.findAnimation(e.atkAnim);if(!animation)throw Error('FINISHER_CLIP_MISSING_'+id);
  const loaded=[];for(const name of [...e.becastEff.files,e.cameraEff].filter(Boolean)){const fx=SpineHelper.createAsyncSpine(name);await fx.loadEnsure();loaded.push({name,fx});}
  line('QA hoạt ảnh kết liễu '+id+' · '+e.atkAnim);
  await Promise.race([new Promise(resolve=>{role.setEntityAnimtion(0,e.atkAnim,false,resolve);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('FINISHER_CALLBACK_TIMEOUT')),Math.max(15000,(animation.duration+3)*1000)))]);
  animations.push({id,atkAnim:e.atkAnim,duration:animation.duration,bodyCallback:true,fxLoaded:loaded.map(x=>x.name)});
  for(const row of loaded)row.fx.Dispose?.();role.setEntityAnimtion(0,'stand',true);
 }
 async function select(id){await rpc(1802,{id,color:0,set:0});view.selectId=id;view.dyeingId=0;view.updateEndSkill();view.labName.text=cfg.LanguageConfig[cfg.FashionDressConfig[id].name]?.cn||String(id);const info=fashion.CreateEmptyShowInfo(8,1);info.fashionMap=fashion.CreateSuitFashionData(id,0,8,1);await new Promise(resolve=>{role.setLoadCallBack(resolve);role.setData(fashion.CreteShowDataByInfo(info));});role.setEntityAnimtion(0,'stand',true);view.validateNow();}
 async function chain(){if(busy)return;busy=true;try{
  for(const id of [28320,28330]){await select(id);const effect=cfg.FashionEndDressConfig[id].endEffectId;
   await rpc(1801,{id:-1,type:304,set:0});view.updateEndSkill();
   for(const on of [true,false,true]){const count=sent.filter(x=>x.tag===1801).length;view.checkboxEndSkill.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,true);
    const start=Date.now();while(fashion.GetCurFashionSkin(304)!==(on?effect:-1)&&Date.now()-start<6000)await new Promise(r=>setTimeout(r,20));view.updateEndSkill();
    if(view.checkboxEndSkill.selected!==on||eligible()!==on)throw Error('CHECKBOX_OR_BATTLE_GATE_'+id);
    const s=await fetch('/relog',{method:'POST',body:'{}'}).then(r=>r.json());fashion._fashionInfo=s.fashionInfo;view.updateEndSkill();if(view.checkboxEndSkill.selected!==on)throw Error('RELOAD_LOST_'+id);
    checks.push({id,effect,on,checkbox:view.checkboxEndSkill.selected,nativeBattleGate:eligible(),newRequests:sent.filter(x=>x.tag===1801).length-count,reload:true});
   }
   await renderFinisher(id);
  }
  const report={result:errors.length?'FAIL':'PASS',checks,animations,errors,warnings:[...new Set(warnings)],mouseClicks,scope:'native UI, battle eligibility, actual finisher body clip and FX loading with RAM persistence; not live-account combat E2E'};
  line(JSON.stringify(report,null,2));await fetch('/result',{method:'POST',body:JSON.stringify(report)});
 }catch(e){errors.push(e.stack);line(e.stack);await fetch('/result',{method:'POST',body:JSON.stringify({result:'FAIL',errors,checks,warnings:[...new Set(warnings)]})});}finally{busy=false;}}
 const controls=document.createElement('div');controls.style='position:fixed;top:0;left:0;z-index:200;background:#fff;padding:5px';document.body.appendChild(controls);
 for(const [name,action]of [['Kaká',()=>select(28320)],['Kaká Milan',()=>select(28330)],['Chạy QA bật/tắt',chain]]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>action().catch?.(e=>line(e.stack));controls.appendChild(b);}
 window.VisualMain=function(){const self=eui.UILayer.call(this)||this;self.addEventListener(egret.Event.ADDED_TO_STAGE,self.ready,self);return self;};__extends(VisualMain,eui.UILayer);
 VisualMain.prototype.ready=async function(){try{root=this;root.stage.frameRate=60;Main.getInstance=()=>root;Object.defineProperty(Main,'Instance',{get:()=>root,configurable:true});root.stageTopSafe=0;root.stageBottomSafe=0;
  view=new DisguiseSuitPanel();root.addChild(view);view.validateNow();role=view.roleShow;view.AddClick(view.checkboxEndSkill,view.onClickESCheckBox);
  await select(28320);line('Native QA riêng: bấm Đeo trên panel hoặc Chạy QA bật/tắt. Dữ liệu chỉ ở RAM.');
 }catch(e){errors.push(e.stack);line(e.stack);}};
 egret.runEgret({renderMode:'webgl',audioType:0});
})().catch(e=>{console.error(e);document.getElementById('qa-status').textContent=e.stack;});
