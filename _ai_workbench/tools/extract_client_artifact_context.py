from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    text = JS.read_text(encoding="utf-8", errors="replace")
    needles = ["3500", "ArtifactModel", "神器", "Pháp bảo", "onItemChange"]
    for needle in needles:
        print(f"=== {needle!r} ===")
        start = 0
        found = 0
        while found < 40:
            pos = text.find(needle, start)
            if pos < 0:
                break
            print(f"OFFSET {pos}")
            print(text[max(0, pos - 900): min(len(text), pos + 1300)])
            print()
            start = pos + len(needle)
            found += 1
        print(f"COUNT_SHOWN={found}\n")


if __name__ == "__main__":
    main()
