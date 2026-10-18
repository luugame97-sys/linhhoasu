import json
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
script=r"""
const fs=require('fs'),cp=require('child_process');const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const logs=[];for(const p of procs.filter(p=>['lhs-s1001','lhs-s1002'].includes(p.name))){const f=p.pm2_env.pm_out_log_path,size=fs.statSync(f).size,b=Buffer.alloc(Math.min(size,3000000)),fd=fs.openSync(f,'r');fs.readSync(fd,b,0,b.length,size-b.length);fs.closeSync(fd);logs.push({name:p.name,env:Object.fromEntries(['AUTH_REDIS_PREFIX','REDIS_PREFIX','SERVER_ID','SERVER_NODE_HTTP_MAP'].map(k=>[k,p.pm2_env[k]])),lines:b.toString('utf8').split('\n').filter(l=>/ROLE_NOT_FOUND|handleSDKAuth failed|认证|玩家登录|登录失败|server-node|skip stale role/.test(l)).slice(-25)});}
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb'),c=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await c.connect();const accounts=await c.db('lhs_s1001').collection('accounts').find({accountId:{$in:['vanduc97','vanduc990']}},{projection:{_id:0,accountId:1,roles:1,activeRoleByServer:1,lastSelectedServerId:1}}).toArray();const rows=[];for(const a of accounts){const roles=[];for(const r of a.roles||[]){const inDbs=[];for(const db of ['lhs_s1001','lhs_s1002'])if(await c.db(db).collection('players').findOne({userId:r.userId},{projection:{_id:1}}))inDbs.push(db);roles.push({serverId:r.serverId,userId:r.userId,inDbs});}rows.push({accountId:a.accountId,roles});}await c.close();console.log(JSON.stringify({now:new Date().toISOString(),logs,accounts:rows}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
try:
 out=execute(s,script);(WB/'temp/s2_login_20260905/role_trace.json').write_text(out,encoding='utf-8');print(out)
finally:s.close()
