'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const APP=path.resolve(process.env.LHS_APP_ROOT||path.join(__dirname,'../temp/reward_release_20260905/app'));
process.env.CONFIG_BIN_PATH=process.env.LHS_CONFIG_PATH||path.resolve(__dirname,'../temp/reward_release_20260905/config.bin');
const clone=v=>JSON.parse(JSON.stringify(v));
let durable={userId:'cash-recovery',playerId:'cash-recovery-role',level:99,items:{},currencies:{diamond:0,silver:0,gold:0},roleInfo:{kungfuId:4,stage:1},rechargeInfo:{records:[],periodRecords:{}},shopInfo:{pack:[]},activityInfo:{datas:[]},other_attr_info:{}};
const txs=new Map(),mails=new Map();let saves=0,failTx=true,failMail=false;
function doc(v,save){return Object.assign(clone(v),{markModified(){},toObject(){return clone(this);},async save(){return save(this);}});}
function stub(relative,exports){const file=require.resolve(path.join(APP,relative));require.cache[file]={id:file,filename:file,loaded:true,exports};}
stub('src/db/models/Player',{async findOne(){return doc(durable,async p=>{durable=clone(p);saves++;return p;});}});
stub('src/db/models/Transaction',{async findOne(q){const v=txs.get(q.orderId);return v?doc(v,async p=>{txs.set(p.orderId,clone(p));return p;}):null;},async create(v){if(failTx){failTx=false;throw new Error('TX_FINALIZE_FAIL');}assert(!txs.has(v.orderId));txs.set(v.orderId,clone(v));return doc(v,async p=>p);}});
stub('src/db/models/Mail',{async findOneAndUpdate(q,u){if(failMail){failMail=false;throw new Error('MAIL_FINALIZE_FAIL');}const key=q.userId+':'+q.eventKey;if(!mails.has(key))mails.set(key,{...clone(u.$setOnInsert),_id:'mail-'+mails.size});return mails.get(key);}});
stub('src/services/DistClient',{async callRecharge(){return{success:true};}});
stub('src/services/RechargeConfigService',{normalizeProductId:id=>String(id),async getResolvedRow(){return{enabled:true,amount:6,source:'catalog',attachments:[{id:4,count:2}]};},normalizeRewardItems:r=>r});
const recharge=require(path.join(APP,'src/handlers/recharge'));
(async()=>{
  const req={userId:'cash-recovery',orderId:'order-one',productId:'11027001',amount:6,idempotentSuccess:true,skipDist:true};
  await assert.rejects(()=>recharge.handleRecharge(req),/TX_FINALIZE_FAIL/);
  assert.equal(durable.currencies.diamond,60);assert.equal(txs.size,0);assert.equal(mails.size,1);
  const recovered=await recharge.handleRecharge(req);assert(recovered.success&&recovered.recovered);assert.equal(durable.currencies.diamond,60);assert.equal(saves,1);assert.equal(mails.size,1);
  const duplicate=await recharge.handleRecharge(req);assert(duplicate.duplicate);assert.equal(saves,1);
  failMail=true;
  const req2={...req,orderId:'order-two'};
  await assert.rejects(()=>recharge.handleRecharge(req2),/MAIL_FINALIZE_FAIL/);
  assert.equal(durable.currencies.diamond,120);assert.equal(saves,2);
  const second=await recharge.handleRecharge(req2);assert(second.recovered);assert.equal(durable.currencies.diamond,120);assert.equal(saves,2);assert.equal(mails.size,2);
  console.log(JSON.stringify({result:'PASS',transactionCrashRecovered:true,mailCrashRecovered:true,freshPlayerReadEachRetry:true,playerSaves:saves,orders:txs.size,mails:mails.size,upstreamPayment:false}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
