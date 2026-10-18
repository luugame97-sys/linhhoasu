from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];B=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js';I=ROOT/'linhhoasu/webgame/game/index.html';OV='20260831_web_no_guide_mask_guard9';NV='20260831_stage_touch_recovery_guard10'
OLD='(a=bht.prototype).createChildren=function(){this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this.onTouchBegin,this),this.touchThrough=!0},a.onTouchBegin=function(t){var e,i=this;bht.idleTouchTime=0,'
NEW='(a=bht.prototype).createChildren=function(){this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this.onTouchBegin,this,!0),this.touchThrough=!0},a.onTouchBegin=function(t){var e,i=this,n=Date.now(),a=!1,s=!1;!RuntimeUtil.isRuntime&&(a=P.ins().isShow(Zz),s=!!(Y.GuideUtil&&Y.GuideUtil.isDuringGuide&&Y.GuideUtil.isDuringGuide()),a&&P.ins().close(Zz),s&&Y.GuideUtil.abortGuide()),(!bht._lhsLastTouchTraceAt||n-bht._lhsLastTouchTraceAt>=2e3)&&(bht._lhsLastTouchTraceAt=n,console.debug("[LHS][TouchTrace] target="+egret.getQualifiedClassName(t.target)+" power="+(a?1:0)+" guide="+(s?1:0))),bht.idleTouchTime=0,'
def main():
 t=B.read_text(encoding='utf-8')
 if NEW in t:print('bundle already patched')
 else:
  c=t.count(OLD)
  if c!=1:raise RuntimeError(f'TapEffectLayer anchor expected once, found {c}')
  B.write_text(t.replace(OLD,NEW),encoding='utf-8',newline='');print('patched stage capture touch trace and stale-lock recovery')
 idx=I.read_text(encoding='utf-8')
 if NV in idx:print('index already versioned')
 else:
  c=idx.count(OV)
  if c!=2:raise RuntimeError(f'old token expected twice, found {c}')
  I.write_text(idx.replace(OV,NV),encoding='utf-8',newline='');print('updated token '+NV)
if __name__=='__main__':main()
