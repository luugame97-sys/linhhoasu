import json
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 out=execute(s,"const fs=require('fs'),p='/linhhoasu/lhs/LHS-file/src/data/player_template.json';let result={exists:fs.existsSync(p)};if(result.exists){const x=JSON.parse(fs.readFileSync(p,'utf8'));result.gemItems=Object.fromEntries(Object.entries(x.items||{}).filter(([id])=>Number(id)>=100091&&Number(id)<=100096));}console.log(JSON.stringify(result));")
 f=s.open_sftp();b=f.file('/linhhoasu/lhs/newServer/src/services/PlayerService.js').read();f.close();(WB/'temp/gem_source_fix_20260905/src/services/PlayerService.js').write_bytes(b)
 (WB/'temp/gem_source_fix_20260905/template_check.json').write_text(out,encoding='utf-8');print(out)
finally:s.close()
