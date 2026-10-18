'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..'),game=process.env.FEATURE_GAME||path.resolve(app,'../../webgame/game');
function req(p){return require(path.join(app,'src',p));}
const log=path.join(app,'src/logger.js');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){}}};
let network=0;const deny=()=>{network++;throw Error('NETWORK_FORBIDDEN')};require('net').Socket.prototype.connect=deny;global.fetch=deny;
const config=req('services/ConfigService'),{ByteArray,BinJsonUtil}=req('protocol/BinJsonUtil'),codec=req('protocol/Codec'),packet=req('protocol/PacketManager');
const configPath=process.env.CONFIG_BIN_PATH||path.resolve(app,'../update/resource/assets/excel/config_e5ac72c2.bin');
const results=[];
function test(name,fn){try{fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:e.stack})}}
test('pooled zlib offset never reads prefix or suffix bytes',()=>{
  const original=zlib.inflateSync;let used=0;
  zlib.inflateSync=function(...args){const raw=original(...args),slab=Buffer.alloc(raw.length+107,0x77);raw.copy(slab,53);used++;return slab.subarray(53,53+raw.length)};
  try{const t=config.reload(configPath);assert.equal(Object.keys(t).length,714);assert.equal(t.PlantConfig[38].rewards[0].id,34);assert.equal(t.PlantBuildConfig[1][1].level,1);assert.equal(Object.keys(t.AlchemyFormulaConfig).length,148);assert.equal(t.AlchemyBaseConfig.pillExp.id,41);assert.equal(used,714);
    const values=[{tag:2500,data:{level:2,exp:10}},{tag:1202,data:{items:[{id:27,count:2}]}}];const b=packet.packBatch(values);assert.deepEqual(codec.Unpack(b),values);
  }finally{zlib.inflateSync=original;}
});
test('last known valid config retained after failed reload',()=>{const before=config.loadAllTables();assert.throws(()=>config.reload(path.join(app,'does-not-exist-audit.bin')),/CONFIG_FILE_MISSING/);assert.equal(config.loadAllTables(),before);});
test('malformed headers and table schemas rejected',()=>{
  const b=fs.readFileSync(configPath);assert.throws(()=>config.decodeTables(b.subarray(0,b.length-4)),/CONFIG_BAD_TABLE_LENGTH/);
  const data=JSON.parse(JSON.stringify(config.loadAllTables()));data.AlchemyFormulaConfig=data.AlchemyElixirConfig;assert.throws(()=>config.validateGameplayTables(data),/CONFIG_INVALID_FORMULA/);
  assert.throws(()=>config.decodeTables(Buffer.alloc(0)),/CONFIG_EMPTY/);
});
test('repeated loads keep table keys stable',()=>{for(let i=0;i<3;i++){const t=config.reload(configPath);assert.equal(Object.keys(t).length,714);assert.equal(t.AlchemyFormulaConfig[120101].id,120101)}});
const receipts=req('services/FeatureReceiptService');
test('modern receipts no device timestamp; cross-player epoch rejected',()=>{const p={},epoch=receipts.createEpoch(p);const request={requestId:'v3_'+epoch.epoch+'_1',id:120101,count:1};assert.equal(receipts.read(p,2500,request),null);receipts.record(p,2500,request,{count:1});assert.deepEqual(receipts.read(p,2500,request),{count:1});assert.throws(()=>receipts.read({},2500,request),/FEATURE_EPOCH_EXPIRED/);assert.throws(()=>receipts.read(p,2500,{...request,count:2}),/FEATURE_REQUEST_CONFLICT/)});
test('same-millisecond sequence accepts new requests after eviction, rejects retired ones',()=>{
  const p={},e=receipts.createEpoch(p);for(let i=1;i<=130;i++){const r={requestId:`v3_${e.epoch}_${i}`,id:120101};assert.equal(receipts.read(p,2500,r),null);receipts.record(p,2500,r,{count:1});}
  assert.equal(p.other_attr_info.featureReceipts.rows.length,64);assert.equal(receipts.read(p,2500,{requestId:`v3_${e.epoch}_131`,id:120101}),null);assert.throws(()=>receipts.read(p,2500,{requestId:`v3_${e.epoch}_1`,id:120101}),/RETIRED/);
});
test('epoch TTL server-owned and count bounded',()=>{const p={};for(let i=0;i<10;i++)receipts.createEpoch(p);assert.equal(p.other_attr_info.featureReceipts.epochs.length,4);const e=p.other_attr_info.featureReceipts.epochs[0];e.expiresAt=Date.now()-1;assert.throws(()=>receipts.read(p,2400,{requestId:`v3_${e.id}_1`}),/EPOCH_EXPIRED/)});
test('GMT7 midnight independent from process timezone',()=>{const d=req('services/GameDayService');assert.equal(d.key(Date.parse('2026-09-08T16:59:59Z')),20260908);assert.equal(d.key(Date.parse('2026-09-08T17:00:00Z')),20260909);assert.equal(d.end(Date.parse('2026-09-08T16:00:00Z')),Date.parse('2026-09-08T17:00:00Z'));});
test('day reset preserves inventory and nonfarm shops, resets counters once',()=>{
  const day=req('services/FarmDayService');const p={items:{29:30,110131:4},other_attr_info:{farmGameDay:20260908,itemPillDaily:{day:20260908}},itemUseRecords:{'-802':10,110131:20},alchemyInfo:{dayKey:20260908,dayCount:200},shopInfo:{farmShopDay:20260908,buyRecords:{6000001:8,120101:1,999:3}},rechargeInfo:{records:[{id:6000001,count:8},{id:999,count:3}]}},now=Date.parse('2026-09-08T17:00:00Z');
  assert.equal(day.prepare(p,now),true);assert.equal(p.alchemyInfo.dayCount,0);assert.equal(p.itemUseRecords[-802],0);assert.equal(p.itemUseRecords[110131],20);assert.equal(p.shopInfo.buyRecords[6000001],undefined);assert.equal(p.shopInfo.buyRecords[120101],1);assert.equal(p.items[29],30);assert.equal(day.prepare(p,now+100),false);
});
const acorn=require(process.env.FEATURE_ACORN||path.join(app,'node_modules/acorn')),main=fs.readFileSync(path.join(game,'js/main.min_a6195824.js'),'utf8');
function fn(marker){const p=main.indexOf(marker);assert.ok(p>=0,marker);let n=acorn.parseExpressionAt(main,p+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
function client(){const calls=[],tips=[],events=[];function Socket(){}Socket.prototype.Rpc=function(tag,p,cb,ctx,err){calls.push({tag,p,cb,err})};Socket.prototype.AddHandler=function(tag,cb){this.handlers||={};this.handlers[tag]=cb};function Item(){}const m=Item.prototype;const cfg=config.loadAllTables();const Y={Config:cfg,LandModel:{_cacheUseItem:{29:1},isLandCardAuto:true},RepeatRpcBlockModel:{setRpcRecord(){}}};const ctx=vm.createContext({m,Y,A:{ins:()=>({dispatch:e=>events.push(e)})},E:new Proxy({},{get:(_,k)=>String(k)}),Date,Math});for(const name of ['GetItemCount','onItemChange','onItemTimeChange'])vm.runInContext('m.'+name+'='+fn('m.'+name+'=function'),ctx);
  const window={GameSocket:Socket,ItemModel:Item,W:Y,UserTips:{ins:()=>({showTips:x=>tips.push(x)})}};ctx.window=window;vm.runInContext(fs.readFileSync(path.join(game,'js/lhs-farm-alchemy-v2.js'),'utf8'),ctx);return {calls,tips,events,window,Socket,Item,Y,ctx};}
test('real ItemModel sees correct recovery count in its update event',()=>{
  const c=client(),m=new c.Item();Object.assign(m,{_itemMap:{27:10},_timeRecords:{27:{count:1,time:0}},_composeIdDict:{},isFreeze:false});let seen=[];c.ctx.A={ins:()=>({dispatch:e=>{if(e==='ITEM_UPDATE27')seen.push(m.GetItemCount(27))}})};m.onItemChange({items:[],changed:[{id:27,count:11}]});m.onItemTimeChange({itemId:27,time:Date.now()});assert.deepEqual(seen,[11]);assert.equal(m.GetItemCount(27),11);
});
test('expired card stops automation without running success callback',()=>{const c=client(),s=new c.Socket();let count=0;s.Rpc(2428,{index:0,requestId:'explicit'},()=>count++);c.calls[0].cb({result:2});assert.equal(c.Y.LandModel.isLandCardAuto,false);assert.equal(count,0);});
test('client pending writes share one epoch; unrelated RPC unchanged',()=>{
  const c=client(),s=new c.Socket(),cb=()=>{};s.Rpc(4010,{id:1},cb);assert.equal(c.calls[0].cb,cb);s.Rpc(2500,{id:120101,count:1},cb);s.Rpc(2400,{seed:29,index:0},cb);assert.equal(c.calls.length,2);const player={},e=receipts.createEpoch(player);c.calls[1].cb(e);assert.equal(c.calls.length,4);assert.equal(c.calls[2].p.requestId,`v3_${e.epoch}_1`);assert.equal(c.calls[3].p.requestId,`v3_${e.epoch}_2`);
});
test('weighted policy exact exhaustive domain and long-run bounds',()=>{
  const policy=req('services/FarmPolicyService');policy.validate();for(const rows of [policy.policy.normalSeedWeights,policy.policy.magicWeights]){const observed={};for(let i=0;i<100000;i++){const id=policy.pick(rows,()=>((i%10000)+.5)/10000);observed[id]=(observed[id]||0)+1;}for(const row of rows)assert.equal(observed[row.id],row.weight*10);}
});
test('magic resources persist native rewards and base timing',()=>{const t=config.loadAllTables();for(const row of req('services/FarmPolicyService').policy.magicWeights){assert.ok(t.PlantMagicConfig[row.id].growTime>=3600);assert.ok([1,2,4,101].includes(t.PlantMagicConfig[row.id].reward.id))}assert.equal(t.PlantConfig[38].count*t.PlantConfig[38].rewards[0].count,40);});
test('support quota/cooldown independent of client ad result; seed refill capped',()=>{
  const s={systemUnlockInfo:{unlockedSystem:[303]},items:{29:0},farmInfo:{buildLv:{3:1},lv:1}},ad=req('services/FarmAdService'),recovery=req('services/FarmRecoveryService'),now=Date.now();
  recovery.settle(s,now);assert.equal(s.items[29],5);s.items[29]=1;recovery.settle(s,now+1);assert.equal(s.items[29],1);assert.equal(ad.claim(s,1,now).ok,true);assert.equal(ad.claim(s,1,now+1).ok,false);assert.equal(ad.claim(s,1,now+31000).ok,true);assert.equal(ad.claim(s,1,now+62000).ok,false);
});
test('failing tables never accepted when formula weights or inputs empty',()=>{
  for(const field of ['consumes','qualityWeights']){const t=JSON.parse(JSON.stringify(config.loadAllTables()));t.AlchemyFormulaConfig[120101][field]=field==='consumes'?[]:{};assert.throws(()=>config.validateGameplayTables(t),/CONFIG_INVALID_FORMULA/);}
});
test('Monte Carlo 100000 draws match probability and expected outputs',()=>{
  const policy=req('services/FarmPolicyService');let state=92813;const rng=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296};
  for(const rows of[policy.policy.normalSeedWeights,policy.policy.magicWeights]){const counts={};for(let i=0;i<100000;i++){const id=policy.pick(rows,rng);counts[id]=(counts[id]||0)+1;}for(const row of rows){const expected=row.weight*10,tolerance=Math.max(30,6*Math.sqrt(expected*(1-row.weight/10000)));assert.ok(Math.abs(counts[row.id]-expected)<tolerance);}}
});
test('30-day autonomous magic economy bounded without acceleration',()=>{
  const policy=req('services/FarmPolicyService');let seed=19222;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const rewards={1:0,2:0,4:0,101:0};for(let plot=0;plot<3;plot++){let time=0;while(true){const id=policy.pick(policy.policy.magicWeights,rng),row=config.get('PlantMagicConfig')[id];time+=row.growTime+config.get('PlantBaseConfig').magicFieldCd;if(time>30*86400)break;rewards[row.reward.id]+=row.reward.count;}}
  assert.ok(rewards[1]<900&&rewards[1]>300);assert.ok(rewards[4]<5000&&rewards[4]>2000);
});
const report={result:results.some(x=>!x.pass)||network?'FAIL':'PASS',count:results.length,node:process.version,productionWrites:0,networkAttempts:network,tests:results};
if(process.env.FEATURE_REPORT)fs.writeFileSync(process.env.FEATURE_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,tests:results.filter(x=>!x.pass)},null,2));if(report.result!=='PASS')process.exitCode=1;
