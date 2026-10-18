import json,sys
import paramiko
from stage_fashion_fix_20260905 import WB,REL
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
code=r"""
const fs=require('fs'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb'),{EJSON}=require('/linhhoasu/lhs/newServer/node_modules/bson');
const file='/linhhoasu/_ai_workbench/backups/fashion_fix_20260905_142733/players/lhs_s1001/30bdd37ac0688b3f2235.before.ejson';
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const col=c.db('lhs_s1001').collection('players'),pre=EJSON.parse(fs.readFileSync(file,'utf8')),now=await col.findOne({_id:pre._id});const result={fields:{},ledger:!!now.fashionOwnershipRepairLedger?.['fashion-body-ownership-v1-20260905']};for(const k of ['items','fashionInfo'])result.fields[k]={canonicalSame:JSON.stringify(canonical(pre[k]))===JSON.stringify(canonical(now[k])),queryMatches:await col.countDocuments({_id:pre._id,[k]:pre[k]}),jsonOrderSame:JSON.stringify(pre[k])===JSON.stringify(now[k])};result.otherChanges=Object.keys(now).filter(k=>!['items','fashionInfo'].includes(k)&&JSON.stringify(canonical(now[k]))!==JSON.stringify(canonical(pre[k])));await c.close();console.log(JSON.stringify(result));})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
try:
 i,o,e=s.exec_command('node -',timeout=30);i.write(code);i.channel.shutdown_write();out=json.loads(o.read());assert o.channel.recv_exit_status()==0;(REL/'repair_conflict_reason.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
finally:s.close()
