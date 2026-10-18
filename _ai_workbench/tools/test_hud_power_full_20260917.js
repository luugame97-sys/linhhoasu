'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const file=process.env.HUD_POWER_SCRIPT||'linhhoasu/webgame/game/js/lhs-hud-power-full-v1.js',source=fs.readFileSync(file,'utf8');
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++;};
function PowerCell(){this.data=0;this.left=170;this.scaleX=this.scaleY=.65;this.powerLabel={ready:true,text:'',left:64,width:0,textWidth:0,scaleX:1,scaleY:1,validateNow(){this.textWidth=this.ready?this.text.length*30:0;},$setFontData(font,key){if(key==='stale')return false;this.ready=!!font;return true;}};this.powerLabel.parent={numChildren:1,getChildAt(){return this.bg;},bg:{source:'main_bm_zhanliBG',width:200}};}
PowerCell.prototype.dataChanged=function(){this.powerLabel.text='compact:'+this.data;};
PowerCell.prototype.setValue=function(v){this.data=v;this.powerLabel.text=String(v);};
PowerCell.prototype.playAnim=function(){this.animated=true;};
function MainPanel(){this.topGroup={width:720};this.parent={left:129,width:420,parent:this.topGroup};this.powerCell=new PowerCell();this.powerCell.parent=this.parent;this.playerNameLabel={text:'Talo',parent:this.parent};this.IdlePrivilegeCardOnTopBtn={parent:{left:305,parent:this.parent}};this.hp={width:160};}
MainPanel.prototype.OnOpen=function(){this.opened=true;this.powerCell.left=170;this.initPower();};
MainPanel.prototype.OnClose=function(){this.closed=true;};
MainPanel.prototype.initPower=function(){this.powerCell.data=898043239;this.powerCell.dataChanged();};
MainPanel.prototype.updatePower=function(n){this.powerCell.data=n;this.powerCell.dataChanged();};
function MainPanelNew(){MainPanel.call(this);this.parent.left=185;this.parent.width=383;this.powerCell.left=189;this.IdlePrivilegeCardOnTopBtn.parent.parent={};}
MainPanelNew.prototype=Object.create(MainPanel.prototype);MainPanelNew.prototype.constructor=MainPanelNew;
MainPanelNew.prototype.OnOpen=function(){this.opened=true;this.powerCell.left=189;this.initPower();};
let timerId=0;const timers=new Map();
const queued=[],context={PowerCell,MainPanel,MainPanelNew,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},egret:{callLater(fn,obj){queued.push(()=>fn.call(obj));}},console:{info(){}}};context.window=context;
vm.runInNewContext(source,context);const api=context.LhsHudPowerFullV1;eq(api.installed,true);
const cases=[[0,'0'],[999,'999'],[1000,'1.000'],[999999,'999.999'],[1000000,'1.000.000'],[100000000,'100.000.000'],[898043239,'898.043.239'],[8900000000,'8.900.000.000'],[1e12,'1.000.000.000.000'],[Number.MAX_SAFE_INTEGER,'9.007.199.254.740.991'],['123456789012345678901','123.456.789.012.345.678.901'],['0000','0'],[-1,'0'],[2.8,'2'],[NaN,'？'],[Infinity,'？'],[undefined,'？'],[null,'？'],['8.9Tỷ','？'],[Number.MAX_SAFE_INTEGER+1,'？']];
for(const [n,t]of cases)eq(api.format(n),t);
for(const Type of [MainPanel,MainPanelNew]){
 const view=new Type(),beforeName=JSON.stringify(view.playerNameLabel.text),beforeHp=view.hp.width;
 view.OnOpen();while(queued.length)queued.shift()();eq(view.powerCell.powerLabel.text,'898.043.239');
 const initialLeft=view.powerCell.left,buttonLeft=view.IdlePrivilegeCardOnTopBtn.parent.left;
 for(const [n,t]of cases){view.updatePower(n);while(queued.length)queued.shift()();eq(view.powerCell.data,n);eq(view.powerCell.powerLabel.text,t);assert(view.powerCell.powerLabel.scaleX>0&&view.powerCell.powerLabel.scaleX<=1);checks++;eq(view.powerCell.left,initialLeft);}
 for(let i=0;i<5;i++){view.OnOpen();while(queued.length)queued.shift()();}eq(view.IdlePrivilegeCardOnTopBtn.parent.left,buttonLeft);
 eq(view.hp.width,beforeHp);eq(JSON.stringify(view.playerNameLabel.text),beforeName);
 view.powerCell.setValue(898077319);eq(view.powerCell.powerLabel.text,'898.077.319');eq(view.powerCell.data,898077319);
}
const other=new PowerCell();other.data=898043239;other.dataChanged();eq(other.powerLabel.text,'compact:898043239');other.setValue(898077319);eq(other.powerLabel.text,'898077319');other.playAnim();eq(other.animated,true);
const method=PowerCell.prototype.dataChanged;vm.runInNewContext(source,context);eq(PowerCell.prototype.dataChanged,method);eq(api.install(),true);
function tick(){const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1]();}}
for(const Type of [MainPanel,MainPanelNew]){
 for(const delay of [0,5,70]){
  const view=new Type(),label=view.powerCell.powerLabel;label.ready=false;view.OnOpen();while(queued.length)queued.shift()();
  eq(label.scaleX,1);eq(label.scaleY,1);eq(label.textWidth,0);eq(timers.size,1);
  for(let i=0;i<delay;i++)tick();eq(label.scaleX,1);assert(timers.size<=1);checks++;
  view.updatePower(8900000000);while(queued.length)queued.shift()();eq(label.text,'8.900.000.000');
  label.$setFontData({},'active');eq(label.text,'8.900.000.000');assert(label.textWidth>0);checks++;assert(label.width<1000);checks++;assert(label.scaleX>0.5);checks++;eq(timers.size,0);eq(view.powerCell.data,8900000000);
  const before=label.text;eq(label.$setFontData({},'stale'),false);eq(label.text,before);
  view.OnClose();eq(timers.size,0);
 }
 const view=new Type(),label=view.powerCell.powerLabel;label.ready=false;view.OnOpen();eq(timers.size,1);view.OnClose();eq(timers.size,0);while(queued.length)queued.shift()();eq(timers.size,0);
 label.$setFontData({},'active');eq(label.scaleX,1);view.OnOpen();while(queued.length)queued.shift()();eq(label.text,'898.043.239');eq(timers.size,0);view.OnClose();
 const late=new Type(),part=late.powerCell.powerLabel;late.powerCell.powerLabel=null;late.OnOpen();while(queued.length)queued.shift()();for(let i=0;i<70;i++)tick();eq(timers.size,0);
 late.powerCell.powerLabel=part;late.powerCell.partAdded('powerLabel',part);eq(part.text,'898.043.239');eq(timers.size,0);late.OnClose();
 const failed=new Type();failed.powerCell.powerLabel.ready=false;failed.OnOpen();while(queued.length)queued.shift()();for(let i=0;i<70;i++)tick();eq(timers.size,0);eq(failed.powerCell.powerLabel.scaleX,1);failed.OnClose();
}
console.log(JSON.stringify({result:'PASS',checks,scope:'self HUD only; no power/currency/other-cell changes',productionWrites:0}));
