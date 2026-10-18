from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BUNDLE=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX=ROOT/'linhhoasu/webgame/game/index.html'
text=BUNDLE.read_text(encoding='utf-8')
start=text.index('"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Main&&function(){')
end=text.index('"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading',start)
replacement='''"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Popup&&I.UI_Main.visible&&(e=0,function t(n){if(!n||e>500)return;n!==I.UI_Main&&n.numChildren>0&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Main),I.UI_Popup.numChildren>0&&function t(n){if(!n||e>500)return;n!==I.UI_Popup&&n.numChildren>0&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Popup),e&&console.debug("[LHS][TouchRecovery] restored="+e)),'''
text=text[:start]+replacement+text[end:]
BUNDLE.write_text(text,encoding='utf-8',newline='')
old='20260831_hit_result_touch_probe_guard17';new='20260831_touch_recovery_clean_guard18'
idx=INDEX.read_text(encoding='utf-8')
if idx.count(old)!=2: raise RuntimeError(f'token count {idx.count(old)}')
INDEX.write_text(idx.replace(old,new),encoding='utf-8',newline='')
print('patched '+new)
