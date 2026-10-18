"""Read-only audit runner: pinned SSH, Node via stdin, local evidence only."""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect, run

BASE = Path(__file__).resolve().parents[1]
mode = sys.argv[1] if len(sys.argv) > 1 else 'inventory'
if mode not in ('inventory', 'probe', 'regression'):
    raise SystemExit('Unknown read-only audit mode')
source = (BASE / 'tools' / ('audit_competitions_' + mode + '_20260917.js')).read_text(encoding='utf-8')
if mode == 'regression':
    files = [BASE / 'tools' / name for name in (
        'test_arena_client_v2.js', 'test_arena_read_model.js', 'test_arena_hardening_20260913.js')]
    files.append(BASE.parent / 'linhhoasu/lhs/newServer/scripts/test-arena-settlement.js')
    cases = [{'name': f.name, 'source': f.read_text(encoding='utf-8')} for f in files]
    source = 'const AUDIT_CASES = ' + json.dumps(cases) + ';\n' + source
ssh = connect()
try:
    output = run(ssh, 'cd /linhhoasu/lhs/newServer && node -', source)
finally:
    ssh.close()
data = json.loads(output)
out = BASE / 'temp' / 'competitions_audit_20260917'
out.mkdir(parents=True, exist_ok=True)
(out / (mode + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(data, ensure_ascii=True))
