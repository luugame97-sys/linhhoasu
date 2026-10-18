from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BUNDLE=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX=ROOT/'linhhoasu/webgame/game/index.html'
text=BUNDLE.read_text(encoding='utf-8')
start=text.index('(a=bht.prototype).createChildren=function(){')
end=text.index('bht.idleTouchTime=0,',start)+len('bht.idleTouchTime=0,')
new='''(a=bht.prototype).createChildren=function(){this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this.onTouchBegin,this,!0),this.touchThrough=!0},a.onTouchBegin=function(t){var e,i=this,n=Date.now(),a=!1,s=!1,o=egret.getQualifiedClassName(t.target);!RuntimeUtil.isRuntime&&(a=P.ins().isShow(Zz),s=!!(Y.GuideUtil&&Y.GuideUtil.isDuringGuide&&Y.GuideUtil.isDuringGuide()),a&&P.ins().close(Zz),s&&Y.GuideUtil.abortGuide()),(!bht._lhsLastTouchTraceAt||n-bht._lhsLastTouchTraceAt>=2e3)&&(bht._lhsLastTouchTraceAt=n,console.debug("[LHS][TouchTrace] target="+o+" power="+(a?1:0)+" guide="+(s?1:0))),"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Main.visible&&(e=0,function t(n){if(!n||e>500)return;n!==I.UI_Main&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Main),I.UI_Popup&&I.UI_Popup.numChildren>0&&function t(n){if(!n||e>500)return;n!==I.UI_Popup&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Popup),e&&console.debug("[LHS][TouchRecovery] restored="+e)),"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Main.visible&&(!I.UI_Popup||0===I.UI_Popup.numChildren)&&(I.UI_Main.alpha=1,I.UI_Main.visible=!0,I.UI_Main.touchEnabled=!0,I.UI_Main.touchChildren=!0,function(){var n=null;try{n=I.UI_Main.$hitTest(t.stageX,t.stageY)}catch(a){}n&&n!==I.UI_Main&&n.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,!0)}()),bht.idleTouchTime=0,'''
BUNDLE.write_text(text[:start]+new+text[end:],encoding='utf-8',newline='')
old='20260831_touch_manual_dispatch_guard21';new_token='20260831_touch_alpha_watchdog_guard22'
idx=INDEX.read_text(encoding='utf-8')
if idx.count(old)!=2: raise RuntimeError(f'token count {idx.count(old)}')
INDEX.write_text(idx.replace(old,new_token),encoding='utf-8',newline='')
print('patched '+new_token)
