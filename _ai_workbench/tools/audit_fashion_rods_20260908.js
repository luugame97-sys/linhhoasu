'use strict';
// Audit only: native function extraction + current backend with memory saves.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const wb = path.resolve(__dirname, '..'), app = path.join(wb, '../linhhoasu/lhs/newServer');
const out = path.join(wb, 'temp/fashion_rods_audit_20260908');
const main = fs.readFileSync(path.join(wb, '../linhhoasu/webgame/game/js/main.min_a6195824.js'), 'utf8');
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('AUDIT_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny; global.fetch = deny;
for (const k of ['http', 'https']) { require(k).get = deny; require(k).request = deny; }
function stub(file, exports) { const id = path.join(app, 'src', file); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('logger.js', { info(){},warn(){},error(){},debug(){} });
let saveMode = 'ok', saves = 0;
stub('services/PlayerService.js', { async savePlayer(_, p) { saves++; if (saveMode === 'null') return null; if (saveMode === 'throw') throw Error('SAVE_FAIL'); return p; }, async drainPendingSaves() {} });
const cfg = require(path.join(app, 'src/services/ConfigService')), t = cfg.loadAllTables();
const lang = cfg.decodeTables(fs.readFileSync(path.join(app, '../update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const res = JSON.parse(fs.readFileSync(path.join(out, 'resource-index.json'), 'utf8'));
const hasRes = key => !!res[key];
const acorn = require(path.join(app, 'node_modules/acorn'));
function fn(marker) {
  const at = main.indexOf(marker); assert.ok(at >= 0, marker);
  const start = at + marker.indexOf('function');
  let n = acorn.parseExpressionAt(main, start, { ecmaVersion: 2022 });
  if (n.type === 'SequenceExpression') n = n.expressions[0];
  assert.equal(n.type, 'FunctionExpression'); return main.slice(n.start, n.end);
}
const name = id => lang[t.AssetsConfig[id]?.name]?.cn || String(id);
const ctx = vm.createContext({ Y: { Config: t, RoleModel: { kungfuId: 4, subJob: 0 } }, O: Math,
  RES: { hasRes }, AppInfo: { inChina: true }, T: { serverOpenDay: 1 },
  B: { deepCopy: x => JSON.parse(JSON.stringify(x)), ConvertLanguageToText: String, getObjectLen: x => Object.keys(x).length },
  x: { ESuitType: { normal: 0, linkage: 1, changeColor: 2, bathrobe: 3, endSkill: 4 }, EMPTY_FASHION_ID: -1 },
  U: { Label: class {} }, D: { ShowRedPoint(){} }, nO: { getItemQualityFrameBg: q => 'frame' + q },
  A: { ins: () => ({ dispatch(){},dispatchImmediate(){} }) }, E: {} });
// Use the current shipped helper definitions, not a proposed replacement.
vm.runInContext(main.slice(main.indexOf('function lhsComponentInfo'), main.indexOf('function lhsServerStatusOpen')), ctx);
const model = { _fashionInfo: { fashion: {}, activateFashion: [], fashionData: [], sets: [], setId: 0 }, sortFashionList(){} };
for (const method of ['IsFashionActive','GetFashionList','checkShowType','checkShowTypeOpenDay','GetSuitFashions','GetSuitList','getAllSuit','getShowInfoSuit','sendChangeFshion','sendChangeSuit']) {
  model[method] = vm.runInContext('(' + fn('f.' + method + '=function') + ')', ctx);
}
ctx.Y.FashionModel = model;
const unlock = { maxRecursionLockCount: 10 };
unlock.calcSingleConditionType = vm.runInContext('(' + fn('pOt.calcSingleConditionType=function') + ')', ctx);
unlock.checkConditions = vm.runInContext('(' + fn('pOt.checkConditions=function') + ')', ctx);
ctx.Y.UnlockSystem = unlock;
let ownedRods = new Set([5907]);
ctx.Y.ItemModel = { GetItemCount: id => ownedRods.has(id) ? 1 : 0 };
ctx.Y.RechargeModel = { checkMonthCard: () => false };
ctx.Y.FishingModel = { getFishInfo: () => ({ rodId: 5907 }) };
ctx.Y.FishingModel.isUnlockFishRod = vm.runInContext('(' + fn('u.isUnlockFishRod=function') + ')', ctx);
const nativeRodInit = vm.runInContext('(' + fn('a.initCirculateList=function(){var t,e=Y.Config.FishRodConfig') + ')', ctx);
const nativeRodRefresh = vm.runInContext('(' + fn('a.updateCirculateList=function(){var t,e=Y.Config.FishRodConfig') + ')', ctx);
const rodVisibility = [];
for (const day of [1, 42, 43, 56, 57, 60]) {
  ctx.T.serverOpenDay = day;
  let initial = [], refresh = [];
  const panel = { selectId: 5907, circulateList: { updateData(x) { initial = x; }, scrollTo(){}, refreshByDataList(x){refresh=x;} } };
  nativeRodInit.call(panel); nativeRodRefresh.call(panel);
  rodVisibility.push({ day, ownsThanhLong: true, initial: initial.map(x=>x.id), refresh: refresh.map(x=>x.id), selectedPresent: initial.some(x=>x.id===panel.selectId) });
}
const rods = Object.values(t.FishRodConfig).map(r => {
  const asset = t.AssetsConfig[r.id], appear = t.AppearanceConfig[r.appearId]?.appearance;
  return { id: r.id, name: name(r.id), conditions: r.conditions || [], icon: asset.icon, iconRegistered: hasRes(asset.icon), appearance: appear,
    skelRegistered: hasRes(appear + '_skel'), atlasRegistered: hasRes(appear + '_atlas'), itemType: asset.type, shopId: r.shopId };
});
ctx.T.serverOpenDay = 100;
const fashionIcons = Object.values(t.FashionConfig).filter(r=>r.type>=301&&r.type<=312&&t.AssetsConfig[r.itemId]).map(r=>{
  const a = t.AssetsConfig[r.itemId]; const resolved = ctx.lhsComponentIcon(r.itemId, a.icon);
  return { id: r.id, name: name(r.itemId), type: r.type, dressId: r.dressId, icon: a.icon, resolved,
    missing: !hasRes(resolved), appearIds: r.appearIds,
    skels: (r.appearIds || []).map(id=>({id, resource:t.AppearanceConfig[id]?.appearance, registered:hasRes(t.AppearanceConfig[id]?.appearance+'_skel')})) };
});
const missingIcons = fashionIcons.filter(r=>r.missing);
const missingStandalone = fashionIcons.filter(r=>r.skels.some(s=>!s.registered));
const visibleMissing = [];
for (const region of [true,false]) {
  ctx.AppInfo.inChina = region;
  for (const type of [301,302,303,309]) for (const id of model.GetFashionList(type,false)) {
    if (missingIcons.some(r=>r.id===id)) visibleMissing.push({region:region?'cn':'tw',id});
  }
}
const appearance = require(path.join(app, 'src/services/RoleAppearanceService'));
const fashion = require(path.join(app, 'src/handlers/fashion'));
const grant = require(path.join(app, 'src/services/RewardGrantService'));
const clean = () => ({ userId: 'audit_memory', level: 50, roleInfo: { kungfuId:4,subJob:0 }, items: {}, currencies: {}, fashionInfo: { activateFashion: [], fashions: {}, curFashion: {}, fashion: {}, fashionMap: {} } });
const own = (p, ids) => ids.forEach(id=>appearance.grantFashionOwnership(p,id));
const idsFor = id => t.FashionColorConfig[id]?.[0]?.fashionIds || t.FashionDressLevelConfig[id]?.[0]?.fashionIds || [];
const findings = [];
async function probe(id, work) { const result = await work(); findings.push({id,...result}); }
(async()=>{
  await probe('R-carousel-missing-selection-shifts-all-icons-offscreen', async()=>{
    const list = { width:550, _isUseAnim:false, _showCount:5, _leftIndex:0, _rightIndex:9,
      _borderLeftIndex:1, _borderRightIndex:5, _selectIndex:3,
      _itemList:Array.from({length:10},(_,i)=>({width:110,x:(i-1)*110,data:{id:[5905,5901,5902,5903,5904,5905,5901,5902,5903,5904][i]}})) };
    for(const method of ['scrollTo','_getSelectItem','_getOutOfBoundsItem','_calculateItemIndex','_clearSelect','_layoutItems','_moveLeft']) {
      list[method]=vm.runInContext('('+fn('o.'+method+'=function')+')',ctx);
    }
    const ok=list.scrollTo(r=>r.id===5907);
    const visible=list._itemList.filter(r=>r.x+r.width>0&&r.x<list.width).length;
    return {result:ok,visibleIcons:visible,leftMostX:Math.min(...list._itemList.map(r=>r.x)),reproduced:ok===false&&visible===0};
  });
  await probe('F-empty-selection-reverts-on-normalize', async()=>{
    const p=clean(); own(p,idsFor(29040)); const s={userId:p.userId,player:p};
    await fashion.handleChangeFashion({id:-1,type:301,set:0},s,1); const afterAck=p.fashionInfo.curFashion[301];
    appearance.ensureRoleAppearance(p); return {afterAck,afterNormalize:p.fashionInfo.curFashion[301],reproduced:afterAck!==p.fashionInfo.curFashion[301]};
  });
  await probe('F-presets-do-not-restore-outfit', async()=>{
    const p=clean(); own(p,[...idsFor(29040),...idsFor(28040)]); const s={userId:p.userId,player:p};
    await fashion.handleChangeSuit({id:29040,color:0,set:0},s,1); const set0=p.fashionInfo.curFashion[303];
    await fashion.handleChangeSuit({id:28040,color:0,set:1},s,2); await fashion.handleFashionChangeSet({setId:0},s,3);
    return {expected:set0,actual:p.fashionInfo.curFashion[303],setId:p.fashionInfo.setId,reproduced:p.fashionInfo.curFashion[303]!==set0};
  });
  await probe('F-save-null-acknowledges-success', async()=>{
    const p=clean(); own(p,idsFor(29040)); const s={userId:p.userId,player:p};saveMode='null';
    let error='';try { await fashion.handleChangeSuit({id:29040,color:0,set:0},s,1); } catch (e) { error=e.message; } saveMode='ok';
    return {error,sessionStillLive:!!s.player,reproduced:error!=='FASHION_SAVE_NOT_CONFIRMED'};
  });
  await probe('F-native-error-callback-overwrites-visible-choice', async()=>{
    model._fashionInfo.fashion={301:29041};model.getCurSetId=()=>0;
    model.Rpc=(_,params,cb)=>cb({result:-1,id:0,type:params.type,setId:0});
    model.sendChangeFshion(29001,301,0);
    return {before:29041,after:model._fashionInfo.fashion[301],reproduced:model._fashionInfo.fashion[301]===0};
  });
  await probe('F-no-weapon-suit-retains-previous-weapon', async()=>{
    const p=clean();own(p,[...idsFor(29040),...idsFor(28010)]);const s={userId:p.userId,player:p};
    await fashion.handleChangeSuit({id:29040,color:0,set:0},s,1);await fashion.handleChangeSuit({id:28010,color:0,set:0},s,2);
    return {components:idsFor(28010),weaponAfter:p.fashionInfo.curFashion[301],expectedByConfig:29041,reproduced:p.fashionInfo.curFashion[301]!==29041};
  });
  await probe('F-incomplete-whole-model-component-allowed', async()=>{
    const p=clean();own(p,[28043]);const s={userId:p.userId,player:p};const r=await fashion.handleChangeFashion({id:28043,type:303,set:0},s,1);
    return {result:r.data.result,componentHasSkel:hasRes('sp_equip_28043_skel'),wholeSkel:hasRes('sp_equip_28049_skel'),reproduced:r.data.result===0&&!hasRes('sp_equip_28043_skel')};
  });
  await probe('F-hidden-suit-boxes-not-expanded-except-29040', async()=>{
    const item=require(path.join(app,'src/handlers/item')), boxes=[];
    for(const d of Object.values(t.FashionDressConfig).filter(d=>t.AssetsUseConfig[d.id]?.type===105)){
      const p=clean(),parts=t.AssetsUseConfig[d.id].rewards.map(r=>r.id);
      item.addRewardRowsToPlayer(p,[{id:d.id,count:1}],1);
      const owned=parts.filter(id=>appearance.hasFashionOwnership(p,id)).length;
      const result={id:d.id,boxInBag:p.items[d.id]||0,hidden:t.AssetsConfig[d.id].ifShow===0,owned,total:parts.length};
      const s={userId:p.userId,player:p};
      if(result.boxInBag) {const use=await item.handleUseItem({id:d.id,count:1},s,1);result.directUseResult=(Array.isArray(use)?use:[use]).find(r=>r.tag===1300)?.data?.result;result.ownedAfterDirectUse=parts.filter(id=>appearance.hasFashionOwnership(p,id)).length;}
      boxes.push(result);
    }
    fs.writeFileSync(path.join(out,'box-catalog.json'),JSON.stringify(boxes,null,2)+'\n');
    return {checked:boxes.length,hiddenBoxNeedsUse:boxes.filter(b=>b.boxInBag&&b.hidden&&b.owned<b.total).length,
      directUseFull:boxes.filter(b=>b.directUseResult===0&&b.ownedAfterDirectUse===b.total).length,
      autoExpanded:boxes.filter(b=>!b.boxInBag&&b.owned===b.total).map(b=>b.id),reproduced:boxes.some(b=>b.boxInBag&&b.hidden&&b.owned<b.total)};
  });
  const result={mode:'AUDIT_ONLY',productionWrites:0,networkAttempts,savesInMemory:saves,rodVisibility,rods,
    fashionCatalog:{rows:fashionIcons.length,missingIcons:missingIcons.length,missingStandaloneRows:missingStandalone.length,unownedVisibleMissingIcons:visibleMissing},
    missingIcons,missingStandalone,findings};
  assert.equal(networkAttempts,0);
  fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({mode:result.mode,rods,rodVisibility,findings,missingIcons:missingIcons.length,missingStandalone:missingStandalone.length,visibleMissing:visibleMissing.slice(0,25),productionWrites:0,networkAttempts}));
})().catch(e=>{console.error(e);process.exitCode=1;});
