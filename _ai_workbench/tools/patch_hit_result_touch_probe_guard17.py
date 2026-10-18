from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BUNDLE=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX=ROOT/'linhhoasu/webgame/game/index.html'
OLD='e.push(a+egret.getQualifiedClassName(t)+":"+String(t.name||"")+"[hit="+(r?egret.getQualifiedClassName(r):"null")+",te="+String(t.touchEnabled)+",tc="+String(t.touchChildren)'
NEW='e.push(a+egret.getQualifiedClassName(t)+":"+String(t.name||"")+"[hit="+(r?egret.getQualifiedClassName(r):"null")+",hitTe="+String(!!(r&&r.touchEnabled))+",te="+String(t.touchEnabled)+",tc="+String(t.touchChildren)'
text=BUNDLE.read_text(encoding='utf-8')
if text.count(OLD)!=1: raise RuntimeError(f'probe anchor count {text.count(OLD)}')
BUNDLE.write_text(text.replace(OLD,NEW),encoding='utf-8',newline='')
old_token='20260831_layer_hit_probe_guard16'
new_token='20260831_hit_result_touch_probe_guard17'
idx=INDEX.read_text(encoding='utf-8')
if idx.count(old_token)!=2: raise RuntimeError(f'token count {idx.count(old_token)}')
INDEX.write_text(idx.replace(old_token,new_token),encoding='utf-8',newline='')
print('patched '+new_token)
