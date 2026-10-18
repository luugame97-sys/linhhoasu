"""Read-only deployment health, QA cleanup inventory and scoped recent log check."""
import json,sys
import paramiko
from release_fishing_complete_20260906 import WB,ROOT,APP,run,node,pm2,ready
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 out={'pm2':pm2(s),'ready':ready(s)}
 out['wsProbe']=run(s,"curl --max-time 2 -i -s -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:9200/ || true").split('\r\n\r\n')[0]
 out['wsHealth']={str(p):run(s,f'curl -sS --max-time 3 -w " HTTP%{{http_code}}" http://127.0.0.1:{p}/ready || true').strip() for p in [9200,9201]}
 out['listeners']=run(s,"ss -ltnp | grep -E ':(9200|9201|8080|8083) ' || true")
 out['processes']=run(s,"ps -eo pid,ppid,pcpu,pmem,stat,comm | grep -E 'node|PM2' | tail -n 18")
 out['qa']=node(s,"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const n of ['lhs_s1001','lhs_s1002']){const d=c.db(n);out[n]={qaRows:await d.collection('players').countDocuments({userId:/^qa_fish_complete_/}),fishingConfigKeys:await d.collection('globalconfigs').find({key:/fish|wash/i},{projection:{_id:0,key:1}}).toArray()};}await c.close();console.log(JSON.stringify(out))})().catch(e=>{console.error(e.name);process.exitCode=1});""")
 out['logs']=node(s,r"""const fs=require('fs');const out={};for(const id of [1001,1002]){const f='/root/.pm2/logs/lhs-s'+id+'-out.log';const st=fs.statSync(f),b=Buffer.alloc(Math.min(st.size,400000)),fd=fs.openSync(f,'r');fs.readSync(fd,b,0,b.length,st.size-b.length);fs.closeSync(fd);out[id]=b.toString('utf8').split(/\r?\n/).filter(x=>/qa_fish_complete|TypeError|FISH_|RangeError|timed out|handshake|连接断开/i.test(x)).slice(-20);}console.log(JSON.stringify(out));""")
 (ROOT/'runtime-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
finally:s.close()
