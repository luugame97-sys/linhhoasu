import json, shlex
from pathlib import Path
from skin_incident_remote import connect, run
root=Path(__file__).resolve().parents[2]
folder=root/'_ai_workbench/temp/event_goal_20261007'
qa=json.loads((folder/'baseline.json').read_text(encoding='utf-8-sig'))['qa']
source=r'''(async()=>{const app='/linhhoasu/lhs/newServer',c=require(app+'/src/services/ConfigService'),tables=c.loadAllTables();
const matches=[];const walk=(v,p)=>{if(!v||typeof v!=='object')return;if(Number(v.id)===233&&Number(v.count)>0)matches.push({path:p,row:v});if(p.split('.').length>9)return;for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')walk(x,p+'.'+k);};
for(const [name,data]of Object.entries(tables))if(/Reward|Shop|Gift|Use|Recharge|Login/.test(name))walk(data,name);
const {MongoClient}=require(app+'/node_modules/mongodb'),dbClient=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await dbClient.connect();
try{const db=dbClient.db('lhs_s1001');const p=await db.collection('players').findOne(QUERY,{projection:{_id:0,items:1,mail:1,shopInfo:1,rechargeInfo:1,itemUseRecords:1,activityInfo:1,other_attr_info:1,updatedAt:1}});
const ledgerKeys=Object.keys(p.other_attr_info||{}).filter(k=>/mail|gift|recharge|reward|receipt|fulu|shop/i.test(k));
const ledgers=Object.fromEntries(ledgerKeys.map(k=>[k,p.other_attr_info[k]]));
const receipts=(p.other_attr_info?.featureReceipts?.rows||[]).filter(r=>r.time>=1791364380000).map(r=>({key:r.key,time:r.time,data:r.data}));
const q=QUERY;const audit=await db.collection('adminactionlogs').find({targetUserId:q.userId,createdAt:{$gte:new Date('2026-10-07T08:50:00Z'),$lte:new Date('2026-10-07T10:00:00Z')}},{projection:{_id:0,action:1,result:1,reason:1,detail:1,createdAt:1}}).limit(50).toArray();
const mails=await db.collection('mails').find({userId:q.userId,'attachments.id':233},{projection:{_id:0,title:1,attachments:1,claimed:1,createdAt:1,updatedAt:1,eventKey:1}}).sort({updatedAt:-1}).limit(10).toArray();
const transactions=await db.collection('transactions').find({userId:q.userId,createdAt:{$gte:new Date('2026-10-07T08:50:00Z'),$lte:new Date('2026-10-07T10:00:00Z')}},{projection:{_id:0,productId:1,amount:1,status:1,channel:1,createdAt:1,extra:1}}).limit(20).toArray();
console.log(JSON.stringify({at:new Date().toISOString(),item233:p.items?.[233]||0,updatedAt:p.updatedAt,matches,audit,mails,transactions,collections:(await db.listCollections({}, {nameOnly:true}).toArray()).map(x=>x.name).filter(x=>/mail|pay|recharge|log|audit/i.test(x)),shopInfo:p.shopInfo,rechargeInfo:p.rechargeInfo,itemUseRecords:p.itemUseRecords,mail:p.mail,ledgerKeys,receipts}));}finally{await dbClient.close();}})().catch(e=>{console.error(e.stack);process.exit(1);});'''.replace('QUERY',json.dumps({'userId':qa['userId'],'playerId':qa['playerId'],'serverId':1001}))
with connect() as client:
    output=run(client,'node -e '+shlex.quote(source))
    data=json.loads(output.strip().splitlines()[-1])
    (folder/'fulu/qa/item233_audit.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:data.get(k) for k in ['at','item233','updatedAt','audit','mails','transactions']},ensure_ascii=False))
