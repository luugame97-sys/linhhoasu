'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let checks=0,id=0;const timers=new Map(),queued=[];
const eq=(a,b)=>{assert.equal(a,b);checks++;};
function label(){return{ready:true,text:'',left:64,scaleX:1,scaleY:1,width:120,maxWidth:100000,validateNow(){this.textWidth=this.ready?this.text.length*28:0;},$setFontData(font,key){if(key==='stale')return false;this.ready=!!font;return true;}};}
function PowerCell(){this.data=0;this.width=200;this.left=115;this.scaleX=this.scaleY=.64;this.$UIComponent={8:NaN};this.parent={width:470,$UIComponent:{8:470}};this.powerLabel=label();this.powerLabel.parent={numChildren:0};this.listeners={};}
PowerCell.prototype.addEventListener=function(n,fn){this.listeners[n]=fn;};
PowerCell.prototype.dataChanged=function(){this.powerLabel.text='compact:'+this.data;};
PowerCell.prototype.setValue=function(v){this.data=v;this.powerLabel.text=String(v);};
PowerCell.prototype.playAnim=function(v,cb){this.powerLabel.num=this.data;if(v!==this.data){this.animationDone=()=>{this.powerLabel.num=v;this.powerLabel.text=String(v);if(cb)cb();this.powerLabel.text=String(v);};}};
PowerCell.prototype.stopAnim=function(){};
function MainPanel(){}MainPanel.prototype.OnOpen=function(){};MainPanel.prototype.OnClose=function(){};MainPanel.prototype.updatePower=function(n){this.powerCell.data=n;this.powerCell.dataChanged();};MainPanel.prototype.initPower=function(){};
function MainPanelNew(){}MainPanelNew.prototype=Object.create(MainPanel.prototype);
function OldTrekPowerItem(){PowerCell.call(this);this.data={power:0};}
OldTrekPowerItem.prototype=Object.create(PowerCell.prototype);OldTrekPowerItem.prototype.dataChanged=function(){this.powerLabel.text=this.data.isUnknow?'？？？？？':'compact:'+this.data.power;};
function TempleAttrPkCell(){this.powerLab0=label();this.powerLab1=label();this.data={};}
TempleAttrPkCell.prototype.dataChanged=function(){this.powerLab0.text=this.data.isPower?'compact':'12%';this.powerLab1.text=this.data.isPower?'compact':'13%';};
const ctx={PowerCell,MainPanel,MainPanelNew,OldTrekPowerItem,TempleAttrPkCell,egret:{Event:{ADDED_TO_STAGE:'added',REMOVED_FROM_STAGE:'removed'},callLater(fn,obj){queued.push(()=>fn.call(obj));}},setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(n){timers.delete(n);},console:{info(){}}};ctx.window=ctx;
const hud=fs.readFileSync(process.env.HUD_POWER_SCRIPT||'linhhoasu/webgame/game/js/lhs-hud-power-full-v1.js','utf8');
const source=fs.readFileSync(process.env.POWER_CELLS_SCRIPT||'linhhoasu/webgame/game/js/lhs-power-cells-full-v1.js','utf8');
vm.runInNewContext(hud,ctx);const hudChanged=PowerCell.prototype.dataChanged;vm.runInNewContext(source,ctx);const api=ctx.LhsPowerCellsFullV1;eq(api.installed,true);
const samples=[0,1,999,1000,1000000,898043239,8900000000,1e12,Number.MAX_SAFE_INTEGER,'898043239','？？？？？','8.9?'];
for(const raw of samples){const cell=new PowerCell();cell.data=raw;cell.dataChanged();eq(cell.powerLabel.text,api.format(raw));eq(cell.data,raw);assert(cell.powerLabel.scaleX>0&&cell.powerLabel.scaleX<=1);checks++;eq(cell.width,380);}
for(const width of [200,220,280,380]){const cell=new PowerCell();cell.$UIComponent[8]=width;cell.data=1e12;cell.dataChanged();eq(cell.width,width);for(let i=0;i<10;i++)cell.dataChanged();eq(cell.width,width);}
{const cell=new PowerCell();cell.parent={$UIComponent:{8:NaN},width:220};cell.data=898043239;for(let i=0;i<10;i++)cell.dataChanged();eq(cell.width,380);}
{const cell=new PowerCell();cell.__lhsFullPowerHud=true;cell.__lhsFullPowerLocalWidth=400;cell.data=898043239;cell.dataChanged();eq(cell.powerLabel.text,'898.043.239');eq(cell.width,200);eq(cell.__lhsAllPowerValue,undefined);}
{const cell=new PowerCell();const panel={power:cell,treeBlessBtn:{left:280,parent:cell.parent}};cell.parent.parent=panel;cell.data=898043239;cell.dataChanged();const left=panel.treeBlessBtn.left;assert(left>280);checks++;for(let i=0;i<5;i++)cell.dataChanged();eq(panel.treeBlessBtn.left,left);}
{const cell=new PowerCell();const peer={visible:true,getTransformedBounds(){return{x:310,y:20,width:100,height:30,bottom:50};}};cell.parent.parent={powerCell:cell,titleItem:peer};cell.powerLabel.getTransformedBounds=()=>({x:150,y:25,width:200,height:26,bottom:51});cell.data=898043239;cell.dataChanged();assert(cell.powerLabel.scaleX<1);checks++;eq(cell.powerLabel.text,'898.043.239');peer.visible=false;cell.dataChanged();eq(cell.powerLabel.scaleX,1);}
for(const late of [0,70]){const cell=new PowerCell();cell.powerLabel.ready=false;cell.data=898043239;cell.dataChanged();eq(cell.powerLabel.scaleX,1);for(let i=0;i<late;i++){const e=timers.entries().next().value;if(e){timers.delete(e[0]);e[1]();}}
 cell.data=898077319;cell.dataChanged();cell.powerLabel.$setFontData({},'active');eq(cell.powerLabel.text,'898.077.319');eq(cell.powerLabel.scaleX,1);eq(timers.size,0);}
{const cell=new PowerCell();cell.powerLabel.ready=false;cell.dataChanged();eq(timers.size,1);cell.listeners.removed();eq(timers.size,0);cell.data=1234567;cell.dataChanged();eq(timers.size,0);cell.powerLabel.$setFontData({},'active');cell.listeners.added();eq(cell.powerLabel.text,'1.234.567');eq(timers.size,0);}
{const cell=new PowerCell();cell.data=898043239;cell.dataChanged();let calls=0;cell.playAnim(898077319,()=>calls++);eq(cell.__lhsAllPowerAnimating,true);cell.animationDone();while(queued.length)queued.shift()();eq(calls,1);eq(cell.powerLabel.text,'898.077.319');eq(cell.data,898043239);cell.playAnim(898043239,()=>calls++);eq(cell.__lhsAllPowerAnimating,false);eq(calls,1);cell.stopAnim();eq(cell.powerLabel.text,'898.043.239');}
{const cell=new PowerCell();cell.setValue(123456789);eq(cell.data,123456789);eq(cell.powerLabel.text,'123.456.789');}
{const item=new OldTrekPowerItem();item.data={power:898043239};item.dataChanged();eq(item.powerLabel.text,'898.043.239');item.data={power:999999999,isUnknow:true};item.dataChanged();eq(item.powerLabel.text,'？？？？？');item.data={power:'99??'};item.dataChanged();eq(item.powerLabel.text,'99??');}
{const cell=new TempleAttrPkCell();cell.data={isPower:true,value0:898043239,value1:8900000000};cell.dataChanged();eq(cell.powerLab0.text,'898.043.239');eq(cell.powerLab1.text,'8.900.000.000');cell.data={isPower:false};cell.dataChanged();eq(cell.powerLab0.text,'12%');eq(cell.powerLab0.width,120);eq(cell.powerLab0.scaleX,1);}
const method=PowerCell.prototype.dataChanged;vm.runInNewContext(source,ctx);eq(PowerCell.prototype.dataChanged,method);eq(api.install(),true);
console.log(JSON.stringify({result:'PASS',checks,productionWrites:0,scope:'full numeric power; masked values and HUD v2 preserved; no global formatter replacement'}));
