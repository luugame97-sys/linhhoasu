'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const logger = path.join(app, 'src/logger.js');
require.cache[logger] = { id: logger, filename: logger, loaded: true, exports: { info() {}, warn() {}, error() {} } };
const service = require(path.join(app, 'src/services/PowerDisplayService'));
const config = require(path.join(app, 'src/services/ConfigService'));
const battle = require(path.join(app, 'src/services/BattleService'));
const wssSource = fs.readFileSync(path.join(app, 'src/net/WSServer.js'), 'utf8');
const weights = config.get('AttrConfig');
const script = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/lhs-power-display-v1.js'), 'utf8');
let count = 0;
function check(fn) { fn(); count++; }
const realm = vm.createContext({});
vm.runInContext(script, realm);
const fmt = realm.LhsPowerDisplay;
for (const [value, result] of [[0, '0'], [1, '1'], [999, '999'], [1000, '1.000'], [1234567, '1.234.567'],
  [100000000, '100.000.000'], [4294967296, '4.294.967.296'], [1e12, '1.000.000.000.000'],
  [Number.MAX_SAFE_INTEGER, '9.007.199.254.740.991']]) check(() => assert.equal(fmt.full(value), result));
for (const bad of [undefined, null, NaN, Infinity, -1, '', '100', {}, [], 1.25, Number.MAX_SAFE_INTEGER + 1]) {
  check(() => assert.equal(fmt.full(bad), '—'));
}
for (const [value, result] of [[999999, '999.999'], [1000000, '≈1 triệu'], [1234567, '≈1,23 triệu'],
  [100000000, '≈100 triệu'], [123456789, '≈123,46 triệu'], [999995000, '≈1 tỷ'], [1e9, '≈1 tỷ'],
  [1e12, '≈1 nghìn tỷ'], [1234567890123, '≈1,23 nghìn tỷ']]) check(() => assert.equal(fmt.compact(value), result));
check(() => assert.equal(fmt.delta(1200000, 1234567), '+34.567'));
check(() => assert.equal(fmt.delta(1234567, 1200000), '−34.567'));
check(() => assert.equal(fmt.delta(10, 10), '0'));
check(() => assert.equal(fmt.delta(null, 10), '—'));

const bundle = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_a6195824.js'), 'utf8');
const nativeText = bundle.match(/calPowerByAttr=(function\(t\)\{[^}]+\}return Math\.ceil\(i\)\})/)[1];
const native = vm.runInNewContext('(' + nativeText + ')', { Y: { Config: { AttrConfig: weights } } });
for (const attrs of [{1:1000}, {1:1000,2:100,3:10,4:10}, {1:1,2:1,3:1,4:1}, {1:0}, {1:12.5,2:1.5}]) {
  const snapshot = JSON.stringify(attrs);
  check(() => assert.equal(service.calculate(attrs), native(attrs)));
  check(() => assert.equal(JSON.stringify(attrs), snapshot));
}
check(() => assert.equal(battle.calcPowerScore({1:1000,2:100,3:10,4:10}), 46));
check(() => assert.equal(service.calculate({1:1000,2:100,3:10,4:10}), 4600));
for (const attrs of [null, [], {}, {1:NaN}, {1:Infinity}, {1:-1}, {1:'10'}, {powerScore:1,1:1000}, {999:100,1:1000}, {1:Number.MAX_SAFE_INTEGER}]) {
  check(() => assert.equal(service.calculate(attrs), null));
}
const options = {entityId:'player1',serverId:1001};
const before = service.fromAttrs({1:1000,2:100}, options);
check(() => assert.equal(before.combatPowerStatus, 'ready'));
check(() => assert.equal(before.combatPowerValue, 4000));
check(() => assert.equal(before.combatPowerRevision, service.fromAttrs({2:100,1:1000}, options).combatPowerRevision));
check(() => assert.notEqual(before.combatPowerRevision, service.fromAttrs({1:1001,2:100}, options).combatPowerRevision));
check(() => assert.notEqual(before.combatPowerRevision, service.fromAttrs({1:1000,2:100}, {...options,serverId:1002}).combatPowerRevision));
check(() => assert.equal(service.fromAttrs({1:1000}, {}).combatPowerStatus, 'unavailable'));
check(() => assert(wssSource.includes('const POWER_REFRESH_TAGS')));
check(() => assert(wssSource.includes('attachCombatPowerSnapshot(result, session, safeTag)')));
for (const tag of [3001, 3304, 3500, 3902, 4010, 6805, 6901, 1804, 3610]) {
  check(() => assert(new RegExp('\\b' + tag + '\\b').test(wssSource), `missing power refresh tag ${tag}`));
}
check(() => assert.equal(service.fromAttrs({1:1000}, options).powerScore, undefined));
const displayContract = service.fromAttrs({1:1000, 2:100}, options);
check(() => assert.equal(displayContract.combatPowerValue, 4000));
check(() => assert.equal(displayContract.combatPowerUnit, 'point'));
check(() => assert.equal(displayContract.combatPowerVersion, service.VERSION));
check(() => assert.equal(displayContract.combatPowerKind, 'current'));
check(() => assert.equal(displayContract.combatPowerStatus, 'ready'));
check(() => assert.equal(displayContract.combatPowerSequence,
  service.fromAttrs({2:100, 1:1000}, options).combatPowerSequence));
