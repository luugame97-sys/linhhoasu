import json
import shlex
from pathlib import Path
from skin_incident_remote import connect, run

root = Path(__file__).resolve().parents[2]
out = root / '_ai_workbench/temp/event_goal_20261007'
qa = json.loads((out / 'baseline.json').read_text(encoding='utf-8-sig'))['qa']
query = json.dumps(dict(userId=qa['userId'],playerId=qa['playerId'],serverId=1001))
source = r'''(async()=>{
const app='/linhhoasu/lhs/newServer';const cfg=require(app+'/src/services/ConfigService');cfg.loadAllTables();
const {MongoClient}=require(app+'/node_modules/mongodb');const m=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await m.connect();
try{const p=await m.db('lhs_s1001').collection('players').findOne(QUERY,{projection:{_id:0,taskInfo:1,activityInfo:1,other_attr_info:1,items:1,level:1,updatedAt:1}});
const ids=[75001,75002,75003,75004,75005],ti=p.taskInfo||{};
const before={taskInfoArray:Array.isArray(ti),taskInfoKeys:Object.keys(ti),tasksType:typeof ti.tasks,tasksArray:Array.isArray(ti.tasks),taskKeys:Object.keys(ti.tasks||{}).slice(0,8),mapKeys:Object.keys(ti.tasksMap||{}),rawTasks:ids.map(id=>ti.tasks?.[id]||null),markedMap:ti.tasksMap?.[52001|(1<<30)]||null,ledger:p.other_attr_info?.fuluTaskLedger?.[52001],updatedAt:p.updatedAt};
const clone=JSON.parse(JSON.stringify(p));const rows=require(app+'/src/services/Activity52TaskService').taskRows(clone);
const normalized=require(app+'/src/handlers/playerPayload').normalizeTaskInfo(JSON.parse(JSON.stringify(ti)),{},clone);
console.log(JSON.stringify({before,derivedRows:rows,normalizedRows:ids.map(id=>normalized.tasks[id]),dbWrites:0}));
}finally{await m.close();}})().catch(e=>{console.error(e.stack);process.exit(1);});'''.replace('QUERY',query)
with connect() as client:
    result = run(client, 'node -e ' + shlex.quote(source))
    data = json.loads(result.strip().splitlines()[-1])
    target = out / 'fulu/qa/task_storage_audit.json'
    target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(data,ensure_ascii=False))
