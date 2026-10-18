"""Read-only fishing source/config and focused player state snapshot."""
import base64,hashlib,json,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp'/('fishing_audit_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));OUT.mkdir(exist_ok=False)
sys.stdout.reconfigure(encoding='utf-8')
script=r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto'),APP='/linhhoasu/lhs/newServer';const files={};
function take(p,r){const b=fs.readFileSync(p);files[r]={sha256:crypto.createHash('sha256').update(b).digest('hex'),remote:p,data:b.toString('base64')};}
function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else if(/\.(js|json)$/.test(e.name))take(q,'app/'+path.relative(APP,q));}}walk(APP+'/src');
take('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','server.bin');take('/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','client.bin');take('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin','lang.bin');take('/linhhoasu/webgame/game/js/main.min_a6195824.js','main.js');
const{MongoClient}=require(APP+'/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1,serverSelectionTimeoutMS:8000});await c.connect();const dbs={};for(const n of['lhs_s1001','lhs_s1002']){const rows=await c.db(n).collection('players').find({isBot:{$ne:true},fishInfo:{$exists:true}},{projection:{_id:0,userId:1,playerId:1,name:1,level:1,fishInfo:1,'items.65':1,'items.68':1,'items.69':1,updatedAt:1}}).maxTimeMS(15000).toArray();dbs[n]={humansWithFishInfo:rows.length,players:rows.map(p=>({subject:crypto.createHash('sha256').update('fish-audit|'+n+'|'+p.userId).digest('hex').slice(0,16),isScreenshotPlayer:String(p.name||'').toLowerCase()==='nicky',level:p.level,fishInfo:p.fishInfo,items:p.items,updatedAt:p.updatedAt}))};}await c.close();console.log(JSON.stringify({generatedAt:new Date().toISOString(),files,dbs,readOnly:true}));})().catch(e=>{console.error(e.name);process.exitCode=1;});
"""
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 i,o,e=s.exec_command('node -',timeout=60);i.write(script);i.channel.shutdown_write();data=json.loads(o.read());assert o.channel.recv_exit_status()==0
 for rel,row in data['files'].items():
  b=base64.b64decode(row.pop('data'));assert hashlib.sha256(b).hexdigest()==row['sha256'];p=OUT/rel;assert p.resolve().is_relative_to(OUT.resolve());p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
 (OUT/'manifest.json').write_text(json.dumps({k:v for k,v in data.items()if k!='dbs'},indent=2)+'\n');(OUT/'runtime.json').write_text(json.dumps(data['dbs'],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'snapshot':str(OUT),'files':len(data['files']),'generatedAt':data['generatedAt'],'servers':{n:{'humanFishProfiles':d['humansWithFishInfo'],'screenshotPlayerMatches':sum(p['isScreenshotPlayer']for p in d['players'])}for n,d in data['dbs'].items()}}))
finally:s.close()
