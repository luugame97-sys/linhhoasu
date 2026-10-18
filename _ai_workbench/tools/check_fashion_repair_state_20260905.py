import json,sys,shlex
from pathlib import Path
import paramiko
from stage_fashion_fix_20260905 import run,pm2,WB,REL,APP
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
    code="""const fs=require('fs'),path=require('path');const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const n of ['lhs_s1001','lhs_s1002'])out[n]=await c.db(n).collection('players').countDocuments({'fashionOwnershipRepairLedger.fashion-body-ownership-v1-20260905':{$exists:true}});await c.close();const d='/linhhoasu/_ai_workbench/backups/fashion_fix_20260905_142733/players';const files=[];function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else files.push(q);}}walk(d);console.log(JSON.stringify({ledgerCounts:out,backupFiles:files.map(p=>path.basename(p))}));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
    i,o,e=s.exec_command('node -',timeout=30);i.write(code);i.channel.shutdown_write();data=json.loads(o.read());assert o.channel.recv_exit_status()==0
    data['pm2']=pm2(s);data['ready']={p:run(s,f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{p}/ready')for p in[8080,8083]}
    (REL/'repair_failure_audit.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps(data))
finally:s.close()
