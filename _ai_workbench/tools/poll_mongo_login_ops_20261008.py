import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin_incident_remote import connect, run

NODE = r'''
const cp=require('child_process'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const p=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).find(x=>x.name==='lhs-s1001');
const uri=p.pm2_env.MONGO_URI||p.pm2_env.env?.MONGO_URI;
(async()=>{const c=new MongoClient(uri,{serverSelectionTimeoutMS:8000});await c.connect();const d=c.db('admin');
for(let i=0;i<90;i++){const x=await d.command({currentOp:1,localOps:true});const a=(x.inprog||[]).filter(y=>(y.secs_running||0)>=1).map(y=>({opid:y.opid,op:y.op,ns:y.ns,secs:y.secs_running,plan:y.planSummary,waitingForLock:y.waitingForLock,command:y.command&&{find:y.command.find,findAndModify:y.command.findAndModify,update:y.command.update,aggregate:y.command.aggregate,insert:y.command.insert,collection:y.command.collection,filter:y.command.filter,updates:y.command.updates?.length}}));console.log(JSON.stringify({at:new Date().toISOString(),a}));await new Promise(r=>setTimeout(r,500));}await c.close();})().catch(e=>{console.error(e.stack);process.exit(1)});
'''

def main():
    with connect() as ssh:
        print(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', NODE), flush=True)

if __name__ == '__main__':
    main()
