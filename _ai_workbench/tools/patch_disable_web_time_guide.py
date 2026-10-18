from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_web_no_power_save_guard7"
NEW_VERSION = "20260831_web_no_idle_guide_guard8"
OLD = "sOt.timeGuideCheck=function(){var t;AppInfo.ckState&&!this.isDuringGuide()"
NEW = "sOt.timeGuideCheck=function(){var t;AppInfo.ckState&&RuntimeUtil.isRuntime&&!this.isDuringGuide()"

def main():
    text = BUNDLE.read_text(encoding="utf-8")
    if NEW in text:
        print("bundle already patched")
    else:
        count = text.count(OLD)
        if count != 1: raise RuntimeError(f"time guide anchor expected once, found {count}")
        BUNDLE.write_text(text.replace(OLD, NEW), encoding="utf-8", newline="")
        print("disabled automatic idle guide on H5; explicit task guides remain")
    index = INDEX.read_text(encoding="utf-8")
    if NEW_VERSION in index:
        print("index already versioned")
    else:
        count = index.count(OLD_VERSION)
        if count != 2: raise RuntimeError(f"index guard7 token expected twice, found {count}")
        INDEX.write_text(index.replace(OLD_VERSION, NEW_VERSION), encoding="utf-8", newline="")
        print(f"updated cache token to {NEW_VERSION}")

if __name__ == "__main__": main()
