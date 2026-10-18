"""Snapshot source and diagnose gem placeholders without mutating players."""
import json,hashlib
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/gem_source_fix_20260905';OUT.mkdir(exist_ok=True)
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 files={};sftp=ssh.open_sftp()
 for f in ['src/handlers/task.js','src/handlers/raid.js','src/services/PlayerGrantService.js','src/net/HTTPServer.js']:
  data=sftp.file('/linhhoasu/lhs/newServer/'+f).read();dest=OUT/f;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);files[f]=hashlib.sha256(data).hexdigest()
 sftp.close()
 source=r"""
process.env.NODE_ENV='audit';process.env.LOG_DIR='';
const APP='/linhhoasu/lhs/newServer',c=require(APP+'/src/services/ConfigService');
const tables=c.loadAllTables(),ids=[100091,100092,100093,100094,100095,100096],refs=[];
function walk(v,p,d){if(!v||typeof v!=='object'||d>12)return;if(ids.includes(v.id)&&v.count>0)refs.push({path:p,id:v.id,count:v.count});for(const [k,x]of Object.entries(v))walk(x,p+'.'+k,d+1);}
for(const [k,v]of Object.entries(tables))if(!['AssetsConfig','LanguageConfig'].includes(k))walk(v,k,0);
const {MongoClient}=require(APP+'/node_modules/mongodb'),client=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await client.connect();const databases={};for(const dbName of ['lhs_s1001','lhs_s1002']){
const db=client.db(dbName),players=await db.collection('players').find({isBot:{$ne:true}},{projection:{name:1,items:1,'taskInfo.tasks.10083':1,'shopInfo.buyRecords':1}}).toArray();
const counts={};let affected=0,nicky=[];for(const p of players){const held=ids.filter(id=>Number(p.items?.[id])>0).map(id=>({id,count:p.items[id]}));if(held.length)affected++;for(const x of held)counts[x.id]=(counts[x.id]||0)+x.count;if(p.name==='nicky')nicky.push({items:held,task10083:p.taskInfo?.tasks?.[10083],gemShopRecords:Object.fromEntries(Object.entries(p.shopInfo?.buyRecords||{}).filter(([k])=>Number(k)>=10000001&&Number(k)<=10000006))});}
databases[dbName]={affectedHumans:affected,counts,nicky};}
await client.close();console.log('GEM_SOURCES='+JSON.stringify({generatedAt:new Date().toISOString(),refs,databases}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
 output=execute(ssh,source);result=json.loads(output.split('GEM_SOURCES=',1)[1].splitlines()[0]);result['sourceHashes']=files
 (OUT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=True))
finally:ssh.close()
