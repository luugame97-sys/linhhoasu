"""Read-only diagnosis of the new fishing rejection toast; no gameplay RPCs."""
import base64,hashlib,json,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_fishing_integrity_20260906 import WB,APP,FILES,run,node,hashes,ready,pm2
sys.stdout.reconfigure(encoding='utf-8')
OUT=WB/'temp'/('fishing_rejection_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));OUT.mkdir(exist_ok=False)
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
script=r"""
const fs=require('fs'),crypto=require('crypto'),APP='/linhhoasu/lhs/newServer';
const{MongoClient}=require(APP+'/node_modules/mongodb');
const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1,serverSelectionTimeoutMS:8000});
(async()=>{await c.connect();const out={checkedAt:new Date().toISOString(),servers:{},logs:{}};
for(const serverId of [1001,1002]){
 const db=c.db('lhs_s'+serverId),p=await db.collection('players').findOne({name:/^nicky$/i},{projection:{_id:0,userId:1,level:1,fishInfo:1,items:1,updatedAt:1}});
 if(!p){out.servers[serverId]={found:false};continue;}
 const items=Object.fromEntries(Object.entries(p.items||{}).filter(([k])=>[65,68,69,135,338,6013].includes(Number(k))||(Number(k)>=5500&&Number(k)<5600)));
 out.servers[serverId]={found:true,subject:crypto.createHash('sha256').update(p.userId).digest('hex').slice(0,12),level:p.level,fishInfo:p.fishInfo,items,updatedAt:p.updatedAt};
 for(const kind of ['out','error']){
  const file='/root/.pm2/logs/lhs-s'+serverId+'-'+kind+'.log';if(!fs.existsSync(file))continue;
  const st=fs.statSync(file),length=Math.min(st.size,4*1024*1024),buffer=Buffer.alloc(length),fd=fs.openSync(file,'r');fs.readSync(fd,buffer,0,length,st.size-length);fs.closeSync(fd);
  const lines=buffer.toString('utf8').split(/\r?\n/).filter(line=>/tag[=:](4000|4002|4007|4008|4020|4050|4060|4061)|nicky/i.test(line));
  out.logs[serverId+'-'+kind]={bytes:st.size,mtime:st.mtime,lines:lines.slice(-70).map(line=>line.replaceAll(String(p.userId),'[subject]').slice(0,800))};
 }
}
await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.name);process.exitCode=1;});
"""
try:
 result=node(s,script);result['ready']=ready(s);result['pm2']=pm2(s)
 paths=[APP+'/'+rel for rel in FILES]+['/linhhoasu/webgame/game/js/main.min_a6195824.js']
 result['hashes']=hashes(s,paths)
 result['localHashesMatch']=all(result['hashes'][APP+'/'+rel]==hashlib.sha256((WB.parent/'linhhoasu/lhs/newServer'/rel).read_bytes()).hexdigest()for rel in FILES)
 # Include config and backend logs inventory, not configuration values/secrets.
 result['backendLogs']=node(s,"const fs=require('fs');const p='/linhhoasu/lhs/newServer/logs';console.log(JSON.stringify(fs.readdirSync(p).map(n=>({name:n,size:fs.statSync(p+'/'+n).size})).slice(-30)));")
 (OUT/'snapshot.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'output':str(OUT),'result':result},ensure_ascii=False))
finally:s.close()
