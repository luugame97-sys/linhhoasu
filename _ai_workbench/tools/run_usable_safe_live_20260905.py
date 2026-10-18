"""Run narrowly scoped QA on S1, preserving S2 opening gate."""
import json, pathlib, shlex, sys
from datetime import datetime, timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run, health, pm2_state

sys.stdout.reconfigure(encoding='utf-8')
root=pathlib.Path(__file__).resolve().parents[1]
creds=(root/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
remote='/linhhoasu/_ai_workbench/temp/qa_usable_safe_'+stamp+'.js'
out=root/'temp'/('usable_safe_live_'+stamp+'.json')
try:
    f=s.open_sftp();f.put(str(root/'tools/qa_usable_item_safe_live_20260905.js'),remote);f.close()
    output=run(s,'cd /linhhoasu/lhs/newServer && node '+shlex.quote(remote),timeout=180)
    payload={'generatedAt':datetime.now(timezone.utc).isoformat(),'output':output,'health':[health(s,9200),health(s,9201)],'pm2':pm2_state(s)}
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'evidence':str(out),**payload},ensure_ascii=False))
finally:
    s.close()
