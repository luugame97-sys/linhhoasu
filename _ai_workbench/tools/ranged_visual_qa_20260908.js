/* Browser-only native renderer fixture, no game socket/login or player account. */
(async function () {
  'use strict';
  const status=document.createElement('pre');status.id='qa-status';status.style='position:fixed;bottom:0;left:0;right:0;height:24%;overflow:auto;background:#11212b;color:white;z-index:100;font:12px monospace';document.body.appendChild(status);
  const baseline=new URLSearchParams(location.search).has('baseline');
  const errors=[],warnings=[],samples=[],clocks=[],durations={},trace=[];let lastFrame=performance.now();
  window.addEventListener('error',e=>{errors.push(e.message);status.textContent=errors.join('\n');});
  window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason?.stack||e.reason));status.textContent=errors.join('\n');});
  const oldWarn=console.warn;console.warn=function(...args){warnings.push(args.join(' '));oldWarn.apply(console,args);};
  function line(text){status.textContent=text;}
  const [cfg,resources,skins]=await Promise.all(['/config.json','/resources.json','/skins.json'].map(p=>fetch(p).then(r=>r.json())));
  const textures={},pending={};
  async function texture(name){
    if(textures[name])return textures[name];if(pending[name])return pending[name];
    const src=resources[name]||resources[name+'_png'];if(!src)throw Error('IMAGE_MISSING_'+name);
    return pending[name]=new Promise((resolve,reject)=>{const loader=new egret.ImageLoader();loader.addEventListener(egret.Event.COMPLETE,()=>{const t=new egret.Texture();t._setBitmapData(loader.data);textures[name]=t;resolve(t);},null);loader.addEventListener(egret.IOErrorEvent.IO_ERROR,()=>reject(Error('IMAGE_LOAD_'+name)),null);loader.load(src);});
  }
  RES.hasRes=name=>!!resources[name]||!!SpineHelper.skelPackData?.[name]||!!SpineHelper.atlasPackData?.[name];
  RES.nameSelector=p=>p.replace(/\.png$/,'');RES.getRes=name=>textures[name];RES.destroyRes=()=>true;
  RES.getResourceInfo=name=>({images:SpineHelper.atlasPackData?.[name]?.images||[]});
  RES.getResAsync=async function(name){
    if(SpineHelper.skelPackData?.[name])return SpineHelper.skelPackData[name];
    if(SpineHelper.atlasPackData?.[name]){const row=SpineHelper.atlasPackData[name];await Promise.all(row.images.map(p=>texture(RES.nameSelector(p))));return row.atlas;}
    const url=resources[name];if(!url)throw Error('RESOURCE_MISSING_'+name);if(/\.(png|jpg)$/.test(url))return texture(name);
    const r=await fetch(url);if(!r.ok)throw Error('RESOURCE_HTTP_'+name);if(/\.json$/.test(url))return r.json();if(/\.atlas$/.test(url))return r.text();
    const b=await r.arrayBuffer();if(new Uint8Array(b)[0]===0x78){const bytes=new zlib.Inflate(new Uint8Array(b)).decompress();return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}return b;
  };
  egret.registerImplementation('eui.IAssetAdapter',{getAsset(name,cb,obj){texture(name).then(t=>cb.call(obj,t,name)).catch(()=>cb.call(obj,null,name));}});
  JSONParseClass.setData(skins);
  SpineHelper.skelPackData={};SpineHelper.atlasPackData={};
  await SpineHelper.loadSingleSkelPack('skel_pack_bin');await SpineHelper.loadSingleAtlasPack('atlas_pack_bin');
  if(resources.skel_lang_pack_bin)await SpineHelper.loadSingleSkelPack('skel_lang_pack_bin');
  if(resources.atlas_lang_pack_bin)await SpineHelper.loadSingleAtlasPack('atlas_lang_pack_bin');
  Object.defineProperty(GlobalManager,'Config',{get:()=>cfg,configurable:true});GlobalManager.LanguageConfig=cfg.LanguageConfig;
  const entities={},raid={GetEntity:id=>entities[id],GetEnitytFSM:()=>({OnHurt(){}})},fx=new MapEffMgr();
  GlobalManager.RaidMgr={mMapRaid:raid};GlobalManager.MapEffMgr=fx;GlobalManager.SoundManager={PlayEffect(){return null;}};
  GlobalManager.RoleModel={kungfuId:4,subJob:0};GlobalManager.BoxLayerModel={isInState:n=>n===5};
  GlobalManager.FashionModel=Object.create(FashionModel.prototype);
  if(!baseline)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-ranged-action-v1.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
  if(!baseline&&!LhsRangedActionV1.installed)throw Error('PATCH_NOT_INSTALLED');
  window.VisualMain=function(){const self=eui.UILayer.call(this)||this;self.addEventListener(egret.Event.ADDED_TO_STAGE,self.ready,self);return self;};__extends(VisualMain,eui.UILayer);
  VisualMain.prototype.ready=async function(){try{
    const root=this;Main.getInstance=()=>root;root.stage.frameRate=60;
    const title=new eui.Label();title.text='QA THỜI TRANG ĐÁNH XA';title.size=28;title.x=60;title.y=80;root.addChild(title);
    const description=new eui.Label();description.size=22;description.x=60;description.y=125;root.addChild(description);
    const actor=new eui.Group();actor.x=160;actor.y=650;root.addChild(actor);
    const role=new RoleShowSpine();actor.addChild(role);role.validateNow();role.scaleX=role.scaleY=.8;
    const speed=Number(new URLSearchParams(location.search).get('speed'))||1;
    actor.m_Info={modeSpeed:speed};actor.GetInfo=()=>({isPlaySoundEff:false});actor.GetHandle=()=> 'actor';
    actor.m_Model={mHeroBody:role,readrAtkCritSoundEff:()=>''};actor.getFlyOutGlobalPos=()=>({x:210,y:555});
    let callbackCount=0,lastTrack={};
    actor.UpdateActionName=function(name,loop,cb){role.stopAll();role.setTimeScale(this.m_Info.modeSpeed);this.m_Model.curAnimState={name,loop};return role.setEntityAnimtion(0,name,loop,cb?function(){callbackCount++;cb();}:null);};
    const target=new eui.Group();target.x=525;target.y=650;root.addChild(target);
    const label=new eui.Label();label.text='MỤC TIÊU QA';label.size=20;label.x=-70;label.y=-180;target.addChild(label);
    const shape=new egret.Shape();shape.graphics.beginFill(0x996e4b);shape.graphics.drawRoundRect(-35,-140,70,140,12);shape.graphics.endFill();target.addChild(shape);
    let hp=10000,hits=0;target.GetInfo=()=>({getAtt:()=>hp,setAtt(_type,value){hp=value;hits++;}});target.GetHandle=()=> 'target';target.mAI={UpdateBlood(){}};
    target.getBecastGlobalPos=()=>({x:525,y:555});target.getBecastPosLocal=()=>({x:0,y:-95});
    entities.actor=actor;entities.target=target;
    let action=null,resolveAction=null;
    egret.startTick(function(t){const n=performance.now();clocks.push(n-lastFrame);lastFrame=n;if(action){const current=role.tuiModel?.state?.getCurrent(0);lastTrack={trackTime:current?.trackTime,duration:current?.animation?.duration,timerFrame:TimerManager.ins().getFrameTime(),visibleInHierarchy:role.tuiModel?.visibleInHierarchy,stateScale:role.tuiModel?.state?.timeScale,callbacks:callbackCount};if(action.OnUpdate(0)){action.OnExit();action=null;const done=resolveAction;resolveAction=null;done(n);}}return false;},root);
    const names=Object.values(cfg.AppearanceConfig).filter(a=>a.wuqiEffectId>0&&cfg.EffectConfig[a.wuqiEffectId]?.[a.wuqiType]?.[1]?.atkType===1),catalogVariants=[];
    line('Đang giải model và kiểm animation của '+names.length+' ngoại hình...');
    for(const a of names){const part=Object.values(cfg.FashionConfig).find(f=>f.type===301&&f.appearIds?.includes(a.id));if(!part)continue;
      const d=cfg.FashionDressConfig[part.dressId],table=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d.isSuit];
      const raw=cfg[table][d.id],vs=d.isSuit===4?[raw]:Object.values(raw),variant=vs.find(r=>r.fashionIds.includes(part.id));if(!variant)continue;
      catalogVariants.push([d.id,variant.colorId??variant.level]);
      const pants=variant.fashionIds.map(id=>cfg.FashionConfig[id]).find(f=>f.type===309);const res=cfg.AppearanceConfig[pants.appearIds[0]].appearance;
      const spine=SpineHelper.createAsyncSpine(res);await spine.loadEnsure();durations[a.id]={};
      for(const e of Object.values(cfg.EffectConfig[a.wuqiEffectId][a.wuqiType]).filter(e=>e.onlyCrit===0||e.onlyCrit===1)){const animation=spine.skeletonData.findAnimation(e.atkAnim);if(!animation)errors.push('MISSING_ANIMATION '+a.id+' '+e.atkAnim);durations[a.id][e.atkAnim]=animation?.duration||0;}
    }
    const allMode=new URLSearchParams(location.search).has('all');
    const variants=baseline?[[28040,0]]:allMode?catalogVariants:[[28040,0],[28340,0],[28340,1],[28340,2],[28340,3],[28340,4]];
    for(const [dress,color]of variants){const info=GlobalManager.FashionModel.CreateEmptyShowInfo(4,0);info.fashionMap=GlobalManager.FashionModel.CreateSuitFashionData(dress,color);
      const show=GlobalManager.FashionModel.CreteShowDataByInfo(info);description.text=(cfg.LanguageConfig[cfg.FashionDressConfig[dress].name]?.cn||String(dress))+' · biến thể '+color;
      await new Promise(resolve=>{role.setLoadCallBack(resolve);role.setData(show);});
      const id=info.fashionMap[301],f=cfg.FashionConfig[id],appearance=cfg.AppearanceConfig[f.appearIds[0]],effects=cfg.EffectConfig[appearance.wuqiEffectId][appearance.wuqiType];
      for(const e of Object.values(effects).filter(e=>e.onlyCrit===0||e.onlyCrit===1))for(let repeat=0;repeat<(allMode?1:2);repeat++){
        const start=performance.now(),before=hits;line(description.text+'\n'+e.atkAnim+' · lần '+(repeat+1));
        const finished=await new Promise(resolve=>{resolveAction=resolve;action=RemoteAtkAction.Create('actor','target',{aprCfg:appearance,effCfg:e,stepDamage:[{isCrit:e.onlyCrit===1,damage:-100}]},false);action.Init(raid);});
        samples.push({dress,color,anim:e.atkAnim,repeat,speed,ms:finished-start,hits:hits-before,...lastTrack});
      }
    }
    const patchBytes=baseline?null:await fetch('/game/js/lhs-ranged-action-v1.js').then(r=>r.arrayBuffer());
    const patchHash=patchBytes?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',patchBytes))).map(x=>x.toString(16).padStart(2,'0')).join(''):null;
    clocks.sort((a,b)=>a-b);const result={result:errors.length===0&&samples.every(s=>s.hits===1&&s.ms<5000)?'PASS':'FAIL',baseline,allMode,patch:baseline?null:LhsRangedActionV1.version,patchHash,renderedCases:samples.length,samples,errors,warnings,counts:baseline?{}:LhsRangedActionV1.counts,durations,mapTickP95:clocks[Math.floor(clocks.length*.95)],qaPlayerWrites:0};
    line(JSON.stringify(result,null,2));await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
  }catch(e){line(e.stack);errors.push(e.stack);await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result:'FAIL',errors,warnings,samples})});}};
  egret.runEgret({renderMode:'webgl',audioType:0});
})().catch(e=>{const status=document.getElementById('qa-status');if(status)status.textContent=e.stack;});
