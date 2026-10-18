from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_stage_touch_recovery_guard10'
NEW_TOKEN = '20260831_stage_touch_diagnostics_guard11'

text = BUNDLE.read_text(encoding='utf-8')
start = text.index('(a=bht.prototype).createChildren=function(){')
end_marker = 'bht.idleTouchTime=0,'
end = text.index(end_marker, start) + len(end_marker)
old = text[start:end]
new = '''(a=bht.prototype).createChildren=function(){this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this.onTouchBegin,this,!0),this.touchThrough=!0},a.onTouchBegin=function(t){var e,i=this,n=Date.now(),a=!1,s=!1,o=egret.getQualifiedClassName(t.target),r=[],l=t.target;for(var h=0;l&&h<12;h++,l=l.parent)r.push(egret.getQualifiedClassName(l)+":"+String(l.name||"")+"[te="+String(l.touchEnabled)+",tc="+String(l.touchChildren)+",v="+String(l.visible)+",a="+String(l.alpha)+"]");!RuntimeUtil.isRuntime&&(a=P.ins().isShow(Zz),s=!!(Y.GuideUtil&&Y.GuideUtil.isDuringGuide&&Y.GuideUtil.isDuringGuide()),a&&P.ins().close(Zz),s&&Y.GuideUtil.abortGuide()),(!bht._lhsLastTouchTraceAt||n-bht._lhsLastTouchTraceAt>=2e3)&&(bht._lhsLastTouchTraceAt=n,console.debug("[LHS][TouchTrace] target="+o+" power="+(a?1:0)+" guide="+(s?1:0)),"Main"===o&&console.debug("[LHS][TouchState] chain="+r.join(" > ")+" layers="+[I.UI_Main,I.UI_Main_Up,I.UI_Popup,I.UI_Loading,I.UI_Tips,I.UI_GM_INPUT].map(function(t){return t?egret.getQualifiedClassName(t)+":"+String(t.name||"")+"[te="+String(t.touchEnabled)+",tc="+String(t.touchChildren)+",v="+String(t.visible)+",a="+String(t.alpha)+",n="+String(t.numChildren)+"]":"null"}).join("|"))),bht.idleTouchTime=0,'''
if text[start:end] != old:
    raise RuntimeError('unexpected TapEffectLayer source')
BUNDLE.write_text(text[:start] + new + text[end:], encoding='utf-8', newline='')

idx = INDEX.read_text(encoding='utf-8')
if idx.count(OLD_TOKEN) != 2:
    raise RuntimeError(f'expected two old cache tokens, found {idx.count(OLD_TOKEN)}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')
print(f'patched {NEW_TOKEN}')
