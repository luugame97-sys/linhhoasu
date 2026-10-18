(async function(){
 'use strict';
 const mode=new URLSearchParams(location.search).get('mode')||'desktop';
 const cold=mode.indexOf('cold')===0, fontDelay=mode==='cold-late'?6500:2000;
 const errors=[],checks=[];
 const status=document.createElement('pre');status.id='qa-status';status.style='position:fixed;bottom:0;left:0;right:0;height:16%;margin:0;overflow:auto;background:#11212b;color:white;font:12px monospace;z-index:10';document.body.appendChild(status);
 const line=s=>{status.textContent=s;};window.addEventListener('error',e=>{errors.push(e.message);line(e.message);});window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason));line(String(e.reason));});
 const [resources,skins]=await Promise.all(['/resources.json','/skins.json'].map(p=>fetch(p).then(r=>r.json())));
 const textures={},fonts={},aliases={},pending={};
 async function texture(name){
  if(textures[name])return textures[name];if(pending[name])return pending[name];
  if(aliases[name]){const entry=aliases[name],frames=PlistHelper.packData[entry],a=frames[name],image=await texture(entry.replace(/_json$/,'_png'));const sheet=new egret.SpriteSheet(image);return textures[name]=sheet.createTexture(name,a.x,a.y,a.w,a.h,a.offX,a.offY,a.sourceW,a.sourceH);}
  const src=resources[name]||resources[name+'_png'];if(!src)throw Error('IMAGE_MISSING_'+name);
  return pending[name]=new Promise((resolve,reject)=>{const l=new egret.ImageLoader();l.addEventListener(egret.Event.COMPLETE,()=>{const t=new egret.Texture();t._setBitmapData(l.data);textures[name]=t;resolve(t);},null);l.addEventListener(egret.IOErrorEvent.IO_ERROR,()=>reject(Error('IMAGE_LOAD_'+name)),null);l.load(src);});
 }
 async function asset(name){
  if(/_fnt$/.test(name)&&FntHelper.packData[name])return fonts[name]||(fonts[name]=new egret.BitmapFont(await texture(name.replace(/_fnt$/,'_png')),{frames:FntHelper.packData[name]}));
  if(aliases[name]||/\.(png|jpg)$/.test(resources[name]||''))return texture(name);
  const r=await fetch(resources[name]);if(!r.ok)throw Error('RESOURCE_HTTP_'+name);const b=await r.arrayBuffer();if(new Uint8Array(b)[0]===0x78){const d=new zlib.Inflate(new Uint8Array(b)).decompress();return d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength);}return b;
 }
 RES.hasRes=n=>!!resources[n]||!!aliases[n]||!!FntHelper.packData?.[n];RES.getRes=n=>fonts[n]||textures[n];RES.getResAsync=asset;RES.destroyRes=()=>true;
 PlistHelper.packData={};await PlistHelper.loadSinglePlistPack('plist_pack_bin');await PlistHelper.loadSinglePlistPack('plist_lang_pack_bin');
 for(const key of Object.keys(PlistHelper.packData))for(const name of Object.keys(PlistHelper.packData[key]))aliases[name]=key;
 FntHelper.packData={};await FntHelper.loadSingleFntPack('fnt_pack_bin');await FntHelper.loadSingleFntPack('fnt_lang_pack_bin');
 egret.registerImplementation('eui.IAssetAdapter',{getAsset(n,cb,obj){(typeof n==='string'&&/_fnt$/.test(n)?asset(n):texture(n)).then(async t=>{if(cold&&n==='font_num_zhanli_fnt')await new Promise(r=>setTimeout(r,fontDelay));cb.call(obj,t,n);}).catch(e=>{errors.push(e.message);cb.call(obj,null,n);});}});
 JSONParseClass.setData(skins);if(!cold)await asset('font_num_zhanli_fnt');
 for(const key of ['main_bm_zhanliBG','main_txt_zhan','ui_zbnf_icon_rk01','ui_zbnf_icon_rk02','battle_bm_bloodBar_g'])if(resources[key]||aliases[key])await texture(key);
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-hud-power-full-v1.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 if(!LhsHudPowerFullV1.installed)throw Error('HUD_PATCH_NOT_INSTALLED');
 const samples=[0,999,1000,1000000,100000000,898043239,898077319,8900000000,1e12,Number.MAX_SAFE_INTEGER];
 let views=[];
 const next=()=>new Promise(resolve=>egret.callLater(resolve,null));
 function makePanel(root,skinName,y){
  const skin=skins[skinName],groupKey=Object.keys(skin).find(k=>(skin[k].$eleC||[]).includes('powerCell')),spec=skin[groupKey];
  const holder=new eui.Group();holder.x=0;holder.y=y;holder.width=720;holder.height=110;root.addChild(holder);
  const top=new eui.Group();top.width=720;top.height=110;holder.addChild(top);
  const parent=new eui.Group();parent.left=spec.left;parent.top=16;parent.width=spec.width;parent.height=55;top.addChild(parent);
  const name=new eui.Label();name.text=skinName==='MainPanelSkin'?'HUD thường · Talo':'HUD mới · Talo';name.size=20;name.textColor=0xffffff;name.left=0;name.verticalCenter=-13;parent.addChild(name);
  const hp=new eui.Label();hp.text='147833894/147833894';hp.size=14;hp.textColor=0x80ff80;hp.left=0;hp.top=27;hp.width=160;parent.addChild(hp);
  const cell=new PowerCell();cell.skinName='PowerCell2Skin';cell.left=skin.powerCell.left+45;cell.scaleX=cell.scaleY=.65;cell.verticalCenter=skin.powerCell.verticalCenter;parent.addChild(cell);cell.validateNow();
  const view={topGroup:top,powerCell:cell,playerNameLabel:name,hp,holder};
  if(skinName==='MainPanelSkin'){
   const privileges=new eui.Group();privileges.left=305;privileges.verticalCenter=2;parent.addChild(privileges);
   for(const [key,center]of [['ui_zbnf_icon_rk01',-27],['ui_zbnf_icon_rk02',18]]){const image=new eui.Image(textures[key]);image.scaleX=image.scaleY=.6;image.horizontalCenter=center;image.verticalCenter=0;privileges.addChild(image);if(!view.IdlePrivilegeCardOnTopBtn)view.IdlePrivilegeCardOnTopBtn=image;}
   view.privilege=privileges;
  }
  view.skinName=skinName;LhsHudPowerFullV1.layout(view);top.validateNow();return view;
 }
 function render(value){for(const view of views){view.powerCell.data=value;view.powerCell.dataChanged();LhsHudPowerFullV1.layout(view);view.topGroup.validateNow();}}
 function geometry(view,value){
  const cell=view.powerCell,label=cell.powerLabel,text=label.text,bounds=label.getTransformedBounds(view.topGroup),power=cell.getTransformedBounds(view.topGroup),hp=view.hp.getTransformedBounds(view.topGroup);
  const row={skin:view.skinName,value,text,expected:LhsHudPowerFullV1.format(value),labelWidth:bounds.width,labelRight:bounds.right,cellRight:power.right,hpRight:hp.right,labelScale:label.scaleX,fontRendered:!!label.font,labelTextWidth:label.textWidth};
  row.textHeight=label.textHeight;
  if(text!==row.expected||bounds.right>704.5||bounds.x<hp.right-0.5||label.textWidth<=0||label.textHeight>80||(text.length>6&&label.textWidth<100))throw Error('HUD_GEOMETRY:'+JSON.stringify(row));
  if(view.privilege){const b=view.privilege.getTransformedBounds(view.topGroup);row.privilegeLeft=b.x;row.privilegeRight=b.right;if(bounds.right>b.x+0.5||b.right>720.5)throw Error('PRIVILEGE_OVERLAP:'+JSON.stringify(row));}
  return row;
 }
 async function run(){try{checks.length=0;for(const value of samples){render(value);await next();for(const view of views)checks.push(geometry(view,value));}
  for(const v of [898043239,898077319,898043239]){render(v);await next();for(const view of views)checks.push(geometry(view,v));}
  render(898043239);await next();const bytes=await fetch('/game/js/lhs-hud-power-full-v1.js').then(r=>r.arrayBuffer());const addonHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');const result={result:errors.length?'FAIL':'PASS',mode,addonHash,viewport:{width:innerWidth,height:innerHeight},checks,errors,scope:'real bitmap font and PowerCell skins; original HUD placements plus healthbar offsets; no account/network gameplay'};line(JSON.stringify(result,null,2));await fetch('/result',{method:'POST',body:JSON.stringify(result)});
 }catch(e){errors.push(e.stack);line(e.stack);await fetch('/result',{method:'POST',body:JSON.stringify({result:'FAIL',mode,errors,checks})});}}
 const controls=document.createElement('div');controls.style='position:fixed;top:0;left:0;z-index:20;background:white';document.body.appendChild(controls);
 for(const [title,value]of [['898 triệu',898043239],['8,9 tỷ',8900000000],['1 nghìn tỷ',1e12],['Tăng LC',898077319]]){const b=document.createElement('button');b.textContent=title;b.onclick=()=>{render(value);line(LhsHudPowerFullV1.format(value));};controls.appendChild(b);}
 const button=document.createElement('button');button.textContent='Kiểm tra HUD';button.onclick=run;controls.appendChild(button);
 window.VisualMain=function(){const self=eui.UILayer.call(this)||this;self.addEventListener(egret.Event.ADDED_TO_STAGE,self.ready,self);return self;};__extends(VisualMain,eui.UILayer);
 VisualMain.prototype.ready=async function(){try{this.stage.frameRate=60;views=[makePanel(this,'MainPanelSkin',160),makePanel(this,'MainPanelNewSkin',390)];render(898043239);await next();
  if(cold){
   const snap=()=>views.map(v=>{const l=v.powerCell.powerLabel;return{skin:v.skinName,data:v.powerCell.data,text:l.text,textWidth:l.textWidth,textHeight:l.textHeight,width:l.width,height:l.height,scaleX:l.scaleX,scaleY:l.scaleY,retryPending:v.powerCell.__lhsFullPowerRetry!=null,localBudget:v.powerCell.__lhsFullPowerLocalWidth};});
   const before=snap();await new Promise(r=>setTimeout(r,200));
   // One panel receives a new raw value while its bitmap font is still pending.
   views[1].powerCell.data=898077319;views[1].powerCell.dataChanged();
   await new Promise(r=>setTimeout(r,fontDelay+500));await next();const after=snap();
   const fixed=before.every(r=>r.textWidth===0&&r.scaleX===1)&&after.every(r=>r.textWidth>100&&r.textHeight===40&&r.scaleX>0.5&&r.width<1000&&!r.retryPending&&r.text===LhsHudPowerFullV1.format(r.data));
   const bytes=await fetch('/game/js/lhs-hud-power-full-v1.js').then(r=>r.arrayBuffer());const addonHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const result={result:fixed&&!errors.length?'PASS':'FAIL',mode,fontDelay,addonHash,viewport:{width:innerWidth,height:innerHeight},before,after,productionWrites:0,errors};line(JSON.stringify(result,null,2));await fetch('/result',{method:'POST',body:JSON.stringify(result)});
  }else line('HUD số đầy đủ · '+mode+' · Bấm Kiểm tra HUD');
 }catch(e){errors.push(e.stack);line(e.stack);}};
 egret.runEgret({renderMode:'webgl',audioType:0});
})().catch(e=>{console.error(e);document.getElementById('qa-status').textContent=e.stack;});
