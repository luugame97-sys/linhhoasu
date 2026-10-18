from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_stage_hit_test_probe_guard14'
NEW_TOKEN = '20260831_stage_popup_recovery_guard15'

text = BUNDLE.read_text(encoding='utf-8')
old = '}(I.UI_Main),e&&console.debug("[LHS][TouchRecovery] restored="+e))'
new = '} (I.UI_Main),I.UI_Popup&&I.UI_Popup.numChildren>0&&(function t(n){if(!n||e>500)return;n!==I.UI_Popup&&n.numChildren>0&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0,e++);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Popup)),e&&console.debug("[LHS][TouchRecovery] restored="+e))'
if text.count(old) != 1:
    raise RuntimeError(f'expected one guard14 recovery anchor, found {text.count(old)}')
text = text.replace(old, new)
BUNDLE.write_text(text, encoding='utf-8', newline='')

idx = INDEX.read_text(encoding='utf-8')
if idx.count(OLD_TOKEN) != 2:
    raise RuntimeError(f'expected two old cache tokens, found {idx.count(OLD_TOKEN)}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')
print(f'patched {NEW_TOKEN}')
