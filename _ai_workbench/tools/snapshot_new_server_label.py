import json,hashlib
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/new_server_label_20260905';OUT.mkdir(exist_ok=True)
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();b=f.file('/linhhoasu/lhs/newServer/src/handlers/serverList.js').read();f.close();(OUT/'serverList.before.js').write_bytes(b)
 out=execute(s,"const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');const c=new MongoClient('mongodb://127.0.0.1:27017');(async()=>{await c.connect();console.log(JSON.stringify(await c.db('lhs_s1001').collection('gameservers').find({},{projection:{_id:0,serverId:1,serverName:1,running:1,status:1,isNew:1,openTime:1}}).toArray()));await c.close()})().catch(e=>{console.error(e.message);process.exitCode=1});")
 data={'hash':hashlib.sha256(b).hexdigest(),'servers':json.loads(out.strip())};(OUT/'snapshot.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(data,ensure_ascii=True))
finally:s.close()