const newerDisplay = service.fromAttrs({1:1001, 2:100}, options);
check(() => assert(newerDisplay.combatPowerSequence > displayContract.combatPowerSequence));
check(() => assert(newerDisplay.combatPowerGeneratedAt >= displayContract.combatPowerGeneratedAt));
const { BotPopulationService } = require(path.join(app,'src/services/BotPopulationService'));
const bots = new BotPopulationService({enabled:false,chatEnabled:false});
const bot = bots._makeBot(10001,0,0,{x:0,y:0},Object.values(config.get('RobotAppearanceConfig')),
  Object.values(config.get('RobotAttrsConfig')),[{x:0,y:0}]);
const botDisplay = service.fromPlayer(bot.player,{serverId:bot.player.serverId});
check(()=>assert.equal(botDisplay.combatPowerValue,bot.mapPlayer.showInfo.combatPowerValue));
check(()=>assert.equal(botDisplay.combatPowerRevision,bot.mapPlayer.showInfo.combatPowerRevision));
check(()=>assert.equal(bot.player.power,bot.mapPlayer.showInfo.power));
check(()=>assert.notEqual(botDisplay.combatPowerValue,bot.player.power));
check(()=>assert.equal(service.fromPlayer({_bot:true,isBot:true,playerId:'b',serverId:1001,power:1}).combatPowerValue,null));
const skin=Object.values(config.get('HomelandSkinConfig')).find(r=>Number(r.attrs?.[703])>0);
const building=Object.values(config.get('HomelandBuildingConfig')).find(r=>r.attrs&&Object.keys(r.attrs).length);
const fixture={_id:'0123456789abcdef01234567',playerId:'p-test',serverId:1001,level:100,roleInfo:{kungfuId:4,stage:5},
  items:{[skin.id]:1},homelandInfo:{lv:1,buildingLv:{[building.id]:10}}};
