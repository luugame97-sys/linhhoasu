from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_stage_touch_recovery_guard12'
NEW_TOKEN = '20260831_stage_touch_recovery_guard13'

text = BUNDLE.read_text(encoding='utf-8')
old = 'n.touchChildren===!1&&(n.touchChildren=!0,e++);for(var a=0;a<(n.numChildren||0);a++)'
new = 'n!==I.UI_Main&&n.numChildren>0&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0,e++);for(var a=0;a<(n.numChildren||0);a++)'
if text.count(old) != 1:
    raise RuntimeError(f'expected one recovery anchor, found {text.count(old)}')
text = text.replace(old, new)
text = text.replace('console.debug("[LHS][TouchRecovery] restored="+e)', 'console.debug("[LHS][TouchRecovery] restored="+e)')
BUNDLE.write_text(text, encoding='utf-8', newline='')

idx = INDEX.read_text(encoding='utf-8')
if idx.count(OLD_TOKEN) != 2:
    raise RuntimeError(f'expected two old cache tokens, found {idx.count(OLD_TOKEN)}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')
print(f'patched {NEW_TOKEN}')
