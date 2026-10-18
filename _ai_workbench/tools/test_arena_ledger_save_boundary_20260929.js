'use strict';
const assert=require('assert/strict'),path=require('path');
const app=process.env.COMPETITION_APP||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
let networkAttempts=0;const deny=()=>{networkAttempts++;throw Error('NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
const log=require.resolve(app+'/src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{warn(){},info(){},error(){},debug(){}}};
const service=require(app+'/src/services/PlayerService'),Player=require(app+'/src/db/models/Player'),arena=require(app+'/src/handlers/arena');
let writes=0,mode='ok',last;
function capture(filter,update){writes++;last=update.$set;assert(last.arenaReceiptLedger.every(e=>!Object.hasOwn(e.targetScore,'document')));if(mode==='fail')throw Error('TEST_SAVE_FAIL');return mode==='stale'?null:last;}
Player.collection.updateOne=async(f,u)=>({matchedCount:capture(f,u)?1:0});
Player.findOneAndUpdate=async(f,u)=>capture(f,u);
const sample=()=>({userId:'offline-only',level:10,arenaScore:1000,arenaScoreReceipts:[{id:'fight',delta:-10}],arenaReceiptLedger:[{id:'old',fightId:'fight',scorechange:10,rewards:[{id:1,count:2}],createdAt:1,targetScore:{status:'pending',targetPlayerId:'defender',scoreAfter:990,document:{deep:{arenaReceiptLedger:[{targetScore:{document:{huge:'x'.repeat(300000)}}}]}}}}]});
const semantic=p=>{const c=JSON.parse(JSON.stringify(p));for(const e of c.arenaReceiptLedger)delete e.targetScore.document;return c;};
(async()=>{
 let checks=0;
 for(const opts of [{},{returnSaved:false},{returnSaved:false,snapshotProvided:true}]){const p=sample(),before=semantic(p);await service.savePlayer(p.userId,p,opts);assert.deepEqual(p,before);assert.deepEqual(last.arenaReceiptLedger,before.arenaReceiptLedger);checks++;}
 const deferred=sample(),before=semantic(deferred);await service.savePlayerDeferred(deferred.userId,deferred);await service.drainPendingSaves(deferred.userId);assert.deepEqual(deferred,before);checks++;
 mode='fail';await assert.rejects(service.savePlayer('offline-only',sample(),{returnSaved:false}),/TEST_SAVE_FAIL/);checks++;
 mode='stale';assert.equal(await service.savePlayer('offline-only',sample(),{returnSaved:false}),null);checks++;
 const p=sample(),meta=semantic(p);assert(service.sanitizeArenaReceiptLedger(p));assert(!service.sanitizeArenaReceiptLedger(p));assert.deepEqual(p,meta);checks++;
 for(const v of [null,undefined,{}, {arenaReceiptLedger:null},{arenaReceiptLedger:[null,4,{}]}])assert.equal(service.sanitizeArenaReceiptLedger(v),false);checks++;
 const duplicate=sample();arena.rememberArenaLedger(duplicate,{id:'old',createdAt:1,extra:'preserved'});assert.equal(duplicate.arenaReceiptLedger.length,1);assert.equal(duplicate.arenaReceiptLedger[0].targetScore.document,undefined);assert.equal(duplicate.arenaReceiptLedger[0].fightId,'fight');checks++;
 const nested=sample();arena.sanitizeArenaLedgerList(nested.arenaReceiptLedger);assert.deepEqual(nested,semantic(sample()));checks++;
 assert.equal(networkAttempts,0);console.log(JSON.stringify({result:'PASS',checks,mockWrites:writes,productionWrites:0,networkAttempts}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