const fixtureBefore=JSON.stringify(fixture);
const fullDisplay=service.fromPlayer(fixture);
const missingItems={...fixture};delete missingItems.items;
check(()=>assert(fullDisplay.combatPowerValue>service.fromPlayer(missingItems).combatPowerValue));
check(()=>assert.equal(JSON.stringify(fixture),fixtureBefore));
const arenaView=require(path.join(app,'src/services/ArenaReadModelService')).buildPlayerView(fixture,1001);
check(()=>assert.equal(arenaView.publicRow.combatPowerValue,fullDisplay.combatPowerValue));
check(()=>assert.equal(arenaView.publicRow.power,battle.calcPowerScore(arenaView.attrs)));
const arenaSource=fs.readFileSync(path.join(app,'src/handlers/arena.js'),'utf8');
const acorn=require(path.join(app,'node_modules/acorn'));
function sourceFunction(name){const at=arenaSource.indexOf('function '+name+'(');let ast=acorn.parseExpressionAt(arenaSource,at,{ecmaVersion:'latest'});return arenaSource.slice(ast.start,ast.end);}
const sandbox=vm.createContext({battle,config,powerDisplay:service,ensureRoleAppearance:require(path.join(app,'src/services/RoleAppearanceService')).ensureRoleAppearance,
  getPrimaryBattlePetId:()=>0,clonePlayerSnapshot:x=>JSON.parse(JSON.stringify(x)),clonePlain:x=>JSON.parse(JSON.stringify(x)),
  ensurePlainObject:x=>x||{},toSafeInt:(n,d=0)=>Number.isFinite(Number(n))?Math.floor(Number(n)):d,
  normalizeArenaRoleSelection:(kungfuId,subJob)=>({kungfuId,subJob}),toArenaDbid:x=>String(x._id)});
const buildChallenge=vm.runInContext('('+sourceFunction('buildArenaChallengeRowFromPlayer')+')',sandbox);
const row=buildChallenge(fixture,1001);
check(()=>assert.equal(row.combatPowerValue,fullDisplay.combatPowerValue));
const legacyBaseline=fs.readFileSync(path.join(root,'_ai_workbench/temp/power_display_20260913/baseline/lhs/newServer/src/handlers/arena.js'),'utf8');
const legacyAt=legacyBaseline.indexOf('function buildArenaChallengeRowFromPlayer(');
const legacyAst=acorn.parseExpressionAt(legacyBaseline,legacyAt,{ecmaVersion:'latest'});
const legacyBuild=vm.runInContext('('+legacyBaseline.slice(legacyAst.start,legacyAst.end)+')',sandbox);
const fullSource=JSON.parse(JSON.stringify(fixture));
require(path.join(app,'src/services/RoleAppearanceService')).ensureRoleAppearance(fullSource);
check(()=>assert.equal(JSON.stringify(row.robotAttrs),JSON.stringify(battle.calcPlayerPower(fullSource))));
const legacyRow=legacyBuild(missingItems,1001);
check(()=>assert(row.robotAttrs[1]>legacyRow.robotAttrs[1]));
check(()=>assert(!arenaSource.includes('delete legacyCombatSource.items')));
check(()=>assert.equal(row.power,Math.max(100,battle.calcPowerScore(row.robotAttrs))));

