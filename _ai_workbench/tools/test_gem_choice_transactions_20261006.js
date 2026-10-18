'use strict';
const assert = require('assert/strict'), path = require('path'), fs = require('fs'), Module = require('module');
const root = path.resolve(__dirname, '../..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu/lhs/newServer');
const candidate = process.env.GEM_CHOICE_CANDIDATE || path.join(root, '_ai_workbench/temp/gem_choice_shop_20261005/candidate/src');
const config = require(path.join(app, 'src/services/ConfigService'));
const tables = config.loadAllTables();
const bags = [90076,90077,90078,90079,100097,100098,100099];
// Private fixture of the approved catalog; root separately verifies actual catalog.
const prices = [9720,38880,116640,349920,1049760,3149280,9447840];
if (process.env.GEM_CHOICE_USE_REAL_CONFIG === '1') require(path.join(app,'src/config/gemChoiceShop')).apply(tables);
else bags.forEach((id,i) => {
  const level=i+6, rewards=Object.values(tables.GemLevelConfig).filter(r=>r.level===level).map(r=>({id:r.id,count:1}));
  tables.AssetsConfig[id]={id,type:1,useType:101,quality:9};
  tables.AssetsUseConfig[id]={id,type:101,rewards,attrs:[],conditions:[]};
  tables.ShopConfig[10000008+i]={id:10000008+i,payId:0,cost:[{id:1,count:prices[i]}],costAgain:[],rewards:[{id,count:1}],limit:0,limitType:0};
});
const clone=x=>JSON.parse(JSON.stringify(x));
const ps=require(path.join(app,'src/services/PlayerService'));
const runtime=require(path.join(app,'src/services/RuntimeBus'));
// Selected gem bags are deterministic type101, outside all random-box pools.
const randomRewards=require(path.join(app,'src/services/RandomUsableItemRewardService'));
if (!randomRewards.isVerifiedBox) randomRewards.isVerifiedBox=()=>false;
let durable, saves=0, mode='ok', invalidations=0;
ps.drainPendingSaves=async()=>{}; ps.loadPlayer=async()=>clone(durable);
ps.savePlayer=async(_id,p)=>{saves++;if(mode==='throw')throw Error('SAVE_THROW');if(mode==='null')return null;durable=clone(p);if(mode==='postcommit')throw Error('LOST_ACK');return true;};
ps.savePlayerDeferred=async()=>{throw Error('UNEXPECTED_DEFERRED_SAVE');};
runtime.getWsServer=()=>({invalidatePlayerForMutation:()=>invalidations++});
let transaction;
function compile(source,logical){const m=new Module(logical,module);m.filename=logical;m.paths=Module._nodeModulePaths(path.dirname(logical));const baseRequire=m.require.bind(m);m.require=name=>name==='../services/GemChoiceTransactionService'?transaction:baseRequire(name);require.cache[logical]=m;m._compile(fs.readFileSync(source,'utf8'),logical);return m.exports;}
transaction=compile(path.join(candidate,'services/GemChoiceTransactionService.js'),path.join(app,'src/services/GemChoiceTransactionService.js'));
const gemHandler=compile(process.env.GEM_HANDLER || path.join(candidate,'handlers/gem.js'),path.join(app,'src/handlers/gem.js'));
let ensureCalls=0;
const actualEnsure=gemHandler.ensureGemInfo;
gemHandler.ensureGemInfo=(...args)=>{ensureCalls++;return actualEnsure(...args);};
const item=compile(path.join(candidate,'handlers/item.js'),path.join(app,'src/handlers/item.js'));
let serial=0;
const intent=extra=>({...extra,requestId:Date.now()+'-fixture_'+(++serial).toString().padStart(8,'0')});
const ack=(out,tag)=>(Array.isArray(out)?out:[out]).find(p=>p.tag===tag&&p.msgUid===77)?.data;
function reset(){mode='ok';saves=0;invalidations=0;durable={userId:'fixture',level:300,items:{},currencies:{diamond:1e12,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:1},gemInfo:{gems:[]},rechargeInfo:{},shopInfo:{}};return {userId:'fixture',player:clone(durable)};}
let groups=0;
async function test(name,fn){await fn();groups++;console.log('PASS '+name);}
(async()=>{
await test('7 exact price buys commit one wallet+bag+receipt write',async()=>{
 for(let i=0;i<7;i++){const s=reset(),before=durable.currencies.diamond;const out=await item.handleMultiBuyItem(intent({require:{[10000008+i]:2}}),s,77);assert.equal(ack(out,1202).result,0);assert.equal(saves,1);assert.equal(durable.currencies.diamond,before-2*prices[i]);assert.equal(durable.items[bags[i]],2);assert.equal(durable.other_attr_info.featureReceipts.rows.length,1);}
});
await test('all40 choices create one correct independent gem, bag consumed once',async()=>{
 for(const id of bags)for(let k=0;k<tables.AssetsUseConfig[id].rewards.length;k++){const s=reset();durable.items[id]=1;s.player=clone(durable);const out=await item.handleUseItem(intent({itemId:id,count:1,selects:{[k]:1}}),s,77);assert.equal(ack(out,1300).result,0);assert.equal(saves,1);assert.equal(durable.items[id]||0,0);assert.equal(ack(out,1300).gems.length,1);assert.equal(ack(out,1300).gems[0].id,tables.AssetsUseConfig[id].rewards[k].id);}
});
await test('invalid/mixed/missing intent and insufficient funds make zero writes',async()=>{
 for(const p of [{require:{10000008:1}},{require:{10000008:1,1:1},requestId:Date.now()+'-invalid_abcdefgh'},intent({require:{10000008:0}}),intent({require:{10000008:10000}})]){const s=reset();const before=clone(durable);assert.equal(ack(await item.handleMultiBuyItem(p,s,77),1202).result,-1);assert.equal(saves,0);assert.deepEqual(durable,before);}
 const s=reset();durable.currencies.diamond=1;s.player=clone(durable);assert.equal(ack(await item.handleMultiBuyItem(intent({require:{10000014:1}}),s,77),1202).result,-1);assert.equal(saves,0);
});
await test('malformed choices and counts cannot consume bag',async()=>{
 for(const selects of [{},{0:2},{6:1},{'-1':1},{0:1,1:1},{0:-1}]){const s=reset();durable.items[100097]=1;s.player=clone(durable);assert.equal(ack(await item.handleUseItem(intent({itemId:100097,count:1,selects}),s,77),1300).result,-1);assert.equal(saves,0);assert.equal(durable.items[100097],1);}
});
await test('large purchase total above int32 remains exact and unrelated SKU is not scoped',async()=>{
 const s=reset(),before=durable.currencies.diamond;const out=await item.handleMultiBuyItem(intent({require:{10000014:9999}}),s,77);
 assert.equal(ack(out,1202).result,0);assert.equal(durable.currencies.diamond,before-prices[6]*9999);assert.equal(durable.items[100099],9999);
 assert.equal(transaction.hasPurchase({require:{10000007:1}}),false);assert.equal(transaction.hasBag({itemId:90075}),false);
 const price=tables.ShopConfig[10000014].cost[0].count;tables.ShopConfig[10000014].cost[0].count=Number.MAX_SAFE_INTEGER;
 const fresh=reset();assert.equal(ack(await item.handleMultiBuyItem(intent({require:{10000014:2}}),fresh,77),1202).code,'GEM_CHOICE_COST_OVERFLOW');assert.equal(saves,0);
 tables.ShopConfig[10000014].cost[0].count=price;
});
await test('concurrent same purchase one debit; replay sync is current absolute',async()=>{
 const s=reset(),p=intent({require:{10000008:1}});const out=await Promise.all([item.handleMultiBuyItem(p,s,77),item.handleMultiBuyItem(p,s,77)]);assert.equal(saves,1);assert(out.some(r=>ack(r,1202).replayed));durable.items[90076]=0;durable.currencies.diamond=55;const replay=await item.handleMultiBuyItem(p,s,77);assert.equal(ack(replay,1202).replayed,true);assert.equal(ack(replay,1202).changed.find(r=>r.id===90076).count,0);assert.equal(saves,1);assert.equal(ack(await item.handleMultiBuyItem({...p,require:{10000008:2}},s,77),1202).code,'FEATURE_REQUEST_CONFLICT');
});
await test('choice retry creates no duplicate gem and syncs current list',async()=>{
 const s=reset();durable.items[90076]=2;s.player=clone(durable);const p=intent({itemId:90076,count:2,selects:{0:1,1:1}});const first=await item.handleUseItem(p,s,77),replay=await item.handleUseItem(p,s,77);assert.equal(ack(first,1300).gems.length,2);assert.equal(new Set(ack(first,1300).gems.map(g=>g.uid)).size,2);assert.equal(ack(replay,1300).replayed,true);assert.equal(ack(replay,1300).gems.length,0);assert.equal(saves,1);
});
await test('legacy1200 preserves intent/replayed/errors and rejects normalized invalid count',async()=>{
 const s=reset(),p=intent({id:10000008,count:2});
 const first=await item.handleGetItems(p,s,77),replay=await item.handleGetItems(p,s,77);
 assert.equal(ack(first,1200).result,0);assert.equal(ack(replay,1200).replayed,true);assert.equal(saves,1);assert.equal(durable.items[90076],2);
 assert.equal(ack(await item.handleGetItems({...p,count:3},s,77),1200).code,'FEATURE_REQUEST_CONFLICT');
 const bad=ack(await item.handleGetItems(intent({id:10000008,count:0}),s,77),1200);
 assert.equal(bad.result,-1);assert.equal(bad.code,'GEM_CHOICE_INVALID_COUNT');assert.equal(bad.retryable,false);assert.equal(saves,1);
 const t=reset(),lost=intent({id:10000008,count:1});mode='postcommit';await assert.rejects(item.handleGetItems(lost,t,77));mode='ok';t.player=clone(durable);
 assert.equal(ack(await item.handleGetItems(lost,t,77),1200).replayed,true);assert.equal(saves,1);
});
await test('null/throw/committed-timeout invalidate; lost ack recovers receipt',async()=>{
 for(const tag of [1202,1300])for(const failure of ['null','throw','postcommit']){const s=reset();durable.items[90076]=1;s.player=clone(durable);const original=clone(s.player);mode=failure;const p=intent(tag===1202?{require:{10000008:1}}:{itemId:90076,count:1,selects:{0:1}});const call=()=>tag===1202?item.handleMultiBuyItem(p,s,77):item.handleUseItem(p,s,77);await assert.rejects(call());assert.equal(s.player,null);assert.equal(invalidations,1);const persisted=clone(durable);const retry=ack(await call(),tag);assert.equal(retry.code,'GEM_CHOICE_SESSION_REQUIRED');assert.equal(retry.retryable,true);assert.deepEqual(durable,persisted);assert.equal(s.player,null);if(failure==='postcommit'){mode='ok';s.player=clone(durable);assert.equal(ack(await call(),tag).replayed,true);assert.equal(saves,1);}else assert.deepEqual(durable,original);}
});
await test('missing authoritative snapshot is retryable without writes',async()=>{
 const s=reset(),load=ps.loadPlayer;ps.loadPlayer=async()=>null;
 try { const r=ack(await item.handleMultiBuyItem(intent({require:{10000008:1}}),s,77),1202);assert.equal(r.code,'PLAYER_SNAPSHOT_REQUIRED');assert.equal(r.retryable,true);assert.equal(saves,0); }
 finally { ps.loadPlayer=load; }
});
await test('bulk100/1000 on10000existing gems uses bounded normalization and one durable write',async()=>{
 for(const count of [100,1000]){const s=reset();durable.items[100099]=count;durable.gemInfo={gems:Array.from({length:10000},(_,i)=>({uid:i+1,id:25051,shapeId:1})),nextUid:10001};s.player=clone(durable);ensureCalls=0;
 const started=Date.now(),out=await item.handleUseItem(intent({itemId:100099,count,selects:{0:count}}),s,77);
 assert.equal(ack(out,1300).result,0);assert.equal(ack(out,1300).gems.length,count);assert.equal(durable.other_attr_info.gemInfo.gems.length,10000+count);assert.equal(new Set(durable.other_attr_info.gemInfo.gems.map(g=>g.uid)).size,10000+count);assert.equal(saves,1);assert(ensureCalls<=3,'ensureGemInfo calls '+ensureCalls);console.log(JSON.stringify({bulk:count,existingGemCount:10000,ensureCalls,elapsedMs:Date.now()-started}));}
 const s=reset();durable.items[100099]=1201;s.player=clone(durable);assert.equal(ack(await item.handleUseItem(intent({itemId:100099,count:1201,selects:{0:1201}}),s,77),1300).code,'GEM_CHOICE_INVALID_COUNT');assert.equal(saves,0);
});
console.log(JSON.stringify({pass:true,groups,mode:'RAM_ONLY',realPurchases:0,playerWrites:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
