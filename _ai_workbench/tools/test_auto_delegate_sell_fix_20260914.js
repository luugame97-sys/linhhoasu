'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const app = process.env.AUTO_SELL_APP || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const out = process.env.AUTO_SELL_FIXTURE || path.resolve(__dirname, '../temp/auto_delegate_sell_fix_20260914');
const acorn = process.env.AUTO_SELL_FUNCTIONS ? null : require(path.join(app, 'node_modules/acorn'));
const slices = process.env.AUTO_SELL_FUNCTIONS ? JSON.parse(fs.readFileSync(process.env.AUTO_SELL_FUNCTIONS)) : null;
const source = fs.readFileSync(path.join(out, 'main.js'), 'utf8');
const baseline = fs.readFileSync(path.join(out, 'main.js.before'), 'utf8');
process.env.NODE_ENV = 'test'; process.env.LOG_DIR = '';
process.env.CONFIG_BIN_PATH ||= path.resolve(__dirname, '../temp/promotional_rewards_20260914/live_now/server.bin');
const clone = x => JSON.parse(JSON.stringify(x));
const config = require(app + '/src/services/ConfigService'); config.loadAllTables();
const players = require(app + '/src/services/PlayerService');
const locks = require(app + '/src/services/PlayerMutationService');
if (process.env.AUTO_SELL_EQUIP_PATH) {
  const Module = require('module'), original = app + '/src/services/EquipService.js';
  const candidate = new Module(original, module); candidate.filename = original;
  candidate.paths = Module._nodeModulePaths(path.dirname(original));
  require.cache[original] = candidate;
  candidate._compile(fs.readFileSync(process.env.AUTO_SELL_EQUIP_PATH, 'utf8'), original);
}
const equip = require(app + '/src/services/EquipService');
if (process.env.AUTO_SELL_ITEM_PATH) {
  const Module = require('module'), original = app + '/src/handlers/item.js';
  const candidate = new Module(original, module); candidate.filename = original;
  candidate.paths = Module._nodeModulePaths(path.dirname(original));
  require.cache[original] = candidate;
  candidate._compile(fs.readFileSync(process.env.AUTO_SELL_ITEM_PATH, 'utf8'), original);
}
const item = require(app + '/src/handlers/item');
const logger = require(app + '/src/logger'); for (const key of ['info','warn','debug','error']) logger[key] = () => {};
let durable, saveMode = 'ok', saveCount = 0;
players.drainPendingSaves = async () => {};
players.savePlayer = async (uid, value) => {
  assert(locks.holds(uid)); saveCount++;
  await new Promise(resolve => setTimeout(resolve, 1));
  if (saveMode === 'throw') throw Error('TEST_SAVE_FAIL');
  if (saveMode === 'null') return null;
  durable = clone(value);
  if (saveMode === 'commit-throw') throw Error('TEST_COMMIT_TIMEOUT');
  return value;
};
players.savePlayerDeferred = async () => { throw Error('UNCONFIRMED_AUTO_SALE'); };
const asset = Object.values(config.get('AssetsConfig')).find(x => x.type === 3 && x.subType > 0);
const mkEquip = (uid, power = 200, extra = {}) => ({ uid, id:asset.id, type:asset.subType, quailty:7, lv:165, attrs:{1:power}, power, ...extra });
function native(marker, context, text = source) {
  if (slices) {
    const key = require('crypto').createHash('sha256').update(text).digest('hex');
    assert(slices[key] && slices[key][marker], 'bundle hash/function mismatch');
    return vm.runInContext('(' + slices[key][marker] + ')', context);
  }
  const at = text.indexOf(marker); assert(at >= 0, marker);
  let node = acorn.parseExpressionAt(text, at + marker.length, {ecmaVersion:'latest'});
  if (node.type === 'SequenceExpression') node = node.expressions[0];
  assert.equal(node.type, 'FunctionExpression');
  return vm.runInContext('(' + text.slice(node.start, node.end) + ')', context);
}
function harness({auto=true, sellAll=true, silent=true, old=[mkEquip(100,500)], baselineMode=false}={}) {
  const worn = mkEquip(1,100), state = {rowList:clone(old), requests:[], popups:0, filters:0, autoEquips:0, states:[], events:[], jobs:[], tips:[], timers:[]};
  const player = {userId:'auto_sale_fixture',serverId:1002,playerId:'fixture',level:165,items:{},currencies:{diamond:90,gold:80,silver:0},
    equipInfo:{curIndex:0,openListMap:{0:clone(old)},equipSetMap:{0:{[worn.type]:worn}},setInfoMap:{},raidSetMap:{},equipList:[]},taskInfo:{}};
  durable = clone(player); saveMode='ok'; saveCount=0;
  const session = {userId:player.userId,player};
  const U9={isOpen:auto,autoConfig:{sellAllEquipments:sellAll,autoEquipUpgrade:true,isSilentMode:silent},updateRecord(){}};
  const bus = {dispatch:(...args)=>state.events.push(args),dispatchImmediate:(...args)=>state.events.push(args)};
  const ctx = vm.createContext({U9,console:{log(){},warn(){},error(){}},xV:{},pNe:{},zV:{isNotShowBoxReward:true},
    S:{ins:()=>({showTips:x=>state.tips.push(x)})},A:{ins:()=>bus},E:{},Er:{Open(){state.popups++;}},YV:{calPower:x=>x?.power||0},
    setTimeout:fn=>{state.timers.push(fn);return fn;},clearTimeout:fn=>{state.timers=state.timers.filter(x=>x!==fn);},
    Y:{FashionModel:{UnlockEquip(){}},EquipModel:{getMapEquipInfo:()=>worn,addEquipToOpenList:x=>state.rowList.push(x)},ActorModel:{},RaidMgr:{}},
    x9:{CheckAutoStop(list){state.filters++;return [];}}});
  const model={_saleList:[],_state:6,
    get _openEquipList(){return state.rowList;},get openEquipList(){return clone(state.rowList);},
    getEquipListLength(){return state.rowList.length;}, getSaleListLength(){return this._saleList.length;},
    isInState(n){return this._state===n;},changeState(n){this._state=n;state.states.push(n);},
    addSaleList(rows){this._saleList.push(...rows);},removeEquips(ids){state.rowList=state.rowList.filter(x=>!ids.includes(x.uid));},
    openListContainEquip:x=>state.rowList.some(r=>r.uid===x.uid),BeatMonstFlyExp(){},SaleEquipFlyCoin(){},
    Rpc(tag,params,cb){state.requests.push({tag,params});if(tag===2001){cb(clone(state.reward));return;}
      assert.equal(tag,2201);state.jobs.push(item.handleEquipSale(clone(params),session,7).then(result=>{
        const ack=(Array.isArray(result)?result:[result]).find(x=>x.tag===2201&&x.msgUid===7); cb(clone(ack.data));
      }).catch(error=>{state.serverError=error.message;cb({result:1,rewardInfo:{items:[]},uids:[]});}));},
    doEquipSale(t,cb){if(!this._saleList.length||this._state!==2)return false;this.sendEquipSale(t,cb);return true;},
  };
  ctx.Y.BoxLayerModel=model;
  for(const [name,mark] of Object.entries({beginAutoSellDropSession:'C.beginAutoSellDropSession=',trackAutoSellDrops:'C.trackAutoSellDrops=',autoSellDroppedEquipments:'C.autoSellDroppedEquipments=',sendEquipSale:'C.sendEquipSale='})) model[name]=native(mark,ctx);
  model.beginAutoSellDropSession();
  const selection={dealSelect:native('o.dealSelect=',ctx,baselineMode?baseline:source),autoEquipPowerUpgrade(){state.autoEquips++;},openHeroReplaceView(){state.popups++;}};
  const saleState={dealSale:native('r.dealSale=',ctx)};
  const sendReward=native('C.sendBoxReward=',ctx,baselineMode?baseline:source);
  async function drop(rows, extra=[]) {
    state.reward={rewardInfo:{equips:clone(rows),items:[],extraReward:{3:{equips:clone(extra)}}}};
    for(const row of [...rows,...extra]) equip.addOpenEquip(session.player,row,0);
    durable=clone(session.player);model._state=6;
    sendReward.call(model,()=>selection.dealSelect(model));
    if(model._state===2) saleState.dealSale();
    await Promise.all(state.jobs);state.jobs=[];
  }
  return {state,model,ctx,U9,session,drop,selection,saleState};
}
const tests=[];
async function test(name,fn){await fn();tests.push(name);}
(async()=>{
  await test('reproduces live old-list length stop before fix',async()=>{
    const h=harness({old:[mkEquip(100),mkEquip(101)],baselineMode:true});await h.drop([mkEquip(200)]);
    assert.equal(h.U9.isOpen,false);assert(h.state.popups>0);assert(!h.state.requests.some(x=>x.tag===2201));
  });
  for(const silent of [false,true]) await test('100 batches sell all strong/equal/weak/empty-slot with silent='+silent,async()=>{
    const h=harness({silent,old:[mkEquip(100),mkEquip(101)]});
    for(let j=0;j<100;j++) await h.drop([mkEquip(1000+j*4,999999),mkEquip(1001+j*4,100),mkEquip(1002+j*4,1),mkEquip(1003+j*4,500,{type:2})]);
    assert(h.U9.isOpen);assert.equal(h.state.popups,0);assert.equal(h.state.autoEquips,0);assert.equal(h.state.filters,0);
    assert.equal(saveCount,100);assert.equal(h.state.requests.filter(r=>r.tag===2201).length,100);
    assert.deepEqual(h.state.rowList.map(r=>r.uid),[100,101]);assert(durable.currencies.silver>0);
    assert.equal(durable.currencies.diamond,90);assert.equal(durable.equipInfo.equipSetMap[0][asset.subType].uid,1);
    assert.equal(h.model._state,3);assert.equal(h.state.timers.length,0);
  });
  await test('extra rewards are included; prior inventory excluded',async()=>{const h=harness();await h.drop([mkEquip(200)],[mkEquip(201)]);assert.deepEqual(Array.from(h.state.requests.find(r=>r.tag===2201).params.uids),[200,201]);assert.deepEqual(h.state.rowList.map(r=>r.uid),[100]);});
  await test('silent is not implicit auto-equip/sale when keep selected',async()=>{const h=harness({sellAll:false});h.U9.autoConfig.autoEquipUpgrade=false;await h.drop([mkEquip(200)]);assert.equal(h.state.autoEquips,0);assert.equal(h.state.requests.filter(r=>r.tag===2201).length,0);assert.equal(saveCount,0);});
  await test('manual mode never auto-sells',async()=>{const h=harness({auto:false});await h.drop([mkEquip(200)]);assert.equal(saveCount,0);assert(!h.state.requests.some(r=>r.tag===2201));});
  await test('other-preset protected UID retained not removed locally',async()=>{const h=harness();h.session.player.equipInfo.equipSetMap[1]={[asset.subType]:mkEquip(201)};await h.drop([mkEquip(200),mkEquip(201)]);assert(h.U9.isOpen);assert(h.state.rowList.some(r=>r.uid===201));assert(durable.equipInfo.openListMap[0].some(r=>r.uid===201));assert.equal(h.model._state,3);});
  for(const mode of ['null','throw','commit-throw']) await test('save '+mode+' does not clear client items or continue',async()=>{const h=harness();saveMode=mode;await h.drop([mkEquip(200)]);assert(!h.U9.isOpen);assert(h.state.rowList.some(r=>r.uid===200));assert.equal(h.session.player,null);assert.equal(h.state.timers.length,0);});
  await test('duplicate sale RPC does not grant silver twice; durable relog',async()=>{const h=harness();await h.drop([mkEquip(200)]);const before=durable.currencies.silver;h.session.player=clone(durable);const replay=await item.handleEquipSale({uids:[200,200],autoDelegate:true,sellAllEquipments:true},h.session,8);const ack=(Array.isArray(replay)?replay:[replay]).find(x=>x.tag===2201);assert.equal(durable.currencies.silver,before);assert.deepEqual(ack.data.missingUids,[200]);});
  for(const kind of ['throw','timeout','partial','rejected','null']) await test('client '+kind+' preserves unsold list and halts safely',async()=>{
    const h=harness();h.model._saleList=[mkEquip(200),mkEquip(201)];h.state.rowList.push(...h.model._saleList);
    h.model.Rpc=(t,p,cb)=>{if(kind==='throw')throw Error('SEND_ERROR');if(kind==='partial')cb({uids:[200],rewardInfo:{items:[]}});if(kind==='rejected')cb({result:1,uids:[],rewardInfo:{items:[]}});if(kind==='null')cb(null);};
    h.model.sendEquipSale(0,()=>{throw Error('MUST_NOT_CONTINUE');});if(kind==='timeout')h.state.timers[0]();
    assert(!h.U9.isOpen);assert(h.state.rowList.some(r=>r.uid===201));assert(h.model._saleList.some(r=>r.uid===201));assert.equal(h.state.timers.length,0);
  });
  await test('same callback twice consumed once',async()=>{const h=harness();h.model._saleList=[mkEquip(200)];h.state.rowList.push(mkEquip(200));let callbacks=0;h.model.Rpc=(t,p,cb)=>{const r={uids:[200],rewardInfo:{items:[]}};cb(r);cb(r);};h.model.sendEquipSale(0,()=>callbacks++);assert.equal(callbacks,1);});
  await test('manual stop during pending sale is respected',async()=>{const h=harness();h.model._saleList=[mkEquip(200)];h.state.rowList.push(mkEquip(200));let callback;h.model.Rpc=(t,p,cb)=>callback=cb;h.model.sendEquipSale(0,()=>{});h.U9.isOpen=false;callback({uids:[200],rewardInfo:{items:[]}});assert.equal(h.U9.isOpen,false);});
  console.log(JSON.stringify({result:'PASS',count:tests.length,tests,network:false,realPlayerWrites:0,simulatedBatches:200}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