// Extract the shipped animation methods; do not replace them with a synthetic
// happy-path tween. Only the tween clock and EUI layout are fixture adapters.
const animStart = bundle.indexOf('o.playNumAni=function');
const animFn = bundle.slice(animStart + 'o.playNumAni='.length, bundle.indexOf(',o.stopNumAni=', animStart));
const animUpdateStart = bundle.indexOf('o.updateText=function', animStart);
const animUpdate = bundle.slice(animUpdateStart + 'o.updateText='.length, bundle.indexOf(',o.onChange=', animUpdateStart));
const tweens = [];
const tween = {
  get(target) { const item = { target, to(attrs) { this.attrs=attrs; return this; }, call(callback) { this.callback=callback; return this; } }; tweens.push(item); return item; },
  removeTweens(target) { for(const t of tweens) if(t.target===target) t.cancelled=true; },
};
function step() {
  const work=tweens.splice(0);
  for(const t of work) if(!t.cancelled) {Object.assign(t.target,t.attrs); if(t.callback)t.callback();}
}
class Display {
  constructor() { this.children=[];this.events={};this.width=500;this.height=60; }
  addChild(child) { this.children.push(child);child.parent=this;return child; }
  removeChild(child) {this.children=this.children.filter(x=>x!==child);child.parent=null;}
  addEventListener(name, fn, ctx) { (this.events[name] || (this.events[name]=[])).push({fn,ctx}); }
  removeEventListener(name, fn) {this.events[name]=(this.events[name]||[]).filter(x=>x.fn!==fn);}
  emit(name, e={}) {for(const h of [...(this.events[name]||[])])h.fn.call(h.ctx,e);}
}
class Label extends Display {get textWidth(){return String(this.text||'').length*(this.size||30)*0.53;}}
const animationRealm=vm.createContext({F:tween});
class AnimationLabel extends Display {
  get num(){return this._num;}
  set num(n){this._num=n;this.updateText();}
}
AnimationLabel.prototype.playNumAni=vm.runInContext('('+animFn+')',animationRealm);
AnimationLabel.prototype.updateText=vm.runInContext('('+animUpdate+')',animationRealm);
const originalUpdate=AnimationLabel.prototype.updateText;
class Cell extends Display {
  constructor(){super();const group=this.addChild(new Display());this.powerLabel=group.addChild(new AnimationLabel());this.powerLabel.left=53;this.powerLabel._num=0;}
  dataChanged(){this.powerLabel.text='legacy';}
  setValue(n){this.data=n;this.powerLabel.text=String(n);}
  stopAnim(){tween.removeTweens(this.powerLabel);}
}
class Tip extends Display {
  constructor(){super();this.changeLabel=this.addChild(new AnimationLabel());}
  setData(value, difference){this.changeLabel.font='bitmap';this.changeLabel.text=String(difference);return 'tip-result';}
}
class RoleModel { calAllPower() { return 12; } }
class GameSocket { Rpc(tag, data, success, context, error) { this.args={tag,data,success,context,error}; return true; } }
const context=vm.createContext({PowerCell:Cell,PowerTipItem:Tip,RoleModel,
  GameSocket,
  W:{PlayerInfoModel:{playerInfo:{combatPowerValue:765432,combatPowerVersion:'native-weighted-v1',combatPowerUnit:'point',combatPowerEntityId:'p-test',combatPowerServerId:1001,combatPowerStatus:'ready'}}},
  eui:{Label,Group:Display,Rect:Display},egret:{Tween:tween,TouchEvent:{TOUCH_TAP:'tap'},Event:{REMOVED_FROM_STAGE:'removed'}}});
