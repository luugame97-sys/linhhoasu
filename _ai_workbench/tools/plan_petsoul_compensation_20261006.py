"""Read-only plan for the Khế ước Thú Hồn privilege repair.

Eligibility is based on the durable player recharge record for pay ID 11000021
and absence of privilege 44. No writes happen in this tool.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin_incident_remote import connect, run

OUT = Path(__file__).resolve().parents[1] / 'temp/petsoul_fix_20261006'
OUT.mkdir(parents=True, exist_ok=True)
JS = r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000,maxPoolSize:3});await c.connect();try{
 const names=(await c.db().admin().listDatabases()).databases.map(x=>x.name).filter(n=>/^lhs_s\d+$/.test(n));
 const out=[],preflight=[];
 for(const dbName of names){const col=c.db(dbName).collection('players');
  const rows=await col.find({'rechargeInfo.records':{$elemMatch:{id:11000021,count:{$gt:0}}}},{projection:{_id:1,userId:1,playerId:1,name:1,isBot:1,'rechargeInfo.records':1,'rechargeInfo.privilegeItem':1,'rechargeInfo.fulfillmentOrders':1,'rechargeInfo.petSoulWishRepairV1':1,'items.287':1,'other_attr_info.petSoulInfo.wishId':1,'other_attr_info.petSoulInfo.wishCount':1,updatedAt:1}}).limit(10000).toArray();
  preflight.push({db:dbName,count:rows.length});
  rows.forEach(p=>{const rec=(p.rechargeInfo?.records||[]).find(r=>Number(r.id)===11000021&&Number(r.count)>0),priv=p.rechargeInfo?.privilegeItem?.['44'];
   out.push({db:dbName,_id:String(p._id),userId:p.userId,playerId:p.playerId,name:p.name,isBot:!!p.isBot,record:rec||null,privilege44:priv??null,hasFulfillmentOrders:Object.keys(p.rechargeInfo?.fulfillmentOrders||{}).length>0,marker:p.rechargeInfo?.petSoulWishRepairV1||null,item287:Number(p.items?.[287]||0),wishId:p.other_attr_info?.petSoulInfo?.wishId||{},wishCount:p.other_attr_info?.petSoulInfo?.wishCount||{},updatedAt:p.updatedAt});
  });
 }
 console.log(JSON.stringify({at:new Date().toISOString(),preflight,rows:out,productionWrites:0}));
}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
'''
with connect() as client:
    result = json.loads(run(client, 'node -', JS))
path = OUT / 'compensation_plan.json'
path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
eligible = [r for r in result['rows'] if r['privilege44'] is None and not r['marker']]
print(json.dumps({'at': result['at'], 'preflight': result['preflight'], 'matched': len(result['rows']), 'eligible': len(eligible), 'productionWrites': 0}, ensure_ascii=False))
