"""Snapshot exact WebGM runtime code/catalog without environment credentials."""
import base64,hashlib,json,sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/webshop_upgrade_20260906';OUT.mkdir(exist_ok=False)
sys.stdout.reconfigure(encoding='utf-8')
script=r"""const fs=require('fs'),path=require('path'),crypto=require('crypto'),root='/linhhoasu/webgame/gm';const files={};function take(p,r){const b=fs.readFileSync(p);files[r]={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),data:b.toString('base64')}};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name),r=path.relative(root,q);if(e.isDirectory()){if(!['vendor','uploads','logs','_ai_workbench','.git'].includes(e.name))walk(q)}else if(e.isFile()&&/\.(php|js|css|svg|json|txt)$/.test(e.name)&&!/(backup|\.bak|\.sql)/i.test(e.name))take(q,r)}}walk(root);console.log(JSON.stringify({generatedAt:new Date().toISOString(),files}));"""
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 i,o,e=s.exec_command('node -',timeout=60);i.write(script);i.channel.shutdown_write();snapshot=json.loads(o.read());assert o.channel.recv_exit_status()==0
 for rel,row in snapshot['files'].items():
  b=base64.b64decode(row.pop('data'));assert hashlib.sha256(b).hexdigest()==row['sha256']
  for name in['baseline','candidate']:
   dest=OUT/name/rel;assert dest.resolve().is_relative_to((OUT/name).resolve());dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
 (OUT/'manifest.json').write_text(json.dumps(snapshot,indent=2)+'\n')
 # Approved SELECT-only helper does not bootstrap sessions or mutate any rows.
 php=(WB/'tools/audit_fashion_channels_web_20260905.php').read_text(encoding='utf-8')
 i,o,e=s.exec_command('php',timeout=60);i.write(php);i.channel.shutdown_write();inventory=json.loads(o.read());assert o.channel.recv_exit_status()==0
 (OUT/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'root':str(OUT),'files':len(snapshot['files']),'paths':[r for r in snapshot['files']if '/item/'not in r],'shopRows':len(inventory['tables']['webshop_items'])}))
finally:s.close()
