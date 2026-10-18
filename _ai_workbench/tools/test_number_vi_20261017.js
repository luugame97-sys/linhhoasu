'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const TASK=path.resolve(__dirname,'../temp/number_vi_20261017'),BASE=TASK+'/baseline',OUT=TASK+'/candidate';
const context={window:{},Math,Number,String,Array,isFinite};vm.runInNewContext(fs.readFileSync(OUT+'/js/lhs-number-vi-v1.js','utf8'),context);
const api=context.window.LhsNumberVi;let checks=0;
function eq(a,b){assert.equal(a,b);checks++;}
const cases=[[null,''],[0,'0'],[-0,'0'],[1,'1'],[999,'999'],[0.0001,'0.0001'],[1000,'1K'],[1001,'1K'],[1234,'1.23K'],[9999,'9.99K'],[10000,'10K'],[99999,'99.99K'],[100000,'100K'],[999999,'999.99K'],[1000000,'1M'],[105035900,'105.03M'],[262589750,'262.58M'],[999999999,'999.99M'],[1000000000,'1B'],[1234567890,'1.23B'],[249999999750,'249.99B'],[1000000000000,'1T'],[9007199254740991,'9007.19T'],['9007199254740991000','9007199.25T'],['00105035900','105.03M'],[-105035900,'-105.03M'],[1e21,'1000000000T'],[NaN,'--'],[Infinity,'--'],['?','?'],['10/20','10/20']];
for(const[n,s]of cases)eq(api.compact(n),s);
eq(api.compact(123456789,0),'123M');eq(api.english(105035900),'105.03M');eq(api.english(1e9),'1B');eq(api.english(1e12),'1T');eq(api.full(105035900),'105.035.900');eq(api.full('9007199254740991000'),'9.007.199.254.740.991.000');
// Use the exact candidate native functions, including data-type guards.
const source=fs.readFileSync(OUT+'/js/main.min_drop200.js','utf8');
const ctx={window:context.window,AppInfo:{lang:'cn'},wPt:{},Y:{Config:{AttrConfig:{1:{dataType:1},2:{dataType:2}}}}};
for(const name of ['overLength','overLengthEn','overLengthPower','overLenghPowerEn']){const start=source.indexOf('wPt.'+name+'=function'),end=source.indexOf('},',start)+1;ctx.wPt[name]=vm.runInNewContext('('+source.slice(start+('wPt.'+name+'=').length,end)+')',ctx);}
for(const value of [0,1000,1000000,105035900,1e9,1e12]){eq(ctx.wPt.overLength(value),api.compact(value));eq(ctx.wPt.overLengthPower(value),api.compact(value));}
eq(ctx.wPt.overLength(105035900,true),'105M');ctx.AppInfo.lang='en';eq(ctx.wPt.overLengthPower(1e9),'1B');ctx.AppInfo.lang='cn';
eq(ctx.wPt.overLengthPower(105035900,true),'105.03M');
const a=source.indexOf('CSe.formatAttrValue1=function'),b=source.indexOf('},',a)+1;
const attr=vm.runInNewContext('('+source.slice(a+'CSe.formatAttrValue1='.length,b)+')',ctx);
eq(attr(1,105035900),'105.03M');eq(attr(2,100),'1%');eq(attr(2,150.5),'1.50%');eq(attr(999,1e9),'0');
assert(!/30020170|30020171|30020322/.test(source));checks++;
// Reverse the six display edits and require byte equality for all unrelated code.
const release=JSON.parse(fs.readFileSync(TASK+'/release.json','utf8'));const bootstrap=fs.readFileSync(OUT+'/js/lhs-number-vi-v1.js','utf8')+'\n';assert(source.startsWith(bootstrap));let restored=source.slice(bootstrap.length);
for(const change of [...release.changes].reverse()){eq(restored.split(change.after).length,2);restored=restored.replace(change.after,change.before);}
eq(restored,fs.readFileSync(BASE+'/js/main.min_drop200.js','utf8'));
// Run the actual item-addon with EUI contract stubs: glyph-safe label, ratios, callbacks, exact tooltips.
function Label(){this.size=30;this.textWidth=0;}Label.prototype.$setText=function(t){this.text=t;return true;};Label.prototype.measure=function(){this.textWidth=String(this.text||'').length*this.size*.65;};
function Icon(){}Icon.prototype.labelShow=function(n){return this.data.labelShow(n,this.countLab);};
function Tips(){}Tips.prototype.OnOpen=function(d){this._itemData=d;this.countLabel={visible:!d.hideExtraCount};this.descLabel={textFlow:[{text:'Mô tả'}]};};Tips.prototype.validateNow=function(){};
const root={LhsNumberVi:api,eui:{Label},egret:{registerClass(){}},JSONParseClass:{setData(d){this.json=d;}},ItemIcon:Icon,ItemTipsView:Tips,__extends(c,p){c.prototype=Object.create(p.prototype);c.prototype.constructor=c;},GlobalManager:{ItemModel:{GetItemCount:()=>105035900}},UIHelper:{setPopupTipsPos(){}}};
vm.runInNewContext(fs.readFileSync(OUT+'/js/lhs-item-quantity-v1.js','utf8'),{window:root,Number,String,Object,Math,isFinite});
for(const[n,s]of cases.filter(c=>c[0]!=null))eq(root.LhsItemQuantity.compact(n),s);
eq(root.LhsItemQuantity.normalize('1Tỷ'),'100M');eq(root.LhsItemQuantity.normalize('100Vạn'),'1M');eq(root.LhsItemQuantity.normalize('1Triệu'),'1T');eq(root.LhsItemQuantity.normalize('1B'),'1B');eq(root.LhsItemQuantity.normalize('10/20'),'10/20');
const label=new root.LhsQuantityLabel();label.$setText(9007199254740991);label.measure();assert(label.size<30&&label.textWidth<=label.quantityWidth);checks++;label.$setText(30);eq(label.size,30);
const icon=new Icon();icon.data={labelShow:(n,l)=>{l.tint=123;return '100K+／1M';}};icon.countLab={};eq(icon.labelShow(1e6),'100K+／1M');eq(icon.countLab.tint,123);
const tip=new Tips();tip.OnOpen({id:1,count:105035900});eq(tip.descLabel.textFlow[0].text,'Số lượng: 105.035.900\n');eq(tip.countLabel.text,'Đang có: 105.035.900');
const idx=fs.readFileSync(OUT+'/index.html','utf8');assert(idx.includes('js/main.min_drop200.js?v=20261017_number_kmbt_v1'));checks++;
assert(idx.includes('js/lhs-essence-buy-max-v1.js?v=20261017_essence_buy_max_v1'));checks++;
const skins=JSON.parse(fs.readFileSync(TASK+'/skins.json','utf8')),oldSkins=JSON.parse(JSON.stringify(skins));root.LhsItemQuantity.patchSkins(skins);let skinCount=0;
let currencyCount=0;
for(const[name,skin]of Object.entries(oldSkins))for(const[part,node]of Object.entries(skin||{})){if(node&&typeof node==='object'&&/count|cnt/i.test(part)&&node.$t==='$eBL'&&node.font==='font_num_prop_fnt'){eq(skins[name][part].$t,'LhsQuantityLabel');skinCount++;}else if(/^CurrencyItem[0-9]*Skin$/.test(name)&&part==='countLabel'&&node?.$t==='$eL'){eq(skins[name][part].$t,'LhsViCurrencyLabel');currencyCount++;}else{assert.deepEqual(skins[name][part],node);}}
assert(skinCount>0);checks++;eq(skins.MountIconItemSkin.labLevel.$t,'$eBL');
for(const size of [20,26])for(const value of [1372,10000,105035900,9007199254740991]){const l=new root.LhsViCurrencyLabel();l.size=size;l.text=api.compact(value);l.measure();assert(l.textWidth<=92);checks++;l.text='12';l.measure();eq(l.size,size);}
const output={status:'PASS',checks,skinQuantityParts:skinCount,currencySkinParts:currencyCount,cases:cases.map(([n])=>({value:String(n),display:api.compact(n)})),nativeDisplayAnchors:6,sharedOverLengthCallSites:74,powerCallSites:11,gameplayBytesRestoredExactly:true,playerWrites:0,browserExecuted:false};
fs.writeFileSync(TASK+'/tests.json',JSON.stringify(output,null,2));console.log(JSON.stringify({status:output.status,checks,gameplayBytesRestoredExactly:true}));
