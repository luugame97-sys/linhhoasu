"""Confirm audited source/config hashes remain unchanged; no application calls."""
import json,sys
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]).resolve();m=json.loads((OUT/'manifest.json').read_text())
selected=['app/src/handlers/fish.js','app/src/handlers/fish-soul.js','app/src/handlers/playerPayload.js','app/src/services/BattleService.js','server.bin','client.bin','main.js']
paths={k:m['files'][k]['remote']for k in selected}
script="const fs=require('fs'),crypto=require('crypto'),paths="+json.dumps(paths)+";console.log(JSON.stringify(Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))));"
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 i,o,e=s.exec_command('node -',timeout=30);i.write(script);i.channel.shutdown_write();after=json.loads(o.read());assert o.channel.recv_exit_status()==0;assert all(after[k]==m['files'][k]['sha256']for k in selected)
 result={'readOnly':True,'filesUnchanged':len(selected),'hashes':after};(OUT/'postcheck.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'readOnly':True,'filesUnchanged':len(selected)}))
finally:s.close()
