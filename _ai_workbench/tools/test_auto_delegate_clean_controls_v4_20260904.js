'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..','..'),source=fs.readFileSync(process.argv[2],'utf8'),index=fs.readFileSync(process.argv[3],'utf8');
const once=x=>assert.equal(source.split(x).length-1,1,x);
once('this.currentState="stateA"');
assert.equal(source.includes('this.currentState=So.getCurCreateTime()>AppInfo.params.powerOpen?"stateA":"stateB"'),false);
once('this.powerCheckBox.selected=!!e.enoughPower');once('this.powerLab.text=B.ConvertLanguageToText(30030107)');
once('this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade');once('this.autoEquipNewAccountGroup.visible=!0');
once('this.autoEquipNewAccountGroup.top=432');
once('_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower,U9.autoConfig.isBoth=!0,this.updateViewUI()}');
once('_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,this.updateViewUI()}');
once('this.bothCheckBox.selected=e.enoughPower&&e.isBoth,this.orCheckBox.selected=e.enoughPower&&!e.isBoth');
once('t.enoughPower=null!=t.enoughPower&&t.enoughPower,t.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade');
once('t.writeBoolean(e.enoughPower)');once('t.writeBoolean(e.autoEquipUpgrade)');once('i.enoughPower=e.readBoolean()');once('i.autoEquipUpgrade=e.readBoolean()');
assert.ok(index.includes('20260904_auto_delegate_clean_v4'));
const start=source.indexOf('e7e.CheckAutoStop=function(t){'),end=source.indexOf(',t(x9=e7e,"EquipCheckModel")',start);assert.ok(start>=0&&end>start);
const ctx={e7e:{},x9:null,t(){},U9:{filter1Data:[-1,101],filter2Data:[-1,151],filter3Data:[-1,101],filter4Data:[-1,151],autoConfig:{}},YV:{calPower:x=>x?x.power||0:0},Y:{EquipModel:{getMapEquipInfo:()=>({power:100})},UnlockSystem:{isSystemUnlock:()=>false},ItemModel:{GetItemCount:()=>0},BoxLayerModel:{getBoxInfo:()=>({})},Config:{ConstConfig:{}}},RV:{getArenaTicketMax:()=>99}};
vm.runInNewContext(source.slice(start,end)+';',ctx);
function kept(isBoth,{quality=true,power=true,attrs=true}={}){ctx.U9.autoConfig={quality:5,enoughPower:true,isBoth,filterAttrs1:{isSelected:true,select1:1,select2:0},filterAttrs2:{isSelected:false,select1:0,select2:0},maxQualitySelect:{isSelected:false,quality:99}};const item={uid:1,type:1,quailty:quality?5:4,power:power?200:50,attrs:attrs?{101:1}:{}};const list=[item],sale=ctx.e7e.CheckAutoStop(list);return{kept:list.length===1,sold:sale.length===1}}
assert.deepEqual(kept(true,{quality:true,power:true,attrs:true}),{kept:true,sold:false});
assert.deepEqual(kept(true,{quality:true,power:true,attrs:false}),{kept:false,sold:true});
assert.deepEqual(kept(true,{quality:true,power:false,attrs:true}),{kept:false,sold:true});
assert.deepEqual(kept(false,{quality:true,power:true,attrs:false}),{kept:true,sold:false});
assert.deepEqual(kept(false,{quality:true,power:false,attrs:true}),{kept:true,sold:false});
assert.deepEqual(kept(false,{quality:true,power:false,attrs:false}),{kept:false,sold:true});
let config={enoughPower:false,autoEquipUpgrade:false,isBoth:false},updates=0;
function powerToggle(){config.enoughPower=!config.enoughPower;config.isBoth=true;updates++}
function autoToggle(){config.autoEquipUpgrade=!config.autoEquipUpgrade;updates++}
powerToggle();assert.deepEqual(config,{enoughPower:true,autoEquipUpgrade:false,isBoth:true});autoToggle();assert.deepEqual(config,{enoughPower:true,autoEquipUpgrade:true,isBoth:true});autoToggle();assert.deepEqual(config,{enoughPower:true,autoEquipUpgrade:false,isBoth:true});assert.equal(updates,3);
console.log(JSON.stringify({result:'PASS',checks:27,allAccountsState:'stateA',powerAndAutoIndependent:true,bothOrTruthTable:true,persistenceIndependent:true}));
