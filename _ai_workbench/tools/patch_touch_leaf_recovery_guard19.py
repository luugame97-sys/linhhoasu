from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BUNDLE=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX=ROOT/'linhhoasu/webgame/game/index.html'
text=BUNDLE.read_text(encoding='utf-8')
old='n!==I.UI_Main&&n.numChildren>0&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++)'
new='n!==I.UI_Main&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++)'
if text.count(old)!=2: raise RuntimeError(f'leaf recovery anchor count {text.count(old)}')
text=text.replace(old,new)
old_token='20260831_touch_recovery_clean_guard18';new_token='20260831_touch_leaf_recovery_guard19'
idx=INDEX.read_text(encoding='utf-8')
if idx.count(old_token)!=2: raise RuntimeError(f'token count {idx.count(old_token)}')
INDEX.write_text(idx.replace(old_token,new_token),encoding='utf-8',newline='')
BUNDLE.write_text(text,encoding='utf-8',newline='')
print('patched '+new_token)
