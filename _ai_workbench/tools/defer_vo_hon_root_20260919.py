"""Remove only migration-created, untouched Võ hồn roots while DoubleTower is gated."""
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
(async()=>{const m=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await m.connect();const out={at:new Date().toISOString(),removed:0,conflicts:0,servers:{}};try{for(const sid of [1001,1002,1003,1004]){const c=m.db('lhs_s'+sid).collection('players');const rows=await c.find({'taskInfo.migrationLedger.vo_hon_than_binh_migration_v1':{$exists:true},'taskInfo.tasks.90002.status':10,'taskInfo.tasks.90002.progress':{$in:[0,null]}}).project({_id:1,userId:1}).toArray();let n=0;for(const row of rows){const r=await c.updateOne({_id:row._id,'taskInfo.migrationLedger.vo_hon_than_binh_migration_v1':{$exists:true},'taskInfo.tasks.90002.status':10,'taskInfo.tasks.90002.progress':{$in:[0,null]}},{$unset:{'taskInfo.tasks.90002':''},$pull:{'taskInfo.tasksMap.9':{id:90002,status:10,progress:{$in:[0,null]}}}});if(r.matchedCount===1){n++;out.removed++}else out.conflicts++}out.servers[sid]=n}}finally{await m.close()}console.log(JSON.stringify(out))})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
'''

ssh = connect()
try:
    remote = '/linhhoasu/_ai_workbench/temp/defer_vo_hon_root_20260919.js'
    with ssh.open_sftp() as sftp:
        with sftp.open(remote, 'wb') as handle:
            handle.write(NODE.encode())
    raw = run(ssh, 'node ' + shlex.quote(remote))
    data = json.loads(raw.strip().splitlines()[-1])
    out = WB / 'temp' / 'vo_hon_than_binh_migration_20260919' / 'defer_vo_hon_root.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(data, ensure_ascii=False))
finally:
    ssh.close()
