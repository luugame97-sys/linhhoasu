from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
TEXT = (ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js").read_text(encoding="utf-8", errors="replace")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

NEEDLES = [
    "regNetMsg(2405",
    "Rpc(2405",
    "sendFightLog",
    "roblist",
    "finishtime",
    "MoveTeam empty path recovery",
    "TRỘM THÀNH CÔNG",
]

for needle in NEEDLES:
    print(f"=== {needle} ===")
    pos = 0
    found = 0
    while found < 30:
        pos = TEXT.find(needle, pos)
        if pos < 0:
            break
        print(f"OFFSET={pos}")
        print(TEXT[max(0, pos - 2400):min(len(TEXT), pos + 4200)])
        pos += len(needle)
        found += 1
    print(f"COUNT={found}")
