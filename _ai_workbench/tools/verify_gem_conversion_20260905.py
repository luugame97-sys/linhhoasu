"""Independent post-conversion validation; only reads DB, backups and health."""
import json
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
from deploy_usable_item_fixes_20260905 import health,pm2_state,run
WB=Path(__file__).resolve().parents[1]
e=json.loads((WB/'temp/gem_box_conversion_20260905_085020.json').read_text(encoding='utf-8'))
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
script=r"""
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');const c=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await c.connect();const players=c.db('lhs_s1001').collection('players');
const rows=await players.find({name:'nicky',isBot:{$ne:true}},{projection:{_id:0,name:1,items:1,gemBoxRepairLedger:1}}).toArray();
const backups=fs.readdirSync(BACKUP).filter(n=>n.endsWith('.ejson'));
const manifest=backups.map(n=>({name:n,bytes:fs.statSync(path.join(BACKUP,n)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(BACKUP,n))).digest('hex')}));
console.log(JSON.stringify({generatedAt:new Date().toISOString(),nicky:rows.map(r=>({name:r.name,items:Object.fromEntries(Object.entries(r.items||{}).filter(([id])=>Number(id)>=100081&&Number(id)<=100096)),repair:r.gemBoxRepairLedger?.['gem-placeholder-to-usable-v1-20260905']})),backupManifest:manifest,preimages:backups.filter(n=>n.endsWith('.before.ejson')).length,verifiedFiles:backups.filter(n=>n.endsWith('.verified.ejson')).length}));await c.close();})().catch(e=>{console.error(e.stack);process.exitCode=1;});
""".replace('BACKUP',json.dumps(e['backup']))
try:
 result=json.loads(execute(s,script).strip().splitlines()[-1]);assert result['preimages']==265 and result['verifiedFiles']==265
 assert len(result['nicky'])==1
 n=result['nicky'][0];assert len(n['repair']['moves'])==2
 assert all(str(m['from']) not in n['items'] for m in n['repair']['moves'])
 result['health']=[health(s,9200),health(s,9201)];result['pm2']=pm2_state(s)
 result['ready']={str(port):run(s,f"curl -s --max-time 5 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready") for port in [8080,8083]}
 assert all(v=='200' for v in result['ready'].values())
 assert all(next(p for p in result['pm2'] if p['name']==old['name'])['pid']==old['pid'] for old in e['beforePm2'] if old['name']!='lhs-s1001')
 result['unrelatedProcessPidsUnchanged']=True
 (WB/'temp/gem_conversion_verified_20260905.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in result.items() if k not in ['backupManifest','pm2']},ensure_ascii=True))
finally:s.close()
