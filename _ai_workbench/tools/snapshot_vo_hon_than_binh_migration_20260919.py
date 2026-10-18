"""Read-only complete state projection for side-task migration planning."""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

NODE = r'''
'use strict';
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await mongo.connect();try{
 const projection={_id:1,userId:1,playerId:1,accountId:1,serverId:1,name:1,level:1,updatedAt:1,stateVersion:1,isBot:1,bot:1,isQA:1,isTest:1,tags:1,
   systemUnlockInfo:1,taskInfo:1,sideTasks:1,type9Map:1,sideTaskReceipts:1,progressReceipts:1};
 const out=[];for(const sid of [1001,1002,1003,1004]){
   const rows=await mongo.db('lhs_s'+sid).collection('players').find({}, {projection,maxTimeMS:30000}).toArray();
   rows.forEach(p=>{p.serverId=p.serverId||sid;p._id=String(p._id);if(p.updatedAt instanceof Date)p.updatedAt=p.updatedAt.toISOString();out.push(p)});
 }
 console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,productionWrites:0,players:out}));
}finally{await mongo.close()}})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
'''

ssh = connect()
try:
    data = json.loads(run(ssh, 'node -', NODE))
finally:
    ssh.close()
out = WB / 'temp' / 'vo_hon_than_binh_migration_20260919'
out.mkdir(parents=True, exist_ok=True)
path = out / 'players.json'
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'at': data['at'], 'players': len(data['players']), 'output': str(path), 'productionWrites': 0}, ensure_ascii=False))
