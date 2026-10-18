from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_move_log_guard4"
NEW_VERSION = "20260831_power_save_touch_guard5"

OLD = (
    '(Sni=Kii.prototype).OnOpen=function(){for(var t=[],e=0;e<arguments.length;e++)'
    't[e]=arguments[e];$.idleTouchTime=0,this.dotLab.text="",this.changeState(1),'
    'this.setProg(0),y.ins().doFrame(20,0,this.onUpdate,this),this.initEvent(),P.ins().close(zst)},'
    'Sni.OnClose=function(){$.idleTouchTime=0},'
)

NEW = (
    '(Sni=Kii.prototype).OnOpen=function(){for(var t=[],e=0;e<arguments.length;e++)'
    't[e]=arguments[e];var n=this;$.idleTouchTime=0,this.dotLab.text="",this.changeState(1),'
    'this.setProg(0),y.ins().doFrame(20,0,this.onUpdate,this),this.initEvent(),P.ins().close(zst),'
    'this.touchEnabled=!0,this._lhsPowerSaveClose||(this._lhsPowerSaveClose=function(){n.CloseSelf()},'
    'this.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this))},'
    'Sni.OnClose=function(){$.idleTouchTime=0,this._lhsPowerSaveClose&&('
    'this.removeEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this),'
    'this._lhsPowerSaveClose=null),this.touchEnabled=!1},'
)


def replace_exact(text, old, new, expected, label):
    actual = text.count(old)
    if actual != expected:
        raise RuntimeError(f"{label}: expected {expected}, found {actual}")
    return text.replace(old, new)


def main():
    bundle = BUNDLE.read_text(encoding="utf-8")
    if NEW in bundle:
        print("bundle already patched")
    else:
        BUNDLE.write_text(replace_exact(bundle, OLD, NEW, 1, "PowerSavingModePanel"), encoding="utf-8", newline="")
        print("patched power-saving panel to close on any touch")

    index = INDEX.read_text(encoding="utf-8")
    if NEW_VERSION in index:
        print("index already versioned")
    else:
        INDEX.write_text(replace_exact(index, OLD_VERSION, NEW_VERSION, 2, "cache token"), encoding="utf-8", newline="")
        print(f"updated cache token to {NEW_VERSION}")


if __name__ == "__main__":
    main()
