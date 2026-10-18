'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'../..');
function Label(){this.size=30;this.textWidth=0;}
Label.prototype.$setText=function(text){this.text=text;return true;};
Label.prototype.measure=function(){this.textWidth=String(this.text||'').length*this.size*.65;};
function Icon(){}
Icon.prototype.labelShow=function(value){return this.data.labelShow(value,this.countLab);};
function Tips(){}
Tips.prototype.OnOpen=function(data){this._itemData=data;this.countLabel={visible:data.hideExtraCount!==1};this.descLabel={textFlow:[{text:'Mô tả gốc'}]};};
Tips.prototype.validateNow=function(){};
const context={eui:{Label},egret:{registerClass(){}},JSONParseClass:{setData(data){this.json=data;}},ItemIcon:Icon,ItemTipsView:Tips,
 __extends(c,p){c.prototype=Object.create(p.prototype);c.prototype.constructor=c;},
 GlobalManager:{ItemModel:{GetItemCount:()=>987654321}},UIHelper:{setPopupTipsPos(){}}};
context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'linhhoasu/webgame/game/js/lhs-item-quantity-v1.js'),'utf8'),context);
const api=context.LhsItemQuantity;
let assertions=0;
function equal(actual,expected){assert.strictEqual(actual,expected);assertions++;}
for(const [n,expected]of [[0,'0'],[1,'1'],[9999,'9999'],[99999,'99999'],[100000,'100K'],[300000,'300K'],[680000,'680K'],[999999,'999.99K'],[1000000,'1M'],[800000,'800K'],[600000,'600K'],[1234567,'1.23M'],[999999999,'999.99M'],[1000000000,'1B'],[1000000000000,'1T'],[9007199254740991,'9007.19T']])equal(api.compact(n),expected);
equal(api.full(1000000),'1.000.000');equal(api.full('9007199254740991000'),'9.007.199.254.740.991.000');
equal(api.normalize('100Vạn'),'1M');equal(api.normalize('80Vạn'),'800K');equal(api.normalize('1Tỷ'),'100M');equal(api.normalize('1Triệu'),'1T');
equal(api.normalize('10/20'),'10/20');equal(api.normalize('x2'),'x2');equal(api.normalize('Tặng thêm'),'Tặng thêm');
equal(api.compact(null),'');equal(api.compact(undefined),'');equal(api.compact('000100000'),'100K');equal(api.compact('100001'),'100K');equal(api.compact('100010'),'100.01K');
equal(api.full(null),'');equal(api.full(-1),'');equal(api.full(Infinity),'');equal(api.full(NaN),'');equal(api.full('1e6'),'');equal(api.full('12.5'),'');
let icon=new Icon();icon.data={};equal(icon.labelShow(1000000),'1M');let calls=0;icon.countLab={};icon.data.labelShow=(n,label)=>{calls++;equal(label,icon.countLab);return '5/10';};equal(icon.labelShow(1),'5/10');equal(calls,1);
const skins=JSON.parse(fs.readFileSync(path.join(ROOT,'_ai_workbench/temp/fishing_full_candidate_20260906/visual-skins.json')));
const original=JSON.stringify(skins.ItemIconSkin.stageLab);api.patchSkins(skins);equal(skins.ItemIconSkin.countLab.$t,'LhsQuantityLabel');equal(skins.ItemIconSkin.countLab.font,undefined);equal(JSON.stringify(skins.ItemIconSkin.stageLab),original);
equal(skins.MountIconItemSkin.labLevel.$t,'$eBL');const count=api.patchedParts.length;api.patchSkins(skins);equal(api.patchedParts.length,count);
const label=new context.LhsQuantityLabel();label.$setText('9007199254740991');label.measure();assert(label.size<30);assertions++;label.$setText('30');label.measure();equal(label.size,30);label.tint=0xff0000;equal(label.tint,0xff0000);
let tip=new Tips();tip.OnOpen({id:1,count:1000000});equal(tip.descLabel.textFlow[0].text,'Số lượng: 1.000.000\n');equal(tip.countLabel.text,'Đang có: 987.654.321');tip.OnOpen({id:1,count:300000});equal(tip.descLabel.textFlow.length,2);equal(tip.descLabel.textFlow[0].text,'Số lượng: 300.000\n');tip.OnOpen({id:1,count:0});equal(tip.descLabel.textFlow.length,1);tip.OnOpen({id:1,count:300000,hideExtraCount:1});equal(tip.descLabel.textFlow[0].text,'Số lượng: 300.000\n');equal(tip.countLabel.visible,false);
const output={passed:true,assertions,patchSha256:require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT,'linhhoasu/webgame/game/js/lhs-item-quantity-v1.js'))).digest('hex'),patchedSkinParts:api.patchedParts,nativeUIStillRequired:true};
fs.writeFileSync(path.join(ROOT,'_ai_workbench/logs/item_quantity_unit_20260907.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
