"""Read-only entitlement/daily-claim and fishing state of screenshot subject."""
import json,sys
from datetime import datetime,timezone
import paramiko
from release_fishing_gear_20260906 import WB,APP,run,node,hashes,pm2,ready
OUT=WB/'temp/fishing_auto_20260906';OUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 out=node(s,r"""const fs=require('fs'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={now:Date.now(),subjects:{}};for(const db of ['lhs_s1001','lhs_s1002']){const p=await c.db(db).collection('players').findOne({name:/^nicky$/i},{projection:{_id:0,userId:1,level:1,fishInfo:1,'rechargeInfo.monthCards':1,'rechargeInfo.monthCardRecords':1,'currencies.diamond':1,'items.65':1,'items.70':1,'items.68':1,updatedAt:1}});if(!p)continue;const user=p.userId;delete p.userId;out.subjects[db]=p;const f='/root/.pm2/logs/'+(db==='lhs_s1001'?'lhs-s1001':'lhs-s1002')+'-out.log',stat=fs.statSync(f),b=Buffer.alloc(Math.min(stat.size,8*1024*1024)),fd=fs.openSync(f,'r');fs.readSync(fd,b,0,b.length,stat.size-b.length);fs.closeSync(fd);out.subjects[db].claimLog=b.toString('utf8').split(/\r?\n/).filter(x=>x.includes(user)&&/tag[=:]1211/.test(x)).slice(-20).map(x=>x.replaceAll(user,'[subject]'));}await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.name);process.exitCode=1});""")
 out['hashes']=hashes(s,[APP+'/src/handlers/commerce-compat.js',APP+'/src/handlers/fish.js','/linhhoasu/webgame/game/js/main.min_a6195824.js']);out['pm2']=pm2(s);out['ready']=ready(s)
 (OUT/'privilege-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'checkedAt':datetime.now(timezone.utc).isoformat(),'subjects':{db:{'level':p['level'],'fishLevel':p['fishInfo']['level'],'rod':[p['fishInfo']['rodRank'],p['fishInfo']['rodLevel'],p['fishInfo']['rodExp']],'rechargeInfo':p.get('rechargeInfo'),'items':p.get('items'),'claimLog':p['claimLog']}for db,p in out['subjects'].items()},'hashes':out['hashes'],'ready':out['ready']},ensure_ascii=False))
finally:s.close()
