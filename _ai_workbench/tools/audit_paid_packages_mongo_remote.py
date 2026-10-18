"""Read-only aggregate of production paid-package state; no account identifiers."""
from __future__ import annotations

import base64
import getpass
import json
import paramiko

HOST = "103.116.105.154"
NODE = r'''
const fs=require('fs'), path=require('path');
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Transaction=require('/linhhoasu/lhs/newServer/src/db/models/Transaction');
const Mail=require('/linhhoasu/lhs/newServer/src/db/models/Mail');
const RechargeProductConfig=require('/linhhoasu/lhs/newServer/src/db/models/RechargeProductConfig');
const Config=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const pay=Config.get('PayConfig')||{}, shop=Config.get('ShopConfig')||{};
const payIds=Object.keys(pay).map(Number).filter(Number.isFinite);
const linkedShopIds=new Set(Object.values(shop).filter(r=>r&&typeof r==='object').map(r=>Number(r.payId||r.payid||r.rechargeId||0)).filter(x=>x>0));
const targetPayIds=[...new Set(payIds.filter(x=>linkedShopIds.has(x)))];
function safe(fn, fallback){try{return fn()}catch(e){return fallback}}
function rewards(v){return Array.isArray(v)?v.map(r=>({id:Number(r&&r.id)||0,count:Number(r&&r.count)||0})).filter(r=>r.id>0&&r.count>0):[]}
(async()=>{
  const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});
  const custom=await RechargeProductConfig.find({}).select({productId:1,amount:1,diamond:1,firstBonus:1,attachments:1,enabled:1}).lean();
  const customSafe=custom.map(r=>({productId:String(r.productId||''),amount:Number(r.amount)||0,diamond:Number(r.diamond)||0,firstBonus:Number(r.firstBonus)||0,attachmentCount:rewards(r.attachments).length,attachmentIds:rewards(r.attachments).map(x=>x.id),enabled:r.enabled!==false}));
  const txAgg=await Transaction.aggregate([{$group:{_id:{productId:'$productId',status:'$status',channel:'$channel'},count:{$sum:1},amountSum:{$sum:{$convert:{input:'$amount',to:'double',onError:0,onNull:0}}},diamondSum:{$sum:{$convert:{input:'$diamond',to:'double',onError:0,onNull:0}}}}},{$sort:{'_id.productId':1,'_id.status':1}}]);
  const recAgg=await Player.aggregate([{$unwind:{path:'$rechargeInfo.records',preserveNullAndEmptyArrays:false}},{$match:{'rechargeInfo.records.id':{$in:targetPayIds}}},{$group:{_id:'$rechargeInfo.records.id',players:{$sum:1},countSum:{$sum:{$convert:{input:'$rechargeInfo.records.count',to:'double',onError:0,onNull:0}}},maxCount:{$max:{$convert:{input:'$rechargeInfo.records.count',to:'double',onError:0,onNull:0}}}}},{$sort:{_id:1}}]);
  const playerCount=await Player.estimatedDocumentCount();
  const activity9=await Player.aggregate([{$unwind:'$activityInfo.datas'},{$match:{'activityInfo.datas.id':{$gte:9001,$lte:9952}}},{$group:{_id:'$activityInfo.datas.id',players:{$sum:1},recordListPlayers:{$sum:{$cond:[{$gt:[{$size:{$ifNull:['$activityInfo.datas.recordList',[]]}},0]},1,0]}},recordListSizes:{$addToSet:{$size:{$ifNull:['$activityInfo.datas.recordList',[]]}}}}},{$sort:{_id:1}}]);
  const month=await Player.aggregate([{$project:{cards:{$objectToArray:{$ifNull:['$rechargeInfo.monthCards',{}]}},records:{$objectToArray:{$ifNull:['$rechargeInfo.monthCardRecords',{}]}}}},{$unwind:{path:'$cards',preserveNullAndEmptyArrays:false}},{$match:{'cards.k':{$in:['11000001','11000002','11000007','11000009','11000012']}}},{$group:{_id:'$cards.k',players:{$sum:1},minEnd:{$min:'$cards.v'},maxEnd:{$max:'$cards.v'}}},{$sort:{_id:1}}]);
  const mailAgg=await Mail.aggregate([{$match:{$or:[{eventKey:{$regex:/recharge|pay|purchase/i}},{title:{$regex:/充值|recharge|nạp|donate/i}},{content:{$regex:/充值|recharge|nạp|donate/i}}]}},{$group:{_id:{claimed:'$claimed'},count:{$sum:1}}}]);
  const dbStats={playerCount,customProductCount:customSafe.length,customEnabled:customSafe.filter(r=>r.enabled).length,customWithDiamond:customSafe.filter(r=>r.diamond>0).length,customWithAttachments:customSafe.filter(r=>r.attachmentCount>0).length};
  console.log(JSON.stringify({dbStats,customProducts:customSafe,transactionAggregate:txAgg,rechargeRecordsAggregate:recAgg,activity9,monthCards:month,paidPayIdCount:targetPayIds.length,paidPayIds:targetPayIds,mailAggregate:mailAgg},null,2));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
'''

def main() -> None:
    encoded = base64.b64encode(NODE.encode()).decode()
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        cmd = f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\""
        _, out, err = ssh.exec_command(cmd, timeout=180)
        stdout = out.read().decode('utf-8','replace'); stderr = err.read().decode('utf-8','replace')
    finally:
        ssh.close()
    print(stdout, end='')
    if stderr: print('STDERR='+stderr, end='')

if __name__ == '__main__': main()