vm.runInContext(script,context);
const role=new RoleModel();
check(()=>assert.equal(role.calAllPower(),765432));
const socket=new GameSocket(); let captured=0; socket.Rpc(2200,{},()=>{captured+=1;},null,null);
const canonicalResponse={combatPowerValue:321,combatPowerVersion:'native-weighted-v1',combatPowerUnit:'point',combatPowerEntityId:'p-test',combatPowerServerId:1001,combatPowerStatus:'ready',combatPowerEpoch:'e',combatPowerSequence:7};
socket.args.success(canonicalResponse);
check(()=>assert.equal(captured,1));
check(()=>assert.equal(context.W.__lhsCanonicalPower.combatPowerValue,321));
check(()=>assert.equal(role.calAllPower(),321));
const canonicalCell=new Cell();
canonicalCell.data={power:12,combatPowerValue:987654,combatPowerVersion:'native-weighted-v1',combatPowerUnit:'point',combatPowerEntityId:'p-test',combatPowerServerId:1001,combatPowerStatus:'ready'};
canonicalCell.dataChanged();
check(()=>assert.equal(canonicalCell.__lhsPowerLabel.text,'987.654'));
const staleCell=new Cell();
staleCell.data={power:1,combatPowerValue:222,combatPowerVersion:'native-weighted-v1',combatPowerUnit:'point',combatPowerEntityId:'p-seq',combatPowerServerId:1001,combatPowerStatus:'ready',combatPowerEpoch:'epoch-a',combatPowerSequence:2};
staleCell.dataChanged();
staleCell.data={power:1,combatPowerValue:111,combatPowerVersion:'native-weighted-v1',combatPowerUnit:'point',combatPowerEntityId:'p-seq',combatPowerServerId:1001,combatPowerStatus:'ready',combatPowerEpoch:'epoch-a',combatPowerSequence:1};
staleCell.dataChanged();
check(()=>assert.equal(staleCell.__lhsPowerLabel.text,'222'));
const invalidCanonicalCell=new Cell();
invalidCanonicalCell.data={power:12,combatPowerValue:987654,combatPowerVersion:'wrong',combatPowerUnit:'point',combatPowerEntityId:'p-test',combatPowerServerId:1001,combatPowerStatus:'ready'};
invalidCanonicalCell.dataChanged();
check(()=>assert.equal(invalidCanonicalCell.__lhsPowerLabel.text,'12'));
const cell=new Cell(); cell.data=123456789; cell.dataChanged();
check(()=>assert.equal(cell.__lhsPowerLabel.text,'123.456.789'));
check(()=>assert.equal(cell.powerLabel.visible,false));
check(()=>assert.equal(cell.__lhsPowerLabel.fontFamily,'Arial'));
check(()=>assert.equal(AnimationLabel.prototype.updateText,originalUpdate));
const money = new AnimationLabel();money.num=1234;
check(()=>assert.equal(money.text,'1234'));
let callbacks=0;
cell.setValue(999999);cell.playAnim(1000000,()=>callbacks++);step();
check(()=>assert.equal(cell.__lhsPowerLabel.text,'1.000.000'));
check(()=>assert.equal(cell.data,1000000));
check(()=>assert.equal(callbacks,1));
cell.playAnim(1000000,()=>callbacks++);
check(()=>assert.equal(callbacks,2));
cell.playAnim(1234567,()=>callbacks++);cell.setValue(42);step();
check(()=>assert.equal(cell.__lhsPowerLabel.text,'42'));
check(()=>assert.equal(callbacks,2));
cell.playAnim(1000000,()=>callbacks++);cell.stopAnim();step();
check(()=>assert.equal(cell.__lhsPowerLabel.text,'1.000.000'));
check(()=>assert.equal(callbacks,2));
cell.setValue(null);check(()=>assert.equal(cell.__lhsPowerLabel.text,'—'));
const narrow=new Cell();narrow.powerLabel.parent.width=205;narrow.data=123456789;narrow.dataChanged();
check(()=>assert.equal(narrow.__lhsPowerLabel.text,'≈123,46 triệu'));
const stage=new Display();stage.stageWidth=390;stage.stageHeight=844;narrow.stage=stage;
const tap={stopPropagation(){}};narrow.__lhsPowerLabel.emit('tap',tap);stage.emit('tap',tap);
check(()=>assert(narrow.__lhsPowerDetail));
check(()=>assert(narrow.__lhsPowerDetail.children.some(c=>c.text==='Lực chiến: 123.456.789')));
stage.emit('tap',{});check(()=>assert.equal(narrow.__lhsPowerDetail,null));
const tip=new Tip();
check(()=>assert.equal(tip.setData(1234567,34567),'tip-result'));
check(()=>assert.equal(tip.changeLabel.text,'+34.567'));
check(()=>assert.equal(tip.changeLabel.textColor,0xa6ffa9));
tip.setData(1200000,-34567);
check(()=>assert.equal(tip.changeLabel.text,'−34.567'));
check(()=>assert.equal(tip.children.length,1));
check(()=>assert.equal(tip.changeLabel.textColor,0xff9696));
check(()=>assert.equal(context.LhsPowerDisplay.installed,true));
// Late skin re-attachment, resize and removal must not leak labels/listeners.
const oldParent=narrow.powerLabel.parent;
narrow.dataChanged();check(()=>assert.equal(oldParent.children.length,2));
narrow.__lhsPowerLabel.emit('tap',{stopPropagation(){}});narrow.emit('removed');
check(()=>assert.equal(narrow.__lhsPowerDetail,null));
check(()=>assert.equal((stage.events.tap||[]).length,0));
oldParent.width=550;narrow.dataChanged();check(()=>assert.equal(narrow.__lhsPowerLabel.text,'123.456.789'));
vm.runInContext(script,context);check(()=>assert.equal(context.LhsPowerDisplay.attempts,1));
console.log(JSON.stringify({result:'PASS',checks:count,actualNativeAnimationMethods:true,
  gameplayCalculatorSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(app,'src/services/BattleService.js'))).digest('hex'),
  nativeUI:false,productionWrites:0}));
