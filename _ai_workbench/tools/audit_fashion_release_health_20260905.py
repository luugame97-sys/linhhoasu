import json,sys
from datetime import datetime,timezone
import paramiko
from stage_fashion_fix_20260905 import run,pm2,WB,REL,APP
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
out={'generatedAt':datetime.now(timezone.utc).isoformat()}
try:
 out['pm2']=pm2(s);out['ready']={p:run(s,f'curl -s --max-time 3 -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{p}/ready')for p in[8080,8083]}
 out['health']={}
 for port in[9200,9201]:
  h=json.loads(run(s,f'curl -fsS --max-time 5 http://127.0.0.1:{port}/health'));r=h.get('runtime',{});b=r.get('bots',{});m=r.get('mapMonsters',{})
  out['health'][port]={'status':h.get('status'),'realBots':b.get('real',{}).get('count'),'virtualBots':b.get('botCount'),'slots':m.get('totalSlots'),'multiplier':m.get('densityMultiplier'),'invalid':m.get('invalid')}
 stage=json.loads((REL/'stage.json').read_text());out['hashes']={r:run(s,f'sha256sum {APP}/{r}').split()[0]for r in stage['files']};assert out['hashes']==stage['candidateHashes']
 code=r"""const fs=require('fs'),path=require('path'),crypto=require('crypto');const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const n of ['lhs_s1001','lhs_s1002']){const p=await c.db(n).collection('players').find({isBot:{$ne:true},$or:[{'items.29001':{$gt:0}},{'items.11274':{$gt:0}}]},{projection:{items:1,fashionInfo:1,fashionOwnershipRepairLedger:1}}).toArray();out[n]={rows:p.length,remainingBodyItems:p.reduce((s,r)=>s+(r.items[29001]||0)+(r.items[11274]||0),0),unowned:p.filter(r=>[29001,11274].some(id=>r.items[id]>0&&!(r.fashionInfo?.activateFashion||[]).includes(id)&&!(r.fashionInfo?.fashions?.[id]>0))).length};}await c.close();const roots=['/linhhoasu/_ai_workbench/backups/fashion_fix_20260905_142733/players','/linhhoasu/_ai_workbench/backups/fashion_repair_resume_20260905_143005'];let pre=0,post=0;const hashes={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else if(e.name.endsWith('.ejson')){if(e.name.endsWith('.before.ejson'))pre++;if(e.name.endsWith('.after.ejson'))post++;hashes[q]=crypto.createHash('sha256').update(fs.readFileSync(q)).digest('hex');}}}roots.forEach(walk);console.log(JSON.stringify({inventory:out,preimages:pre,postimages:post,backupHashes:hashes}));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
 i,o,e=s.exec_command('node -',timeout=30);i.write(code);i.channel.shutdown_write();out['repairAudit']=json.loads(o.read());assert o.channel.recv_exit_status()==0
 assert all(d['unowned']==0 for d in out['repairAudit']['inventory'].values());assert out['repairAudit']['postimages']==48
 out['passed']=True
finally:(REL/'health_final.json').write_text(json.dumps(out,indent=2)+'\n');s.close()
print(json.dumps({'passed':out['passed'],'ready':out['ready'],'health':out['health'],'repairInventory':out['repairAudit']['inventory'],'preimages':out['repairAudit']['preimages'],'postimages':out['repairAudit']['postimages'],'hashesVerified':7}))
