"""Read-only audit of the Old Trek / Kết Vân Cung feature state."""
import json
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

NODE = r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const m=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await m.connect();try{const summary={players:0,real:0,withInfo:0,sailing:0,trekData:0,events:0,invalidSailing:0,invalidTrek:0};const examples=[];for(const sid of [1001,1002,1003,1004]){const rows=await m.db('lhs_s'+sid).collection('players').find({'other_attr_info.oldTrekInfo':{$exists:true}},{projection:{userId:1,name:1,level:1,updatedAt:1,other_attr_info:1,items:1,currencies:1}}).toArray();for(const p of rows){summary.players++;const real=!String(p.userId||'').startsWith('lhs_real_bot_');if(real)summary.real++;const i=(p.other_attr_info||{}).oldTrekInfo||{};summary.withInfo++;if(i.sailing)summary.sailing++;const s=i.sailInfo||{};if(s.trekData)summary.trekData++;if(s.currentEvent)summary.events++;const invalidS=!!i.sailing&&!s.trekData;const invalidT=!!s.trekData&&(!Number(s.trekData.id)||!Number(s.trekData.diff));if(invalidS)summary.invalidSailing++;if(invalidT)summary.invalidTrek++;if(real&&examples.length<30&&(invalidS||invalidT||String(p.userId||'').includes('u_Wk_1003_7a09bf_1789278201013')))examples.push({serverId:sid,userId:p.userId,name:p.name,level:p.level,sailing:!!i.sailing,sailInfo:{trekData:s.trekData,currentEvent:s.currentEvent,offlineCache:s.offlineCache},totalDistance:i.totalDistance,taskRecord:i.taskRecord,items:{1:p.items&&p.items['1'],321:p.items&&p.items['321']},currencies:p.currencies});}}console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,productionWrites:0,summary,examples}))}finally{await m.close()}})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});
'''

ssh = connect()
try:
    data = json.loads(run(ssh, 'node -e ' + shlex.quote(NODE)))
finally:
    ssh.close()
out = WB / 'temp' / 'old_trek_audit_20260920.json'
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(data, ensure_ascii=False))
