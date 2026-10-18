"""Patch client Spine lifecycle and stale mask recovery without changing game data."""
from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(r"I:\Linhhoasu\server\server")
MAIN = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "main.min_a6195824.js"
INDEX = ROOT / "linhhoasu" / "webgame" / "game" / "index.html"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


main = MAIN.read_text(encoding="utf-8")
index = INDEX.read_text(encoding="utf-8")

old_wait = (
    'TPt.waitPlayEnd=function(){var e=this;return new Promise(function(t){var i=!1,n=function(){'
    'i||(i=!0,clearTimeout(a),e.off(1,n),e.off(4,n),e.off(6,n),t())},'
    'a=setTimeout(function(){console.warn("[LHS] spine waitPlayEnd timeout fallback"),n()},15e3);'
    'e.on(1,n),e.on(4,n),e.on(6,n)})}'
)
new_wait = (
    'TPt.waitPlayEnd=function(){var e=this;return new Promise(function(t){if(e.disposed)return t();var i=!1,n=function(){'
    'i||(i=!0,clearTimeout(a),e.off(1,n),e.off(4,n),e.off(6,n),t())},'
    'a=setTimeout(function(){var e=Date.now();(!xRt._lhsLastWaitWarnAt||e-xRt._lhsLastWaitWarnAt>=5e3)&&(xRt._lhsLastWaitWarnAt=e,console.warn("[LHS] spine waitPlayEnd timeout fallback")),n()},8e3);'
    'e.on(1,n),e.on(4,n),e.on(6,n)})}'
)
if main.count(old_wait) != 1:
    raise RuntimeError(f"waitPlayEnd anchor count={main.count(old_wait)}")
main = main.replace(old_wait, new_wait, 1)

old_play = (
    'l.play=function(n,t,e){var i,a={},s=this;for(i in this.commonFunc)!function(t){var e=Number(t),i=s.commonFunc[t];'
    'switch(e){case 0:a.playStart=function(){i({type:0,animation:n})};break;case 2:a.loopStart=function(){i({type:2,animation:n})};'
    'break;case 3:a.loopEnd=function(){i({type:3,animation:n})};break;case 1:a.playEnd=function(){i({type:1,animation:n})};'
    'break;case 5:a.custom=function(t){i({type:5,animation:n,eventData:{name:t.data.name,intValue:t.intValue,floatValue:t.floatValue,stringValue:t.stringValue}})}}}(i);'
    'return FRt.call(this,n,t,e,a)}'
)
new_play = (
    'l.play=function(n,t,e){var i,a={},s=this,o=this._lhsActiveTracks||(this._lhsActiveTracks={}),r=o[Number(e)||0];'
    'r&&r!==s&&r.onInterrupt();for(i in this.commonFunc)!function(t){var e=Number(t),i=s.commonFunc[t];switch(e){case 0:'
    'a.playStart=function(){i({type:0,animation:n})};break;case 2:a.loopStart=function(){i({type:2,animation:n})};break;case 3:'
    'a.loopEnd=function(){i({type:3,animation:n})};break;case 1:a.playEnd=function(){i({type:1,animation:n})};break;case 5:'
    'a.custom=function(t){i({type:5,animation:n,eventData:{name:t.data.name,intValue:t.intValue,floatValue:t.floatValue,stringValue:t.stringValue}})}}}(i);'
    'var l=FRt.call(this,n,t,e,a);return o[Number(e)||0]=l,l}'
)
if main.count(old_play) != 1:
    raise RuntimeError(f"SkeletonAnimationEx.play anchor count={main.count(old_play)}")
main = main.replace(old_play, new_play, 1)

old_removed = 'l.onRemovedFromStage=function(){this.commonFunc=null,NRt.call(this)}'
new_removed = (
    'l.onRemovedFromStage=function(){if(this._lhsActiveTracks){for(var t in this._lhsActiveTracks)'
    'this._lhsActiveTracks[t]&&this._lhsActiveTracks[t].onInterrupt();this._lhsActiveTracks={}}this.commonFunc=null,NRt.call(this)}'
)
if main.count(old_removed) != 1:
    raise RuntimeError(f"onRemovedFromStage anchor count={main.count(old_removed)}")
main = main.replace(old_removed, new_removed, 1)

