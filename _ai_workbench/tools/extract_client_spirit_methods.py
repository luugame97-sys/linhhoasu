from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
TEXT = (ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js").read_text(encoding="utf-8", errors="replace")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

needles = [
    "Rpc(3600",
    "sendSpiritUpgrade",
    "SpiritModel.send",
    "upgradeAll",
    "SPIRIT_MAIN_VIEW_UPDATE",
]
for needle in needles:
    print(f"=== {needle} ===")
    start = 0
    count = 0
    while count < 30:
        pos = TEXT.find(needle, start)
        if pos < 0: break
        print(f"OFFSET={pos}")
        print(TEXT[max(0, pos-1500):min(len(TEXT), pos+2300)])
        start = pos + len(needle)
        count += 1
    print(f"COUNT={count}")
