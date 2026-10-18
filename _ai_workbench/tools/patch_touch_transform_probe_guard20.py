from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BUNDLE=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX=ROOT/'linhhoasu/webgame/game/index.html'
text=BUNDLE.read_text(encoding='utf-8')
old='console.debug("[LHS][TouchState] chain="+r.join(" > ")+" layers="+[I.UI_Main,I.UI_Main_Up,I.UI_Popup,I.UI_Loading,I.UI_Tips,I.UI_GM_INPUT].map(function(t){return t?egret.getQualifiedClassName(t)+":"+String(t.name||"")+"[te="+String(t.touchEnabled)+",tc="+String(t.touchChildren)+",v="+String(t.visible)+",a="+String(t.alpha)+",n="+String(t.numChildren)+"]":"null"}).join("|"))'
new='console.debug("[LHS][TouchState] chain="+r.join(" > ")+" stage="+String(t.stageX)+","+String(t.stageY)+" size="+String(t.target.stage&&t.target.stage.stageWidth)+","+String(t.target.stage&&t.target.stage.stageHeight)+" main="+(I.UI_Main&&I.UI_Main.$children&&I.UI_Main.$children[0]?String(I.UI_Main.$children[0].width)+","+String(I.UI_Main.$children[0].height)+",s="+String(I.UI_Main.$children[0].scaleX)+","+String(I.UI_Main.$children[0].scaleY)+",x="+String(I.UI_Main.$children[0].x)+","+String(I.UI_Main.$children[0].y):"null")+" layers="+[I.UI_Main,I.UI_Main_Up,I.UI_Popup,I.UI_Loading,I.UI_Tips,I.UI_GM_INPUT].map(function(t){return t?egret.getQualifiedClassName(t)+":"+String(t.name||"")+"[te="+String(t.touchEnabled)+",tc="+String(t.touchChildren)+",v="+String(t.visible)+",a="+String(t.alpha)+",n="+String(t.numChildren)+"]":"null"}).join("|"))'
if text.count(old)!=1: raise RuntimeError(f'transform probe anchor count {text.count(old)}')
BUNDLE.write_text(text.replace(old,new),encoding='utf-8',newline='')
old_token='20260831_touch_leaf_recovery_guard19';new_token='20260831_touch_transform_probe_guard20'
idx=INDEX.read_text(encoding='utf-8')
if idx.count(old_token)!=2: raise RuntimeError(f'token count {idx.count(old_token)}')
INDEX.write_text(idx.replace(old_token,new_token),encoding='utf-8',newline='')
print('patched '+new_token)