old_land = (
    'this.cloudSp.visible=!0,this.allGr.alpha=0,this.cloudSp.setAnimation(0,"a_1",!1).waitPlayEnd().then(function(){'
    't.cloudSp.setAnimation(0,"a_2",!0),t.allGr.alpha=1,y.ins().doTimer(300,1,function(){t.cloudSp.setAnimation(0,"a_3",!1).waitPlayEnd().then(function(){'
    't.maskGr.visible=!1,Y.GuideUtil.continueGuide(),t.cloudSp.visible=!1})},t)})'
)
new_land = (
    'this.cloudSp.visible=!0,this.allGr.alpha=0,this._lhsLandOpenSeq=(this._lhsLandOpenSeq||0)+1;var lhsLandOpenSeq=this._lhsLandOpenSeq,'
    'lhsLandDone=function(){t._lhsLandOpenSeq===lhsLandOpenSeq&&(t.maskGr.visible=!1,Y.GuideUtil.continueGuide(),t.cloudSp.visible=!1)},'
    'lhsLandStartTimer=setTimeout(lhsLandDone,6e3);this.cloudSp.setAnimation(0,"a_1",!1).waitPlayEnd().then(function(){'
    'clearTimeout(lhsLandStartTimer),t.cloudSp.setAnimation(0,"a_2",!0),t.allGr.alpha=1;var e=setTimeout(lhsLandDone,4e3);'
    't.cloudSp.setAnimation(0,"a_3",!1).waitPlayEnd().then(function(){clearTimeout(e),lhsLandDone()},lhsLandDone)},lhsLandDone)'
)
if main.count(old_land) != 1:
    raise RuntimeError(f"land cloud anchor count={main.count(old_land)}")
main = main.replace(old_land, new_land, 1)

old_mine = (
    'this.cloudSp.visible=!0,this.setGlobalMaskState(!0),this.allGr.alpha=0,this.cloudSp.setAnimation(0,"a_1",!1).waitPlayEnd().then(function(){'
    'i.cloudSp.setAnimation(0,"a_2",!0),i.allGr.alpha=1,y.ins().doTimer(300,1,function(){i.cloudSp.setAnimation(0,"a_3",!1).waitPlayEnd().then(function(){'
    'i.setGlobalMaskState(!1),Y.GuideUtil.continueGuide(),i.cloudSp.visible=!1})},i)})'
)
new_mine = (
    'this.cloudSp.visible=!0,this.setGlobalMaskState(!0),this.allGr.alpha=0,this._lhsMineOpenSeq=(this._lhsMineOpenSeq||0)+1;var lhsMineOpenSeq=this._lhsMineOpenSeq,'
    'lhsMineDone=function(){i._lhsMineOpenSeq===lhsMineOpenSeq&&(i.setGlobalMaskState(!1),Y.GuideUtil.continueGuide(),i.cloudSp.visible=!1)},'
    'lhsMineStartTimer=setTimeout(lhsMineDone,6e3);this.cloudSp.setAnimation(0,"a_1",!1).waitPlayEnd().then(function(){'
    'clearTimeout(lhsMineStartTimer),i.cloudSp.setAnimation(0,"a_2",!0),i.allGr.alpha=1;var e=setTimeout(lhsMineDone,4e3);'
    'i.cloudSp.setAnimation(0,"a_3",!1).waitPlayEnd().then(function(){clearTimeout(e),lhsMineDone()},lhsMineDone)},lhsMineDone)'
)
if main.count(old_mine) != 1:
    raise RuntimeError(f"mine cloud anchor count={main.count(old_mine)}")
main = main.replace(old_mine, new_mine, 1)

old_token = "20260830_name_rename_fix2"
new_token = "20260831_input_freeze_guard1"
if index.count(old_token) < 1:
    raise RuntimeError("index cache token anchor missing")
index = index.replace(old_token, new_token)

MAIN.write_text(main, encoding="utf-8", newline="")
INDEX.write_text(index, encoding="utf-8", newline="")
print(json_line := {
    "mainBefore": "see backup",
    "mainAfter": sha(MAIN),
    "indexAfter": sha(INDEX),
    "waitGuardCount": main.count("[LHS] spine waitPlayEnd timeout fallback"),
    "activeTrackRegistry": main.count("_lhsActiveTracks"),
    "disposedFastPath": "if(e.disposed)return t()" in main,
    "landMaskGuard": "lhsLandDone" in main,
    "mineMaskGuard": "lhsMineDone" in main,
    "cacheToken": new_token,
})
