"""Read only all claim owners, compact player state and matching gameplay receipts."""
import json
from snapshot_web_multiserver_20260906 import connect,run
from snapshot_donate_revision_20260907 import ROOT
sql=json.loads((ROOT/'sql-before.json').read_text(encoding='utf-8'))
targets={str(s):sorted(set(c['account_name']for c in sql['claims']if int(c['server_id'])==s))for s in [1001,1002]}
script="const targets="+json.dumps(targets)+r''';const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();try{const out={};for(const[s,accounts]of Object.entries(targets)){const db=c.db('lhs_s'+s);out[s]={players:await db.collection('players').find({accountId:{$in:accounts},isBot:{$ne:true}},{projection:{userId:1,playerId:1,accountId:1,name:1,serverId:1,roleInfo:1,mailClaimLedger:1,moderation:1,'items.4':1,'items.5':1,'items.65':1,createdAt:1}}).toArray()};}console.log(JSON.stringify(out));}finally{await c.close()}})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1;});'''
ssh=connect()
try:
 result=json.loads(run(ssh,'node -',script));(ROOT/'players-expanded.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:{'accounts':len(targets[k]),'roles':len(v['players']),'skillRange':[min((p.get('items',{}).get('5',0)for p in v['players']),default=0),max((p.get('items',{}).get('5',0)for p in v['players']),default=0)]}for k,v in result.items()}))
finally:ssh.close()
