"""Patch only the live OldTrek event renderer and its main-bundle cache key."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_renderer_fix_20261008'
MARKER = '20261008_oldtrek_renderer_v1'


def replace_once(data, old, new):
    if data.count(old) != 1:
        raise RuntimeError('ANCHOR_COUNT:' + repr(old[:100]))
    return data.replace(old, new)


def main():
    manifest = json.loads((OUT / 'baseline.json').read_text(encoding='utf-8'))
    rel = 'webgame/game/js/main.min_drop200.js'
    original = (OUT / 'before' / rel).read_bytes()
    start = original.index(b'S5e.dataChanged=function(){var t=Y.OldTrekModel.getTrekEventLogByUid')
    end = original.index(b',t(tY=a5e,"OldTrekEventItem")', start)
    renderer = original[start:end]
    patched = renderer
    for old, new in [
        (b'e=e&&0<e.checkValue.length', b'e=!!(e&&Array.isArray(e.checkValue)&&0<e.checkValue.length)'),
        (b'i=null!=this.data.rewards&&0<this.data.rewards.length', b'i=Array.isArray(this.data.rewards)&&0<this.data.rewards.length'),
        (b'Y.Config.OldTrekCommonEventConfig[this.data.id])', b'Y.Config.OldTrekCommonEventConfig[this.data.id]||{})'),
        (b'e.effectRewardsSuccess:e.effectRewardsFailure,o=0;', b'e.effectRewardsSuccess:e.effectRewardsFailure,l=Array.isArray(l)?l:[],o=0;'),
    ]:
        patched = replace_once(patched, old, new)
    old = b'B.generateTextFlowByLangId(e.eventDesc)'
    if patched.count(old) != 2:
        raise RuntimeError('DESCRIPTION_ANCHOR')
    patched = patched.replace(old, b'(e.eventDesc==null?[]:B.generateTextFlowByLangId(e.eventDesc))')
    data = original[:start] + patched + original[end:]
    # Everything outside this one method, including newline/encoding, is identical.
    assert data[:start] == original[:start] and data[start+len(patched):] == original[end:]
    target = OUT / 'candidate' / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    (OUT / 'renderer-before.js').write_bytes(renderer.split(b'=', 1)[1] + b';\n')
    (OUT / 'renderer-after.js').write_bytes(patched.split(b'=', 1)[1] + b';\n')
    rel = 'webgame/game/index.html'
    original_index = (OUT / 'before' / rel).read_bytes()
    index = replace_once(original_index, b'main.min_drop200.js?v=20261007_fulu_safe_v1',
                         b'main.min_drop200.js?v=' + MARKER.encode())
    target = OUT / 'candidate' / rel
    target.write_bytes(index)
    manifest.update(phase='candidate', version=MARKER, changedMethod='OldTrekEventItem.dataChanged')
    for row in manifest['files']:
        before = (OUT / 'before' / row['relative']).read_bytes()
        if hashlib.sha256(before).hexdigest() != row['expected']:
            raise RuntimeError('BASELINE_HASH')
        after = (OUT / 'candidate' / row['relative']).read_bytes()
        row['candidate'] = hashlib.sha256(after).hexdigest()
        row['candidateBytes'] = len(after)
    (OUT / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files':manifest['files'], 'changedMethod':manifest['changedMethod']}))


if __name__ == '__main__':
    main()
