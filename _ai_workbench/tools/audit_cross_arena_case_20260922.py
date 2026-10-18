"""Run scoped read-only CrossArena diagnostics via verified SSH; save evidence locally."""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

base = Path(__file__).resolve().parents[1]
source = Path(__file__).with_suffix('.js').read_text(encoding='utf-8')
ssh = connect()
try:
    data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node', source))
finally:
    ssh.close()
dest = base / 'temp' / 'combat_parity_20260922' / 'cross_arena_case.json'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'evidence':str(dest),'at':data['at'],'players':[{k:p[k] for k in ['name','serverId','level','power','dbUnchanged']} for p in data['players']], 'entries':len(data['entries']), 'fights':len(data['fights'])},ensure_ascii=True))
