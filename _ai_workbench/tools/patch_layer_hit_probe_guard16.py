from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_stage_popup_recovery_guard15'
NEW_TOKEN = '20260831_layer_hit_probe_guard16'

text = BUNDLE.read_text(encoding='utf-8')
old = 'n._x=t.stageX,n._y=t.stageY,n(I.UI_Main,"",0),console.debug("[LHS][HitProbe] "+e.join("|"))'
new = 'n._x=t.stageX,n._y=t.stageY,n(I.UI_Main,"M/",0),n(I.UI_Popup,"P/",0),n(I.UI_Loading,"L/",0),console.debug("[LHS][HitProbe] "+e.join("|"))'
if text.count(old) != 1:
    raise RuntimeError(f'expected one guard15 probe anchor, found {text.count(old)}')
text = text.replace(old, new)
BUNDLE.write_text(text, encoding='utf-8', newline='')

idx = INDEX.read_text(encoding='utf-8')
if idx.count(OLD_TOKEN) != 2:
    raise RuntimeError(f'expected two old cache tokens, found {idx.count(OLD_TOKEN)}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')
print(f'patched {NEW_TOKEN}')
