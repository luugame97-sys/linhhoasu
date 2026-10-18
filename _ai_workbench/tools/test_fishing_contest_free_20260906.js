'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),net=require('net');
const root=path.resolve(process.argv[2]),app=path.join(root,'app'),clone=x=>JSON.parse(JSON.stringify(x));
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
net.Socket.prototype.connect=()=>{throw Error('FIXTURE_NO_NETWORK');};
const saved=new Map();let mode='ok',now=Date.parse('2026-09-06T20:00:00+07:00');Date.now=()=>now;
function stub(rel,exports){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{async savePlayer(id,p){if(mode==='null')return null;if(mode==='throw')throw Error('SAVE_FAILED');saved.set(id,clone(p));if(mode==='commit-throw')throw Error('COMMIT_TIMEOUT');return p;},wasRecentlySaved:()=>false});
const cfg=require(path.join(app,'src/services/ConfigService'));cfg.loadAllTables();
const shops=require(path.join(app,'src/services/FishingEventShopService')),schedule=require(path.join(app,'src/services/FishingEventSchedule')),item=require(path.join(app,'src/handlers/item'));
let seq=0;const tests=[];
function base(){mode='ok';now=Date.parse('2026-09-06T20:00:00+07:00');const p={userId:'free_fixture_'+(++seq),playerId:'p'+seq,name:'Fixture',serverId:1001,level:116,exp:0,items:{4:0},currencies:{diamond:0,gold:0,silver:0},rechargeInfo:{records:[]},shopInfo:{},systemUnlockInfo:{unlockedSystem:[215]},fishInfo:{}};schedule.sync(p);saved.set(p.userId,clone(p));return {userId:p.userId,player:p};}
const rows=x=>Array.isArray(x)?x:[x],ack=(r,tag=1202)=>rows(r).find(p=>p.tag===tag&&p.msgUid===7)?.data;
const claim=s=>item.handleMultiBuyItem({require:{11001400:1}},s,7);
async function test(name,fn){try{await fn();tests.push({name,result:'PASS'});}catch(e){tests.push({name,result:'FAIL',error:e.stack});}finally{mode='ok';}}
(async()=>{
await test('free_grants_ten_once_and_syncs_native_counter',async()=>{const s=base(),r=await claim(s);assert.equal(ack(r).result,0);assert.equal(s.player.items[4],10);assert.equal(rows(r).find(p=>p.tag===1701).data.data.buyRecords[11001400],1);assert.equal(ack(await claim(s)).code,'DAILY_LIMIT_REACHED');assert.equal(s.player.items[4],10);});
await test('spam_twenty_requests_only_one_grant',async()=>{const s=base(),results=await Promise.all(Array.from({length:20},()=>claim(s)));assert.equal(results.filter(r=>ack(r).result===0).length,1);assert.equal(s.player.items[4],10);});
await test('relog_and_heartbeat_keep_claimed',async()=>{const s=base();await claim(s);s.player=clone(saved.get(s.userId));schedule.sync(s.player);assert.equal(ack(await claim(s)).code,'DAILY_LIMIT_REACHED');assert.equal(s.player.items[4],10);});
await test('legacy_purchase_not_reset_by_hotfix',async()=>{const s=base();s.player.shopInfo.buyRecords={11001400:93};s.player.rechargeInfo.records=[{id:11001400,count:93}];assert.equal(ack(await claim(s)).code,'DAILY_LIMIT_REACHED');assert.equal(s.player.items[4],0);assert.equal(shops.policy(s.player,11001400).count,1);});
await test('next_game_day_allows_exactly_one',async()=>{const s=base();await claim(s);now=Date.parse('2026-09-07T00:00:00+08:00');assert.equal(ack(await claim(s)).result,0);assert.equal(ack(await claim(s)).code,'DAILY_LIMIT_REACHED');assert.equal(s.player.items[4],20);});
await test('old_history_does_not_block_future_days',async()=>{const s=base();s.player.shopInfo.buyRecords={11001400:20};now=Date.parse('2026-09-07T00:00:00+08:00');assert.equal(ack(await claim(s)).result,0);assert.equal(ack(await claim(s)).code,'DAILY_LIMIT_REACHED');});
for(const value of [0,2,-1,0.5,'1',null])await test('invalid_count_'+JSON.stringify(value),async()=>{const s=base();assert.notEqual(ack(await item.handleMultiBuyItem({require:{11001400:value}},s,7)).result,0);assert.equal(s.player.items[4],0);});
await test('mixed_free_paid_rejected_atomically',async()=>{const s=base(),before=clone(s.player);assert.notEqual(ack(await item.handleMultiBuyItem({require:{11001400:1,11001401:1}},s,7)).result,0);assert.deepEqual(s.player,before);});
await test('compat_1210_cannot_bypass_daily_cap',async()=>{const s=base();assert.equal(ack(await item.handleShopBuy({goodsId:11001400,count:1},s,7),1210).result,0);assert.equal(ack(await item.handleShopBuy({goodsId:11001400,count:1},s,7),1210).result,-1);assert.equal(s.player.items[4],10);});
await test('inactive_or_ineligible_event_rejects_free',async()=>{for(const kind of ['closed','level','disabled','competing']){const s=base();if(kind==='closed')now=Date.parse('2026-12-06T00:00:00+07:00');if(kind==='level')s.player.level=54;if(kind==='disabled')s.player.activityInfo.disabledEntryIds=[6006];if(kind==='competing')s.player.activityInfo.datas.push({id:6001,startTime:now-1,endTime:now+10000});assert.equal(ack(await claim(s)).code,'FISH_EVENT_NOT_ACTIVE');assert.equal(s.player.items[4],0);}});
for(const failure of ['null','throw','commit-throw'])await test('save_'+failure+'_never_regrants_after_uncertainty',async()=>{const s=base(),before=clone(s.player);mode=failure;await assert.rejects(()=>claim(s));assert.equal(s.player,null);mode='ok';s.player=clone(saved.get(s.userId));if(failure==='commit-throw'){assert.equal(ack(await claim(s)).code,'DAILY_LIMIT_REACHED');assert.equal(s.player.items[4],10);}else{assert.deepEqual(s.player,before);assert.equal(ack(await claim(s)).result,0);}});
await test('paid_caps_preserve_current_counts_and_reset_only_next_instance',()=>{const s=base();s.player.rechargeInfo.records=[{id:11001401,count:5}];assert.equal(shops.policy(s.player,11001401).count,5);assert.equal(shops.policy(s.player,11001401).limit,50);assert.equal(shops.policy(s.player,11001403).limit,100);now+=7*86400000;assert.equal(shops.policy(s.player,11001401).count,0);});
const out={result:tests.every(t=>t.result==='PASS')?'PASS':'FAIL',count:tests.length,tests,productionWrites:0};fs.writeFileSync(path.join(root,'free-tests.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));if(out.result!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
