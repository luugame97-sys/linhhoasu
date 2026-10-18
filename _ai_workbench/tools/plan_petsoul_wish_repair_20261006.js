'use strict';
// READ ONLY. Prints a private plan to its caller; never updates Mongo/Redis.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),{MongoClient}=require('mongodb');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const base=require('dotenv').parse(fs.readFileSync('.env'));
const summary={roles:0,eligible:0,alreadyActive:0,manualReview:0,transactions:0,receiptMatches:0,servers:[]};
const plan={version:1,readOnly:true,at:new Date().toISOString(),marker:'rechargeInfo.petSoulWishRepairV1',summary,roles:[]};
(async()=>{
for(let sid=1001;sid<=1007;sid++){
 const proc=procs.find(p=>p.name==='lhs-s'+sid);if(!proc)throw Error('MISSING_SERVER_'+sid);
 const env={...base,...proc.pm2_env,...proc.pm2_env.env};const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,socketTimeoutMS:10000,maxPoolSize:1});
 await client.connect();try{const db=client.db();
 const rows=await db.collection('players').find({'rechargeInfo.records':{$elemMatch:{id:11000021,count:{$gt:0}}}},{projection:{_id:1,userId:1,playerId:1,serverId:1,rechargeInfo:1,items:1,currencies:1,other_attr_info:1,petSoulInfo:1,updatedAt:1,__v:1}}).maxTimeMS(8000).toArray();
 const result={serverId:sid,roles:rows.length,eligible:0,alreadyActive:0,manualReview:0};
 for(const p of rows){
  const tx=await db.collection('transactions').find({userId:p.userId,productId:{$in:['11000021',11000021]}},{projection:{_id:0,orderId:1,userId:1,playerId:1,productId:1,status:1,amount:1,createdAt:1}}).maxTimeMS(5000).toArray();
  const goodTx=tx.filter(t=>t.status==='success'&&String(t.playerId)===String(p.playerId)&&t.orderId&&Number(t.amount)>0);
  const receipts=Object.entries(p.rechargeInfo?.fulfillmentOrders||{}).filter(([key,r])=>{const t=r?.transactionData;return t&&Number(t.productId)===11000021&&String(t.userId)===String(p.userId)&&String(t.playerId)===String(p.playerId)&&t.orderId&&key===hash(String(t.orderId)).replace(/^$/,'!')&&Number(t.amount)>0;});
  // fulfillmentKey hashes the raw order string, not JSON representation.
  const durable=Object.entries(p.rechargeInfo?.fulfillmentOrders||{}).filter(([key,r])=>{const t=r?.transactionData;return t&&Number(t.productId)===11000021&&String(t.userId)===String(p.userId)&&String(t.playerId)===String(p.playerId)&&t.orderId&&key===crypto.createHash('sha256').update(String(t.orderId)).digest('hex')&&Number(t.amount)>0;});
  const flag=p.rechargeInfo?.privilegeItem?.['44'];const active=flag===-1||Number(flag)>Date.now();
  const status=active?'alreadyActive':goodTx.length||durable.length?'eligible':'manualReview';
  const soul=p.other_attr_info?.petSoulInfo||p.petSoulInfo||{};
  const untarget=JSON.parse(JSON.stringify(p));delete untarget._id;delete untarget.updatedAt;delete untarget.__v;
  if(untarget.rechargeInfo){delete untarget.rechargeInfo.petSoulWishRepairV1;if(untarget.rechargeInfo.privilegeItem)delete untarget.rechargeInfo.privilegeItem['44'];}
  plan.roles.push({serverId:sid,db:db.databaseName,id:String(p._id),userId:p.userId,playerId:p.playerId,status,evidence:{record:p.rechargeInfo.records.find(r=>Number(r.id)===11000021),transactions:tx,successOrderIds:goodTx.map(t=>t.orderId),durableOrderIds:durable.map(([,r])=>r.transactionData.orderId)},preimage:{privilege44:flag??null,privilege44Exists:flag!==undefined,marker:p.rechargeInfo?.petSoulWishRepairV1??null,wishId:soul.wishId||{},wishCount:soul.wishCount||{},updatedAt:p.updatedAt,__v:p.__v},nonTargetFingerprint:hash(untarget),proposed:status==='eligible'?{'rechargeInfo.privilegeItem.44':-1}:null});
  summary.roles++;summary[status]++;result[status]++;summary.transactions+=goodTx.length;summary.receiptMatches+=durable.length;
 }
 summary.servers.push(result);
 }finally{await client.close();}
}
console.log(JSON.stringify(plan));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
