"""Run the scoped read-only power synchronization audit on the verified VPS."""
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect, run

base = Path(__file__).resolve().parents[1]
source = Path(__file__).with_suffix('.js').read_text(encoding='utf-8')
ssh = connect()
try:
    data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', source))
finally:
    ssh.close()
out = base / 'temp' / 'power_sync_audit_20260926'
out.mkdir(parents=True, exist_ok=True)
(out / 'audit.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
summary = {
    'evidence': str(out / 'audit.json'),
    'at': data.get('at'),
    'productionWrites': data.get('productionWrites'),
    'servers': [{'serverId': s['serverId'], 'realPlayers': s['realPlayers'],
                 'rankedSamples': len(s['rankedSamples'])} for s in data.get('servers', [])],
    'cross': {k: data.get('cross', {}).get(k) for k in ['currentCycle', 'entries', 'comparable', 'stale', 'missingPlayer']},
}
print(json.dumps(summary, ensure_ascii=False))
