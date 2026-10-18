from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
text = (ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js").read_text(encoding="utf-8", errors="replace")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

needles = [
    "C.sendArtifactUpgrade",
    "C.onArtifactUpdate",
    "sendArtifactUpgrade=function",
    "onArtifactUpdate=function",
    "updateArtifactDate=function",
    "updateArtifactData=function",
]
for needle in needles:
    print(f"=== {needle} ===")
    start = 0
    count = 0
    while count < 10:
        pos = text.find(needle, start)
        if pos < 0:
            break
        print(f"OFFSET={pos}")
        print(text[max(0, pos - 1800): min(len(text), pos + 2600)])
        start = pos + len(needle)
        count += 1
    print(f"COUNT={count}")
