/* Native CrossArena views + native models + candidate handler through local RAM RPC. */
(async function(){
 'use strict';
 const status=document.createElement('pre');status.id='qa-status';status.style='position:fixed;bottom:0;left:0;right:0;height:17%;margin:0;overflow:auto;background:#11212b;color:white;z-index:100;font:12px monospace';document.body.appendChild(status);
 const errors=[],warnings=[],checks=[],sent=[],notices=[];let root,view,serial=100,ready=false,busy=false;
 const line=t=>status.textContent=t;
 window.addEventListener('error',e=>{errors.push(e.message);line(e.message);});window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason?.stack||e.reason));line(errors.at(-1));});
 const [cfg,resources,skins,p,state]=await Promise.all(['/config.json','/resources.json','/skins.json','/player.json','/state.json'].map(p=>fetch(p).then(r=>r.json())));
 const textures={},pending={},fonts={},aliases={};
 async function texture(n){if(textures[n])return textures[n];if(pending[n])return pending[n];
  if(aliases[n]){const entry=aliases[n],a=PlistHelper.packData[entry][n],image=await texture(entry.replace(/_json$/,'_png')),sheet=new egret.SpriteSheet(image);return textures[n]=sheet.createTexture(n,a.x,a.y,a.w,a.h,a.offX,a.offY,a.sourceW,a.sourceH);}
  const src=resources[n]||resources[n+'_png'];if(!src)throw Error('IMAGE_MISSING_'+n);return pending[n]=new Promise((resolve,reject)=>{const l=new egret.ImageLoader();l.addEventListener(egret.Event.COMPLETE,()=>{const t=new egret.Texture();t._setBitmapData(l.data);textures[n]=t;resolve(t);},null);l.addEventListener(egret.IOErrorEvent.IO_ERROR,()=>reject(Error('IMAGE_LOAD_'+n)),null);l.load(src);});}
 RES.hasRes=n=>!!resources[n]||!!aliases[n]||!!FntHelper.packData?.[n]||!!SpineHelper.skelPackData?.[n]||!!SpineHelper.atlasPackData?.[n];RES.nameSelector=n=>n.replace(/\.png$/,'');RES.getRes=n=>fonts[n]||textures[n];RES.destroyRes=()=>true;RES.getResourceInfo=n=>({images:SpineHelper.atlasPackData?.[n]?.images||[]});
 RES.getResAsync=async n=>{if(/_fnt$/.test(n)&&FntHelper.packData?.[n])return fonts[n]||(fonts[n]=new egret.BitmapFont(await texture(n.replace(/_fnt$/,'_png')),{frames:FntHelper.packData[n]}));if(aliases[n])return texture(n);if(SpineHelper.skelPackData?.[n])return SpineHelper.skelPackData[n];if(SpineHelper.atlasPackData?.[n]){const a=SpineHelper.atlasPackData[n];await Promise.all(a.images.map(i=>texture(RES.nameSelector(i))));return a.atlas;}const src=resources[n];if(!src)throw Error('RESOURCE_MISSING_'+n);if(/\.(png|jpg)$/.test(src))return texture(n);const r=await fetch(src);if(!r.ok)throw Error('RESOURCE_HTTP_'+n);if(/\.json$/.test(src))return r.json();const b=await r.arrayBuffer();if(new Uint8Array(b)[0]===0x78){const d=new zlib.Inflate(new Uint8Array(b)).decompress();return d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength);}return b;};
 PlistHelper.packData={};await PlistHelper.loadSinglePlistPack('plist_pack_bin');await PlistHelper.loadSinglePlistPack('plist_lang_pack_bin');
 for(const key of Object.keys(PlistHelper.packData))for(const name of Object.keys(PlistHelper.packData[key]))aliases[name]=key;
 FntHelper.packData={};await FntHelper.loadSingleFntPack('fnt_pack_bin');await FntHelper.loadSingleFntPack('fnt_lang_pack_bin');
 egret.registerImplementation('eui.IAssetAdapter',{getAsset(n,cb,obj){if(typeof n!=='string'){cb.call(obj,n,n);return;}( /_fnt$/.test(n)?RES.getResAsync(n):texture(n)).then(t=>cb.call(obj,t,n)).catch(e=>{warnings.push(e.message);cb.call(obj,null,n);});}});JSONParseClass.setData(skins);
 SpineHelper.skelPackData={};SpineHelper.atlasPackData={};for(const name of ['skel_pack_bin','skel_lang_pack_bin'])if(resources[name])await SpineHelper.loadSingleSkelPack(name);for(const name of ['atlas_pack_bin','atlas_lang_pack_bin'])if(resources[name])await SpineHelper.loadSingleAtlasPack(name);
 Object.defineProperty(GlobalManager,'Config',{get:()=>cfg,configurable:true});GlobalManager.LanguageConfig=cfg.LanguageConfig;GlobalManager.MessageCenter=MessageCenter.ins();
 const fashion=Object.create(FashionModel.prototype);fashion._fashionInfo=p.fashionInfo;fashion.checkAutoChangeFashion=()=>{};fashion.updateCehckFashionTimer=()=>{};
 const item=Object.create(ItemModel.prototype);Object.assign(item,{_itemMap:p.items,_itemUseRecords:{},_timeRecords:{},_composeIdDict:{}});
 const playerInfo=Object.create(PlayerInfoModel.prototype);playerInfo.playerInfo=p;
 const cross=Object.create(CrossArenaModel.prototype),arena=Object.create(ArenaModel.prototype),raid=Object.create(RaidInfoModel.prototype);
 Object.assign(GlobalManager,{FashionModel:fashion,ItemModel:item,CrossArenaModel:cross,ArenaModel:arena,RaidInfoModel:raid,ActorModel:{actorID:p.playerId},
  PlayerInfoModel:playerInfo,RoleModel:{kungfuId:4,subJob:0,calAllPower:()=>state.power,getNameByStage:()=>'',roleInfo:p.roleInfo},
  UnlockSystem:{isSystemUnlock:()=>true,checkConditions:()=>true},SoundManager:{PlayEffect(){return null;}},RedManager:{updateAllTree(){}},
  SettingModel:{onSubscribeRequest(){}},PresetModel:{GetBattleUsePlan:()=>0,GetPlanName:()=> 'QA'}});
 window.UserInfo={UserID:p.userId,ServerID:p.serverId};UserTips.ins=()=>({showTips:t=>{notices.push(String(t));line(String(t));}});
 const socket={_host:'local_competitions_qa'};GameSocket.ins=()=>socket;
 async function transport(tag,data,uid){sent.push({tag,data});const rows=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag,data,msgUid:uid})}).then(r=>r.json());if(!Array.isArray(rows))throw Error(rows.error);
  for(const r of rows){if(r.tag===1202)for(const row of r.data.changed||[])item._itemMap[row.id]=row.count;if(r.tag===1220)item._timeRecords[r.data.itemId]=r.data.time;}
  const result=rows.find(r=>r.tag===tag)?.data;if(!result)throw Error('ACK_MISSING_'+tag);return result;}
 GameSocket.prototype.Rpc=function(tag,data,cb,owner,err){transport(tag,data,++serial).then(r=>{if(cb)cb.call(owner,r);}).catch(e=>{errors.push(e.stack);line(e.stack);if(err)err.call(owner,e);});};socket.Rpc=GameSocket.prototype.Rpc;
 const modelRpc=function(tag,data,ok,fail){return socket.Rpc(tag,data,ok,this,fail);};
 ArenaModel.prototype.Rpc=modelRpc;CrossArenaModel.prototype.Rpc=modelRpc;RaidInfoModel.prototype.Rpc=modelRpc;
 // Keep the actual request wrapper; this fixture stops at the native result
 // boundary rather than pretending to create a full logged-in world battle.
 RaidInfoModel.prototype.sendStartFightPart=function(data){this.Rpc(2300,data,r=>{this.qaBattle=r;cross.updateArenaScore(r.score);});};
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-arena-v1.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-power-cells-full-v1.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 if(!LhsArenaContractV1.crossInstalled)throw Error('CROSS_ADDON_NOT_INSTALLED');
 cross.onArenaInfo(await transport(5000,{},++serial));
 const parallelMode=new URLSearchParams(location.search).has('parallel');
 if(parallelMode){
  const top=Object.create(TopArenaModel.prototype),rival=Object.create(CrossRivalModel.prototype);
  top.info={stage:0};top.Rpc=()=>{};rival.Rpc=()=>{};
  rival._crossRivalInfo={stage:2,endTime:Date.now()+86400000,campInfoMap:{1:{camp:1}},camp:1,score:0};
  Object.assign(GlobalManager,{TopArenaModel:top,CrossRivalModel:rival});
  if(!window.AppInfo)window.AppInfo={params:{}};AppInfo.params=AppInfo.params||{};
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-cross-events-v2.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 }
 async function show(kind){if(view){try{view.OnClose?.();}catch(_){}if(view.parent)view.parent.removeChild(view);}
  const name=kind==='rank'?'CrossArenaRankView':kind==='log'?'CrossArenaLogView':'CrossArenaChallengeView';
  const Type=window[name]||egret.getDefinitionByName(name);if(!Type)throw Error('NATIVE_VIEW_MISSING_'+name);
  view=new Type();root.addChild(view);view.validateNow();view.OnOpen?.();view.validateNow();line('Native QA '+kind+' · đối thủ liên server · dữ liệu RAM');return view;}
 function assert(ok,name){if(!ok)throw Error(name);checks.push(name);}
 async function run(){if(busy||!ready)return;busy=true;checks.length=0;errors.length=0;try{
  await show('rank');await new Promise(r=>setTimeout(r,400));assert(cross.getRankList().length===7,'BXH chung 7 người');
  await show('challenge');await new Promise(r=>setTimeout(r,400));assert(cross.getChallengeList().length>0&&cross.getChallengeList().length<=5,'Danh sách đối thủ còn lại hợp lệ');assert(cross.getChallengeList().some(r=>r.serverId!==1001),'Có đối thủ server khác');
  const before=item._itemMap[110],row=cross.getChallengeList()[0];raid.qaBattle=null;raid.sendStartFightPart({type:16,enemyid:row.dbid});
  let until=Date.now()+8000;while(!raid.qaBattle&&Date.now()<until)await new Promise(r=>setTimeout(r,30));assert(raid.qaBattle?.fightResult?.entitys.length===2,'Callback native nhận đủ dữ liệu trận');assert(item._itemMap[110]===before-1,'Client đồng bộ trừ đúng 1 vé');
  const original=sent.filter(r=>r.tag===2300).at(-1);const replay=await transport(2300,original.data,++serial);assert(replay.recovered&&replay.fightResult.entitys.length===2,'Gửi lại có đủ dữ liệu và không đánh lại');assert(item._itemMap[110]===before-1,'Retry không trừ vé lần hai');
  cross.onArenaInfo(await transport(5000,{},++serial));await show('log');await new Promise(r=>setTimeout(r,400));assert(cross.getLogList().length>0,'Nhật ký native có trận mới');
  const report={result:errors.length?'FAIL':'PASS',checks,errors,warnings:[...new Set(warnings)],notices,viewport:{width:innerWidth,height:innerHeight},
   scope:'native rendered views/models and candidate handler via local RAM RPC; battle callback boundary only, not full world animation or production login'};
  line(JSON.stringify(report,null,2));await fetch('/result',{method:'POST',body:JSON.stringify(report)});
 }catch(e){errors.push(e.stack);line(e.stack);await fetch('/result',{method:'POST',body:JSON.stringify({result:'FAIL',checks,errors,warnings:[...new Set(warnings)]})});}finally{busy=false;}}
 const controls=document.createElement('div');controls.style='position:fixed;top:0;left:0;z-index:200;background:white;padding:5px';document.body.appendChild(controls);
 for(const [name,action]of [['BXH',()=>show('rank')],['Đối thủ',()=>show('challenge')],['Nhật ký',()=>show('log')],['Chạy kiểm tra',run]]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>action().catch?.(e=>line(e.stack));controls.appendChild(b);}
 if(parallelMode){const b=document.createElement('button');b.textContent='Kiểm lịch song song';controls.appendChild(b);b.onclick=async()=>{try{
  const api=window.LhsCrossEvents;assert(api.installed,'Addon lịch gắn vào hai model native');
  const payload=await transport(6199,{},++serial);api.apply(payload);
  assert(api.isOpen('crossArena')&&GlobalManager.CrossRivalModel.checkActivityIsOpen(),'Đỉnh Phong và Tiên Vực cùng mở');
  assert(CrossArenaRankView.openCheck(false),'Gate native mở Đỉnh Phong');
  assert(!GlobalManager.TopArenaModel.IsTopArenaOpen(),'Thiên Hạ đóng đúng kỳ');
  const boundary=payload.events.crossRival.cycle.endTime,next=JSON.parse(JSON.stringify(payload));
  next.serverTime=boundary;next.events.crossRival.open=false;next.events.crossRival.cycle=null;next.events.crossRival.reason='CLOSED';
  next.events.crossArena.cycle={index:1,startTime:boundary,endTime:boundary+7*86400000,key:'QA_W1',event:'crossArena'};
  next.events.topArena.open=true;next.events.topArena.reason='';next.events.topArena.cycle={index:1,startTime:boundary,endTime:boundary+7*86400000,key:'QA_C1',event:'topArena'};
  api.apply(next);assert(api.isOpen('crossArena')&&GlobalManager.TopArenaModel.IsTopArenaOpen(),'Chuyển kỳ native: Đỉnh Phong và Thiên Hạ cùng mở');
  assert(!GlobalManager.CrossRivalModel.checkActivityIsOpen(),'Tiên Vực đóng tại mốc đổi kỳ');
  next.events.crossArena.open=false;next.events.crossArena.reason='SERVER_NOT_IN_POOL';api.apply(next);
  assert(!CrossArenaRankView.openCheck(false),'Native từ chối ngoài pool');api.apply(payload);
  const report={result:errors.length?'FAIL':'PASS',checks,errors,warnings:[...new Set(warnings)],scope:'Native Egret views and calendar models in RAM QA; no production player writes'};
  line(JSON.stringify(report,null,2));await fetch('/result',{method:'POST',body:JSON.stringify(report)});
 }catch(e){errors.push(e.stack);line(e.stack);await fetch('/result',{method:'POST',body:JSON.stringify({result:'FAIL',checks,errors,warnings})});}};}
 window.VisualMain=function(){const self=eui.UILayer.call(this)||this;self.addEventListener(egret.Event.ADDED_TO_STAGE,self.ready,self);return self;};__extends(VisualMain,eui.UILayer);
 VisualMain.prototype.ready=async function(){try{root=this;root.stage.frameRate=60;Main.getInstance=()=>root;Object.defineProperty(Main,'Instance',{get:()=>root,configurable:true});root.stageTopSafe=0;root.stageBottomSafe=0;
  await show('rank');ready=true;
 }catch(e){errors.push(e.stack);line(e.stack);}};
 egret.runEgret({renderMode:'webgl',audioType:0});
})().catch(e=>{console.error(e);document.getElementById('qa-status').textContent=e.stack;});
