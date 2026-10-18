'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const dir=path.resolve(__dirname,'../temp/component_client_fix_20260905');
let main=fs.readFileSync(path.join(dir,'main.js.before'),'utf8');
const helper=fs.readFileSync(path.join(__dirname,'component_client_helpers_20260905.js'),'utf8');
const edits=[];
function once(before,after,label){assert.equal(main.split(before).length,2,label);main=main.replace(before,after);edits.push(label);}
function wrap(marker,build,label){const at=main.indexOf(marker);assert(at>=0,label);assert.equal(main.indexOf(marker,at+marker.length),-1,label+' unique');const start=at+marker.indexOf('function');let node=acorn.parseExpressionAt(main,start,{ecmaVersion:'latest'});if(node.type==='SequenceExpression')node=node.expressions[0];assert.equal(node.type,'FunctionExpression');const original=main.slice(node.start,node.end);main=main.slice(0,node.start)+build(original)+main.slice(node.end);edits.push(label);}
once('this.checkShowType(o.showType,s,o.openDay,o.area,o.showTypeTw,o.openDayTw)&&n.push(o.id)','(this.checkShowType(o.showType,s,o.openDay,o.area,o.showTypeTw,o.openDayTw)||lhsOwnedComponentVisible(o,s))&&n.push(o.id)','owned component listing only');
for(const name of ['GetImgByID','GetItemIconById'])wrap('pDt.'+name+'=function',original=>'function(t){return lhsComponentIcon(t,('+original+').call(this,t));}',name+' native icon resolver');
wrap('_ge.setItem=function(t){var e,i,t=Y.Config.AssetsConfig[t]',original=>'function(t){var result=('+original+').call(this,t);var asset=Y.Config.AssetsConfig[t];if(asset){this.icon.source=lhsComponentIcon(t,this.icon.source);lhsComponentBadge(this,t)}return result;}','fashion renderer icon/badge');
wrap('(_ge=nfe.prototype).dataChanged=function(){var t;this.data&&(this.currentState=this.data.state,this.validateNow(),this.spQuality.visible',original=>'function(){var result=('+original+').apply(this,arguments);lhsComponentBadge(this,this.data&&this.data.id);return result;}','clear recycled fashion badge');
wrap('pOt.dataChanged=function(){var t,e,i;this.data&&',original=>'function(){var result=('+original+').apply(this,arguments);lhsComponentBadge(this,this.data&&this.data.id);return result;}','ItemIcon badge lifecycle');
wrap('_ge.updateUI=function(t){for(var e=this',original=>'function(t){var result=('+original+').apply(this,arguments);lhsRefreshComponentPanel(this);return result;}','component panel title and requirements');
wrap('_ge.getCurShowInfo=function()',original=>'function(){return lhsComponentPreviewInfo(this,('+original+').apply(this,arguments));}','full suit preview without player mutation');
once('_ge.onClickSelect=function(){var t=this,e=x.ShowTypeToFashionType[this.showType];if(this.isInHotSpring)','_ge.onClickSelect=function(){if(lhsSelectComponent(this))return;var t=this,e=x.ShowTypeToFashionType[this.showType];if(this.isInHotSpring)','native select routes complete set');
wrap('yre.updateUI=function(){var e=this,t=(egret.stopTick(this.followUpdate,this)',original=>'function(){return lhsUpdateComponentDetail(this,'+original+',arguments);}','component detail native set preview');
once('A.ins().addListener(E.FASHION_SET_UPDATE,this.onSetUpdate,this),A.ins().dispatch(E.DISGUIS_UPDATE_CURRENCYITEM,[])','A.ins().addListener(E.FASHION_SET_UPDATE,this.onSetUpdate,this),A.ins().addListener(E.FASHION_UPDATE,this._lhsComponentRefresh,this),A.ins().dispatch(E.DISGUIS_UPDATE_CURRENCYITEM,[])','receive refresh without reopen');
once('i(afe,lpe=n),(_ge=afe.prototype).createChildren=function()','i(afe,lpe=n),(_ge=afe.prototype)._lhsComponentRefresh=function(){this.updateDataList();this.updateUI()},_ge.createChildren=function()','native refresh method');
assert(main.startsWith('!function(v){'));main=main.replace('!function(v){','!function(v){'+helper+'\n');
fs.writeFileSync(path.join(dir,'main.js'),main,'utf8');
let index=fs.readFileSync(path.join(dir,'index.html.before'),'utf8');
assert(index.includes('js/main.min_a6195824.js?v=20260905_server_status_color_v1'));
index=index.replace('js/main.min_a6195824.js?v=20260905_server_status_color_v1','js/main.min_a6195824.js?v=20260905_component_native_v2');
fs.writeFileSync(path.join(dir,'index.html'),index,'utf8');fs.writeFileSync(path.join(dir,'patch_edits.json'),JSON.stringify(edits,null,2)+'\n');console.log(JSON.stringify({result:'PASS',edits}));
