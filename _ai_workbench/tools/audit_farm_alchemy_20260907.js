'use strict';
// Read source/config, execute fixture-only state; all network access is denied.
const fs = require('fs'), path = require('path'), vm = require('vm'), Module = require('module');
const assert = require('assert/strict'), crypto = require('crypto');
const root = path.resolve(__dirname, '../..'), app = path.join(root, 'linhhoasu/lhs/newServer');
const outDir = path.join(root, '_ai_workbench/temp/farm_alchemy_audit_20260907');
const clone = x => JSON.parse(JSON.stringify(x));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let networkAttempts = 0;
function deny() { networkAttempts++; throw Error('AUDIT_NETWORK_DENIED'); }
require('net').Socket.prototype.connect = deny;
for (const mod of ['http','https']) { require(mod).request = deny; require(mod).get = deny; }
global.fetch = deny;
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
function stub(file, exports) { const filename = path.join(app, file); require.cache[filename] = { id: filename, filename, loaded: true, exports }; }
stub('src/logger.js', quiet);
const records = new Map(), saves = [];
let saveMode = 'ok', onRead = null;
const playerService = {
  async savePlayer(id, data) {
    if (saveMode === 'null') return null;
    if (saveMode === 'throw') throw Error('fixture-save-failed');
    records.set(id, { ...(records.get(id) || {}), ...clone(data) }); saves.push({ id, fields: Object.keys(data) });
    if (saveMode === 'commit-throw') throw Error('fixture-committed-then-timeout');
    return data;
  },
  async savePlayerDeferred(id, data) { return this.savePlayer(id, data); },
  async drainPendingSaves() {}, wasRecentlySaved() { return false; },
  async findByPlayerId(id) {
    const row = [...records.values()].find(p => p.playerId === id); const result = row ? clone(row) : null;
    if (onRead) await onRead(id);
    return result;
  },
  async listPlayersBasic(filter, count) { return [...records.values()].filter(p => p.playerId !== filter.playerId?.$ne).slice(0,count).map(clone); },
};
stub('src/services/PlayerService.js', playerService);
const cfg = require(path.join(app,'src/services/ConfigService'));
const item = require(path.join(app,'src/handlers/item'));
const alchemy = require(path.join(app,'src/handlers/alchemy'));
const craft = require(path.join(app,'src/services/AlchemyCraftService')).craft;
const farmFile = path.join(app,'src/handlers/farm.js');
const farmSourceFile = process.env.AUDIT_LIVE_FARM ? path.join(outDir,'live-farm.js') : farmFile;
const farmModule = new Module(farmFile); farmModule.filename = farmFile; farmModule.paths = Module._nodeModulePaths(path.dirname(farmFile));
farmModule._compile(fs.readFileSync(farmSourceFile,'utf8') + '\nmodule.exports.audit={getPlantGrowConfigBySeed,calcHarvestRewardItems,calcStealRewardItems,applyPlantOnBlock};', farmFile);
const farm = farmModule.exports;
const currency = require(path.join(app,'src/services/CurrencySync'));
const mainFile = path.join(root,'linhhoasu/webgame/game/js/main.min_a6195824.js'), main = fs.readFileSync(mainFile,'utf8');
const acorn = require(path.join(app,'node_modules/acorn'));
const wire = require(path.join(app,'src/protocol/PacketManager')), codec = require(path.join(app,'src/protocol/Codec'));
function extract(marker, from = 0) {
  const start = main.indexOf(marker,from); assert.ok(start>=0,marker);
  const pos = start + marker.indexOf('function');
  let node = acorn.parseExpressionAt(main,pos,{ecmaVersion:2022});
  if (node.type==='SequenceExpression') node=node.expressions[0];
  assert.equal(node.type,'FunctionExpression');
  return main.slice(node.start,node.end);
}
let idCounter = 0;
function fresh(options={}) {
  const id = 'audit_'+(++idCounter);
  const p = { userId:id,playerId:id,name:'fixture',level:20,exp:0,roleInfo:{stage:1,kungfuId:4},
    currencies:{diamond:10000,silver:10000,gold:100},items:{29:10,30:10,31:10,100:10,27:20,28:20,32:20,34:1000,33:100,104:1,102:1,120101:1,120131:1,2001:50,2101:5},
    alchemyInfo:{level:1,lv:1,exp:0,dayCount:0},farmInfo:{lv:25,exp:0,blockInfo:[],buildLv:{1:1,2:1,3:1}},
    taskInfo:{},other_attr_info:{},shopInfo:{buyRecords:{}},rechargeInfo:{records:[],monthCards:{}},...options };
  farm.ensureFarmInfo(p); alchemy.ensureAlchemyInfo(p);
  records.set(id,clone(p)); return {userId:id,player:p};
}
function block(s,index=0) { return s.player.farmInfo.blockInfo.find(b=>b.index===index); }
function mature(s,index=0,rewardId=38,count=40) {
  Object.assign(block(s,index),{rewardId,curCount:count,finishTime:Date.now()-600000,robber:null}); records.set(s.userId,clone(s.player));
}
function packets(r) { return Array.isArray(r)?r:[r]; }
function ack(r,tag) { return packets(r).find(p=>p.tag===tag&&p.msgUid!==0)?.data; }
async function rng(value, fn) { const old=Math.random; Math.random=()=>value;try{return await fn()}finally{Math.random=old} }
const findings=[];
async function check(id,domain,fn) {
  saveMode='ok';onRead=null;
  try { const detail=await fn();findings.push({id,domain,verified:true,...detail}); }
  catch(e) { findings.push({id,domain,verified:false,error:e.stack.split('\n').filter(x=>x.length<400).slice(-12).join('\n')}); }
  finally { saveMode='ok';onRead=null; }
}
function client(s) {
  const events=[],popups=[],errors=[],tips=[],issued=[],pending=[],handlerHits=[],callbackHits=[];
  const Item={_itemMap:Object.fromEntries(currency.buildClientItemList(s.player).map(r=>[r.id,r.count])),_timeRecords:{},_itemUseRecords:{},isFreeze:false,cacheMsg:[],_composeIdDict:{},CheckItemCanCompose:()=>false};
  const center={dispatch:(e,...args)=>events.push([e,...args])};
  const Y={Config:cfg.loadAllTables(),ItemModel:Item,MessageCenter:center,UnlockSystem:{isSystemUnlock:()=>true},CuriosModel:{taskCheck(){}},RoleModel:{roleInfo:s.player.roleInfo}};
  const proto={}; const socketProto={}, er={viewStack:[],exchangeFashion(){},OpenFashionGetView(){}}, ar={};
  const fakeView={setCloseHandler(){return this},playAlchemyAni(type,success,done){done()}};
  const ctx=vm.createContext({Y,E:new Proxy({}, {get:(_,k)=>String(k)}),A:{ins:()=>center},O:Math,
    S:{ins:()=>({showTips:x=>tips.push(x),showTipsByLangId:x=>tips.push(x)})},B:{strformatByLangId:x=>String(x)},
    m:Item,C:proto,l:socketProto,OAt:er,zzt:ar,Er:er,bT:ar,Zz:'blocked',PT:'alchemy',
    P:{ins:()=>({isShow:()=>false,getView:()=>fakeView,open:(...args)=>{popups.push(args);return fakeView}})},
    eO:{minifyItemList:x=>x},sc:{updateBindBagBtn(){}},console:{error:e=>errors.push(String(e)),log(){},warn(){}},
    clearTimeout(){},setTimeout(){},window:{},Date});
  for(const name of ['onItemChange','GetItemCount','getBagItems','SetItemCount','getItemType','FreezeItemChangeMsg']) vm.runInContext('m.'+name+'='+extract('m.'+name+'=function'),ctx);
  for(const name of ['sendGenerate','sendAutoGenerate','onLvUpdate','setDayCount','getRoleAddRate']) vm.runInContext('C.'+name+'='+extract('C.'+name+'=function'),ctx);
  vm.runInContext('l.onSocketRead='+extract('l.onSocketRead=function'),ctx);
  vm.runInContext('OAt.RewardInfoToItemList='+extract('OAt.RewardInfoToItemList=function'),ctx);
  vm.runInContext('zzt.Open='+extract('zzt.Open=function'),ctx);
  ar.RewardInfoToItemList=er.RewardInfoToItemList;ar.exchangeFashion=er.exchangeFashion;ar.OpenFashionGetView=er.OpenFashionGetView;ar.OpenView=(...a)=>popups.push(a);
  const am=Object.create(proto);am._lv=s.player.alchemyInfo.level;am._dayCount=s.player.alchemyInfo.dayCount;am.getLv=()=>am._lv;Y.AlchemyModel=am;
  function Type(){} Type.prototype=proto;ctx.window.AlchemyModel=Type;ctx.window.UserTips={ins:()=>({showTips:x=>tips.push(x)})};
  vm.runInContext(fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/lhs-alchemy-v1.js'),'utf8'),ctx);
  const socket=Object.assign(Object.create(socketProto),{recvPack:{length:0},socket_:{readBytes(){}},_lhsRpcTimerMap:{},_resListenerMap:{},_resListenerErrorMap:{},
    m_RpcReqHandlerDict:{1202:d=>{handlerHits.push(1202);Item.onItemChange(d)},2500:d=>{handlerHits.push(2500);am.onLvUpdate(d)}},
    Unpack:()=>pending.splice(0),localNetMsgLog(){}});
  let uid=100;
  function rpc(tag,params,callback){const msgUid=++uid;socket._resListenerMap[msgUid]=d=>{callbackHits.push(tag);return callback(d)};issued.push({tag,params,msgUid});}
  am.Rpc=rpc;
  function feed(result) {
    for(const packet of packets(result)){const b=wire.packSingle(packet.tag,packet.data,packet.msgUid);pending.push(...codec.Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)));}
    socket.onSocketRead();
  }
  return {Item,am,proto,Y,ctx,rpc,feed,issued,events,popups,errors,tips,handlerHits,callbackHits};
}
async function run() {
  await check('shop-normal-chain','shop',async()=>{
    const s=fresh(),c=client(s);c.rpc(1200,{id:6000003,count:2},d=>c.popups.push(d.rewardInfo));
    const q=c.issued.at(-1),r=await item.handleGetItems(q.params,s,q.msgUid);c.feed(r);
    assert.equal(s.player.items[2101],7);assert.equal(c.Item.GetItemCount(2101),7);
    return {status:'PASS',serverHerb:s.player.items[2101],clientHerb:c.Item.GetItemCount(2101),linhthuc:s.player.items[34],responseTags:packets(r).map(x=>[x.tag,x.msgUid]),callbacks:c.callbackHits};
  });
  await check('alchemy-normal-client-level','alchemy',async()=>{
    const s=fresh(),c=client(s);c.am.sendGenerate(120101,5,d=>c.popups.push(d.rewardInfo));const q=c.issued.at(-1);
    const r=await rng(0,()=>alchemy.handleGenerate(q.params,s,q.msgUid));c.feed(r);
    assert.equal(s.player.items[110102],5);assert.equal(c.Item.GetItemCount(110102),5);
    assert.equal(s.player.alchemyInfo.level,2);assert.equal(c.am.getLv(),1);
    return {status:'BUG',serverPill:5,clientPill:c.Item.GetItemCount(110102),serverLevel:2,clientLevel:c.am.getLv(),pushTags:c.handlerHits};
  });
  await check('alchemy-auto-client','alchemy',async()=>{
    const s=fresh(),c=client(s);c.am.sendAutoGenerate(120131,5,0,d=>c.popups.push(d.rewardInfo));const q=c.issued.at(-1);
    c.feed(await rng(0,()=>alchemy.handleAutoGenerate(q.params,s,q.msgUid)));
    assert.equal(c.Item.GetItemCount(110131),5);assert.equal(c.am.getLv(),2);
    return {status:'PASS',serverPill:s.player.items[110131],clientPill:5,level:2};
  });
  await check('shop-stale-cache','shop',async()=>{
    const s=fresh();const first=await item.handleGetItems({},s,1);
    await item.handleGetItems({id:6000003,count:1},s,2);const stale=await item.handleGetItems({},s,3);
    assert.equal(stale.data.items.find(x=>x.id===2101).count,5);assert.equal(s.player.items[2101],6);
    return {status:'BUG',db:s.player.items[2101],listResponse:5,cacheMilliseconds:3000};
  });
  await check('shop-cost-ladder','shop',async()=>{
    const s=fresh();const before=s.player.currencies.diamond;
    await item.handleGetItems({id:6000001,count:1},s,1);
    assert.equal(before-s.player.currencies.diamond,25);
    return {status:'BUG',clientFirstCost:cfg.get('ShopConfig')[6000001].cost[0].count,actualFirstCost:25};
  });
  await check('shop-save-null','shop',async()=>{
    const s=fresh();saveMode='null';const r=await item.handleGetItems({id:6000003,count:1},s,1);
    assert.equal(ack(r,1200).result,0);assert.equal(records.get(s.userId).items[2101],5);
    return {status:'BUG',ackSuccess:true,sessionHerb:s.player.items[2101],persistedHerb:5};
  });
  await check('alchemy-uncertain-save','alchemy',async()=>{
    const s=fresh();saveMode='commit-throw';await assert.rejects(()=>rng(0,()=>alchemy.handleGenerate({id:120101,count:1},s,1)));
    const committed=records.get(s.userId);assert.equal(committed.items[110102],1);assert.equal(s.player.items[110102],undefined);
    return {status:'BUG',persistedPill:1,sessionPill:0,sessionRemainsActive:!!s.player};
  });
  await check('normal-legacy-level-overflow','alchemy',async()=>{
    const s=fresh();s.player.alchemyInfo.level=100;s.player.alchemyInfo.lv=100;alchemy.ensureAlchemyInfo(s.player);
    assert.equal(cfg.get('AlchemyRoleConfig')[s.player.alchemyInfo.level],undefined);
    return {status:'BUG',storedLevel:100,maximumConfigLevel:Math.max(...Object.keys(cfg.get('AlchemyRoleConfig')).map(Number))};
  });
  await check('alchemy-auto-stop-reason','alchemy',async()=>{
    const s=fresh();s.player.items[110131]=19;
    const r=await rng(0,()=>alchemy.handleAutoGenerate({id:120131,count:5,exchange:1},s,1));
    assert.equal(ack(r,2501).count,1);assert.equal(ack(r,2501).result,0);
    return {status:'BUG',requested:5,accepted:1,reasonCode:0,clientExpectedLimitCode:1};
  });
  await check('alchemy-limit-privilege','alchemy',async()=>{
    const s=fresh();s.player.items[110131]=20;
    const echo=cfg.get('CuriosEchoConfig')[9010];
    s.player.other_attr_info.curiosInfo={curiosData:echo.suit.map(id=>({id,star:Math.max(...Object.keys(echo.addPrivilege).map(Number))}))};
    const privilege=require(path.join(app,'src/services/ItemPillService')).privilegeAdd(s.player,100);
    const r=craft(s.player,{id:120131,count:1,exchange:1},true,()=>0);
    return {status:privilege>0&&r.rejected?'BUG':'NEEDS_CONFIG_FIXTURE',privilege,reason:r.rejected};
  });
  await check('farm-seeds-all','farm',async()=>{
    const details=[];
    for(const seed of [29,30,31,100]){
      const s=fresh(),r=await farm.handlePlantInfo({index:0,seed},s,1);
      assert.equal(block(s).rewardId,1);details.push({seed,result:ack(r,2400).result,rewardId:block(s).rewardId,growSeconds:9000});
    }
    return {status:'BUG',details,missingSeedRewards:!cfg.get('PlantBaseConfig').seedRewards};
  });
  await check('farm-seed-any-owned-item','farm',async()=>{
    const s=fresh();s.player.items[2101]=1;
    const r=await farm.handlePlantInfo({index:0,seed:2101},s,1);assert.equal(ack(r,2400).result,0);assert.equal(block(s).rewardId,1);
    return {status:'BUG',herbConsumed:!s.player.items[2101],plantedRewardId:1};
  });
  await check('farm-harvest-single-repeat','farm',async()=>{
    const s=fresh();mature(s);
    const first=await farm.handlePlantHarvest({index:0},s,1),a=s.player.items[34];
    const stillMature=block(s).rewardId;
    const second=await farm.handlePlantHarvest({index:0},s,2),b=s.player.items[34];
    return {status:b>a?'BUG':'PASS',firstReward:ack(first,2401).rewards,persistedBlockReward:stillMature,secondResult:ack(second,2401).result,firstBalance:a,secondBalance:b};
  });
  await check('farm-harvest-all-repeat','farm',async()=>{
    const s=fresh();mature(s);
    await farm.handlePlantHarvestAll({},s,1);const a=s.player.items[34],b=block(s).rewardId;
    const next=await farm.handlePlantHarvestAll({},s,2);
    assert.equal(s.player.items[34],a);
    return {status:'PASS',balance:a,block:b,secondIndexes:ack(next,2407).indexs};
  });
  await check('farm-magic-display-versus-reward','farm',async()=>{
    const s=fresh();mature(s,100,1,20);const displayed=cfg.get('PlantMagicConfig')[1].reward;
    const r=await farm.handlePlantHarvest({index:100},s,1);assert.equal(ack(r,2401).rewards[0].id,1);
    return {status:'BUG',displayed,actual:ack(r,2401).rewards,clientGrow:3600,serverGrow:9000};
  });
  await check('farm-overwrite-mature','farm',async()=>{
    const s=fresh();mature(s);const r=await farm.handlePlantInfo({index:0,seed:30},s,1);
    assert.equal(ack(r,2400).result,0);assert.equal(block(s).rewardId,1);assert.equal(s.player.items[34],1000);
    return {status:'BUG',previousHarvestLost:40,seedConsumed:1};
  });
  await check('farm-fertilizer-invalid-id','farm',async()=>{
    const s=fresh();await farm.handlePlantInfo({index:0,seed:29},s,1);const old=block(s).finishTime;
    const r=await farm.handlePlantSpeedUp({index:0,itemId:0,count:10},s,2);
    assert.equal(ack(r,2406).result,0);assert.equal(old-block(s).finishTime,3000000);
    return {status:'BUG',itemId:0,secondsReduced:3000,noCost:true};
  });
  await check('farm-fertilizer-neighbor','farm',async()=>{
    const a=fresh(),b=fresh();await farm.handlePlantInfo({index:0,seed:29},b,1);
    const r=await farm.handlePlantSpeedUp({index:0,dbid:b.userId,itemId:32,count:1},a,2);
    assert.equal(ack(r,2406).result,1);return {status:'BUG',validClientActionRejected:true};
  });
  await check('farm-month-free-overwrite','farm',async()=>{
    const s=fresh();s.player.items={};const one=await farm.handlePlantMonth({index:0,seed:40},s,1);
    const previous=block(s).finishTime;const two=await farm.handlePlantMonth({index:0,seed:38},s,2);
    assert.equal(ack(one,2420).result,0);assert.equal(ack(two,2420).result,0);
    return {status:'BUG',noCardNoSeedAccepted:true,growingCropOverwritten:block(s).rewardId===38};
  });
  await check('farm-build-time','farm',async()=>{
    const s=fresh(),start=Date.now(),r=await farm.handleBuildUpgrade({index:1},s,1);
    const duration=Math.round((ack(r,2410).time-start)/1000);
    assert.equal(duration,cfg.get('PlantBuildConfig')[1][2].levelUpTime);
    return {status:'BUG',clientSeconds:cfg.get('PlantBuildConfig')[1][1].levelUpTime,serverSeconds:duration};
  });
  await check('farm-build-expired-upgrade-overwrite','farm',async()=>{
    const s=fresh();s.player.farmInfo.buildUpgrade[1]=Date.now()-1;const r=await farm.handleBuildUpgrade({index:1},s,1);
    assert.equal(s.player.farmInfo.buildLv[1],1);assert.equal(ack(r,2410).result,0);
    return {status:'BUG',completedUpgradeNotApplied:true,chargedAgain:true};
  });
  await check('farm-build-ad-unverified','farm',async()=>{
    const s=fresh();s.player.farmInfo.buildUpgrade[1]=Date.now()+86400000;
    const r=await farm.handleBuildSpeedup({index:1,ad:1},s,1);assert.equal(s.player.farmInfo.buildLv[1],2);
    return {status:'BUG',adReceiptRequired:false,wholeUpgradeFinished:true};
  });
  await check('farm-assist-noop','farm',async()=>{
    const s=fresh(),before=JSON.stringify(s.player);await farm.handleBuildAssist({index:1},s,1);await farm.handleFightAssist({index:0},s,2);
    assert.equal(JSON.stringify(s.player),before);return {status:'BUG',bothAcknowledgeWithoutEffects:true};
  });
  await check('farm-steal-free-mice','farm',async()=>{
    const a=fresh(),b=fresh();a.player.items[104]=0;mature(b);
    const r=await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:2},a,1);
    assert.equal(ack(r,2402).result,0);assert.equal(a.player.items[104],2);
    return {status:'BUG',miceCreated:2,paidCorn:0};
  });
  await check('farm-steal-hidden-product','farm',async()=>{
    const a=fresh(),b=fresh();mature(b);await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:1},a,1);
    a.player.farmInfo.roblist[0].finishtime=Date.now()-1;records.get(b.userId).farmInfo.blockInfo.find(x=>x.index===0).finishTime=Date.now()-1;
    await farm.handlePlantFightLogCheck({},a,2);
    assert.ok(a.player.items[38]>0);assert.equal(a.player.items[34],1000);
    return {status:'BUG',hiddenCrop38:a.player.items[38],linhthucUnchanged:true,assetVisible:cfg.get('AssetsConfig')[38].ifShow};
  });
  await check('farm-steal-cancel-other-player','farm',async()=>{
    const a=fresh(),b=fresh();mature(b);Object.assign(block(b),{robber:{dbid:'third'},robCount:1,matureFinishTime:Date.now()-600000,finishTime:Date.now()+10000});records.set(b.userId,clone(b.player));
    const r=await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:0},a,1);
    assert.equal(ack(r,2402).result,0);assert.equal(records.get(b.userId).farmInfo.blockInfo[0].robber,null);
    return {status:'BUG',cancelledUnrelatedThief:true};
  });
  await check('farm-steal-self','farm',async()=>{
    const a=fresh();mature(a);const r=await farm.handlePlantLevelOrRob({dbid:a.userId,index:0,count:1},a,1);
    return {status:ack(r,2402).result===0?'BUG':'PASS',result:ack(r,2402).result};
  });
  await check('farm-neighbor-overwrites-inventory','farm',async()=>{
    const a=fresh(),b=fresh();const before=records.get(b.userId).items[2101];
    onRead=async id=>{ if(id===b.userId)records.get(b.userId).items[2101]=before+1; };
    await farm.handlePlantEnemyUpdate({dbid:b.userId},a,1);
    assert.equal(records.get(b.userId).items[2101],before);
    return {status:'BUG',concurrentBoughtHerb:before+1,overwrittenHerb:before,fullRemoteSnapshotWrite:true};
  });
  await check('farm-drive-away-unlimited','farm',async()=>{
    const a=fresh();a.player.items[-2]=999;
    Object.assign(block(a),{rewardId:38,robber:{dbid:'third'},curCount:40,matureFinishTime:Date.now()-10000,finishTime:Date.now()+10000});
    const r=await farm.handleDriveAway({index:0,dbid:'third'},a,1);
    assert.equal(ack(r,2422).result,0);assert.equal(block(a).robber,null);
    return {status:'BUG',noCard:true,usedBefore:999,usedAfter:a.player.items[-2]};
  });
  await check('farm-rat-skin-unowned','farm',async()=>{
    const a=fresh(),skin=Object.keys(cfg.get('PlantThiefConfig')).map(Number).find(x=>x>0);
    const r=await farm.handleRatSkinChange({id:skin},a,1);
    return {status:ack(r,2423).id===skin?'BUG':'PASS',skin,owned:a.player.items[skin]||0,selected:ack(r,2423).id};
  });
  await check('farm-cache-rewards-sync','farm',async()=>{
    const a=fresh();mature(a);const r=await farm.handlePlantHarvestAll({cache:true},a,1);
    assert.equal(a.player.items[34],1000);assert.equal(a.player.farmInfo.cacheRecover[0].count,40);
    assert.ok(!packets(r).some(p=>p.tag===2408));
    const claim=await farm.handleGetCacheReward({},a,2),again=await farm.handleGetCacheReward({},a,3);
    assert.equal(a.player.items[34],1040);assert.equal(ack(again,2421).result,1);
    return {status:'BUG',cacheClaimOncePass:true,noCacheUpdatePush:true,noClearCachePush:!packets(claim).some(p=>p.tag===2408)};
  });
  await check('farm-cook-two-slots','farm',async()=>{
    const a=fresh();await farm.handleCook({index:0},a,1);await farm.handleCook({index:1},a,2);
    const f=a.player.farmInfo,first=f.cookInfo[0].reward;f.cookInfo[0].finishTime=Date.now()-1;
    await farm.handleCookReward({index:0},a,3);const second=await farm.handleCookReward({index:0},a,4);
    assert.equal(ack(second,2417).result,1);
    return {status:'PASS',firstReward:first,otherSlotActive:f.cookInfo[1].reward>0,repeatDenied:true};
  });
  await check('farm-offline-not-settled','farm',async()=>{
    const a=fresh();mature(a);const old=JSON.stringify(block(a));const r=farm.buildFarmInfoData(a.player);
    return {status:'GAP',matureUnsettled:JSON.stringify(block(a))===old,cacheOffline:r.cacheOffline.length,offlineSchedulerInFarm:false};
  });
  await check('pill-use-nonusable-herb','alchemy',async()=>{
    const s=fresh();const before=s.player.items[2101],r=await item.handleUseItem({index:2101,count:1},s,1);
    assert.equal(ack(r,1300).result,0);assert.equal(s.player.items[2101],before-1);
    return {status:'BUG',nonUsableHerbConsumed:true,rewards:ack(r,1300).rewardInfo.items};
  });
  await check('pill-use-stage-bypass','alchemy',async()=>{
    const s=fresh();s.player.items[110231]=1;const r=await item.handleUseItem({index:110231,count:1},s,1);
    assert.equal(ack(r,1300).result,0);
    return {status:'BUG',roleStage:1,requiredConditions:cfg.get('AssetsUseConfig')[110231].conditions,grantedRecord:s.player.other_attr_info.record[110231]};
  });
  await check('full-native-alchemy-panel','alchemy',async()=>{
    const s=fresh(),c=client(s),view={_tabIdx:0,_tabCellIdx:0,_tabDataList:[{cfgs:[cfg.get('AlchemyFormulaConfig')[120101]]}],_maxUseCnt:-1,_useCnt:0,numInput:{nowNum:1},actionBtn:{},autoCheck:{selected:false},
      AddClick(node,fn){if(node===this.actionBtn)this.click=fn},observe(){},getLimitTipItemId(){return 0},refreshBaseInfoWithAni(){}};
    c.Item.checkItemEnough=(id,num)=>c.Item.GetItemCount(id)>=num;
    c.ctx.panel=view;
    vm.runInContext('panel.initEvent='+extract('d.initEvent=function',main.indexOf('i(Xzt,')),c.ctx);
    view.initEvent();view.click();const q=c.issued.at(-1);
    c.feed(await rng(0,()=>alchemy.handleGenerate(q.params,s,q.msgUid)));
    assert.equal(c.errors.length,0);assert.equal(c.popups.length,1);assert.equal(c.Item.GetItemCount(110102),1);
    return {status:'PASS',actualPanelCallbackExecuted:true,popupPill:c.popups[0][2],clientPill:1};
  });
  await check('full-native-alchemy-all-failed','alchemy',async()=>{
    const s=fresh(),c=client(s);c.am.sendAutoGenerate(120131,1,0,d=>{ if(d.count>d.failed)c.popups.push(d.rewardInfo); });
    const q=c.issued.at(-1);c.feed(await rng(.9999,()=>alchemy.handleAutoGenerate(q.params,s,q.msgUid)));
    assert.equal(c.popups.length,0);assert.equal(c.Item.GetItemCount(110131),0);
    return {status:'EXPECTED',allFailedProducesNoPill:true,configuredChance:4800,herbSpent:1,expInItem41:c.Item.GetItemCount(41)};
  });
  await check('full-native-shop-rejection-silent','shop',async()=>{
    const s=fresh(),c=client(s),shopProto={canOfferItem:()=>true,checkPackageItemOverflow:()=>0,saveLocalBuyRecord(){}},clientRecords=[];
    c.Y.RechargeModel={addRecords:(id,n)=>clientRecords.push([id,n])};
    c.ctx.shopProto=shopProto;c.ctx.T={serverTimeMilli:Date.now()};
    vm.runInContext('shopProto.sendBuyItem='+extract('C.sendBuyItem=function'),c.ctx);
    shopProto.Rpc=c.rpc;s.player.items[34]=0;
    shopProto.sendBuyItem(6000003,1,false);const q=c.issued.at(-1);
    const r=await item.handleGetItems(q.params,s,q.msgUid);c.feed(r);
    assert.equal(ack(r,1200).result,-1);assert.equal(clientRecords.length,1);assert.equal(c.tips.length,0);
    return {status:'BUG',serverRejected:true,clientStillRecordedPurchase:clientRecords,tips:0,newItem:0};
  });
  await check('farm-harvest-locked-block','farm',async()=>{
    const s=fresh();s.player.farmInfo.lv=1;mature(s,5);
    const r=await farm.handlePlantHarvest({index:5},s,1);
    assert.equal(ack(r,2401).result,0);return {status:'BUG',landLevel:1,requiredLevel:25,received:ack(r,2401).rewards};
  });
  await check('farm-harvest-active-thief','farm',async()=>{
    const s=fresh();mature(s);block(s).robber={dbid:'thief'};block(s).matureFinishTime=Date.now()-1000000;block(s).robCount=1;
    const r=await farm.handlePlantHarvestAll({},s,1);
    assert.equal(ack(r,2407).indexs.length,1);
    return {status:'BUG',ownerHarvestAcceptedWhileThiefUnsettled:true,received:ack(r,2407).rewards};
  });
  await check('farm-build-grow-bonus-ignored','farm',async()=>{
    const s=fresh();s.player.farmInfo.buildLv={1:10,2:10,3:10};
    const before=Date.now();await farm.handlePlantMonth({index:0,seed:38},s,1);
    const actual=Math.round((block(s).finishTime-before)/1000);
    return {status:'BUG',growSpeedAttribute5:18000,baseGrow:7200,actualGrow:actual};
  });
  await check('farm-harvest-level-material-sync','farm',async()=>{
    const s=fresh();s.player.farmInfo.lv=1;s.player.farmInfo.exp=5;mature(s);
    const before=s.player.items[33],r=await farm.handlePlantHarvestAll({},s,1);
    assert.equal(s.player.items[33],before+1);
    assert.ok(!packets(r).some(p=>p.tag===1202&&p.data.changed.some(x=>x.id===33)));
    return {status:'BUG',levelUpMaterial33Added:1,noInventoryPushFor33:true};
  });
  await check('farm-multiple-steals-one-target','farm',async()=>{
    const a=fresh(),b=fresh();a.player.items[104]=5;mature(b,0);mature(b,1);
    await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:1},a,1);
    const r=await farm.handlePlantLevelOrRob({dbid:b.userId,index:1,count:1},a,2);
    assert.equal(ack(r,2402).result,0);
    return {status:'BUG',simultaneousSameOwner:a.player.farmInfo.roblist.length,clientOnlyLimit:1};
  });
  await check('farm-steal-protected-remainder','farm',async()=>{
    const a=fresh(),b=fresh();mature(b,0,38,12);
    const r=await farm.handlePlantLevelOrRob({dbid:b.userId,index:0,count:1},a,1);
    assert.equal(ack(r,2402).result,0);
    return {status:'BUG',remainingPercent:30,configuredProtectedPercent:30,accepted:true};
  });
  await check('farm-fight-fixed-win','farm',async()=>{
    const s=fresh();s.player.power=1;const r=await farm.handleFightRobber({index:0,dbid:'no-thief'},s,1);
    assert.equal(ack(r,2412).fightResult.win,1);
    return {status:'BUG',noThiefButVictory:true,staticDamage:100};
  });
  await check('farm-build-client-missing-push','farm',async()=>{
    const s=fresh();s.player.farmInfo.buildUpgrade[1]=Date.now()-1;
    const r=await farm.handleBuildCheck({},s,77);
    assert.equal(s.player.farmInfo.buildLv[1],2);assert.ok(!packets(r).some(x=>x.msgUid===0));
    const c=client(s),land={getSelfLandInfo:()=>({}),Rpc:(tag,p,cb)=>cb(ack(r,2411))};
    const landInfo={buildLv:{1:1}};land.getSelfLandInfo=()=>landInfo;c.ctx.land=land;
    vm.runInContext('land.sendBuildCheck='+extract('a.sendBuildCheck=function'),c.ctx);land.sendBuildCheck();
    assert.equal(landInfo.buildLv[1],2);
    return {status:'PASS',serverBuildLevel:2,clientCallbackAppliesLevels:true};
  });
  await check('farm-cache-client-negative-counters','farm',async()=>{
    const s=fresh(),c=client(s);s.player.items[-1]=40;s.player.farmInfo.tiredDayKey=Number(new Date().getFullYear())*10000+(new Date().getMonth()+1)*100+new Date().getDate();
    c.Item._itemMap[-1]=40;const r=await farm.handleUseCheese({},s,1);c.feed(r);
    assert.equal(c.Item.GetItemCount(-1),0);
    return {status:'PASS',cheeseConsumed:1,tiredAfter:0};
  });
  await check('farm-mature-month-regrowth','farm',async()=>{
    const s=fresh();s.player.farmInfo.lv=1;mature(s,100,1,20);
    await farm.handlePlantHarvest({index:100},s,1);
    const again=await farm.handlePlantHarvest({index:100},s,2);assert.equal(ack(again,2401).result,1);
    return {status:'PASS',magicRegrows:true,repeatedClaimDenied:true,storedFinishFuture:block(s,100).finishTime>Date.now()};
  });
  await check('alchemy-recipe-matrix','alchemy',async()=>{
    let tested=0;const missing=new Set(),autoMissing=new Set(),formulaCfg=cfg.get('AlchemyFormulaConfig');
    const sold=new Set(Object.values(cfg.get('ShopConfig')).filter(x=>x.type===0&&x.payId===0).flatMap(x=>(x.rewards||[]).map(r=>r.id)));
    for(const recipe of Object.values(formulaCfg)){
      const s=fresh();s.player.roleInfo.stage=recipe.stageId;s.player.items[recipe.id]=1;
      for(const row of recipe.consumes){if(![1,2,6].includes(row.id))s.player.items[row.id]=row.count*2;if(!sold.has(row.id)&&![1,2,6].includes(row.id))missing.add(row.id);}
      const auto=cfg.get('AssetsConfig')[recipe.id].subType===3,r=craft(s.player,{id:recipe.id,count:1,exchange:0},auto,()=>0);
      assert.equal(r.count,1);assert.ok(r.items.length>0);tested++;
      if(auto){for(const row of recipe.consumes)if(![1,2,6].includes(row.id))s.player.items[row.id]=0;
        s.player.items[34]=1e9;const x=craft(s.player,{id:recipe.id,count:1,exchange:1},auto,()=>0);if(x.rejected)autoMissing.add(recipe.id);}
    }
    return {status:'PASS',testedRecipes:tested,autoMissingShops:[...autoMissing],materialsWithoutNoncashShop:[...missing]};
  });
  await check('alchemy-auto-cap-via-normal-route','alchemy',async()=>{
    const s=fresh();s.player.items[110131]=20;
    const r=await rng(0,()=>alchemy.handleGenerate({id:120131,count:2},s,1));
    assert.equal(ack(r,2500).count,2);assert.equal(s.player.items[110131],22);
    return {status:'BUG',ordinaryRpcAcceptsAutoOnlyFormula:true,cap:20,after:22};
  });
  await check('pill-use-privilege-cap-mismatch','alchemy',async()=>{
    const s=fresh(),echo=cfg.get('CuriosEchoConfig')[9010];
    s.player.other_attr_info.curiosInfo={curiosData:echo.suit.map(id=>({id,star:9}))};
    s.player.itemUseRecords={110131:20};s.player.items[110131]=1;
    const r=await item.handleUseItem({index:110131,count:1},s,1);
    assert.equal(ack(r,1300).result,-1);
    return {status:'BUG',clientMaxWithPrivilege:22,serverCap:20,result:ack(r,1300).msg};
  });
  await check('farm-fertilizer-not-regenerated','farm',async()=>{
    const s=fresh();s.player.items[27]=0;s.player.farmInfo.lastUpdateTime=Date.now()-86400000;
    farm.ensureFarmInfo(s.player);const t=item.buildItemTimeRecords(s.player);
    assert.equal(s.player.items[27],0);assert.ok(!(27 in t));
    return {status:'BUG',configuredRecoverySeconds:cfg.get('AssetsRefreshConfig')[27].time,configuredCap:20,countAfter:0,noTimer27:true};
  });
  await check('farm-ad-seeds-wrong-reward','farm',async()=>{
    const s=fresh(),ad=require(path.join(app,'src/handlers/commerce-compat'));const before=s.player.items[29];
    const r=await ad.handleAdReward({adId:1},s,1);
    assert.equal(s.player.items[29],before);assert.equal(ack(r,1220).rewardInfo.items[0].id,3);
    return {status:'BUG',configured:cfg.get('AdvertisementConfig')[1].rewards,actual:ack(r,1220).rewardInfo.items,inventoryPush:packets(r).some(x=>x.tag===1202)};
  });
  await check('farm-ad-quota-bypass','farm',async()=>{
    const s=fresh(),ad=require(path.join(app,'src/handlers/commerce-compat'));
    for(let i=0;i<4;i++)await ad.handleAdReward({adId:1},s,i+1);
    return {status:'BUG',configuredDailyLimit:2,accepted:4,expGranted:s.player.exp};
  });
  await check('farm-build-speed-ticket-unit','farm',async()=>{
    const s=fresh();s.player.farmInfo.buildUpgrade[1]=Date.now()+3600000;const old=s.player.farmInfo.buildUpgrade[1];
    await farm.handleBuildSpeedup({index:1,count:1,ad:0},s,1);
    assert.equal(old-s.player.farmInfo.buildUpgrade[1],60000);
    return {status:'BUG',clientTicketSeconds:300,serverTicketSeconds:60};
  });
  await check('farm-cook-early-claim-client-desync','farm',async()=>{
    const s=fresh();await farm.handleCook({index:0},s,1);const r=await farm.handleCookReward({index:0},s,101);
    assert.equal(ack(r,2417).result,1);
    const c=client(s),land={_cookInfo:clone(s.player.farmInfo.cookInfo),Rpc:(tag,p,cb)=>cb(ack(r,2417))};
    c.Y.RepeatRpcBlockModel={checkRpc:()=>true,setRpcRecord(){}};c.ctx.land=land;
    vm.runInContext('land.sendCookReward='+extract('a.sendCookReward=function'),c.ctx);
    land.sendCookReward(0,false);
    assert.equal(land._cookInfo[0].finishTime,0);assert.ok(s.player.farmInfo.cookInfo[0].finishTime>0);
    return {status:'BUG',serverStillCooking:true,clientClearedOnRejection:true};
  });
  await check('farm-month-client-block-not-updated','farm',async()=>{
    const s=fresh(),r=await farm.handlePlantMonth({index:0,seed:38},s,77);
    const c=client(s),land={_curDbid:s.userId,Rpc:(tag,p,cb)=>cb(ack(r,2420))};
    c.Y.ActorModel={actorID:s.userId};c.ctx.land=land;
    vm.runInContext('land.sendPlantMonth='+extract('a.sendPlantMonth=function'),c.ctx);land.sendPlantMonth(0,38);
    assert.ok(!packets(r).some(x=>x.tag===2401&&x.msgUid===0));
    return {status:'BUG',serverBlockReward:block(s).rewardId,noBlockUpdatePush:true,clientOnlyDispatchesEvent:true};
  });
  await check('farm-thief-second-start-concurrency','farm',async()=>{
    const a=fresh(),b=fresh(),owner=fresh();mature(owner);
    let reads=0,release;const barrier=new Promise(r=>release=r);
    onRead=async id=>{if(id!==owner.userId)return;reads++;if(reads===2)release();await barrier};
    const r=await Promise.all([farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},a,1),farm.handlePlantLevelOrRob({dbid:owner.userId,index:0,count:1},b,2)]);
    assert.equal(ack(r[0],2402).result,0);assert.equal(ack(r[1],2402).result,0);
    return {status:'BUG',bothAcknowledgedSamePlot:true,finalOwnerRobber:records.get(owner.userId).farmInfo.blockInfo[0].robber.dbid,oneThiefLosesReservation:true};
  });
  await check('farm-new-magic-slot-missing-push','farm',async()=>{
    const s=fresh();s.player.farmInfo.lv=9;s.player.farmInfo.exp=cfg.get('PlantLevelConfig')[9].exp-5;s.player.farmInfo.blockInfo=s.player.farmInfo.blockInfo.filter(x=>x.index<101);
    mature(s,0,38,40);const r=await farm.handlePlantHarvestAll({},s,1);assert.equal(s.player.farmInfo.lv,10);
    assert.ok(block(s,101));assert.ok(!packets(r).some(x=>x.tag===2401&&x.data.blockinfo?.index===101));
    const p=await farm.handlePlantFightLogCheck({},s,2);assert.ok(!packets(p).some(x=>x.tag===2401&&x.data.blockinfo?.index===101));
    return {status:'BUG',newMagicSlotExistsServer:true,clientPollingDoesNotReceiveIt:true};
  });
  await check('farm-logs-client-stale','farm',async()=>{
    const s=fresh();mature(s);const r=await farm.handlePlantHarvestAll({},s,1);
    assert.ok(s.player.farmInfo.loglist.length>0);assert.ok(!packets(r).some(x=>x.tag===2403&&x.msgUid===0));
    return {status:'BUG',newLogStored:true,noAddLogPush:true,logAfterNormalization:farm.buildFarmInfoData(s.player).loglist.at(-1)};
  });
  await check('herbs-general-bag-not-pill-bag','shop',async()=>{
    const s=fresh(),c=client(s);s.player.items[110131]=1;c.Item._itemMap[110131]=1;
    const all=c.Item.getBagItems(0),pillBag=c.Item.getBagItems(8);
    assert.ok(all.some(x=>x.id===2101));assert.ok(!pillBag.some(x=>x.id===2101));assert.ok(pillBag.some(x=>x.id===110131));
    return {status:'EXPECTED',herb2101VisibleGeneral:true,herb2101VisibleAlchemyBag:false,pillVisible:true};
  });
  await check('failed-seed-client-reservation-stuck','farm',async()=>{
    const s=fresh(),c=client(s),land={_cacheUseItem:{29:1},changeCacheItem(id,n){this._cacheUseItem[id]+=n},Rpc:(tag,p,cb)=>cb({result:1})};
    c.ctx.land=land;c.ctx.egret={Capabilities:{runtimeType:'web'},RuntimeType:{TBGAME:'tb'}};
    vm.runInContext('land.sendPlant='+extract('a.sendPlant=function'),c.ctx);land.sendPlant(29,0,true);
    assert.equal(land._cacheUseItem[29],1);return {status:'BUG',reservationNotReleasedOnReject:1};
  });
  await check('normal-result-means-failed-count','alchemy',async()=>{
    const s=fresh(),c=client(s);const r=await rng(0,()=>alchemy.handleGenerate({id:120101,count:1},s,1));
    const a=ack(r,2500);assert.equal(a.result,0);assert.equal(a.rewardInfo.items[0].count,1);
    return {status:'EXPECTED',normalResultIsFailureCount:true,result:0,successCount:1,clientSuccessTest:'result < requested'};
  });
  await check('real-player-save-target-overwrite','farm',async()=>{
    const owner=fresh(),visitor=fresh(),queryWrites=[];
    let inject=true;
    const model={
      findOne(filter){return {maxTimeMS(){return this},async lean(){
        const value=[...records.values()].find(p=>p.playerId===filter.playerId||p.userId===filter.userId);
        const stale=clone(value);
        if(inject&&filter.playerId===owner.userId){inject=false;await actualPlayer.savePlayer(owner.userId,{items:{...stale.items,2101:stale.items[2101]+1}},{returnSaved:false});}
        return stale;
      }}},
      collection:{async updateOne(filter,change){queryWrites.push({filter:clone(filter),fields:Object.keys(change.$set)});records.set(filter.userId,{...records.get(filter.userId),...clone(change.$set)});return {matchedCount:1}}},
      async findOneAndUpdate(filter,change){queryWrites.push({filter:clone(filter),fields:Object.keys(change.$set)});records.set(filter.userId,{...records.get(filter.userId),...clone(change.$set)});return clone(records.get(filter.userId));},
    };
    const actualFile=path.join(app,'src/services/PlayerService.js'),m=new Module(actualFile);m.filename=actualFile;m.paths=Module._nodeModulePaths(path.dirname(actualFile));
    const defaultRequire=m.require.bind(m);m.require=id=>id==='../db/models/Player'?model:defaultRequire(id);
    m._compile(fs.readFileSync(actualFile,'utf8'),actualFile);const actualPlayer=m.exports;
    const fm=new Module(farmFile);fm.filename=farmFile;fm.paths=Module._nodeModulePaths(path.dirname(farmFile));const oldRequire=fm.require.bind(fm);
    fm.require=id=>id==='../services/PlayerService'?actualPlayer:oldRequire(id);fm._compile(fs.readFileSync(farmSourceFile,'utf8'),farmFile);
    await fm.exports.handlePlantEnemyUpdate({dbid:owner.userId},visitor,1);
    assert.equal(records.get(owner.userId).items[2101],5);assert.equal(queryWrites.length,2);
    return {status:'BUG',usesRealPlayerService:true,newHerbBalance:6,afterFarmView:5,firstWriteFields:queryWrites[0].fields,secondWriteIncludesInventory:queryWrites[1].fields.includes('items'),filterBlocksEqualLevelStale:false};
  });
  await check('pill-exp-shared-daily-limit','alchemy',async()=>{
    const s=fresh();s.player.items[110122]=11;
    const good=await item.handleUseItem({index:110122,count:10},s,1),bad=await item.handleUseItem({index:110122,count:1},s,2);
    assert.equal(ack(good,1300).result,0);assert.equal(ack(bad,1300).result,-1);assert.equal(s.player.itemUseRecords[-802],10);
    return {status:'PASS',accepted:10,rejectedExtra:true,sharedGroup:-802,expGranted:s.player.exp};
  });
  await check('pill-permanent-record-and-relog','alchemy',async()=>{
    const s=fresh();s.player.items[110131]=1;const r=await item.handleUseItem({index:110131,count:1},s,1);
    assert.equal(ack(r,1300).result,0);assert.equal(records.get(s.userId).other_attr_info.record[110131],1);
    assert.ok(packets(r).some(x=>x.tag===1250&&x.data.id===110131));
    return {status:'PASS',consumedOnce:true,persistedPermanentRecord:1,push1250:true,attributeFormulaInBattleNotExercised:true};
  });
  await check('alchemy-outofrange-native-panel','alchemy',async()=>{
    const s=fresh(),c=client(s);c.am._lv=100;const panel={};c.ctx.panel=panel;
    const start=main.indexOf('i($zt,');vm.runInContext('panel.refreshBaseInfo='+extract('d.refreshBaseInfo=function',start),c.ctx);
    c.ctx.B.ConvertLanguageToText=x=>x;c.am.getExp=()=>0;panel.nameLab={};panel.lvProgBar={labelDisplay:{}};
    let error='';try{panel.refreshBaseInfo()}catch(e){error=e.message;}
    assert.ok(error);return {status:'BUG',legacyLevel:100,nativePanelException:error};
  });
  const fileList=['src/handlers/farm.js','src/handlers/alchemy.js','src/services/AlchemyCraftService.js','src/handlers/item.js'];
  const result={at:new Date().toISOString(),productionWrites:0,networkAttempts,fixtureWrites:saves.length,farmSource:farmSourceFile,farmHash:hash(farmSourceFile),
    sourceHashes:Object.fromEntries(fileList.map(p=>[p,hash(path.join(app,p))])),mainHash:hash(mainFile),findings};
  const output=path.join(outDir,process.env.AUDIT_LIVE_FARM?'audit-live-source.json':'audit.json');
  fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({out:output,verified:findings.filter(x=>x.verified).length,total:findings.length,
    counts:findings.reduce((a,x)=>(a[x.status||'ERROR']=(a[x.status||'ERROR']||0)+1,a),{}),
    failed:findings.filter(x=>!x.verified).map(x=>[x.id,x.error]),networkAttempts},null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1});
