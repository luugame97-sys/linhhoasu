"""Read-only aggregate inventory counts for catalog boxes, no identities."""
from pathlib import Path
import json,paramiko
from rollback_role_lian_manifest_20260930 import ssh_config
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'_ai_workbench/temp/item_boxes_20261002'
catalog=json.loads((OUT/'catalog.json').read_text(encoding='utf8'))
ids=sorted({str(r['id']) for r in catalog['rows']})
source=r'''
const fs=require('fs'),cp=require('child_process'),{MongoClient}=require('mongodb');
const ids=IDS;
const env=require('dotenv').parse(fs.readFileSync('.env'));
const nodes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s100[1-6]$/.test(p.name));
(async()=>{const reports=[];for(const node of nodes){
 const e={...env,...node.pm2_env,...node.pm2_env.env};const client=new MongoClient(e.MONGO_URI,{serverSelectionTimeoutMS:4000,socketTimeoutMS:13000,maxPoolSize:1});
 try{await client.connect();const db=client.db();if(db.databaseName!=='lhs_s'+node.name.slice(-4))throw Error('DB_SCOPE');
 const rows=await db.collection('players').aggregate([
 {$match:{isBot:{$ne:true},userId:{$not:/^lhs_real_bot_/}}},
 {$project:{items:{$filter:{input:{$objectToArray:{$cond:[{$eq:[{$type:'$items'},'object']},'$items',{}]}},as:'r',cond:{$and:[{$in:['$$r.k',ids]},{$gt:['$$r.v',0]}]}}}}},
 {$unwind:'$items'},{$group:{_id:'$items.k',holders:{$sum:1},count:{$sum:'$items.v'}}},{$sort:{_id:1}}
 ],{maxTimeMS:10000,allowDiskUse:false}).toArray();reports.push({node:node.name,db:db.databaseName,rows:rows.map(r=>({id:Number(r._id),holders:r.holders,count:r.count}))});
 }finally{await client.close();}}
 console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,ids:ids.length,reports}));
})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1});
'''.replace('IDS',json.dumps(ids))
args,kw=ssh_config();c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw)
try:
 i,o,e=c.exec_command('cd /linhhoasu/lhs/newServer && node -',timeout=60);i.write(source);i.channel.shutdown_write();raw=o.read().decode('utf8');err=e.read().decode('utf8');rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError('AUDIT_FAILED:'+err[-400:])
 data=json.loads(raw);(OUT/'inventory.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps(data,ensure_ascii=False,indent=2))
finally:c.close()
