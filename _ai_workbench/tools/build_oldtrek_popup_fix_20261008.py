"""Patch OldTrek dice popup guards/positioning in the already-fixed bundle."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_popup_fix_20261008'
VERSION = '20261008_oldtrek_popup_v1'


def once(data, old, new, count=1):
    if data.count(old) != count:
        raise RuntimeError(f'ANCHOR:{old[:80]} count={data.count(old)} expected={count}')
    return data.replace(old, new)


def main():
    manifest = json.loads((OUT/'baseline.json').read_text(encoding='utf-8'))
    main_rel = 'webgame/game/js/main.min_drop200.js'
    index_rel = 'webgame/game/index.html'
    original = (OUT/'before'/main_rel).read_text(encoding='utf-8')
    class_start = original.index('i(n5e,OVe=')
    class_end = original.index(',t(Z4=n5e,"OldTrekEventCheckView")', class_start)
    segment = original[class_start:class_end]
    before_segment = segment
    guard = 'null==e||e.checkValue.length<=0||e.checkValue[0].length<2'
    safe_guard = 'null==e||!Array.isArray(e.checkValue)||e.checkValue.length<=0||!Array.isArray(e.checkValue[0])||e.checkValue[0].length<2'
    segment = once(segment, guard, safe_guard, 1)
    guard = 'null==n||n.checkValue.length<=0||n.checkValue[0].length<2'
    safe_guard = 'null==n||!Array.isArray(n.checkValue)||n.checkValue.length<=0||!Array.isArray(n.checkValue[0])||n.checkValue[0].length<2'
    segment = once(segment, guard, safe_guard, 1)
    guard = 'null==i||i.checkValue.length<=0||i.checkValue[0].length<2'
    safe_guard = 'null==i||!Array.isArray(i.checkValue)||i.checkValue.length<=0||!Array.isArray(i.checkValue[0])||i.checkValue[0].length<2'
    segment = once(segment, guard, safe_guard, 1)
    segment = once(segment, 't.checkValue[0][1]+e.checkFloat', 'Array.isArray(t&&t.checkValue)&&Array.isArray(t.checkValue[0])&&t.checkValue[0].length>1?t.checkValue[0][1]+e.checkFloat:0', 1)
    pos = 'var i=Ad.getBoneNodeInfo(this.spShake,"p_zp",this.spShake.parent);null!=i&&(this.groupContent.horizontalCenter=i.pos.x,this.groupContent.verticalCenter=i.pos.y)'
    segment = once(segment, pos, 'this.groupContent.horizontalCenter=0,this.groupContent.verticalCenter=0', 1)
    data = original[:class_start] + segment + original[class_end:]
    target = OUT/'candidate'/main_rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(data, encoding='utf-8', newline='')
    idx = (OUT/'before'/index_rel).read_bytes()
    idx = once(idx, b'main.min_drop200.js?v=20261008_oldtrek_renderer_v1', b'main.min_drop200.js?v='+VERSION.encode(), 1)
    (OUT/'candidate'/index_rel).write_bytes(idx)
    (OUT/'popup-before.txt').write_text(before_segment, encoding='utf-8')
    (OUT/'popup-after.txt').write_text(segment, encoding='utf-8')
    manifest.update({'phase':'candidate','version':VERSION,'changedClass':'OldTrekEventCheckView','changedContracts':['checkValue guard','bone position clamp']})
    for row in manifest['files']:
        after=(OUT/'candidate'/row['relative']).read_bytes()
        row['candidate']=hashlib.sha256(after).hexdigest()
        row['candidateBytes']=len(after)
    (OUT/'release.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'version':VERSION,'files':manifest['files'],'segmentBeforeBytes':len(before_segment),'segmentAfterBytes':len(segment)}))


if __name__=='__main__': main()
