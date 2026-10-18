"""Pinned-host read-only power comparison; sanitized result only."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect,run
WB=Path(__file__).resolve().parents[1]
OUT=WB/'temp/arena_power_20260917'
s=connect()
try:r=json.loads(run(s,'node -',(WB/'tools/audit_arena_power_20260917.js').read_text(encoding='utf-8')))
finally:s.close()
OUT.mkdir(parents=True,exist_ok=True)
(OUT/('post-live.json' if '--post' in sys.argv else 'audit.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for p in r['samples']:p.pop('attrs',None);p.pop('playerId',None);p.pop('dbid',None)
print(json.dumps(r,ensure_ascii=True))
