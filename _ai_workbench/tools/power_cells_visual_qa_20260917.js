/* Reused native Egret bootstrap; catalog-derived PowerCell geometry, no accounts. */
window.startPowerCellQa=async function(context){
 'use strict';
 const {mode,cold,fontDelay,skins,errors,line}=context,checks=[];
 GlobalManager.MessageCenter=MessageCenter.ins();
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/game/js/lhs-power-cells-full-v1.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 if(!LhsPowerCellsFullV1.installed)throw Error('POWER_CELLS_ADDON_NOT_INSTALLED');
 const catalog=[];
 for(const [skin,row]of Object.entries(skins))for(const [key,spec]of Object.entries(row||{}))if(spec&&['PowerCell','OldTrekPowerCell'].includes(spec.$t)&&!/^MainPanel/.test(skin)){
  const parentKey=Object.keys(row).find(k=>(row[k]?.$eleC||[]).includes(key))||'$bs';
  function widthOf(k,depth=0){const r=row[k]||{};if(r.width>0)return r.width;if(k==='$bs'||depth>8)return row.$bs?.width||720;const p=Object.keys(row).find(i=>(row[i]?.$eleC||[]).includes(k))||'$bs';return widthOf(p,depth+1)-(Number(r.left)||0)-(Number(r.right)||0);}
  catalog.push({skin,key,spec,parentWidth:widthOf(parentKey),parentKey,parentHeight:row[parentKey]?.height||120,tree:row.treeBlessBtn&&parentKey===Object.keys(row).find(k=>(row[k]?.$eleC||[]).includes('treeBlessBtn'))?row.treeBlessBtn:null});
 }
 let root,current,busy=false;
 const next=()=>new Promise(r=>egret.callLater(r,null));
 function create(row,value){
  if(current?.host?.parent)current.host.parent.removeChild(current.host);
  const host=new eui.Group();host.width=720;host.height=360;host.y=130;root.addChild(host);
  const title=new eui.Label();title.text=row.skin;title.size=22;title.textColor=0xffffff;title.x=20;host.addChild(title);
  const parent=new eui.Group();parent.width=Math.min(row.parentWidth,720);parent.height=row.parentHeight;parent.y=65;parent.x=(720-parent.width)/2;host.addChild(parent);
  const bg=new egret.Shape();bg.graphics.beginFill(0x344955);bg.graphics.drawRect(0,0,parent.width,parent.height);bg.graphics.endFill();parent.addChild(bg);
  const Type=window[row.spec.$t],cell=new Type();if(row.spec.skinName)cell.skinName=row.spec.skinName;
  for(const k of ['left','right','top','bottom','horizontalCenter','verticalCenter','scaleX','scaleY','width'])if(row.spec[k]!=null)cell[k]=row.spec[k];
  parent.addChild(cell);host[row.key]=cell;host.powerCell=cell;
  if(row.tree){const button=new eui.Label();button.text='Phúc';button.size=22;button.width=40;button.height=35;button.left=row.tree.left;button.verticalCenter=row.tree.verticalCenter;parent.addChild(button);host.treeBlessBtn=button;}
  cell.validateNow();cell.data=value;cell.dataChanged();parent.validateNow();current={row,host,parent,cell};return current;
 }
 function snapshot(x){const cell=x.cell,label=cell.powerLabel,b=label.getTransformedBounds(x.parent);return{skin:x.row.skin,key:x.row.key,data:cell.data,text:label.text,width:label.textWidth,height:label.textHeight,scale:label.scaleX,cellWidth:cell.width,right:b.right,parentWidth:x.parent.width,timer:cell.__lhsAllPowerTimer!=null};}
 function verify(x,value){const r=snapshot(x);if(r.text!==LhsPowerCellsFullV1.format(value)||r.height>80||r.width<=0||r.scale<=0||r.timer||r.right>x.parent.width+12)throw Error('CELL_LAYOUT:'+JSON.stringify(r));return r;}
 async function record(result,extra={}){const bytes=await fetch('/game/js/lhs-power-cells-full-v1.js').then(r=>r.arrayBuffer());const addonHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const r={result,mode,addonHash,viewport:{width:innerWidth,height:innerHeight},catalogEntries:catalog.length,checks,errors,...extra};line(JSON.stringify({result,mode,catalogEntries:r.catalogEntries,checks:checks.length,errors,...extra},null,2));await fetch('/result',{method:'POST',body:JSON.stringify(r)});
 }
 async function run(){if(busy||cold)return;busy=true;checks.length=0;for(const b of controls.children)b.disabled=true;try{
  for(const row of catalog)for(const value of [898043239,8900000000,1e12,Number.MAX_SAFE_INTEGER]){const x=create(row,value);await next();checks.push(verify(x,value));}
  const row=catalog.find(x=>x.skin==='PlayerInfoPanelSkin');const x=create(row,898043239);await next();let done=false;x.cell.playAnim(898077319,()=>{done=true;});
  const until=Date.now()+2500;while(!done&&Date.now()<until)await new Promise(r=>setTimeout(r,20));if(!done)throw Error('NATIVE_TWEEN_CALLBACK_MISSING');await next();checks.push(verify(x,898077319));
  await record(errors.length?'FAIL':'PASS',{animationCallback:true});
 }catch(e){errors.push(e.stack);await record('FAIL');}finally{busy=false;for(const b of controls.children)b.disabled=false;}}
 const controls=document.createElement('div');controls.style='position:fixed;top:0;left:0;background:white;z-index:30';document.body.appendChild(controls);
 for(const [name,skin]of [['Cá nhân','PlayerInfoPanelSkin'],['Người khác','OtherPlayerInfoPanelSkin'],['BXH','RankItemSkin'],['Bục BXH','RankShowItemSkin']]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{create(catalog.find(x=>x.skin===skin),898043239);line('898.043.239 · '+skin);};controls.appendChild(b);}
 const runBtn=document.createElement('button');runBtn.textContent='Kiểm tất cả ô LC';runBtn.onclick=run;controls.appendChild(runBtn);
 if(cold)for(const b of controls.children)b.disabled=true;
 window.VisualMain=function(){const self=eui.UILayer.call(this)||this;self.addEventListener(egret.Event.ADDED_TO_STAGE,self.ready,self);return self;};__extends(VisualMain,eui.UILayer);
 VisualMain.prototype.ready=async function(){root=this;root.stage.frameRate=60;try{
  const row=catalog.find(x=>x.skin==='PlayerInfoPanelSkin'),x=create(row,898043239);await next();
  if(cold){const before=snapshot(x);await new Promise(r=>setTimeout(r,200));x.cell.data=898077319;x.cell.dataChanged();await new Promise(r=>setTimeout(r,fontDelay+500));await next();const after=verify(x,898077319);if(before.width!==0||before.scale!==1||after.scale<.5)throw Error('COLD_FONT_FAILED');checks.push(after);await record('PASS',{fontDelay,before,after});}
  else line('Kiểm PowerCell native · '+catalog.length+' vị trí từ skin, dữ liệu QA cục bộ.');
 }catch(e){errors.push(e.stack);await record('FAIL');}};
 egret.runEgret({renderMode:'webgl',audioType:0});
};
