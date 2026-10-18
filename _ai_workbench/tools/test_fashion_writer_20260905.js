'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),net=require('node:net');
const app=path.resolve(process.env.LHS_APP_ROOT||process.argv[2]);
process.env.CONFIG_BIN_PATH=process.env.LHS_CONFIG_PATH||path.resolve(app,'../server.bin');
process.env.PLAYER_DEFERRED_SAVE_COALESCE_MS='10000';
process.env.MONGO_OPERATION_TIMEOUT_MS='500';
net.Socket.prototype.connect=function(){throw new Error('NETWORK_FORBIDDEN');};
const clone=x=>JSON.parse(JSON.stringify(x));let f;
function stub(rel,exports){const filename=require.resolve(path.join(app,rel));require.cache[filename]={id:filename,filename,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
function doc(value){return Object.assign(clone(value),{markModified(){},toObject(){return clone(this);},async save(){
 f.events.push('cash-write-start');if(f.cashHook)await f.cashHook();
 if(f.failSave==='before')throw new Error('SAVE_BEFORE');
 f.durable=clone(this);f.cashSaves++;f.events.push('cash-committed');
 if(f.failSave==='after')throw new Error('SAVE_AFTER');return this;
}});}
function chain(work){return{maxTimeMS(){return this;},lean(){return work();},then(a,b){return work().then(a,b);}};}
async function update(_q,u){f.events.push('game-write-start');if(f.gameHook)await f.gameHook();Object.assign(f.durable,clone(u.$set));f.gameSaves++;f.events.push('game-committed');return {matchedCount:1};}
stub('src/db/models/Player',{
 findOne(q){return chain(async()=>{assert.equal(q.userId,f.durable.userId);return doc(f.durable);});},
 findOneAndUpdate(q,u){return chain(async()=>{await update(q,u);return clone(f.durable);});},
 collection:{updateOne:update},
});
stub('src/db/models/Transaction',{async findOne(q){return f.orders.get(q.orderId)||null;},async create(row){if(f.failTx){f.failTx=false;throw new Error('TX_FAIL');}assert(!f.orders.has(row.orderId));f.orders.set(row.orderId,clone(row));return row;}});
stub('src/db/models/Mail',{async findOneAndUpdate(_q,u){if(f.failMail){f.failMail=false;throw new Error('MAIL_FAIL');}return {_id:'writer-mail',...u.$setOnInsert};}});
stub('src/services/DistClient',{async rechargeCallback(){throw new Error('UPSTREAM_FORBIDDEN');}});
stub('src/services/RechargeConfigService',{normalizeProductId:x=>String(x),normalizeRewardItems:x=>x,async getResolvedRow(id){return {productId:id,source:'catalog',enabled:true,amount:cfg.get('PayConfig')[id].priceR,attachments:[{id:4,count:2}]};}});
const cfg=require(path.join(app,'src/services/ConfigService'));
const mutation=require(path.join(app,'src/services/PlayerMutationService'));
const ps=require(path.join(app,'src/services/PlayerService'));
const {syncSessionPlayerFields}=require(path.join(app,'src/services/SessionPlayerSyncService'));
const recharge=require(path.join(app,'src/handlers/recharge'));
function begin(label){const p={userId:'writer-'+label,playerId:'writer-'+label,level:99,exp:0,items:{},currencies:{diamond:0,gold:0,silver:0},roleInfo:{kungfuId:4,stage:1,subJob:0},rechargeInfo:{records:[],periodRecords:{},monthCards:{}},shopInfo:{pack:[],chainPack:[]},activityInfo:{datas:[]},fashionInfo:{fashions:{},activateFashion:[],fashionData:[],dress:[]},other_attr_info:{},equipInfo:{equipList:[],openList:[],setInfoMap:{},curIndex:0},taskInfo:{},raidInfo:{}};
f={p,durable:clone(p),orders:new Map(),events:[],cashSaves:0,gameSaves:0,packets:[],invalidated:false};
f.ws={getPlayerForMutation(){return f.invalidated?null:f.p;},invalidatePlayerForMutation(){f.invalidated=true;},syncSessionPlayer(_u,v,o){f.events.push('sync');syncSessionPlayerFields(f.p,v,o);},pushToUser(_u,t,d){if(f.failPush){f.failPush=false;throw new Error('PUSH_FAIL');}f.packets.push({tag:t,data:d});}};
f.req={userId:p.userId,orderId:'order-'+label,productId:'11000003',amount:cfg.get('PayConfig')[11000003].priceR,idempotentSuccess:true};return f;}
function owned(p){return (p.fashionInfo?.activateFashion||[]).includes(29001);}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};}
const results=[];
async function check(name,work){await work();results.push(name);}
async function main(){
await check('cash_updates_real_projection_and_game_save_retains_ownership',async()=>{begin('plain');assert((await recharge.handleRecharge(f.req,f.ws)).success);assert(owned(f.p)&&owned(f.durable));await mutation.run(f.p.userId,()=>ps.savePlayer(f.p.userId,f.p,{returnSaved:false}));assert(owned(f.durable));});
await check('inflight_cash_excludes_gameplay_until_commit',async()=>{begin('concurrent');const entered=deferred(),release=deferred();f.cashHook=async()=>{entered.resolve();await release.promise;};const cash=recharge.handleRecharge(f.req,f.ws);await entered.promise;let played=false;const game=mutation.run(f.p.userId,async()=>{played=true;assert(owned(f.p));f.p.roleInfo.stage=9;f.p.currencies.diamond-=5;await ps.savePlayer(f.p.userId,f.p,{returnSaved:false});});await Promise.resolve();assert(!played);release.resolve();await Promise.all([cash,game]);assert.equal(f.durable.roleInfo.stage,9);assert(owned(f.durable));assert.equal(f.durable.currencies.diamond,f.p.currencies.diamond);});
await check('gameplay_inflight_before_cash_is_committed_first',async()=>{begin('game-first');const entered=deferred(),release=deferred();const game=mutation.run(f.p.userId,async()=>{f.p.roleInfo.stage=17;entered.resolve();await release.promise;await ps.savePlayer(f.p.userId,f.p,{returnSaved:false});});await entered.promise;const cash=recharge.handleRecharge(f.req,f.ws);await Promise.resolve();assert.equal(f.cashSaves,0);release.resolve();await Promise.all([cash,game]);assert.equal(f.durable.roleInfo.stage,17);assert(owned(f.p));});
await check('already_captured_save_drained_before_cash_reads',async()=>{begin('captured');const entered=deferred(),release=deferred();f.gameHook=async()=>{entered.resolve();await release.promise;};const old=ps.savePlayer(f.p.userId,clone(f.p),{returnSaved:false});await entered.promise;const cash=recharge.handleRecharge(f.req,f.ws);await Promise.resolve();assert.equal(f.cashSaves,0);release.resolve();await Promise.all([old,cash]);assert(owned(f.durable));assert(f.events.indexOf('game-committed')<f.events.indexOf('cash-write-start'));});
await check('pending_deferred_snapshot_drained_before_cash',async()=>{begin('deferred');f.p.roleInfo.stage=22;const old=ps.savePlayerDeferred(f.p.userId,f.p);await recharge.handleRecharge(f.req,f.ws);await old;assert.equal(f.durable.roleInfo.stage,22);assert(owned(f.durable));assert(f.events.indexOf('game-committed')<f.events.indexOf('cash-write-start'));});
for(const fail of ['failMail','failTx'])await check('retry_'+fail+'_keeps_unflushed_progress_and_spend',async()=>{begin(fail);f[fail]=true;await assert.rejects(()=>recharge.handleRecharge(f.req,f.ws));assert(owned(f.p));f.p.roleInfo.stage=31;f.p.currencies.diamond-=5;f.p.activityInfo.datas.push({id:999999,score:53});const balance=f.p.currencies.diamond;const result=await recharge.handleRecharge(f.req,f.ws);assert(result.recovered);assert.equal(f.cashSaves,1);assert.equal(f.p.currencies.diamond,balance);assert.equal(f.p.roleInfo.stage,31);assert(f.p.activityInfo.datas.some(r=>r.id===999999));await mutation.run(f.p.userId,()=>ps.savePlayer(f.p.userId,f.p,{returnSaved:false}));assert.equal(f.durable.currencies.diamond,balance);assert(owned(f.durable));});
for(const mode of ['before','after'])await check('uncertain_save_'+mode+'_invalidates_session',async()=>{begin('save-'+mode);f.failSave=mode;await assert.rejects(()=>recharge.handleRecharge(f.req,f.ws));assert(f.invalidated);assert(!owned(f.p));assert.equal(owned(f.durable),mode==='after');f.failSave=null;f.p=clone(f.durable);f.invalidated=false;await recharge.handleRecharge(f.req,f.ws);assert(owned(f.durable));assert.equal(f.cashSaves,1);});
await check('push_failure_still_keeps_committed_live_state',async()=>{begin('push');f.failPush=true;await assert.rejects(()=>recharge.handleRecharge(f.req,f.ws),/PUSH_FAIL/);assert(owned(f.p));await recharge.handleRecharge(f.req,f.ws);assert.equal(f.cashSaves,1);});
await check('same_order_concurrent_grants_once',async()=>{begin('duplicate');const r=await Promise.all([recharge.handleRecharge(f.req,f.ws),recharge.handleRecharge(f.req,f.ws)]);assert(r.every(x=>x.success));assert.equal(f.cashSaves,1);});
await check('nested_lock_and_unrelated_roles_do_not_deadlock',async()=>{begin('locks');await mutation.run('outer',()=>mutation.run('outer',async()=>{}));const entered=deferred(),release=deferred();const hold=mutation.run('a',async()=>{entered.resolve();await release.promise;});await entered.promise;let b=false;await mutation.run('b',async()=>{b=true;});assert(b);release.resolve();await hold;});
await check('real_WSServer_wrapper_and_getter_share_role_lock',async()=>{begin('ws');const WSServer=require(path.join(app,'src/net/WSServer'));const ws=Object.create(WSServer.prototype);const session={userId:f.p.userId,player:f.p,wsId:100};ws.clients=new Map([[100,{session}]]);assert.strictEqual(ws.getPlayerForMutation(f.p.userId),f.p);ws._handleSingleMessageUnlocked=async()=>{f.p.roleInfo.stage=45;};const entered=deferred(),release=deferred();const hold=mutation.run(f.p.userId,async()=>{entered.resolve();await release.promise;});await entered.promise;const routed=ws._handleSingleMessage({}, {tag:1801},session);await Promise.resolve();assert.equal(f.p.roleInfo.stage,1);release.resolve();await Promise.all([hold,routed]);assert.equal(f.p.roleInfo.stage,45);});
await check('missing_live_receipt_never_regrants_durable_purchase',async()=>{begin('receipt-mismatch');f.failTx=true;await assert.rejects(()=>recharge.handleRecharge(f.req,f.ws));delete f.p.rechargeInfo.fulfillmentOrders;await assert.rejects(()=>recharge.handleRecharge(f.req,f.ws),/RELOAD_REQUIRED/);assert(f.invalidated);assert.equal(f.cashSaves,1);});
await check('db_deadline_never_releases_inflight_writer',async()=>{begin('deadline');let calls=0,active=0,maximum=0;f.gameHook=async()=>{calls++;active++;maximum=Math.max(maximum,active);if(calls===1)await new Promise(r=>setTimeout(r,550));active--;};const old=ps.savePlayer(f.p.userId,clone(f.p),{returnSaved:false});const cash=recharge.handleRecharge(f.req,f.ws);await Promise.all([old,cash]);assert.equal(maximum,1);assert.equal(calls,2);assert(owned(f.durable));});
await check('latest_session_gets_commit_not_stale_duplicate',async()=>{begin('latest');const WSServer=require(path.join(app,'src/net/WSServer')),ws=Object.create(WSServer.prototype),old=clone(f.p);ws.clients=new Map([[1,{session:{userId:f.p.userId,player:old,wsId:1}}],[2,{session:{userId:f.p.userId,player:f.p,wsId:2}}]]);ws.pushToUser=()=>{};await recharge.handleRecharge(f.req,ws);assert(owned(f.p));assert(!owned(old));});
await check('disconnected_closing_snapshot_receives_cash_commit',async()=>{begin('closing');const WSServer=require(path.join(app,'src/net/WSServer')),ws=Object.create(WSServer.prototype),session={userId:f.p.userId,player:f.p,wsId:8};ws.clients=new Map();ws._closingPlayers=new Map([[8,{session}]]);ws.pushToUser=()=>{};await recharge.handleRecharge(f.req,ws);assert(owned(session.player));await mutation.run(session.userId,()=>ps.savePlayer(session.userId,session.player,{returnSaved:false}));assert(owned(f.durable));});
await check('uncertain_commit_invalidates_closing_snapshot',async()=>{begin('closing-fail');const WSServer=require(path.join(app,'src/net/WSServer')),ws=Object.create(WSServer.prototype),session={userId:f.p.userId,player:f.p,wsId:8};ws.clients=new Map();ws._closingPlayers=new Map([[8,{session}]]);ws.pushToUser=()=>{};f.failSave='after';await assert.rejects(()=>recharge.handleRecharge(f.req,ws));assert.equal(session.player,null);assert(owned(f.durable));});
console.log(JSON.stringify({result:'PASS',cases:results.length,checks:results,realPlayerService:true,realMutationQueue:true,realWSServerWrapper:true,network:false,database:'memory',upstreamPayment:false}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
