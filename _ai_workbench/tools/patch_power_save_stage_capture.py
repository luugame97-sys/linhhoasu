from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_power_save_touch_guard5"
NEW_VERSION = "20260831_power_save_stage_guard6"

OLD = (
    'this.touchEnabled=!0,this._lhsPowerSaveClose||(this._lhsPowerSaveClose=function(){n.CloseSelf()},'
    'this.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this))},'
    'Sni.OnClose=function(){$.idleTouchTime=0,this._lhsPowerSaveClose&&('
    'this.removeEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this),'
    'this._lhsPowerSaveClose=null),this.touchEnabled=!1},'
)

NEW = (
    'this.touchEnabled=!0,this._lhsPowerSaveClose||(this._lhsPowerSaveClose=function(){n.CloseSelf()},'
    'this.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this),'
    'this.stage&&this.stage.addEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this,!0))},'
    'Sni.OnClose=function(){$.idleTouchTime=0,this._lhsPowerSaveClose&&('
    'this.removeEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this),'
    'this.stage&&this.stage.removeEventListener(egret.TouchEvent.TOUCH_BEGIN,this._lhsPowerSaveClose,this,!0),'
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
        BUNDLE.write_text(replace_exact(bundle, OLD, NEW, 1, "PowerSaving stage capture"), encoding="utf-8", newline="")
        print("patched power-saving stage capture touch exit")

    index = INDEX.read_text(encoding="utf-8")
    if NEW_VERSION in index:
        print("index already versioned")
    else:
        INDEX.write_text(replace_exact(index, OLD_VERSION, NEW_VERSION, 2, "cache token"), encoding="utf-8", newline="")
        print(f"updated cache token to {NEW_VERSION}")


if __name__ == "__main__":
    main()
