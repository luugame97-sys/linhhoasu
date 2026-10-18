"""Read-only audit of Arena/CrossArena winner/loser score persistence."""
import json
import sys
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
BASE = Path(__file__).resolve().parents[1]
source = Path(__file__).with_suffix('.js').read_text(encoding='utf-8')
ssh = connect()
try:
    raw = run(ssh, "cd /linhhoasu/lhs/newServer && node", source)
finally:
    ssh.close()
data = json.loads(raw)
out = BASE / 'temp' / 'pvp_score_flow_20260927'
out.mkdir(parents=True, exist_ok=True)
(out / 'audit.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
summary = json.dumps({'evidence': str(out / 'audit.json'), 'at': data['at'], 'nodes': data['nodes'], 'arena': data['arena']['summary'], 'crossArena': data['crossArena']['summary']}, ensure_ascii=False)
sys.stdout.buffer.write((summary + '\n').encode('utf-8'))
