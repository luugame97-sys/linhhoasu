"""Read-only S2 login/runtime diagnostics with redacted log output."""
import json,shlex,re,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,health
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];sys.stdout.reconfigure(encoding='utf-8')
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
script=r"""
const cp=require('child_process'),fs=require('fs');
const readFileSyncOriginal=fs.readFileSync;
fs.readFileSync=function(file,encoding){if(typeof file==='string'&&/\.log$/.test(file)){const size=fs.statSync(file).size,b=Buffer.alloc(Math.min(size,256000)),fd=fs.openSync(file,'r');try{fs.readSync(fd,b,0,b.length,Math.max(0,size-b.length));return b.toString('utf8');}finally{fs.closeSync(fd);}}return readFileSyncOriginal.apply(fs,arguments);};
const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const rows=procs.filter(p=>['lhs-s1001','lhs-s1002','lhs-dist','lhs-admin'].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,env:Object.fromEntries(['SERVER_ID','MONGO_URI','IDENTITY_MONGO_DB','WS_PORT','HTTP_PORT','WS_PUBLIC_PATH_1002','WS_PUBLIC_PORT_1002'].map(k=>[k,k==='MONGO_URI'?String(p.pm2_env[k]||'').replace(/\/\/.*@/,'//[REDACTED]@'):p.pm2_env[k]])),logs:['pm_err_log_path','pm_out_log_path'].map(k=>({path:p.pm2_env[k],lines:fs.existsSync(p.pm2_env[k])?fs.readFileSync(p.pm2_env[k],'utf8').split('\n').filter(l=>/error|fail|login|登录|1002|Account/i.test(l)).slice(-25).map(l=>l.replace(/((?:password|token|secret|userToken)[=:]\s*)[^\s,}]+/gi,'$1[REDACTED]')):[]}))}));
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb'),c=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await c.connect();const dbs={};for(const db of ['lhs_s1001','lhs_s1002'])dbs[db]={servers:await c.db(db).collection('gameservers').find({serverId:{$in:[1001,1002]}},{projection:{_id:0,serverId:1,status:1,running:1,openTime:1}}).toArray(),humanPlayers:await c.db(db).collection('players').countDocuments({isBot:{$ne:true}})};await c.close();console.log(JSON.stringify({now:new Date().toISOString(),processes:rows,dbs}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
try:
 result=json.loads(execute(s,script).strip().splitlines()[-1]);result['health']={str(p):health(s,p) for p in [9200,9201]}
 result['listeners']=run(s,"ss -lntp | grep -E ':(81|8080|8083|9200|9201) ' || true")
 for name,remote in [('serverList.js','/linhhoasu/lhs/newServer/src/handlers/serverList.js'),('HTTPServer.js','/linhhoasu/lhs/newServer/src/net/HTTPServer.js')]:
  dest=WB/'temp/s2_login_20260905'/name;dest.parent.mkdir(exist_ok=True);sf=s.open_sftp();sf.get(remote,str(dest));sf.close()
 result['nginxRoutes']=run(s,"nginx -T 2>/dev/null | grep -A 8 -B 2 -E 'location.*ws-s2|location.*gameMsg|location.*api/user|location.*ws ' | head -n 100")
 (WB/'temp/s2_login_20260905/audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
finally:s.close()
