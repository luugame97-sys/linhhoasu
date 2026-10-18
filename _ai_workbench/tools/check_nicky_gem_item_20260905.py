"""Read-only diagnosis of the two identically named level-five gem items."""
import json
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1]
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
source=r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const client=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await client.connect();const result=[];
for(const db of ['lhs_s1001','lhs_s1002']){
 const rows=await client.db(db).collection('players').find({name:'nicky',isBot:{$ne:true}},{projection:{_id:0,name:1,level:1,'items.100085':1,'items.100095':1,'items.100094':1}}).toArray();
 result.push({db,players:rows});
}
await client.close();console.log(JSON.stringify({readOnly:true,generatedAt:new Date().toISOString(),result}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
try:result=json.loads(execute(ssh,source).strip().splitlines()[-1])
finally:ssh.close()
(WB/'temp/nicky_gem_item_diagnosis_20260905.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
