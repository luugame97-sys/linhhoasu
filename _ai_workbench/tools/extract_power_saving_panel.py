from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
text = (ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js").read_text(encoding="utf-8", errors="replace")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pos = text.find('t(Zz=')
print('CLASS_OFFSET', pos)
print(text[max(0, pos - 9000):min(len(text), pos + 14000)])
