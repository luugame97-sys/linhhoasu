"""Read-only snapshot of active OldTrek records, no player writes."""
import json
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
NODE = r'''const {MongoClient}=require('mongodb');
(async()=>{const out=[];for(const sid of [1001,1002,1003,1004,1005,1006,1007,1008,1009]){const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,maxPoolSize:1});try{await c.connect();const rows=await c.db('lhs_s'+sid).collection('players').find({'other_attr_info.oldTrekInfo.sailInfo.currentEvent':{$exists:true,$ne:null},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{_id:0,uid:1,roleId:1,'other_attr_info.oldTrekInfo':1},maxTimeMS:20000}).limit(30).toArray();for(const p of rows){const i=p.other_attr_info&&p.other_attr_info.oldTrekInfo||{},s=i.sailInfo||{},e=s.currentEvent||{};out.push({serverId:sid,uid:p.uid||p.roleId,event:{id:e.id,eventType:e.eventType,uid:e.uid,result:e.result,pre:e.pre,createdAt:e.createdAt,miniGameLevel:e.miniGameLevel,miniGameType:e.miniGameType,keys:Object.keys(e)},eventLogs:(s.eventLogs||[]).slice(-8).map(x=>({id:x.id,uid:x.uid,result:x.result,pre:x.pre,keys:Object.keys(x)})),ledger:(i.eventLedger||[]).slice(-12).map(x=>({uid:x.uid,operate:x.operate,param:x.param,result:x.result,code:x.code,revision:x.revision})),state:{stage:s.stage,arrive:s.arrive,trekData:s.trekData&&{uid:s.trekData.uid,stage:s.trekData.stage},stateRevision:i.stateRevision}})}}catch(e){out.push({serverId:sid,error:e.name+':'+e.message})}finally{await c.close()}}console.log(JSON.stringify(out));})().catch(e=>{console.error(e.stack);process.exitCode=1});'''
with connect() as client:
    raw = run(client, 'cd /linhhoasu/lhs/newServer && node -', data=NODE)
result = json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith('[')))
out = ROOT / '_ai_workbench/temp/oldtrek_full_audit_20261016/active_20261017.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'records': len(result), 'servers': sorted({x.get('serverId') for x in result if 'serverId' in x}), 'path': str(out)}, ensure_ascii=False))
