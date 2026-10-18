'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),app=process.env.DROP200_APP||path.join(root,'linhhoasu/lhs/newServer');
const map=JSON.parse(process.env.DROP200_CANDIDATE_MAP||'{}');
const mainFile=process.env.DROP200_MAIN||(process.env.DROP200_APP?'/linhhoasu/webgame/game/js/main.min_drop200.js':path.join(root,'linhhoasu/webgame/game/js/main.min_drop200.js'));
const s=fs.readFileSync(map[mainFile]||mainFile,'utf8');
process.env.CONFIG_BIN_PATH=process.env.CONFIG_BIN_PATH||path.join(root,'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
const C=require(path.join(app,'src/services/ConfigService'));
const cfg=C.decodeTables(fs.readFileSync(process.env.CONFIG_BIN_PATH));
// The binary baseline ends at role stage 45; construct only the documented
const cultivation=require(path.join(app,'src/config/roleLevel2000'));
const demon=require(path.join(app,'src/config/demonBossDrop200'));
process.env.ROLE_LEVEL_2000_ENABLED='1';cultivation.extend(cfg);
let cleared=48,canPay=true,sweeps=[],tips=0,checks=0;
function View(){} function Item(){}
const Y={Config:cfg,RaidInfoModel:{getDemonBossInfo:()=>({stage:cleared,cleanOutTime:0}),sendCleanOutDemonBoss:n=>sweeps.push(n)},RoleModel:{roleInfo:{stage:48},getNameByStage:n=>'Realm '+n},ItemModel:{checkItemEnough:()=>canPay},SystemTipsModel:{isClickSystem:()=>false}};
const ctx={Y,m:{},v:{LhsCultivationDataV1:cultivation},Ine:View,Cne:Item,U9:{},x:{BOXTOWER_MIN_NUMBER:2,EQUIP_QUALITY_NAME:{},QUAILTY_COLOR:{},QUAILTY_STROKE_COLOR:{},QUAILTY_COLOR_LIGHT:{}},U:{ArrayCollection:function(a){this.source=a;}},Gp:{checkRaidCanGetMutl:()=>0},Hp:{checkRaidCanGetMutl:()=>0},D:{ScrollToIndex(){},setLeftTimesLabel(){},ShowRedPoint(){}},B:{strformatByLangId:n=>' '+n,ConvertLanguageToText:n=>String(n),setGaryEnabled(){}},lu:{GetAppearancePictureById:n=>n},qo:{Prop:1},S:{ins:()=>({showTipsByLangId(){tips++;}})},_5:{getPrivilegeAddMaxNum:(id,n)=>n}};
vm.createContext(ctx);
function extract(start,end){const a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,start);return s.slice(a,b).split('=function').slice(1).join('=function');}
function method(start,end){return vm.runInContext('(function'+extract(start,end)+')',ctx);}
View.prototype.update=method('Ane.update=function(){var t,e=Y.Config.DemonBossConfig',',Ine.checkAllRewardIsGet=');
Item.prototype.dataChanged=method('Ane.dataChanged=function(){var t,e=this.data.stageData.roleStageId',',Ane.getCostRate=');
Item.prototype.getCostRate=method('Ane.getCostRate=function(){return 0<this.data.backOldMutl',',Ane.onClickChallengeBtn=');
Item.prototype.onClickAutoBtn=method('Ane.onClickAutoBtn=function(){var t=this.getMaxTimes()',',Ane.getMaxTimes=');
Item.prototype.getMaxTimes=method('Ane.getMaxTimes=function(){var t=Y.Config.DemonBossBaseConfig.cleanoutNum',',t(pL=Cne');
const a=s.indexOf('m.applyDrop46Config=function anonymous(serverId'),b=s.indexOf('},m.onPlayerInfo=',a);assert(a>=0&&b>a);vm.runInContext(s.slice(a,b)+'};',ctx);
ctx.m.applyDrop46Config(1001);
demon.extend(cfg);
function render(id,done){const item=new Item(),view=new View(),previous=cleared;cleared=done;view.list={validateNow(){}};view.scroller={height:600};view.update();cleared=previous;item.data=view.list.dataProvider.source.find(row=>Number(row.stageData.stageId||row.stageData.roleStageId)===id);assert(item.data);for(const k of ['titleLabel','headIcon','lockLabel','costItem','autoBtn','challengeBtn','countLabel','list'])item[k]={};item.backOldMutlCell={setData(){}};item.rewardFindBackMutlCell={setData(){}};const original=item.data;item.dataChanged();assert.equal(item.data,original);return item;}
function test(name,fn){fn();checks++;console.log(JSON.stringify({name,status:'PASS'}));}
test('actual native states 48 through50',()=>{assert.equal(render(49,48).currentState,'normal');assert.equal(render(50,48).currentState,'lock');assert.equal(render(49,49).currentState,'auto');assert.equal(render(50,49).currentState,'normal');assert.equal(render(49,48).titleLabel.text,cfg.DemonBossConfig[49].displayName);});
test('native old stages preserve progress and role locks',()=>{assert.equal(render(44,44).currentState,'auto');assert.equal(render(45,44).currentState,'normal');Y.RoleModel.roleInfo.stage=47;assert.equal(render(49,48).currentState,'lock');Y.RoleModel.roleInfo.stage=48;});
test('sweep identity affordability and daily limit unchanged',()=>{const item=render(49,49);item.onClickAutoBtn();assert.equal(sweeps.at(-1),49);const n=sweeps.length;canPay=false;item.onClickAutoBtn();assert.equal(sweeps.length,n);canPay=true;item.data.cleanOutTime=item.getMaxTimes();item.onClickAutoBtn();assert.equal(sweeps.length,n);assert.equal(tips,1);assert.equal(item.data.stageData.roleStageId,48);});
test('native view filters future and restores full table',()=>{const rows=cfg.DemonBossConfig,v=new View();v.list={validateNow(){}};v.scroller={height:600};v.update();assert.equal(cfg.DemonBossConfig,rows);assert(v.list.dataProvider.source.some(x=>x.stageData.stageId===49));assert(v.list.dataProvider.source.every(x=>Number(x.stageData.stageId||x.stageData.roleStageId)<=Math.max(cfg.DemonBossBaseConfig.show[0],cleared+cfg.DemonBossBaseConfig.show[1])));cleared=171;v.update();assert.equal(render(172,171).currentState,'normal');assert.equal(render(172,172).currentState,'auto');assert(v.list.dataProvider.source.some(x=>x.stageData.stageId===172));assert(!cfg.DemonBossConfig[173]);});
test('applyDrop idempotent config and native method identities',()=>{const before=JSON.stringify(cfg),update=View.prototype.update,change=Item.prototype.dataChanged;ctx.m.applyDrop46Config(1001);assert.equal(JSON.stringify(cfg),before);assert.equal(View.prototype.update,update);assert.equal(Item.prototype.dataChanged,change);});
console.log(JSON.stringify({result:'PASS',checks,productionWrites:0,method:'actual native extracted functions and inline config initializer in VM'}));
