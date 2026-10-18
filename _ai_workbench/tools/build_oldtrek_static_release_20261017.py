"""Compose the verified OldTrek renderer and empty-history guard release."""
import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/oldtrek_full_audit_20261016/baseline'
RENDER = ROOT / '_ai_workbench/temp/oldtrek_renderer_fix_20261017'
OUT = ROOT / '_ai_workbench/temp/oldtrek_static_release_20261017'
VERSION = '20261017_oldtrek_renderer_eventview_v1'
old = b'\t\t"js/lhs-oldtrek-minigames-v1.js?v=20260921_v1",\n'
new = old + b'\t\t"js/lhs-oldtrek-eventview-v1.js?v=20261017_eventview_guard_v1",\n'
idx = (RENDER / 'index.html').read_bytes()
if idx.count(old) != 1:
    raise RuntimeError('MINIGAME_MARKER_NOT_UNIQUE')
idx = idx.replace(old, new)
files = {
    'index.html': idx,
    'js/main.min_drop200.js': (RENDER / 'js/main.min_drop200.js').read_bytes(),
    'js/lhs-oldtrek-eventview-v1.js': (ROOT / 'linhhoasu/webgame/game/js/lhs-oldtrek-eventview-v1.js').read_bytes(),
}
for rel, data in files.items():
    p = OUT / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)
report = {'version': VERSION, 'directPlayerWrites': 0, 'restarts': 0,
          'files': [{'relative': r, 'before': hashlib.sha256((BASE / r).read_bytes()).hexdigest() if (BASE / r).exists() else None,
                     'candidate': hashlib.sha256(d).hexdigest(), 'bytes': len(d)} for r, d in files.items()]}
(OUT / 'release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
