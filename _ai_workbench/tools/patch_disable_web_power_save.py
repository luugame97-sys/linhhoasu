from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_power_save_stage_guard6"
NEW_VERSION = "20260831_web_no_power_save_guard7"
OLD = "&&P.ins().open(Zz)"
NEW = "&&RuntimeUtil.isRuntime&&P.ins().open(Zz)"

def main():
    text = BUNDLE.read_text(encoding="utf-8")
    count = text.count(OLD)
    if count == 0:
        if NEW not in text: raise RuntimeError("PowerSaving open anchor not found")
        print("bundle already patched")
    elif count != 2:
        raise RuntimeError(f"expected 2 PowerSaving open anchors, found {count}")
    else:
        BUNDLE.write_text(text.replace(OLD, NEW), encoding="utf-8", newline="")
        print("disabled auto PowerSaving on H5; native runtime remains enabled")
    index = INDEX.read_text(encoding="utf-8")
    old_count = index.count(OLD_VERSION)
    if old_count == 2:
        INDEX.write_text(index.replace(OLD_VERSION, NEW_VERSION), encoding="utf-8", newline="")
        print(f"updated cache token to {NEW_VERSION}")
    elif NEW_VERSION in index:
        print("index already versioned")
    else:
        raise RuntimeError(f"expected 2 old index tokens, found {old_count}")

if __name__ == "__main__": main()
