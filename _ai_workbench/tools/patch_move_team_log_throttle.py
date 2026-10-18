from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_land_settle_guard3"
NEW_VERSION = "20260831_move_log_guard4"

OLD = 'console.warn("[LHS] MoveTeam empty path recovery")'
NEW = (
    '(!jIt._lhsLastEmptyPathWarnAt||Date.now()-jIt._lhsLastEmptyPathWarnAt>=5e3)'
    '&&(jIt._lhsLastEmptyPathWarnAt=Date.now(),console.debug("[LHS] MoveTeam empty path recovery"))'
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
        BUNDLE.write_text(replace_exact(bundle, OLD, NEW, 1, "MoveTeam warning"), encoding="utf-8", newline="")
        print("throttled MoveTeam empty path log to debug/5s")

    index = INDEX.read_text(encoding="utf-8")
    if NEW_VERSION in index:
        print("index already versioned")
    else:
        INDEX.write_text(replace_exact(index, OLD_VERSION, NEW_VERSION, 2, "cache token"), encoding="utf-8", newline="")
        print(f"updated cache token to {NEW_VERSION}")


if __name__ == "__main__":
    main()
