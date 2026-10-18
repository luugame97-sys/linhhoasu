from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_stage_touch_recovery_guard13'
NEW_TOKEN = '20260831_stage_hit_test_probe_guard14'

text = BUNDLE.read_text(encoding='utf-8')
old = '"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Main.visible&&(e=0,function t(n){'
new = '''"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Main&&function(){var e=[],n=function(t,a,s){if(!t||e.length>=80||s>5)return;var r=null,l=null,h=null,c=null,u=null;try{r=t.$hitTest(n._x,n._y)}catch(p){}try{l=t.$getInvertedConcatenatedMatrix(),h=l.a*n._x+l.c*n._y+l.tx,c=l.b*n._x+l.d*n._y+l.ty,u=t.$getContentBounds()}catch(p){}var d=u&&u.contains(h,c);(s<2||d||r||t.$maskedObject)&&e.push(a+egret.getQualifiedClassName(t)+":"+String(t.name||"")+"[hit="+(r?egret.getQualifiedClassName(r):"null")+",te="+String(t.touchEnabled)+",tc="+String(t.touchChildren)+",masked="+String(!!t.$maskedObject)+",mask="+String(!!t.$mask)+",sr="+String(!!(t.$scrollRect||t.$maskRect))+",in="+String(!!d)+",v="+String(t.visible)+",a="+String(t.alpha)+",n="+String(t.numChildren||0)+"]");for(var o=0;o<(t.numChildren||0)&&e.length<80;o++)n(t.getChildAt(o),a+o+"/",s+1)};n._x=t.stageX,n._y=t.stageY,n(I.UI_Main,"",0),console.debug("[LHS][HitProbe] "+e.join("|"))}(),"Main"===o&&!RuntimeUtil.isRuntime&&I.UI_Loading&&0===I.UI_Loading.numChildren&&I.UI_Main&&I.UI_Main.visible&&(e=0,function t(n){'''
if text.count(old) != 1:
    raise RuntimeError(f'expected one guard13 recovery anchor, found {text.count(old)}')
text = text.replace(old, new)
BUNDLE.write_text(text, encoding='utf-8', newline='')

idx = INDEX.read_text(encoding='utf-8')
if idx.count(OLD_TOKEN) != 2:
    raise RuntimeError(f'expected two old cache tokens, found {idx.count(OLD_TOKEN)}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')
print(f'patched {NEW_TOKEN}')
