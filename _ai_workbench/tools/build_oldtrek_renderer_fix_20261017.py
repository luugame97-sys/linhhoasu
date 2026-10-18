"""Build a surgical candidate from the current live OldTrek client baseline."""
import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/oldtrek_full_audit_20261016/baseline'
OUT = ROOT / '_ai_workbench/temp/oldtrek_renderer_fix_20261017'
MAIN = BASE / 'js/main.min_drop200.js'
INDEX = BASE / 'index.html'
VERSION = '20261017_oldtrek_renderer_v2'

def replace_once(data: bytes, old: bytes, new: bytes) -> bytes:
    if data.count(old) != 1:
        raise RuntimeError('ANCHOR_COUNT:' + old[:80].decode('ascii', 'replace'))
    return data.replace(old, new)

main = MAIN.read_bytes()
start = main.index(b'S5e.dataChanged=function(){var t=Y.OldTrekModel.getTrekEventLogByUid')
end = main.index(b',t(tY=a5e,"OldTrekEventItem")', start)
method = main[start:end]
patched = method
for old, new in [
    (b'e=e&&0<e.checkValue.length', b'e=!!(e&&Array.isArray(e.checkValue)&&0<e.checkValue.length)'),
    (b'i=null!=this.data.rewards&&0<this.data.rewards.length', b'i=Array.isArray(this.data.rewards)&&0<this.data.rewards.length'),
    (b'Y.Config.OldTrekCommonEventConfig[this.data.id])', b'Y.Config.OldTrekCommonEventConfig[this.data.id]||{})'),
    (b'e.effectRewardsSuccess:e.effectRewardsFailure,o=0;', b'e.effectRewardsSuccess:e.effectRewardsFailure,l=Array.isArray(l)?l:[],o=0;'),
]:
    patched = replace_once(patched, old, new)
if patched.count(b'B.generateTextFlowByLangId(e.eventDesc)') != 2:
    raise RuntimeError('DESCRIPTION_ANCHOR')
patched = patched.replace(b'B.generateTextFlowByLangId(e.eventDesc)', b'(e.eventDesc==null?[]:B.generateTextFlowByLangId(e.eventDesc))')
candidate_main = main[:start] + patched + main[end:]

idx = INDEX.read_bytes()
if b'main.min_drop200.js?v=20261016_server_parity_v1' not in idx:
    raise RuntimeError('INDEX_BASELINE_MARKER')
candidate_index = idx.replace(b'main.min_drop200.js?v=20261016_server_parity_v1', b'main.min_drop200.js?v=' + VERSION.encode(), 1)
for rel, data in [('js/main.min_drop200.js', candidate_main), ('index.html', candidate_index)]:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
manifest = {
    'version': VERSION, 'readOnlySource': str(BASE), 'changedMethod': 'OldTrekEventItem.dataChanged',
    'productionPlayerWrites': 0, 'networkCalls': 0,
    'files': [{'relative': r, 'before': hashlib.sha256((BASE / r).read_bytes()).hexdigest(),
               'candidate': hashlib.sha256((OUT / r).read_bytes()).hexdigest(),
               'bytes': (OUT / r).stat().st_size} for r in ['js/main.min_drop200.js', 'index.html']]
}
(OUT / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
