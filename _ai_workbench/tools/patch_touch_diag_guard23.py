from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_touch_alpha_watchdog_guard22'
NEW_TOKEN = '20260831_touch_diag_guard23'

text = BUNDLE.read_text(encoding='utf-8')
start = text.index('(a=bht.prototype).createChildren=function(){')
end = text.index('bht.idleTouchTime=0,', start) + len('bht.idleTouchTime=0,')
new = '''(a=bht.prototype).createChildren=function(){this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this.onTouchBegin,this,!0),this.touchThrough=!0},a.onTouchBegin=function(t){var e,i=this,n=Date.now(),a=!1,s=!1,o=egret.getQualifiedClassName(t.target);!RuntimeUtil.isRuntime&&(a=P.ins().isShow(Zz),s=!!(Y.GuideUtil&&Y.GuideUtil.isDuringGuide&&Y.GuideUtil.isDuringGuide()),a&&P.ins().close(Zz),s&&Y.GuideUtil.abortGuide()),(!bht._lhsLastTouchTraceAt||n-bht._lhsLastTouchTraceAt>=2e3)&&(bht._lhsLastTouchTraceAt=n,console.debug("[LHS][TouchTrace] target="+o+" power="+(a?1:0)+" guide="+(s?1:0))),"Main"===o&&!RuntimeUtil.isRuntime&&(function(){var n=[],a=function(t,e,i){if(!t||n.length>=140||i>6)return;var s="",o="",r="",l="",h="",c="",u="",p="",d="",f="";try{s=String(t.touchEnabled),o=String(t.$touchEnabled),r=String(t.touchChildren),l=String(t.$touchChildren),h=String(t.enabled),c=t.$Component?String(t.$Component[3]):"-",u=String(t.visible),p=String(t.alpha),d=String(t.numChildren||0),f=egret.getQualifiedClassName(t)}catch(g){}((i<2||"false"===h||"false"===o||"false"===s)&&n.push(e+f+":"+String(t.name||"")+"[en="+h+",ce="+c+",te="+s+",$te="+o+",tc="+r+",$tc="+l+",v="+u+",a="+p+",n="+d+"]"));for(var m=0;m<(t.numChildren||0)&&n.length<140;m++)a(t.getChildAt(m),e+m+"/",i+1)};a(I.UI_Main,"M/",0),a(I.UI_Popup,"P/",0),a(I.UI_Loading,"L/",0),console.debug("[LHS][TouchDiag] stage="+String(t.stageX)+","+String(t.stageY)+" "+n.join("|"))}()),"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Main.visible&&(e=0,function t(n){if(!n||e>500)return;n!==I.UI_Main&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Main),I.UI_Popup&&I.UI_Popup.numChildren>0&&function t(n){if(!n||e>500)return;n!==I.UI_Popup&&n.touchEnabled===!1&&(n.touchEnabled=!0,e++),n.touchChildren===!1&&(n.touchChildren=!0);for(var a=0;a<(n.numChildren||0);a++){var s=n.getChildAt(a);s&&s.visible&&s.alpha>0&&t(s)}}(I.UI_Popup),e&&console.debug("[LHS][TouchRecovery] restored="+e)),"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Main.visible&&(!I.UI_Popup||0===I.UI_Popup.numChildren)&&(I.UI_Main.alpha=1,I.UI_Main.visible=!0,I.UI_Main.touchEnabled=!0,I.UI_Main.touchChildren=!0,function(){var n=null;try{n=I.UI_Main.$hitTest(t.stageX,t.stageY)}catch(a){}n&&n!==I.UI_Main&&n.dispatchEventWith(egret.TouchEvent.TOUCH_TAP,!0)}()),bht.idleTouchTime=0,'''
BUNDLE.write_text(text[:start] + new + text[end:], encoding='utf-8', newline='')
idx = INDEX.read_text(encoding='utf-8')
if idx.count(OLD_TOKEN) != 2:
    raise RuntimeError(f'expected two old cache tokens, found {idx.count(OLD_TOKEN)}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')
print(f'patched {NEW_TOKEN}')
